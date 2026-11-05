import { useEffect } from 'react';
import { call, parseFrappeError } from '@ury/core';
import { showToast } from '@ury/ui';
import { usePOSStore } from '../store/pos-store';
import { t } from '../i18n';

// Patch 47 (ticket 39): a USB scanner types a loyalty card's code like a keyboard, fast,
// then Enter. A burst that ends with "LOY" + 12 letters sets that customer on the order being
// taken (erp_restaurant loyalty.resolve_loyalty_code); anything else is left alone, so item
// search and typing work as before. Keys are read by physical position (e.code): the code's
// letters avoid the keys that move between QWERTY and AZERTY (erp_restaurant
// loyalty.ALPHABET), so it reads the same whatever the scanner's and the iPad's layouts,
// Arabic included.
const CODE = /LOY[BCDEFGHIJKLNOPRSTUVXY]{12}$/;
const CODE_LENGTH = 15;
const MAX_GAP_MS = 60;
// Only the cashier's order screen: elsewhere (Orders, payment, waiter app) the order being
// paid takes its customer from the saved order, not from the till's current tab.
const ORDER_SCREEN = '/pos/pos';

type Resolved = { customer: string; customer_name: string; phone: string; points: number; value: number };

/** Removes the scanned characters the scanner typed into the focused field (React-controlled). */
function clearTyped(el: Element | null, typed: string) {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
  if (!el.value.toUpperCase().endsWith(typed)) return;
  const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, el.value.slice(0, -typed.length));
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

const LoyaltyScanListener: React.FC = () => {
  useEffect(() => {
    let buffer = '';
    let typedBuffer = '';
    let last = 0;

    const onKeyDown = (e: KeyboardEvent) => {
      const now = e.timeStamp;
      const fast = now - last <= MAX_GAP_MS;
      last = now;
      if (e.key === 'Enter') {
        const match = fast ? CODE.exec(buffer) : null;
        const typed = typedBuffer.slice(-CODE_LENGTH);
        buffer = '';
        typedBuffer = '';
        if (!match) return;
        e.preventDefault();
        e.stopPropagation();
        clearTyped(document.activeElement, typed.toUpperCase());
        void resolve(match[0]);
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const letter = /^Key([A-Z])$/.exec(e.code)?.[1] ?? (e.key.length === 1 ? e.key.toUpperCase() : null);
      if (!letter) return;
      buffer = fast ? (buffer + letter).slice(-32) : letter;
      // What the layout actually typed into the focused field, to remove it after a scan.
      typedBuffer = fast ? (typedBuffer + e.key).slice(-32) : e.key;
    };

    const resolve = async (code: string) => {
      const { selectedOrderType, setSelectedCustomer, isUpdatingOrder } = usePOSStore.getState();
      if (window.location.pathname.replace(/\/$/, '') !== ORDER_SCREEN) {
        showToast.error(t('loyalty.scan_on_order_screen'));
        return;
      }
      // A sent order keeps its customer (the till's customer picker is locked too).
      if (isUpdatingOrder) {
        showToast.error(t('loyalty.order_already_sent'));
        return;
      }
      if (selectedOrderType === 'Aggregators') {
        showToast.error(t('loyalty.not_for_platforms'));
        return;
      }
      try {
        const r = await call.get<{ message: Resolved }>('erp_restaurant.erp_restaurant.loyalty.resolve_loyalty_code', { code });
        const c = r.message;
        setSelectedCustomer({ id: c.customer, name: c.customer_name, phone: c.phone });
        showToast.success(t('loyalty.customer_set', { name: c.customer_name, points: c.points }));
      } catch (err) {
        showToast.error(parseFrappeError(err, t('loyalty.scan_failed')));
      }
    };

    // Capture phase: the Enter must not also submit the field the scanner typed into.
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, []);

  return null;
};

export default LoyaltyScanListener;
