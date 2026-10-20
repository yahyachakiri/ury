import { useEffect } from 'react';
import { usePOSStore } from '../store/pos-store';

// Patch 25: reload the menu in the background so meals that run out during the shift
// are greyed out (stock figures come from erp_restaurant with each menu load).
const REFRESH_MS = 45000;

export function useMenuStockRefresh() {
  const fetchMenuItems = usePOSStore((state) => state.fetchMenuItems);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') void fetchMenuItems(true);
    };
    const timer = window.setInterval(refresh, REFRESH_MS);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [fetchMenuItems]);
}
