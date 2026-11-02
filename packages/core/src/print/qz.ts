import qz from 'qz-tray';

// Patch 41: unsigned (anonymous) QZ Tray requests, owner choice 2026-11-02: no certificate to install
// on the till PC. Upstream required a private key in this bundle (never set, so every print threw)
// and a cert.pem that was never shipped. QZ Tray asks the till user to allow an unsigned site.
let connecting: Promise<void> | null = null;
let securitySet = false;

// Kept for the apps that still call it at startup; nothing is signed.
export function initPrinting(_opts?: { signKey?: string }) {}

function setQzSecurity(): void {
  if (securitySet) return;
  securitySet = true;
  qz.security.setCertificatePromise((resolve: (data?: string) => void) => resolve());
  qz.security.setSignaturePromise(() => (resolve: (sig?: string) => void) => resolve());
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
