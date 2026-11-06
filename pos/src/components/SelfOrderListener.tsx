import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import type { Socket } from 'socket.io-client';
import { call, parseFrappeError } from '@ury/core';
import { Button, Input, showToast } from '@ury/ui';
import { getRealtimeSocket } from '../lib/realtime';
import { printKitchenTickets } from '../lib/print';
import { usePOSStore } from '../store/pos-store';
import { useRootStore } from '../store/root-store';
import { getActiveDirection, t } from '../i18n';

// Patch 43: alerts the till when a customer orders or asks for the bill from the
// QR app. erp_restaurant (self_order_alerts.py) publishes erp_self_order_<branch>
// after the order is saved.
// Ticket 40: a QR table order waits for the counter ("request": Valider / Refuser on the
// till, info only in the waiter app, which prints no kitchen tickets); the requests still
// waiting are shown again when the till starts; "request_done" removes it on every till.
// A QR pickup order ("pay_first") reaches the kitchen when the cashier prints its bill in Orders
// (owner 2026-11-06; lib/print.ts printQrPickupKitchenTicket), else once paid (PaymentDialog).
// On the till, tapping a QR order toast opens Orders with that order selected (OpenOrderBridge).

interface QrRequest {
  name: string;
  table: string;
  qty: number;
  total: number;
  items: { item_name: string; qty: number; comment?: string }[];
}

interface SelfOrderEvent {
  kind: 'order' | 'bill' | 'request' | 'request_done';
  invoice: string;
  order_number?: string | number;
  table?: string;
  qty?: number;
  pay_first?: boolean;
  request?: QrRequest;
}

const QR_API = 'erp_restaurant.erp_restaurant.qr_validation';

// One context, unlocked by the first tap: iPad Safari keeps a context made outside a tap suspended.
let audioCtx: AudioContext | null = null;

function unlockAudio() {
  try {
    audioCtx = audioCtx || new AudioContext();
    audioCtx.resume().catch(() => undefined);
  } catch {
    audioCtx = null;
  }
}

function beep() {
  const ctx = audioCtx;
  if (!ctx) return; // Not tapped yet, or no audio on this device: the toast is enough.
  ctx.resume().catch(() => undefined);
  [880, 1175].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    gain.gain.value = 0.2;
    osc.connect(gain).connect(ctx.destination);
    osc.start(ctx.currentTime + i * 0.25);
    osc.stop(ctx.currentTime + i * 0.25 + 0.2);
  });
}

function refreshOrdersPage() {
  // Only where the list is shown, keeping the page the cashier is on.
  if (!window.location.pathname.startsWith('/pos/orders')) return;
  const { fetchOrders, pagination } = useRootStore.getState();
  fetchOrders(pagination.currentPage).catch(() => undefined);
}

function message(e: SelfOrderEvent): string {
  const number = String(e.order_number || e.invoice);
  if (e.kind === 'bill') {
    return t('self_order.bill_requested', { table: e.table || '', number });
  }
  const qty = e.qty || 0;
  if (e.table) return t('self_order.new_order_table', { table: e.table, number, qty });
  if (!e.pay_first) return t('self_order.new_order_pickup', { number, qty });
  return t(onTill() ? 'self_order.new_order_pickup_open' : 'self_order.new_order_pickup_pay_first', { number, qty });
}

const requestToastId = (name: string) => `request-${name}`;

// The waiter app (/pos/order, /pos/order/table/<table>) does not print kitchen tickets:
// validation stays at the till (/pos/orders is the till's Orders page, not the waiter app).
const onTill = () => {
  const path = window.location.pathname;
  return !(path === '/pos/order' || path.startsWith('/pos/order/'));
};

// At most this many request toasts at once; the others show as earlier ones are handled.
const MAX_REQUEST_TOASTS = 5;

