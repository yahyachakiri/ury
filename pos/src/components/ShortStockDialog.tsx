import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { call, numberLocale } from '@ury/core';
import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, Spinner } from '@ury/ui';
import { t } from '../i18n';

// Patch 84 (ticket 119): a sold-out meal can still be ordered once the customer accepts the missing
// ingredients. The list comes from erp_restaurant short_stock.get_missing_ingredients; the line is then
// sent with short_stock_ok so payment and closing accept it (stock may go below zero).

interface MissingRow {
  item_code: string;
  item_name: string;
  uom: string;
  needed: number;
  available: number;
}

interface ShortStockDialogProps {
  item: { item: string; name: string };
  posProfile: string;
  onConfirm: () => void;
  onClose: () => void;
}

// Numbers and units kept left to right inside the Arabic sentence (first strong isolate).
const isolate = (text: string) => `⁨${text}⁩`;
const formatQty = (value: number) => new Intl.NumberFormat(numberLocale(), { maximumFractionDigits: 3 }).format(value);

const ShortStockDialog = ({ item, posProfile, onConfirm, onClose }: ShortStockDialogProps) => {
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState<MissingRow[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    call
      .get('erp_restaurant.erp_restaurant.short_stock.get_missing_ingredients', { item: item.item, pos_profile: posProfile, qty: 1 })
      .then((res: { message?: { missing?: MissingRow[] } }) => {
        if (alive) setMissing(res?.message?.missing || []);
      })
      .catch(() => {
        if (alive) setError(t('short_stock.load_failed'));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [item.item, posProfile]);

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent onClose={onClose}>
        <DialogHeader>
          <DialogTitle>
            <span className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" aria-hidden="true" />
              {t('short_stock.title', { name: item.name })}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 pb-2 text-sm text-gray-700" aria-live="polite">
          {loading ? (
            <Spinner className="w-5 h-5" message={t('common.loading')} />
          ) : error ? (
            <p className="text-red-600">{error}</p>
          ) : (
            <>
              <p className="mb-2 font-medium">{t('short_stock.missing')}</p>
              {missing.length ? (
                <ul className="space-y-1 mb-3">
                  {missing.map((row) => (
                    <li key={row.item_code} className="flex justify-between gap-3">
                      <span>{row.item_name}</span>
                      <span className="text-gray-500 whitespace-nowrap">
                        {t('short_stock.qty_line', {
                          needed: isolate(formatQty(row.needed)),
                          available: isolate(formatQty(row.available)),
                          uom: isolate(row.uom),
                        })}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mb-3 text-gray-500">{t('short_stock.none_listed')}</p>
              )}
              <p>{t('short_stock.ask_customer')}</p>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          {/* Not offered until the staff have seen what is missing (a failed load: tap the meal again). */}
          <Button
            variant="destructive"
            disabled={loading || Boolean(error)}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {t('short_stock.order_anyway')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ShortStockDialog;
