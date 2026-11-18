import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, LogOut, Square } from 'lucide-react';
import { Button, Spinner, showToast } from '@ury/ui';
import { useCaptainContext } from '../hooks/useCaptainContext';
import { getRooms, getTables, mergeTablesBatch, type Room, type Table } from '../../lib/table-api';
import { getMergeGroupMembers, isMergedTable, sortTablesByMergeGroups } from '../../lib/table-utils';
import TableActionsMenu from '../../components/TableActionsMenu';
import TableMergeDialog from '../../components/TableMergeDialog';
import TableSplitDialog from '../../components/TableSplitDialog';
import {
  getActiveTableOrders,
  getUserFullNames,
  type ActiveTableOrder,
} from '../lib/captain-table-api';
import CaptainTableCard, {
  type CaptainTableOwnership,
} from '../components/CaptainTableCard';
import { getActiveLanguage, t } from '../../i18n';
import { call, logout, parseFrappeError } from '@ury/core';
import type { Socket } from 'socket.io-client';
import { getRealtimeSocket } from '../../lib/realtime';

/**
 * Captain "Tables" home screen (`/order`). See PLAN.md §5/§6 for the
 * intended IA. Mobile-first: large single-tap table cards, room tabs,
 * no cashier-oriented chrome (no payment/discount/settlement affordances —
 * those never belong on this screen for a Captain, per PLAN §6).
 */
