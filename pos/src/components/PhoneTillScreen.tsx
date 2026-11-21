import { LogOut, ScanLine } from 'lucide-react';
import { Button } from '@ury/ui';
import { t } from '../i18n';

// Patch 81 (ticket 116, owner 2026-11-21): a cashier opening the till on a phone gets this screen instead of URY's
// "Desktop Only" dialog. The scan button opens erp_restaurant's scan page in "send to the till" mode (/scan?till=1):
// the scanned customer goes onto the order open on the till of the same account (Patch 81 LoyaltyScanListener).
const PhoneTillScreen = () => {
  const logout = () => {
    fetch('/api/method/logout', { credentials: 'include' })
      .catch(() => undefined)
      .finally(() => window.location.assign('/login'));
  };
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-white p-6 text-center">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold text-gray-900">{t('phone_till.title')}</h1>
        <p className="text-sm text-gray-600">{t('phone_till.text')}</p>
      </div>
      <Button className="h-14 w-full max-w-xs gap-2 text-base" onClick={() => window.location.assign('/scan?till=1')}>
        <ScanLine className="h-5 w-5" aria-hidden="true" />
        {t('phone_till.scan')}
      </Button>
      <Button variant="ghost" onClick={logout} className="gap-2 text-sm text-gray-500">
        <LogOut className="h-4 w-4" aria-hidden="true" />
        {t('phone_till.logout')}
      </Button>
    </div>
  );
};

export default PhoneTillScreen;
