import qz from 'qz-tray';
import { call } from '../frappe/client';

// Patch 41: QZ Tray trusts a site by its certificate and the signature of each request.
// Both come from the server (erp_restaurant kitchen_print), which keeps the private key:
// upstream expected the key inside this bundle and a static cert.pem that was never shipped.
// Unsigned requests (2026-11-02) made QZ Tray ask "Allow" on every print (owner test 2026-11-04).
const QZ_API = 'erp_restaurant.erp_restaurant.api.kitchen_print';
let connecting: Promise<void> | null = null;
let securitySet = false;

// Kept for the apps that still call it at startup; the key no longer lives in the browser.
export function initPrinting(_opts?: { signKey?: string }) {}

function setQzSecurity(): void {
  if (securitySet) return;
  securitySet = true;
  qz.security.setCertificatePromise((resolve: (data: string) => void, reject: (err?: string) => void) => {
    call
      .get<{ message: string }>(`${QZ_API}.qz_certificate`)
      .then((r) => resolve(r.message))
      .catch((err) => reject('Error fetching certificate: ' + String(err)));
  });
  qz.security.setSignatureAlgorithm('SHA512');
  qz.security.setSignaturePromise((toSign: string) => (resolve: (sig: string) => void, reject: (err?: string) => void) => {
    call
      .post<{ message: string }>(`${QZ_API}.qz_sign`, { request: toSign })
      .then((r) => resolve(r.message))
      .catch((err) => reject(String(err)));
  });
}

export async function loadQzPrinter(host: string): Promise<void> {
  setQzSecurity();
  if (!qz.websocket.isActive()) {
    // Patch 10: kitchen and bill prints can start together; QZ refuses a
    // second connect while one is pending, so they share the same attempt.
    if (!connecting) {
      connecting = qz.websocket.connect({ host, usingSecure: false }).finally(() => {
        connecting = null;
      });
    }
    await connecting;
  }
}

export function disconnectQzPrinter(): void {
  if (qz.websocket.isActive()) qz.websocket.disconnect();
}

// Patch 10: printerName picks a printer installed on the QZ Tray machine;
// empty keeps upstream behavior (the machine's default printer).
export async function printWithQz(host: string, htmlToPrint: string, printerName?: string | null): Promise<void> {
  setQzSecurity();

  const printing = async () => {
    const wanted = printerName?.trim();
    // find(name) resolves the first installed printer whose name contains it
    // (so use the full name) and rejects when none matches.
    const printer = wanted ? ((await qz.printers.find(wanted)) as string) : await qz.printers.getDefault();
    const data = [{ type: 'html', format: 'plain', data: htmlToPrint }];
    const config = qz.configs.create(printer);
    await qz.print(config, data as any);
  };

  if (qz.websocket.isActive()) {
    await printing();
  } else {
    await loadQzPrinter(host);
    await printing();
  }
}
