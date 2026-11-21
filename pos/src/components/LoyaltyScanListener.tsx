import { useEffect } from 'react';
import { call, parseFrappeError } from '@ury/core';
import { showToast } from '@ury/ui';
import { usePOSStore } from '../store/pos-store';
import { useRootStore } from '../store/root-store';
import { getRealtimeSocket } from '../lib/realtime';
import { isTillScreen } from './TillGuard';
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

/** Why a card cannot go onto the till's current order now (a translated message), else null. Patch 47's rules. */
function whyNot(): string | null {
  const { selectedOrderType, isUpdatingOrder } = usePOSStore.getState();
  if (window.location.pathname.replace(/\/$/, '') !== ORDER_SCREEN) return t('loyalty.scan_on_order_screen');
  // A sent order keeps its customer (the till's customer picker is locked too).
  if (isUpdatingOrder) return t('loyalty.order_already_sent');
  if (selectedOrderType === 'Aggregators') return t('loyalty.not_for_platforms');
  return null;
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
      const { setSelectedCustomer } = usePOSStore.getState();
      const refusal = whyNot();
      if (refusal) {
        showToast.error(refusal);
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

    // Patch 81 (ticket 116): a card scanned on the cashier's phone (erp_restaurant loyalty.send_to_till) arrives
    // here, on the till of the same account, and goes through the same rules as a USB scan; the phone gets the
    // answer (loyalty.scan_result).
    const onPhoneScan = (p: { scan_id: string; customer: string; customer_name: string; phone?: string; points?: number }) => {
      if (!isTillScreen() || !p?.scan_id) return; // a phone or the waiter app never answers for the till
      const refusal = whyNot();
      if (!refusal) {
        usePOSStore.getState().setSelectedCustomer({ id: p.customer, name: p.customer_name, phone: p.phone || '' });
        showToast.success(t('loyalty.customer_set', { name: p.customer_name, points: p.points ?? 0 }));
      } else {
        showToast.error(refusal);
      }
      call
        .post('erp_restaurant.erp_restaurant.loyalty.scan_result', { scan_id: p.scan_id, status: refusal ? 'refused' : 'applied', message: refusal || '' })
        .catch(() => undefined);
    };

    // Patch 81 / 82: a waiter scanned a card on a served "Client comptoir" order (loyalty.set_order_customer): an
    // open till or waiter app showing that order takes the customer and the order's new time (its next update would
    // be refused as modified otherwise); the Orders list reloads so the payment sends the new customer.
    const onOrderCustomer = (p: { invoice: string; customer: string; customer_name: string; modified?: string; previous_modified?: string }) => {
      const pos = usePOSStore.getState();
      if (pos.orderId && pos.orderId === p.invoice) {
        // The new time only if this copy was current: else the next update must still be refused as modified
        // (Patch 06), rather than overwrite lines another device sent meanwhile.
        const current = !!p.modified && pos.lastModifiedTime === p.previous_modified;
        usePOSStore.setState({
          selectedCustomer: { id: p.customer, name: p.customer_name, phone: '' },
          lastModifiedTime: current ? p.modified : pos.lastModifiedTime,
        });
      }
      if (window.location.pathname.startsWith('/pos/orders')) {
        const root = useRootStore.getState();
        root.fetchOrders(root.pagination.currentPage).catch(() => undefined);
        if (root.selectedOrder?.name === p.invoice) root.selectOrder(root.selectedOrder).catch(() => undefined);
      }
    };

    let socket: Awaited<ReturnType<typeof getRealtimeSocket>> | null = null;
    let stopped = false;
    getRealtimeSocket()
      .then((s) => {
        if (stopped) return;
        socket = s;
        s.on('erp_loyalty_scan', onPhoneScan);
        s.on('erp_order_customer', onOrderCustomer);
      })
      .catch(() => undefined);

    // Capture phase: the Enter must not also submit the field the scanner typed into.
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      stopped = true;
      document.removeEventListener('keydown', onKeyDown, true);
      socket?.off('erp_loyalty_scan', onPhoneScan);
      socket?.off('erp_order_customer', onOrderCustomer);
    };
  }, []);

  return null;
};

export default LoyaltyScanListener;
