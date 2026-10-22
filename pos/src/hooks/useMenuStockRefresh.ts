import { useEffect } from 'react';
import { usePOSStore } from '../store/pos-store';

// Patch 25: reload the menu in the background so meals that run out during the shift
// are greyed out (stock figures come from erp_restaurant with each menu load).
const REFRESH_MS = 45000;

export function useMenuStockRefresh() {
  const fetchMenuItems = usePOSStore((state) => state.fetchMenuItems);
  useEffect(() => {
    const refresh = () => {
      // An aggregator order shows the platform's menu (fetchAggregatorMenu): never replace it
      // with the restaurant menu (e2e test 2026-10-22).
      if (usePOSStore.getState().selectedOrderType === 'Aggregators') return;
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
