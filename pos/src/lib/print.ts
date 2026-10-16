import { call, printWithQz } from '@ury/core';
import {
  getInvoicePrintHtml,
  networkPrint,
  selectNetworkPrinter,
  updatePrintStatus
} from './invoice-api';
import { PosProfileCombined } from './pos-profile-api';

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
      throw new Error('QZ host is not set');
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
    const url = `/printview?doctype=POS Invoice&name=${orderId}&format=${format}&no_letterhead=1&settings={}&letterhead=No Letterhead&trigger_print=1&_lang=en`;
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
    throw new Error('QZ Print is not enabled on the POS Profile');
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
