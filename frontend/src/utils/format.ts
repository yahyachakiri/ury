import { storage } from '@ury/core';

export function formatCurrency(amount: number): string {
  // Patch 16: site currency when the POS has not cached a symbol (was ₹), no Indian grouping.
  const symbol = (storage as any)?.getItem?.('currencySymbol') || (window as any).frappe?.boot?.sysdefaults?.currency || '';
  const formattedVal = typeof amount === 'number' && !isNaN(amount) ? amount.toLocaleString() : amount;
  return `${symbol} ${formattedVal}`;
}

export function formatInvoiceTime(timestamp: string | null): string {
  if (!timestamp) return 'No bill activity yet';
  const parsedDate = new Date(timestamp);
  if (!Number.isNaN(parsedDate.getTime())) {
    return parsedDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: 'numeric' });
  }
  return timestamp;
}
