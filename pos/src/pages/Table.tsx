import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Layout, Square } from 'lucide-react';
import { usePOSStore } from '../store/pos-store';
import { useRootStore } from '../store/root-store';
import { getRooms, getTables, getTableCount, getVacantTablesForBranch, mergeTablesBatch, unmergeTables, type Room, type Table } from '../lib/table-api';
import { getMergeGroupMembers, formatMergedTableLabelFromGroup, getTableRenderGroups, sortTablesByMergeGroups } from '../lib/table-utils';
import { Spinner } from '@ury/ui';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Textarea } from '@ury/ui';
import { Button } from '@ury/ui';
import { Badge } from '@ury/ui';
import { DINE_IN } from '../data/order-types';
import { captainTransfer, getTableOrder, tableTransfer } from '../lib/order-api';
import { printKitchenTickets, printOrder } from '../lib/print';
import { resolvePrintFormat, updatePrintStatus } from '../lib/invoice-api';
import { call, canCaptainTransfer, isUserRestrictedFromTableOrders, parseFrappeError } from '@ury/core';
import type { Socket } from 'socket.io-client';
import { getRealtimeSocket } from '../lib/realtime';
import { showToast } from '@ury/ui';
import { t } from '../i18n';
import LayoutView from '../components/LayoutView';
import TableMergeDialog from '../components/TableMergeDialog';
import TableUnmergeDialog from '../components/TableUnmergeDialog';
import TableTransferDialog from '../components/TableTransferDialog';
import CaptainTransferDialog from '../components/CaptainTransferDialog';
import TableCard, { TABLE_STATE_STYLES } from '../components/TableCard';
import MergeLinkConnector from '../components/MergeLinkConnector';
import { openOrderInOrders } from '../components/SelfOrderListener';

