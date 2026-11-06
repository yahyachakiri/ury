import { call, parseFrappeError, printWithQz } from '@ury/core';
import {
  getInvoicePrintHtml,
  printLanguage,
  networkPrint,
  selectNetworkPrinter,
  updatePrintStatus
} from './invoice-api';
import { PosProfileCombined } from './pos-profile-api';
import { t } from '../i18n';

interface PrintOrderParams {
  orderId: string;
  posProfile: PosProfileCombined;
  printFormat?: string | null;
}

export async function printOrder({ orderId, posProfile, printFormat }: PrintOrderParams): Promise<'qz' | 'network' | 'socket'> {
  const { print_type, qz_host, print_format, printer, name, cashier, multiple_cashier } = posProfile;
  const format = printFormat || print_format;

  if (print_type === 'qz') {
    if (!qz_host) {
      throw new Error(t('kitchen.qz_host_missing'));
    }
    const html = await getInvoicePrintHtml(orderId, format as string);
    await printWithQz(qz_host, html, posProfile.custom_bill_printer);
    await updatePrintStatus(orderId);
    return 'qz';
  } else if (print_type === 'network') {
    if (cashier && !multiple_cashier) {
      await networkPrint(orderId, printer as string, format as string);
    } else {
      await selectNetworkPrinter(orderId, name, format);
    }
    await updatePrintStatus(orderId);
    return 'network';
  } else {
    // Redirect to printview page
    // Patch 21: the bill in the cashier's language (was always _lang=en), and no "format=null"
    // when the POS Profile has no print format.
    const params = new URLSearchParams({
      doctype: 'POS Invoice',
      name: orderId,
      no_letterhead: '1',
      settings: '{}',
      letterhead: 'No Letterhead',
      trigger_print: '1',
      _lang: printLanguage(), // Patch 42: French instead of Arabic
    });
    if (format) params.set('format', format);
    const url = `/printview?${params.toString()}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    await updatePrintStatus(orderId);
    return 'socket';
  }
}

// Patch 10: kitchen tickets (URY KOTs) rendered by erp_restaurant and printed
// through QZ Tray on the cashier PC. URY's own KOT print is server-side, which
// a cloud server cannot do for a printer in the restaurant.
interface KitchenTicket {
  name: string;
  type: string;
  html: string;
}

const KITCHEN_API = 'erp_restaurant.erp_restaurant.api.kitchen_print';

export async function printKitchenTickets({
  invoice,
  posProfile,
  reprint = false,
}: {
  invoice: string;
  posProfile: PosProfileCombined;
  reprint?: boolean;
}): Promise<number> {
  const host = posProfile.qz_host;
  if (posProfile.print_type !== 'qz' || !host) {
    throw new Error(t('kitchen.qz_disabled'));
  }
  const res = await call.get<{ message: KitchenTicket[] }>(`${KITCHEN_API}.get_kitchen_tickets`, {
    invoice,
    only_unprinted: reprint ? 0 : 1,
  });
  const tickets = res.message || [];
  const printed: string[] = [];
  try {
    for (const ticket of tickets) {
      await printWithQz(host, ticket.html, posProfile.custom_kitchen_printer);
      printed.push(ticket.name);
    }
  } finally {
    if (printed.length) {
      await call.post(`${KITCHEN_API}.mark_kitchen_tickets_printed`, { invoice, kots: printed });
    }
  }
  return tickets.length;
}

// Patch 56 (ticket 40): a QR pickup order's kitchen ticket goes out with its bill (owner
// 2026-11-06). The server creates the held ticket and says whether this is a QR pickup order;
// any kitchen ticket of it not printed yet is printed, so pressing Print again retries a failed
// kitchen print (no Reprint needed). Other orders: one server read, nothing printed.
// One kitchen print per order at a time: a second tap on Print while QZ is still printing would
// find the same ticket not marked printed yet and print it twice.
const qrKitchenPrinting = new Set<string>();

export async function printQrPickupKitchenTicket({
  invoice,
  posProfile,
}: {
  invoice: string;
  posProfile: PosProfileCombined;
}): Promise<void> {
  let res: { message?: { qr_pickup?: number; kitchen_ticket_failed?: number } };
  try {
    res = await call.post('erp_restaurant.erp_restaurant.qr_validation.release_held_kitchen_ticket', { invoice });
  } catch (err) {
    // Network, or the server without this method yet: one translated line, never a raw error.
    throw new Error(t('kitchen.qr_print_failed', { reason: parseFrappeError(err, t('errors.network')) }));
  }
  const answer = res?.message;
  if (!answer?.qr_pickup) return;
  if (answer.kitchen_ticket_failed) throw new Error(t('kitchen.not_created_on_print'));
  if (!posProfile.custom_auto_print_kitchen_ticket || qrKitchenPrinting.has(invoice)) return;
  qrKitchenPrinting.add(invoice);
  try {
    await printKitchenTickets({ invoice, posProfile });
  } catch (err) {
    throw new Error(t('kitchen.qr_print_failed', { reason: err instanceof Error ? err.message : String(err) }));
  } finally {
    qrKitchenPrinting.delete(invoice);
  }
}
