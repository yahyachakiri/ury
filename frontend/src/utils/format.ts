import { storage, numberLocale, withSymbol } from '@ury/core';

export function formatCurrency(amount: number): string {
  // Patch 16: site currency when the POS has not cached a symbol (was ₹), no Indian grouping.
  const symbol = (storage as any)?.getItem?.('currencySymbol') || (window as any).frappe?.boot?.sysdefaults?.currency || '';
  const formattedVal = typeof amount === 'number' && !isNaN(amount) ? amount.toLocaleString(numberLocale()) : amount; // Patch 61, 62: the screen's language
  return withSymbol(symbol, formattedVal); // Patch 60: symbol after the amount when the Currency says so
}

export function formatInvoiceTime(timestamp: string | null): string {
  if (!timestamp) return 'No bill activity yet';
  const parsedDate = new Date(timestamp);
  if (!Number.isNaN(parsedDate.getTime())) {
    return parsedDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: 'numeric' });
  }
  return timestamp;
}