const TableView = () => {
  const navigate = useNavigate();
  const { posProfile, setSelectedTable, setSelectedOrderType } = usePOSStore();
  const user = useRootStore((state) => state.user);
  const showCaptainTransfer = canCaptainTransfer(user, posProfile);
  const isRestricted = isUserRestrictedFromTableOrders(user, posProfile);

  const branch = posProfile?.branch ?? null;
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const selectedRoomRef = useRef<string | null>(null); // Patch 74: room on screen, for live reloads
  useEffect(() => {
    selectedRoomRef.current = selectedRoom;
  }, [selectedRoom]);
  const [tables, setTables] = useState<Table[]>([]);
  const [tablesCache, setTablesCache] = useState<Record<string, Table[]>>({});
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [loadingTables, setLoadingTables] = useState(false);
  const [roomCounts, setRoomCounts] = useState<Record<string, number>>({});

  const [error, setError] = useState<string | null>(null);
  const [printingTable, setPrintingTable] = useState<string | null>(null);
  const [menuOpenForTable, setMenuOpenForTable] = useState<string | null>(null);
  // Patch 74: cancel a busy table's order from this page (same endpoint and reason as Orders).
  const [cancelTable, setCancelTable] = useState<Table | null>(null);
  const [cancelInvoice, setCancelInvoice] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelLoading, setCancelLoading] = useState(false);
  const [mergeSourceTable, setMergeSourceTable] = useState<Table | null>(null);
  const [unmergeSourceTable, setUnmergeSourceTable] = useState<Table | null>(null);
  const [transferSourceTable, setTransferSourceTable] = useState<Table | null>(null);
  const [transferInvoiceName, setTransferInvoiceName] = useState<string | null>(null);
  const [transferDestinationTables, setTransferDestinationTables] = useState<Table[]>([]);
  const [transferDestinationsLoading, setTransferDestinationsLoading] = useState(false);
  const [captainTransferContext, setCaptainTransferContext] = useState<{
    table: Table;
    invoiceName: string;
    currentCaptain: string;
  } | null>(null);

  const persistRoomCounts = useCallback((counts: Record<string, number>) => {
    if (!branch) return;
    sessionStorage.setItem(`ury_room_counts_${branch}`, JSON.stringify(counts));
  }, [branch]);

  useEffect(() => {
    async function fetchRooms() {
      if (!branch) return;
      setLoadingRooms(true);
      setError(null);

      try {
        const sessionKey = `ury_rooms_${branch}`;
        const cachedRooms = sessionStorage.getItem(sessionKey);

        if (cachedRooms) {
          const parsedRooms = JSON.parse(cachedRooms) as Room[];
          setRooms(parsedRooms);
          setSelectedRoom((prev) => prev ?? (parsedRooms[0]?.name ?? null));
        } else {
          const fetchedRooms = await getRooms(branch);
          setRooms(fetchedRooms);
          setSelectedRoom((prev) => prev ?? (fetchedRooms[0]?.name ?? null));
          sessionStorage.setItem(sessionKey, JSON.stringify(fetchedRooms));
        }
      } catch (e) {
        console.error(e);
        setError(t('errors.failed_load_rooms'));
      } finally {
        setLoadingRooms(false);
      }
    }

    fetchRooms();
  }, [branch]);

  useEffect(() => {
    if (!branch || rooms.length === 0) return;
    const cacheKey = `ury_room_counts_${branch}`;
    const cachedCounts = sessionStorage.getItem(cacheKey);
    let shouldFetch = true;

    if (cachedCounts) {
      try {
        const parsedCounts = JSON.parse(cachedCounts) as Record<string, number>;
        setRoomCounts(parsedCounts);
        const hasAllRooms = rooms.every((room) => typeof parsedCounts[room.name] === 'number');
        if (hasAllRooms) {
          shouldFetch = false;
        }
      } catch {
        sessionStorage.removeItem(cacheKey);
      }
    }

    if (!shouldFetch) return;

    async function fetchRoomCounts() {
      try {
        const counts = await Promise.all(
          rooms.map((room) => getTableCount(room.name, room.branch))
        );
        const nextCounts = rooms.reduce((acc, room, index) => {
          acc[room.name] = counts[index];
          return acc;
        }, {} as Record<string, number>);
        setRoomCounts(nextCounts);
        persistRoomCounts(nextCounts);
      } catch (error) {
        console.error('Failed to load room counts', error);
      }
    }

    fetchRoomCounts();
  }, [branch, rooms, persistRoomCounts]);

  const loadTables = useCallback(
    async (roomName: string, options?: { useCache?: boolean; quiet?: boolean }) => {
      if (!roomName) return;
      setError(null);

      // Patch 74: a live reload keeps the grid on screen, never touches the loading state, keeps the
      // current tables on a network error and drops an answer for a room no longer on screen.
      if (options?.quiet) {
        try {
          const fetchedTables = sortTablesByMergeGroups(await getTables(roomName));
          setTablesCache((prev) => ({ ...prev, [roomName]: fetchedTables }));
          if (selectedRoomRef.current === roomName) setTables(fetchedTables);
        } catch (e) {
          console.error('Tables: live reload failed', e);
        }
        return;
      }

      const shouldUseCache = options?.useCache !== false;
      if (shouldUseCache && tablesCache[roomName]) {
        setTables(sortTablesByMergeGroups(tablesCache[roomName]));
        setLoadingTables(false);
        return;
      }

      setLoadingTables(true);
      try {
        const fetchedTables = await getTables(roomName);
        const sortedTables = sortTablesByMergeGroups(fetchedTables);
        setTables(sortedTables);
        setTablesCache((prev) => ({ ...prev, [roomName]: sortedTables }));
      } catch (e) {
        console.error(e);
        setError(t('errors.failed_load_tables'));
        setTables([]);
      } finally {
        setLoadingTables(false);
      }
    },
    [tablesCache]
  );

  useEffect(() => {
    if (!selectedRoom) return;
    loadTables(selectedRoom);
  }, [selectedRoom, loadTables]);

  const handleNavigateToPOS = (tableName: string) => {
    if (!selectedRoom) return;

    // Check if user is restricted from taking table orders
    if (isUserRestrictedFromTableOrders(user, posProfile)) {
      showToast.error(t('errors.dine_in_restricted') || 'Dine In is not available for your role');
      return;
    }

    setSelectedOrderType(DINE_IN);
    setSelectedTable(tableName, selectedRoom);
    navigate('/pos');
  };

  const handlePreviewTable = (table: Table, event?: MouseEvent<HTMLButtonElement>) => {
    event?.stopPropagation();
    handleNavigateToPOS(table.name);
  };

  const handlePrintTable = async (table: Table, event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();

    if (!posProfile) {
      showToast.error(t('errors.pos_profile_not_loaded'));
      return;
    }

    setPrintingTable(table.name);
    try {
      const orderResponse = await getTableOrder(table.name);
      const invoiceId = orderResponse.message?.name;

      if (!invoiceId) {
        showToast.error(t('errors.no_active_order'));
        return;
      }

      try {
        await printOrder({
          orderId: invoiceId,
          posProfile,
          printFormat: resolvePrintFormat(
            orderResponse.message ?? {},
            posProfile.print_format
          ),
        });
        showToast.success(t('success.printed'));
      } catch (printError) {
        // Patch 53: a failed print still counts as the print, so the order can be paid.
        await updatePrintStatus(invoiceId).catch(() => {
          throw printError;
        });
        showToast.error(t('errors.print_failed_pay_anyway', { reason: parseFrappeError(printError, t('errors.failed_print')) }));
      }
      // Patch 73: the printed order opens in Orders, selected, ready for its payment.
      openOrderInOrders(invoiceId);
    } catch (error) {
      showToast.error(parseFrappeError(error, t('errors.failed_print')));
    } finally {
      setPrintingTable(null);
    }
  };

  // Patch 74: a table order sent by a waiter (or paid, cancelled) on this branch reloads the
  // tables (erp_restaurant table_refresh.py, channel erp_tables_<branch>), without the loading
  // grid; other rooms are fetched again when opened. A socket (re)connection reloads too.
  const liveReloadRef = useRef<() => void>(() => {});
  useEffect(() => {
    liveReloadRef.current = () => {
      setTablesCache({});
      if (selectedRoom) void loadTables(selectedRoom, { useCache: false, quiet: true });
    };
  });
  useEffect(() => {
    if (!branch) return;
    const channel = `erp_tables_${branch}`;
    let activeSocket: Socket | null = null;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onEvent = () => {
      clearTimeout(timer);
      timer = setTimeout(() => liveReloadRef.current(), 500);
    };
    getRealtimeSocket()
      .then((s) => {
        if (cancelled) return;
        activeSocket = s;
        s.on(channel, onEvent);
        s.on('connect', onEvent);
      })
      .catch((err) => console.error('Tables: realtime unavailable:', err));
    return () => {
      cancelled = true;
      clearTimeout(timer);
      activeSocket?.off(channel, onEvent);
      activeSocket?.off('connect', onEvent);
    };
  }, [branch]);

  const closeCancel = () => {
    setCancelTable(null);
    setCancelInvoice(null);
    setCancelReason('');
  };

  // The table's open order and the user's cancel right first, as Orders shows its cancel button
  // only with that right: no reason typed for nothing.
  const handleOpenCancel = async (table: Table) => {
    try {
      // Patch 74 follow-up: printed orders too ("Payments" lifts get_order_invoice's not-printed filter), and a
      // merged table's group order (found through custom_merged_tables); cancel_order then frees and
      // separates every table of the group.
      const orderResponse = (await call.get('ury.ury.doctype.ury_order.ury_order.get_order_invoice', {
        table: table.name,
        is_payment: 'Payments',
      })) as { message?: { name?: string; docstatus?: number } | null };
      // An unsaved new order (no order on the table) has no name, or a "new-..." one.
      const found = orderResponse.message;
      const invoiceId =
        found?.docstatus === 0 && found.name && !found.name.startsWith('new-') ? found.name : undefined;
      if (!invoiceId) {
        showToast.error(t('errors.no_active_order'));
        return;
      }
      const res = (await call.get('frappe.client.has_permission', {
        doctype: 'POS Invoice',
        docname: invoiceId,
        perm_type: 'cancel',
      })) as { message?: { has_permission?: boolean } };
      if (res?.message?.has_permission !== true) {
        showToast.error(t('captain.no_permission_order'));
        return;
      }
      setCancelInvoice(invoiceId);
      setCancelTable(table);
    } catch (err) {
      showToast.error(parseFrappeError(err, t('errors.failed_cancel_order')));
    }
  };

  const handleConfirmCancel = async () => {
    const invoiceId = cancelInvoice;
    if (!cancelTable || !invoiceId) return;
    if (!cancelReason.trim()) {
      showToast.error(t('errors.enter_cancel_reason'));
      return;
    }
    setCancelLoading(true);
    try {
      await call.post('ury.ury.doctype.ury_order.ury_order.cancel_order', {
        invoice_id: invoiceId,
        reason: cancelReason,
      });
      showToast.success(t('success.order_cancelled'));
      // As in Orders (Patches 10 and 37): the "Cancelled" kitchen ticket, without blocking.
      if (posProfile?.custom_auto_print_kitchen_ticket) {
        printKitchenTickets({ invoice: invoiceId, posProfile }).catch((err) => {
          showToast.error(t('kitchen.print_failed', { reason: err?.message || String(err) }));
        });
      }
      closeCancel();
      if (selectedRoom) await loadTables(selectedRoom, { useCache: false, quiet: true });
    } catch (err) {
      showToast.error(parseFrappeError(err, t('errors.failed_cancel_order')));
    } finally {
      setCancelLoading(false);
    }
  };

  const handleMergeConfirm = async (targetNames: string[]) => {
    if (!mergeSourceTable || targetNames.length === 0) return;

    const sourceName = mergeSourceTable.name;

    try {
      await mergeTablesBatch(sourceName, targetNames);
      if (selectedRoom) {
        await loadTables(selectedRoom, { useCache: false });
      }
      showToast.success(t('tables.merge_success'));
    } catch (error) {
      showToast.error(parseFrappeError(error, t('tables.merge_failed')));
      throw error;
    }
  };

  const handleUnmergeConfirm = async () => {
    if (!unmergeSourceTable) return;

    try {
      await unmergeTables(unmergeSourceTable.name);
      if (selectedRoom) {
        await loadTables(selectedRoom, { useCache: false });
      }
      showToast.success(t('tables.unmerge_success'));
    } catch (error) {
      showToast.error(parseFrappeError(error, t('tables.unmerge_failed')));
      throw error;
    }
  };

  const validateActiveTableOrder = async (tableName: string) => {
    const orderResponse = await getTableOrder(tableName);
    const invoice = orderResponse.message;

    if (!invoice?.name) {
      throw new Error(t('tables.no_active_order'));
    }
    if (invoice.invoice_printed === 1) {
      throw new Error(t('tables.order_already_billed'));
    }

    return invoice;
  };

  const handleOpenTransferTable = async (table: Table) => {
    if (getMergeGroupMembers(table, tables).length > 1) {
      showToast.error(t('tables.transfer_not_for_merged'));
      return;
    }

    if (!branch) {
      showToast.error(t('tables.transfer_failed'));
      return;
    }

    setTransferSourceTable(table);
    setTransferInvoiceName(null);
    setTransferDestinationTables([]);
    setTransferDestinationsLoading(true);

    try {
      const invoice = await validateActiveTableOrder(table.name);
      const destinations = await getVacantTablesForBranch(branch, table.name);
      setTransferDestinationTables(destinations);
      setTransferInvoiceName(invoice.name);
    } catch (error) {
      setTransferSourceTable(null);
      setTransferInvoiceName(null);
      setTransferDestinationTables([]);
      showToast.error(parseFrappeError(error, t('tables.transfer_failed')));
    } finally {
      setTransferDestinationsLoading(false);
    }
  };

  const handleOpenCaptainTransfer = async (table: Table) => {
    try {
      const invoice = await validateActiveTableOrder(table.name);
      if (!invoice.waiter) {
        throw new Error(t('tables.no_active_order'));
      }
      setCaptainTransferContext({
        table,
        invoiceName: invoice.name,
        currentCaptain: invoice.waiter,
      });
    } catch (error) {
      showToast.error(parseFrappeError(error, t('tables.transfer_failed')));
    }
  };

  const handleTableTransferConfirm = async (newTable: string) => {
    if (!transferSourceTable || !transferInvoiceName) return;

    try {
      await tableTransfer(transferSourceTable.name, newTable, transferInvoiceName);
      if (selectedRoom) {
        await loadTables(selectedRoom, { useCache: false });
      }
      showToast.success(t('tables.transfer_success'));
    } catch (error) {
      showToast.error(parseFrappeError(error, t('tables.transfer_failed')));
      throw error;
    }
  };

  const handleCaptainTransferConfirm = async (newCaptain: string) => {
    if (!captainTransferContext) return;

    const { currentCaptain, invoiceName } = captainTransferContext;

    try {
      await captainTransfer(currentCaptain, newCaptain, invoiceName);
      if (selectedRoom) {
        await loadTables(selectedRoom, { useCache: false });
      }
      showToast.success(t('tables.captain_transfer_success'));
    } catch (error) {
      showToast.error(parseFrappeError(error, t('tables.transfer_failed')));
      throw error;
    }
  };

  const mergeAvailableTables = useMemo(() => {
    if (!mergeSourceTable) return [];
    const sourceCluster = new Set(getMergeGroupMembers(mergeSourceTable, tables));
    return tables.filter((table) => {
      if (table.name === mergeSourceTable.name) return false;
      if (sourceCluster.has(table.name)) return false;
      if (table.occupied === 1 && mergeSourceTable.occupied === 1) return false;
      return true;
    });
  }, [mergeSourceTable, tables]);

  const tablesToDisplay = useMemo(() => sortTablesByMergeGroups(tables), [tables]);

  const unmergeGroupMembers = useMemo(() => {
    if (!unmergeSourceTable) return [];
    return getMergeGroupMembers(unmergeSourceTable, tablesToDisplay);
  }, [unmergeSourceTable, tablesToDisplay]);

  const tableRenderGroups = useMemo(() => getTableRenderGroups(tablesToDisplay), [tablesToDisplay]);

  const renderTableCard = (table: Table, className?: string) => {
    const mergeMembers = getMergeGroupMembers(table, tables);
    const mergeGroupLabel =
      mergeMembers.length > 1 ? formatMergedTableLabelFromGroup(mergeMembers) : undefined;
    const canTransferTable = table.occupied === 1 && mergeMembers.length <= 1;

    return (
    <TableCard
      key={table.name}
      table={table}
      mergeGroupLabel={mergeGroupLabel}
      className={className}
      menuOpen={menuOpenForTable === table.name}
      onMenuOpenChange={(open) => setMenuOpenForTable(open ? table.name : null)}
      onMerge={() => setMergeSourceTable(table)}
      onUnmerge={() => setUnmergeSourceTable(table)}
      onTransferTable={canTransferTable ? () => void handleOpenTransferTable(table) : undefined}
      onTransferCaptain={() => void handleOpenCaptainTransfer(table)}
      showCaptainTransfer={showCaptainTransfer}
      onCancelOrder={
        table.occupied === 1 && !isRestricted
          ? () => void handleOpenCancel(table)
          : undefined
      }
      onNavigate={() => handleNavigateToPOS(table.name)}
      onPreview={(event) => handlePreviewTable(table, event)}
      onPrint={(event) => handlePrintTable(table, event)}
      isPrinting={printingTable === table.name}
      isRestricted={isRestricted}
    />
    );
  };

  const hasRooms = rooms.length > 0;
  const showGridSkeleton = loadingTables || !selectedRoom;

  const handleRoomChange = (roomName: string) => {
    if (roomName === selectedRoom) {
      loadTables(roomName, { useCache: false });
      return;
    }

    setSelectedRoom(roomName);

    if (tablesCache[roomName]) {
      setTables(sortTablesByMergeGroups(tablesCache[roomName]));
      setLoadingTables(false);
    } else {
      setLoadingTables(true);
      setTables([]);
    }
  };

  const [isLayoutView, setIsLayoutView] = useState(false);

  const handleLayoutView = () => {
    if (selectedRoom) {
      loadTables(selectedRoom, { useCache: false });
    }
    setIsLayoutView(true);
  };

  if (isLayoutView && selectedRoom) {
    return (
      <LayoutView
        selectedRoom={selectedRoom}
        tables={tablesToDisplay}
        onBackToGrid={() => setIsLayoutView(false)}
        onRefresh={() => loadTables(selectedRoom, { useCache: false })}
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 bg-white border-b border-gray-200">
        <div className="max-w-screen-xl mx-auto">
          <div className="flex flex-col gap-3">
            <div className="flex justify-between items-start gap-4">
              <div className="flex flex-wrap gap-2">
                {loadingRooms && (
                  <div className="flex-1 min-w-[160px]">
                    <Spinner message={t('tables.loading_rooms')} />
                  </div>
                )}

                {!loadingRooms && !hasRooms && (
                  <div className="flex items-center gap-2 text-gray-500 text-sm">
                    <AlertTriangle className="w-4 h-4" />
                    No rooms found for this branch
                  </div>
                )}

                {rooms.map((room) => (
                  <Button
                    key={room.name}
                    variant="tab"
                    data-selected={selectedRoom === room.name}
                    onClick={() => handleRoomChange(room.name)}
                    className="h-fit"
                  >
                    {room.name}
                    {typeof roomCounts[room.name] === 'number' ? (
                      <Badge variant="outline" className="ml-2 bg-white/60">
                        {roomCounts[room.name]}
                      </Badge>
                    ) : null}
                  </Button>
                ))}
              </div>

              <div className="flex-shrink-0">
                <Button
                  variant="tab"
                  className="flex items-center gap-2 text-sm"
                  onClick={() => handleLayoutView()}
                >
                  <Layout className="w-4 h-4" />
                  {t('tables.layout_view')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-gray-50 p-6">
        <div className="max-w-screen-xl mx-auto h-full">
          {error && !loadingTables ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-red-500">
              <AlertTriangle className="w-10 h-10" />
              <p>{error}</p>
            </div>
          ) : showGridSkeleton ? (
            <Spinner message={t('common.loading_tables')} />
          ) : tablesToDisplay.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-gray-500">
              <Square className="w-10 h-10" />
              <p>{t('tables.no_tables_found')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 pb-40">
              {tableRenderGroups.map((group) =>
                group.length === 1 ? (
                  renderTableCard(group[0])
                ) : (
                  <div
                    key={group.map((t) => t.name).join('-')}
                    className="col-span-full flex flex-wrap items-stretch gap-y-2 rounded-lg border border-blue-200/70 bg-blue-50/40 p-2"
                  >
                    {group.map((table, index) => (
                      <Fragment key={table.name}>
                        {renderTableCard(
                          table,
                          'min-w-[9.5rem] flex-1 basis-[calc(50%-1.5rem)] sm:basis-[calc(33.333%-1.5rem)] md:min-w-[10rem] md:max-w-[14rem]'
                        )}
                        {index < group.length - 1 && (
                          <MergeLinkConnector
                            leftTable={table.name}
                            rightTable={group[index + 1].name}
                          />
                        )}
                      </Fragment>
                    ))}
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </div>

      <TableMergeDialog
        open={mergeSourceTable !== null}
        onOpenChange={(open) => {
          if (!open) setMergeSourceTable(null);
        }}
        sourceTable={mergeSourceTable}
        availableTables={mergeAvailableTables}
        onConfirm={handleMergeConfirm}
      />

      <TableUnmergeDialog
        open={unmergeSourceTable !== null}
        onOpenChange={(open) => {
          if (!open) setUnmergeSourceTable(null);
        }}
        sourceTable={unmergeSourceTable}
        groupMembers={unmergeGroupMembers}
        onConfirm={handleUnmergeConfirm}
      />

      {/* Patch 74: cancel the busy table's order, with a reason (as Orders). */}
      <Dialog
        open={cancelTable !== null}
        onOpenChange={(open) => {
          if (!open && !cancelLoading) closeCancel();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('order.cancel_order')}
              {cancelTable ? ` · ${getMergeGroupMembers(cancelTable, tables).join(' + ')}` : ''}
            </DialogTitle>
            <DialogDescription>{t('errors.enter_cancel_reason')}</DialogDescription>
          </DialogHeader>
          <div className="px-6 mb-3">
            <Textarea
              placeholder={t('order.enter_cancel_reason')}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              disabled={cancelLoading}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={closeCancel}
              disabled={cancelLoading}
            >
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={() => void handleConfirmCancel()} disabled={cancelLoading}>
              {cancelLoading ? t('common.cancelling') : t('common.confirm_cancel')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TableTransferDialog
        open={transferSourceTable !== null}
        onOpenChange={(open) => {
          if (!open) {
            setTransferSourceTable(null);
            setTransferInvoiceName(null);
            setTransferDestinationTables([]);
          }
        }}
        sourceTable={transferSourceTable}
        destinationTables={transferDestinationTables}
        loading={transferDestinationsLoading}
        onConfirm={handleTableTransferConfirm}
      />

      <CaptainTransferDialog
        open={captainTransferContext !== null}
        onOpenChange={(open) => {
          if (!open) setCaptainTransferContext(null);
        }}
        currentCaptain={captainTransferContext?.currentCaptain ?? ''}
        onConfirm={handleCaptainTransferConfirm}
      />

      {/* Status Legend */}
      <div className="fixed bottom-[4.5rem] w-full p-4 bg-white border-t border-gray-200">
        <div className="max-w-screen-xl mx-auto">
          <div className="flex items-center justify-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-emerald-50 border border-emerald-300 rounded"></div>
              <span>{t('tables.available')}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-amber-50 border border-amber-400 rounded"></div>
              <span>{t('tables.occupied')}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-blue-50/40 border border-blue-200/70 rounded"></div>
              <span>{t('tables.merged')}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TableView;
