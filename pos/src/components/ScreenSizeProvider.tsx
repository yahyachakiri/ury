import { useState, useEffect } from 'react';
import PhoneTillScreen from './PhoneTillScreen';

interface ScreenSizeProviderProps {
  children: React.ReactNode;
}

// This app-wide 1024px floor predates the Captain migration and is correct
// for the desktop-oriented Cashier POS — but it renders ABOVE the router
// (App.tsx: ScreenSizeProvider > AuthGuard > POSOpeningProvider > Router),
// so a blind width check makes the Captain surface (`/ury/order*`),
// deliberately built mobile-first per PLAN.md, completely unreachable on
// any phone. Found via live E2E test at a real phone viewport — every
// prior test in this migration ran at >=1024px and never hit this. Exempt
// Captain routes from the desktop-only gate rather than raising the floor
// for the whole app (Cashier POS genuinely isn't usable below 1024px).
const isCaptainRoute = () => window.location.pathname.includes('/order');

const ScreenSizeProvider = ({ children }: ScreenSizeProviderProps) => {
  const [isScreenTooSmall, setIsScreenTooSmall] = useState(false);

  const checkScreenSize = () => {
    const isSmall = window.innerWidth < 1024 && !isCaptainRoute();
    setIsScreenTooSmall(isSmall);
  };

  useEffect(() => {
    // Check on mount
    checkScreenSize();

    // Add resize listener
    const handleResize = () => {
      checkScreenSize();
    };

    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Patch 81 (ticket 116): a phone gets the scan screen (scan for the till of the same account), not "Desktop Only".
  if (isScreenTooSmall) {
    return <PhoneTillScreen />;
  }

  // Render children if screen size is acceptable
  return <>{children}</>;
};

export default ScreenSizeProvider; 