const RequestCard: React.FC<{ req: QrRequest }> = ({ req }) => {
  const [busy, setBusy] = useState(false);
  const [refusing, setRefusing] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const canDecide = onTill();

  const done = (message: string) => {
    toast.dismiss(requestToastId(req.name));
    showToast.success(message);
    refreshOrdersPage();
  };

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await call.post<{ message?: { invoice?: string } }>(`${QR_API}.accept_qr_order`, { request: req.name });
      done(t('self_order.accepted', { table: req.table }));
      const invoice = res?.message?.invoice;
      const posProfile = usePOSStore.getState().posProfile;
      // Patch 10: the kitchen ticket created by the validation, printed like a confirmed order's.
      if (invoice && posProfile?.custom_auto_print_kitchen_ticket) {
        printKitchenTickets({ invoice, posProfile }).catch((err) =>
          showToast.error(t('kitchen.print_failed', { reason: err?.message || String(err) }))
        );
      }
    } catch (err) {
      setError(parseFrappeError(err, t('self_order.decide_failed')));
      setBusy(false);
    }
  };

  const refuse = async () => {
    if (!reason.trim()) {
      setError(t('self_order.reason_required'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await call.post(`${QR_API}.refuse_qr_order`, { request: req.name, reason: reason.trim() });
      done(t('self_order.refused', { table: req.table }));
    } catch (err) {
      setError(parseFrappeError(err, t('self_order.decide_failed')));
      setBusy(false);
    }
  };

  const button = 'bg-white font-semibold text-blue-700 hover:bg-white/90';
  return (
    <div dir={getActiveDirection()} className="space-y-2">
      <div className="font-semibold">{t('self_order.request_title', { table: req.table, qty: Number(req.qty) })}</div>
      <ul className="text-sm">
        {req.items.map((line, i) => (
          <li key={i}>
            {Number(line.qty)} × {line.item_name}
            {line.comment ? ` (${line.comment})` : ''}
          </li>
        ))}
      </ul>
      {!canDecide && <div className="text-sm">{t('self_order.request_waiter')}</div>}
      {canDecide && !refusing && (
        <div className="flex gap-2">
          <Button type="button" size="sm" className={button} disabled={busy} onClick={accept}>
            {t('self_order.accept')}
          </Button>
          <Button type="button" size="sm" className={button} disabled={busy} onClick={() => setRefusing(true)}>
            {t('self_order.refuse')}
          </Button>
        </div>
      )}
      {canDecide && refusing && (
        <div className="space-y-2">
          <Input
            size="sm"
            className="text-gray-900"
            value={reason}
            maxLength={140}
            placeholder={t('self_order.reason_placeholder')}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="flex gap-2">
            <Button type="button" size="sm" className={button} disabled={busy} onClick={refuse}>
              {t('self_order.confirm_refuse')}
            </Button>
            <Button type="button" size="sm" className={button} disabled={busy} onClick={() => setRefusing(false)}>
              {t('self_order.back')}
            </Button>
          </div>
        </div>
      )}
      {error && <div className="rounded-md bg-white px-2 py-1 text-sm text-red-700">{error}</div>}
    </div>
  );
};

function showRequest(req: QrRequest): boolean {
  const toastId = requestToastId(req.name);
  if (toast.isActive(toastId)) return false;
  toast.info(<RequestCard req={req} />, {
    toastId,
    position: 'top-right',
    autoClose: false,
    closeOnClick: false,
    draggable: false,
    // On the till the toast is the only place a waiting request shows: no close button.
    closeButton: !onTill(),
    theme: 'colored',
  });
  return true;
}

let shownRequests = 0;

// Requests still waiting: at start, after a reconnect (events missed meanwhile) and after one is
// handled (the next ones beyond MAX_REQUEST_TOASTS).
async function loadPendingRequests(branch: string) {
  const res = await call.get<{ message?: QrRequest[] }>(`${QR_API}.get_pending_qr_orders`, { branch });
  const pending = res?.message || [];
  const active = pending.filter((r) => toast.isActive(requestToastId(r.name))).length;
  shownRequests = active;
  let added = 0;
  for (const req of pending) {
    if (shownRequests >= MAX_REQUEST_TOASTS) break;
    if (showRequest(req)) {
      shownRequests += 1;
      added += 1;
    }
  }
  if (added) beep();
}

const SelfOrderListener: React.FC = () => {
  const { posProfile } = usePOSStore();
  const branch = posProfile?.branch || '';

  useEffect(() => {
    window.addEventListener('pointerdown', unlockAudio);
    return () => window.removeEventListener('pointerdown', unlockAudio);
  }, []);

  useEffect(() => {
    if (!branch) return;
    const channel = `erp_self_order_${branch}`;
    let activeSocket: Socket | null = null;
    let cancelled = false;

    const onEvent = (e: SelfOrderEvent) => {
      if (!e?.invoice) return;
      if (e.kind === 'request_done') {
        toast.dismiss(requestToastId(e.invoice));
        refreshOrdersPage();
        loadPendingRequests(branch).catch(() => undefined);
        return;
      }
      if (e.kind === 'request') {
        if (e.request && shownRequests < MAX_REQUEST_TOASTS && showRequest(e.request)) shownRequests += 1;
        beep();
        return;
      }
      // One toast per order and kind: a customer adding more replaces the earlier one.
      const toastId = `${e.kind}-${e.invoice}`;
      const content = <div dir={getActiveDirection()}>{message(e)}</div>;
      // Till, QR order toast: a tap opens the order in Orders, ready to print and take the payment.
      const opens = e.kind === 'order' && onTill();
      if (toast.isActive(toastId)) {
        toast.update(toastId, { render: content });
      } else {
        toast.info(content, {
          toastId,
          position: 'top-right',
          autoClose: false,
          closeOnClick: !opens,
          theme: 'colored',
          onClick: opens ? () => openInOrders(toastId, e.invoice) : undefined,
        });
      }
      beep();
      refreshOrdersPage();
    };

    const loadPending = () => {
      if (cancelled) return;
      loadPendingRequests(branch).catch((error) => console.error('SelfOrderListener: pending QR orders unavailable:', error));
    };
    // Requests made while this till was closed.
    loadPending();

    getRealtimeSocket()
      .then((s) => {
        if (cancelled) return;
        activeSocket = s;
        s.on(channel, onEvent);
        s.on('connect', loadPending); // reconnect after sleep or Wi-Fi loss: events were missed
      })
      .catch((error) => console.error('SelfOrderListener: realtime unavailable:', error));

    return () => {
      cancelled = true;
      activeSocket?.off(channel, onEvent);
      activeSocket?.off('connect', loadPending);
    };
  }, [branch]);

  return null;
};

const OPEN_ORDER_EVENT = 'erp-self-order-open';

function openInOrders(toastId: string, invoice: string) {
  // A dialog open (payment, cancel...) is about the order on screen: a tap must not switch it to
  // another order. The toast stays until the cashier is done.
  if (document.querySelector('[role="dialog"]')) return;
  toast.dismiss(toastId);
  window.dispatchEvent(new CustomEvent<string>(OPEN_ORDER_EVENT, { detail: invoice }));
}

// Mounted inside the Router (App.tsx), unlike the listener: selects the order in Orders' Draft
// list and opens Orders, as a confirmed takeaway does (Patch 08).
export const OpenOrderBridge: React.FC = () => {
  const navigate = useNavigate();
  useEffect(() => {
    const open = async (event: Event) => {
      const invoice = (event as CustomEvent<string>).detail;
      if (!invoice) return;
      const rootStore = useRootStore.getState();
      rootStore.setOrderSearchQuery('');
      await rootStore.setSelectedStatus('Draft');
      const listed = useRootStore.getState().orders.find((o) => o.name === invoice);
      if (listed) useRootStore.getState().selectOrder(listed);
      navigate('/orders');
    };
    window.addEventListener(OPEN_ORDER_EVENT, open);
    return () => window.removeEventListener(OPEN_ORDER_EVENT, open);
  }, [navigate]);
  return null;
};

export default SelfOrderListener;
