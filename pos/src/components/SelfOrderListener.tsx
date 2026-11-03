import { useEffect } from 'react';
import { toast } from 'react-toastify';
import type { Socket } from 'socket.io-client';
import { getRealtimeSocket } from '../lib/realtime';
import { usePOSStore } from '../store/pos-store';
import { useRootStore } from '../store/root-store';
import { getActiveDirection, t } from '../i18n';

// Patch 43: alerts the till when a customer orders or asks for the bill from the
// QR app. erp_restaurant (self_order_alerts.py) publishes erp_self_order_<branch>
// after the order is saved.

interface SelfOrderEvent {
  kind: 'order' | 'bill';
  invoice: string;
  order_number?: string | number;
  table?: string;
  qty?: number;
}

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
  return e.table
    ? t('self_order.new_order_table', { table: e.table, number, qty })
    : t('self_order.new_order_pickup', { number, qty });
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
      // One toast per order and kind: a customer adding more replaces the earlier one.
      const toastId = `${e.kind}-${e.invoice}`;
      const content = <div dir={getActiveDirection()}>{message(e)}</div>;
      if (toast.isActive(toastId)) {
        toast.update(toastId, { render: content });
      } else {
        toast.info(content, { toastId, position: 'top-right', autoClose: false, closeOnClick: true, theme: 'colored' });
      }
      beep();
      refreshOrdersPage();
    };

    getRealtimeSocket()
      .then((s) => {
        if (cancelled) return;
        activeSocket = s;
        s.on(channel, onEvent);
      })
      .catch((error) => console.error('SelfOrderListener: realtime unavailable:', error));

    return () => {
      cancelled = true;
      activeSocket?.off(channel, onEvent);
    };
  }, [branch]);

  return null;
};

export default SelfOrderListener;
