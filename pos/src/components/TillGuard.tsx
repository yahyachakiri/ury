import { useEffect, useState } from 'react';
import { call } from '@ury/core';
import { usePOSStore } from '../store/pos-store';
import { getRealtimeSocket } from '../lib/realtime';

// Patch 81 (ticket 116, owner 2026-11-21): one open till per till (POS Profile) and per cashier. The till screen
// claims erp_restaurant till_lock when its POS Profile is known and renews it every 20 s; a refused claim, a lost
// lock or another device's "Prendre la main" (erp_till_taken) sends this tab to the "till already open" page
// (/scan?busy=<till>, erp_restaurant owner app), which can scan cards for the open till or take it over.
// The device is a random ID per tab (sessionStorage), read by that page too. The waiter app and the phone screen
// (under 1024 px, Patch 81 PhoneTillScreen) take no lock.
// Patch 86 (owner 2026-11-26): the width was read once, so a page loaded narrow and then widened (a rotated tablet, a
// resized window) showed the till with no lock, next to the same till open elsewhere. The claim now starts when the
// screen becomes a till screen. A till that narrows afterwards keeps its lock (a tablet turned for a moment does not
// lose its till).
const LOCK = 'erp_restaurant.erp_restaurant.till_lock';
export const DEVICE_KEY = 'erp_till_device';
const RENEW_MS = 20_000;

export function tillDeviceId(): string {
  const fresh = () =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  try {
    const saved = sessionStorage.getItem(DEVICE_KEY);
    if (saved) return saved;
    const id = fresh();
    sessionStorage.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    return fresh();
  }
}

/** The till screen (not the waiter app /pos/order, not a phone). /pos/orders (the till's Orders page) is the till. */
export const isTillScreen = () => {
  const path = window.location.pathname.replace(/\/$/, '');
  return window.innerWidth >= 1024 && path !== '/pos/order' && !path.startsWith('/pos/order/');
};

type Claim = { ok: boolean; reason?: string };

const TillGuard: React.FC = () => {
  const tillName = usePOSStore((s) => s.posProfile?.name);
  const [tillScreen, setTillScreen] = useState(isTillScreen);

  useEffect(() => {
    if (tillScreen) return;
    const onResize = () => {
      if (isTillScreen()) setTillScreen(true);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [tillScreen]);

  useEffect(() => {
    if (!tillName || !tillScreen) return;
    const device = tillDeviceId();
    let stopped = false;
    let timer = 0;

    const leave = () => {
      if (stopped) return;
      stopped = true;
      window.location.assign(`/scan?busy=${encodeURIComponent(tillName)}`);
    };

    const tick = async () => {
      if (stopped) return;
      try {
        const r = await call.post<{ message: Claim }>(`${LOCK}.claim`, { pos_profile: tillName, device_id: device });
        if (!r.message.ok) return leave();
      } catch {
        // Network or server error: keep the till usable and try again at the next renewal.
      }
      timer = window.setTimeout(tick, RENEW_MS);
    };
    void tick();

    // Best effort: a closed tab frees the till at once instead of after the lock's minute.
    const release = () => {
      if (stopped) return;
      fetch(`/api/method/${LOCK}.release`, {
        method: 'POST',
        keepalive: true,
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Frappe-CSRF-Token': (window as unknown as { csrf_token?: string }).csrf_token || '',
        },
        body: JSON.stringify({ pos_profile: tillName, device_id: device }),
      }).catch(() => undefined);
    };
    window.addEventListener('pagehide', release);

    const onTaken = (payload: { device?: string }) => {
      if (payload?.device === device) leave();
    };
    let socket: Awaited<ReturnType<typeof getRealtimeSocket>> | null = null;
    getRealtimeSocket()
      .then((s) => {
        if (stopped) return;
        socket = s;
        s.on('erp_till_taken', onTaken);
      })
      .catch(() => undefined);

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      window.removeEventListener('pagehide', release);
      socket?.off('erp_till_taken', onTaken);
    };
  }, [tillName, tillScreen]);

  return null;
};

export default TillGuard;
