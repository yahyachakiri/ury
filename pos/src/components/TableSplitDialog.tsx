import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import {
  Badge,
  Button,
  Spinner,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  cn,
  showToast,
} from '@ury/ui';
import { parseFrappeError } from '@ury/core';
import { t } from '../i18n';
import { getTableGroup, splitTables, type Table } from '../lib/table-api';

/**
 * Patch 76 (ticket 102): the tables of a merged group, all ticked; untick the ones to take out
 * (erp_restaurant split_tables frees them). Every table holding an open order stays ticked and
 * locked. Used by the till's and the waiter's Tables pages, for free and busy groups.
 */
interface TableSplitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceTable: Table | null;
  onDone: () => void;
}

const TableSplitDialog = ({ open, onOpenChange, sourceTable, onDone }: TableSplitDialogProps) => {
  const [members, setMembers] = useState<string[]>([]);
  const [orderTables, setOrderTables] = useState<string[]>([]);
  // The parents pass a new onOpenChange on each render (a live reload included): kept in a ref so
  // the group is loaded once per opening and the user's ticks survive.
  const onOpenChangeRef = useRef(onOpenChange);
  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  });
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !sourceTable) return;
    let cancelled = false;
    setRemoved(new Set());
    setMembers([]);
    setLoading(true);
    getTableGroup(sourceTable.name)
      .then((group) => {
        if (cancelled) return;
        setMembers(group.members);
        setOrderTables(group.order_tables);
      })
      .catch((error) => {
        if (cancelled) return;
        showToast.error(parseFrappeError(error, t('tables.unmerge_failed')));
        onOpenChangeRef.current(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, sourceTable]);

  if (!sourceTable) return null;

  const toggle = (name: string) => {
    if (orderTables.includes(name)) return;
    setRemoved((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleConfirm = async () => {
    if (removed.size === 0) {
      showToast.error(t('tables.split_none'));
      return;
    }
    setSubmitting(true);
    try {
      await splitTables(sourceTable.name, [...removed]);
      showToast.success(t('tables.unmerge_success'));
      onOpenChange(false);
      onDone();
    } catch (error) {
      showToast.error(parseFrappeError(error, t('tables.unmerge_failed')));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent onClose={() => !submitting && onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>{t('tables.split_title')}</DialogTitle>
          <DialogDescription>{t('tables.split_description')}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-2 px-6 pb-2 sm:grid-cols-2">
          {loading
            ? <Spinner message={t('common.loading')} />
            : members.map((name) => {
                const kept = !removed.has(name);
                const locked = orderTables.includes(name);
                return (
                  <Button
                    key={name}
                    variant="ghost"
                    onClick={() => toggle(name)}
                    disabled={locked || submitting}
                    aria-pressed={kept}
                    className={cn(
                      'flex h-auto items-center justify-start gap-3 rounded-lg border-2 p-3 text-start font-normal',
                      kept ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded border',
                        kept ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300'
                      )}
                    >
                      {kept && <Check className="h-3.5 w-3.5" />}
                    </span>
                    <span className="flex-1 truncate font-semibold text-gray-900">{name}</span>
                    {locked && (
                      <Badge variant="info" size="sm">
                        {t('tables.split_order_table')}
                      </Badge>
                    )}
                  </Button>
                );
              })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="danger"
            onClick={() => void handleConfirm()}
            disabled={submitting || loading || removed.size === 0}
          >
            {submitting ? t('common.loading') : t('tables.split_confirm', { count: removed.size })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TableSplitDialog;
