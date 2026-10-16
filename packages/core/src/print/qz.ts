import qz from 'qz-tray';
import axios from 'axios';
import { KEYUTIL, KJUR, stob64, hextorstr } from 'jsrsasign';

let injectedSignKey: string | null = null;
let connecting: Promise<void> | null = null;

export function initPrinting(opts: { signKey: string }) {
  injectedSignKey = opts.signKey;
}

function ensureSignKey(): string {
  if (!injectedSignKey) {
    throw new Error(
      'QZ printing has not been initialized. Call initPrinting({ signKey: ... }) before using printWithQz.'
    );
  }
  return injectedSignKey;
}

export async function loadQzPrinter(host: string): Promise<void> {
  qz.security.setCertificatePromise((resolve: (data: string) => void, reject: (err?: string) => void) => {
    axios.get('/assets/ury/files/cert.pem')
      .then(({ data }) => resolve(data))
      .catch((err) => reject('Error fetching certificate: ' + String(err)));
  });
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
  const signKey = ensureSignKey();

  qz.security.setSignatureAlgorithm('SHA512');
  qz.security.setSignaturePromise((toSign: string) => (resolve: (sig: string) => void, reject: (err?: string) => void) => {
    try {
      const pk = KEYUTIL.getKey(signKey);
      const sig = new KJUR.crypto.Signature({ alg: 'SHA512withRSA' });
      sig.init(pk);
      sig.updateString(toSign);
      const hex = sig.sign();
      resolve(stob64(hextorstr(hex)));
    } catch (err) {
      reject(String(err));
    }
  });

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