export default function CaptainTables() {
  const navigate = useNavigate();
  const {
    context,
    capabilities,
    branch,
    rooms,
    isLoading: contextLoading,
    error: contextError,
  } = useCaptainContext();

  const currentUser = context?.user ?? null;
  const canAccessOtherCaptainsTables = Boolean(capabilities?.canAccessOtherCaptainsTables);

  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [branchRooms, setBranchRooms] = useState<Room[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [tables, setTables] = useState<Table[]>([]);
  const [activeOrders, setActiveOrders] = useState<Map<string, ActiveTableOrder>>(new Map());
  const [ownerNames, setOwnerNames] = useState<Map<string, string>>(new Map());
  const [tablesLoading, setTablesLoading] = useState(false);
  const [tablesError, setTablesError] = useState<string | null>(null);
  // Patch 75: waiters merge and unmerge tables with the till's ⋮ menu and windows.
  const [menuOpenForTable, setMenuOpenForTable] = useState<string | null>(null);
  const [mergeSourceTable, setMergeSourceTable] = useState<Table | null>(null);
  const [unmergeSourceTable, setUnmergeSourceTable] = useState<Table | null>(null);

  // `get_captain_context()`'s `rooms` field (from `getRoom()` in
  // `ury/ury_pos/api.py`) reflects the Captain's own room *assignment*, not
  // "which rooms exist" — a Captain assigned at the branch level (not a
  // specific room) gets back a row with `name: null`, which is not a usable
  // room selector value. The Cashier `Table.tsx` doesn't use `getRoom()` for
  // its room selector at all; it lists ALL branch rooms via `getRooms(branch)`
  // and lets the user pick. Match that pattern here — every table needs to be
  // reachable regardless of whether this Captain has a narrow room
  // assignment, since room-level restriction (if any) is enforced
  // server-side (captain_transfer's room-match, table_transfer's branch
  // check), not by hiding rooms from the picker.
  useEffect(() => {
    if (!branch) return;
    let cancelled = false;
    setRoomsLoading(true);
    getRooms(branch)
      .then((fetched) => {
        if (cancelled) return;
        setBranchRooms(fetched);
      })
      .catch(() => {
        if (!cancelled) setBranchRooms([]);
      })
      .finally(() => {
        if (!cancelled) setRoomsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [branch]);

  // Default the selected tab to the Captain's own assigned room if they have
  // one (a real, non-null room name from get_captain_context), else the
  // first branch room.
  useEffect(() => {
    if (selectedRoom || branchRooms.length === 0) return;
    const assignedRoomName = rooms.find((r) => r.name)?.name;
    const defaultRoom = branchRooms.find((r) => r.name === assignedRoomName) ?? branchRooms[0];
    setSelectedRoom(defaultRoom.name);
  }, [branchRooms, rooms, selectedRoom]);

  const loadTables = useCallback(async (roomName: string) => {
    setTablesLoading(true);
    setTablesError(null);
    try {
      const fetchedTables = await getTables(roomName);
      setTables(sortTablesByMergeGroups(fetchedTables));
    } catch (err) {
      console.error(err);
      setTablesError(t('errors.failed_load_tables'));
      setTables([]);
    } finally {
      setTablesLoading(false);
    }
  }, []);

  const loadActiveOrders = useCallback(async (branchName: string) => {
    try {
      const orders = await getActiveTableOrders(branchName);
      setActiveOrders(orders);

      const waiters = Array.from(orders.values()).map((order) => order.waiter);
      const names = await getUserFullNames(waiters);
      setOwnerNames(names);
    } catch (err) {
      // Non-fatal: table grid still renders with occupied/free state from
      // the bulk table list, just without waiter/total annotations.
      console.error('Failed to load active table orders', err);
    }
  }, []);

  useEffect(() => {
    if (selectedRoom) {
      loadTables(selectedRoom);
    }
  }, [selectedRoom, loadTables]);

  useEffect(() => {
    if (branch) {
      loadActiveOrders(branch);
    }
  }, [branch, loadActiveOrders]);

  const refresh = useCallback(() => {
    if (selectedRoom) loadTables(selectedRoom);
    if (branch) loadActiveOrders(branch);
  }, [selectedRoom, branch, loadTables, loadActiveOrders]);

  // Patch 73: a table order paid or cancelled at the till (erp_restaurant table_refresh.py,
  // channel erp_tables_<branch>) reloads this page, so the waiter sees the table free without
  // tapping "Actualiser"; a reconnect (sleep, Wi-Fi loss) reloads too, events were missed.
  // Several events in a row give one reload.
  useEffect(() => {
    if (!branch) return;
    const channel = `erp_tables_${branch}`;
    let activeSocket: Socket | null = null;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onEvent = () => {
      clearTimeout(timer);
      timer = setTimeout(refresh, 500);
    };
    getRealtimeSocket()
      .then((s) => {
        if (cancelled) return;
        activeSocket = s;
        s.on(channel, onEvent);
        s.on('connect', onEvent);
      })
      .catch((error) => console.error('CaptainTables: realtime unavailable:', error));
    return () => {
      cancelled = true;
      clearTimeout(timer);
      activeSocket?.off(channel, onEvent);
      activeSocket?.off('connect', onEvent);
    };
  }, [branch, refresh]);

  const tableGroups = useMemo(() => sortTablesByMergeGroups(tables), [tables]);

  const resolveOwnership = useCallback(
    (table: Table, order: ActiveTableOrder | undefined): CaptainTableOwnership => {
      if (table.occupied !== 1) return 'free';
      if (!order) return 'occupied-unknown';
      return order.waiter === currentUser ? 'mine' : 'other';
    },
    [currentUser]
  );

  // Patch 75: a waiter may merge a free table, or a busy one they may open (theirs, or any with the
  // transfer / billing right); a table whose bill is printed is left to the till.
  const canMergeFrom = useCallback(
    (table: Table, order: ActiveTableOrder | undefined) => {
      if (order?.invoicePrinted) return false;
      const ownership = resolveOwnership(table, order);
      return ownership === 'free' || ownership === 'mine' || canAccessOtherCaptainsTables;
    },
    [resolveOwnership, canAccessOtherCaptainsTables]
  );

  const mergeAvailableTables = useMemo(() => {
    if (!mergeSourceTable) return [];
    const sourceCluster = new Set(getMergeGroupMembers(mergeSourceTable, tables));
    // URY's merge_tables_batch refuses a busy target and one already in another group.
    return tables.filter(
      (table) => !sourceCluster.has(table.name) && table.occupied !== 1 && !isMergedTable(table)
    );
  }, [mergeSourceTable, tables]);

  const handleMergeConfirm = async (targetNames: string[]) => {
    if (!mergeSourceTable || targetNames.length === 0) return;
    try {
      await mergeTablesBatch(mergeSourceTable.name, targetNames);
      refresh();
      showToast.success(t('tables.merge_success'));
    } catch (error) {
      showToast.error(parseFrappeError(error, t('tables.merge_failed')));
      throw error;
    }
  };

  const handleTableTap = (table: Table, order: ActiveTableOrder | undefined) => {
    const ownership = resolveOwnership(table, order);

    if (ownership === 'free' || ownership === 'mine') {
      navigate(`/order/table/${table.name}`);
      return;
    }

    // Occupied by someone else (or occupancy with no resolvable owner):
    // elevated/transfer access overrides the base restriction.
    if (canAccessOtherCaptainsTables) {
      navigate(`/order/table/${table.name}`);
      return;
    }

    const ownerName = order ? ownerNames.get(order.waiter) ?? order.waiter : null;
    showToast.error(ownerName ? t('errors.table_assigned', { name: ownerName }) : t('errors.table_occupied'));
  };

  const isLoading = contextLoading || (roomsLoading && branchRooms.length === 0);
  const error = contextError;

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner message={t('captain.loading_context')} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="text-center">
          <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-red-600" />
          <h2 className="mb-1 text-lg font-semibold text-gray-800">{t('errors.failed_load_tables')}</h2>
          <p className="text-sm text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <div className="sticky top-0 z-10 border-b border-gray-200 bg-white p-3">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-bold text-gray-900">{t('footer.tables')}</h1>
          <div className="flex flex-wrap items-center justify-end gap-1">
            <WaiterLanguageSwitch />
            <Button variant="ghost" size="sm" onClick={refresh}>
              {t('captain.refresh')}
            </Button>
            <WaiterLogoutButton />
          </div>
        </div>

        {branchRooms.length > 0 && (
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {branchRooms.map((room) => (
              <Button
                key={room.name}
                variant="tab"
                size="sm"
                data-selected={selectedRoom === room.name}
                onClick={() => setSelectedRoom(room.name)}
                className="h-9 shrink-0"
              >
                {room.name}
              </Button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 p-3">
        {branchRooms.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-16 text-gray-500">
            <AlertTriangle className="h-8 w-8" />
            <p className="text-sm">{t('captain.no_rooms')}</p>
          </div>
        ) : tablesError ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-16 text-red-500">
            <AlertTriangle className="h-8 w-8" />
            <p className="text-sm">{tablesError}</p>
          </div>
        ) : tablesLoading ? (
          <Spinner message={t('common.loading_tables')} />
        ) : tableGroups.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-16 text-gray-500">
            <Square className="h-8 w-8" />
            <p className="text-sm">{t('captain.no_tables_in_room')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {tableGroups.map((table) => {
              const order = activeOrders.get(table.name);
              const ownership = resolveOwnership(table, order);
              const ownerName = order ? ownerNames.get(order.waiter) ?? order.waiter : undefined;
              const mergePartners = getMergeGroupMembers(table, tables).filter(
                (name) => name !== table.name
              );

              const showMenu = canMergeFrom(table, order);

              return (
                <div key={table.name} className="relative">
                <CaptainTableCard
                  table={table}
                  order={order}
                  ownership={ownership}
                  ownerName={ownership === 'mine' ? undefined : ownerName}
                  mergePartners={mergePartners}
                  reserveMenuSpace={showMenu}
                  onTap={() => handleTableTap(table, order)}
                />
                {/* Patch 75: the till's table menu, merge and unmerge only. */}
                {showMenu && (
                  <div className="absolute end-1 top-1.5">
                    <TableActionsMenu
                      table={table}
                      isOpen={menuOpenForTable === table.name}
                      onOpenChange={(open) => setMenuOpenForTable(open ? table.name : null)}
                      onMerge={() => setMergeSourceTable(table)}
                      onUnmerge={isMergedTable(table) ? () => setUnmergeSourceTable(table) : undefined}
                    />
                  </div>
                )}
                </div>
              );
            })}
          </div>
        )}
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
      <TableSplitDialog
        open={unmergeSourceTable !== null}
        onOpenChange={(open) => {
          if (!open) setUnmergeSourceTable(null);
        }}
        sourceTable={unmergeSourceTable}
        onDone={refresh}
      />
    </div>
  );
}

// Patch 70: the waiter app had no way to log out (the till's header menu is not shown here).
// Two taps, so a slip on a phone does not log the waiter out: the first shows "Déconnexion"
// for 4 seconds, the second logs out and opens the login page (plain /login: erp_restaurant
// staff_routes sends whoever logs in next to their own screen). The tab's saved till data is
// cleared, as POSOpeningScreen does, so the next user of a shared device starts fresh.
function WaiterLogoutButton() {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!confirming) return;
    const timer = window.setTimeout(() => setConfirming(false), 4000);
    return () => window.clearTimeout(timer);
  }, [confirming]);
  const onClick = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setBusy(true);
    try {
      await logout();
    } catch {
      setBusy(false);
      setConfirming(false);
      showToast.error(t('errors.failed_logout'));
      return;
    }
    sessionStorage.clear();
    window.location.href = '/login';
  };
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label={t('header.logout')}
      disabled={busy}
      onClick={() => void onClick()}
      className={confirming ? 'h-8 gap-1 px-2 text-red-600 hover:text-red-600' : 'h-8 px-2 text-gray-600'}
    >
      <LogOut className="h-4 w-4 rtl:-scale-x-100" />
      {confirming && <span>{t('header.logout')}</span>}
    </Button>
  );
}

// Patch 63: a waiter chooses the app's language (their own User language, set by erp_restaurant
// owner_app.set_language, which only changes the logged-in user), then the app reloads in it.
const WAITER_LANGS: { code: string; label: string; name: string }[] = [
  { code: 'fr', label: 'FR', name: 'Français' },
  { code: 'ar', label: 'ع', name: 'العربية' },
  { code: 'en', label: 'EN', name: 'English' },
];

function WaiterLanguageSwitch() {
  const active = getActiveLanguage();
  const choose = async (code: string) => {
    if (code === active) return;
    try {
      await call.post('erp_restaurant.erp_restaurant.api.owner_app.set_language', { lang: code });
      window.location.reload();
    } catch {
      showToast.error(t('errors.language_change_failed'));
    }
  };
  return (
    <div className="flex items-center rounded-md border border-gray-200 text-xs" dir="ltr">
      {WAITER_LANGS.map((l) => (
        <Button
          key={l.code}
          variant="ghost"
          size="sm"
          aria-pressed={l.code === active}
          aria-label={l.name}
          onClick={() => void choose(l.code)}
          className={l.code === active ? 'h-7 px-2 font-semibold text-primary-700' : 'h-7 px-2 text-gray-600'}
        >
          {l.label}
        </Button>
      ))}
    </div>
  );
}
