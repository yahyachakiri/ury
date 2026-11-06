import qz from 'qz-tray';
import { call } from '../frappe/client';
import { errorMessage } from '../frappe/errors';

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

// Patch 55: QZ Tray's own errors when it is not running or quits during a print, shown to the
// cashier in English before; they become the till's translated message.
const QZ_NOT_RUNNING = /Unable to establish connection with QZ|connection to QZ Tray has not been established|Connection closed before response received/i;

function qzError(err: unknown): unknown {
  return QZ_NOT_RUNNING.test(String((err as Error)?.message ?? err)) ? new Error(errorMessage('qzNotRunning')) : err;
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
    try {
      await connecting;
    } catch (err) {
      throw qzError(err); // Patch 55
    }
  }
}

export function disconnectQzPrinter(): void {
  if (qz.websocket.isActive()) qz.websocket.disconnect();
}

// Patch 51: "192.168.1.50" or "192.168.1.50:9100"; the Java socket errors when nothing answers
// (not QZ Tray's own "Connection closed" / "not been established" websocket errors).
const NETWORK_PRINTER = /^(\d{1,3}(?:\.\d{1,3}){3})(?::(\d{1,5}))?$/;
const UNREACHABLE = /ConnectException|refused|timed? ?out|unreachable|no route to host|host is down/i;
// Patch 51: one job at a time, so a kitchen ticket and a bill sent together to the same network
// printer do not compete for its single connection.
let printQueue: Promise<unknown> = Promise.resolve();

// Patch 10: printerName picks a printer installed on the QZ Tray machine;
// empty keeps upstream behavior (the machine's default printer).
export function printWithQz(host: string, htmlToPrint: string, printerName?: string | null): Promise<void> {
  const job = printQueue.catch(() => undefined).then(() => printOne(host, htmlToPrint, printerName));
  printQueue = job;
  return job;
}

async function printOne(host: string, htmlToPrint: string, printerName?: string | null): Promise<void> {
  setQzSecurity();

  const printing = async () => {
    const wanted = printerName?.trim();
    // Patch 51: an IP address (port 9100 unless given) prints straight to the printer over
    // the network, so a printer that is off fails the print instead of waiting in the
    // computer's print queue while the POS shows success.
    const network = wanted?.match(NETWORK_PRINTER);
    // find(name) resolves the first installed printer whose name contains it
    // (so use the full name) and rejects when none matches.
    const printer = network
      ? { host: network[1], port: network[2] || '9100' }
      : wanted
        ? ((await qz.printers.find(wanted)) as string)
        : await qz.printers.getDefault();
    // Patch 50 (replaces Patch 48): raw ESC/POS bytes, drawn below, so no driver or
    // Windows setting resizes the ticket.
    const data = [{ type: 'raw', format: 'command', flavor: 'base64', data: await htmlToEscPos(htmlToPrint) }];
    const config = qz.configs.create(printer);
    try {
      await qz.print(config, data as any);
    } catch (err) {
      if (network && UNREACHABLE.test(String((err as Error)?.message ?? err))) {
        throw new Error(errorMessage('printerUnreachable'));
      }
      throw qzError(err); // Patch 55
    }
  };

  if (qz.websocket.isActive()) {
    await printing();
  } else {
    await loadQzPrinter(host);
    await printing();
  }
}

// Patch 50: QZ's HTML print was sized by each PC's driver (600 dpi on one Windows PC, 203 dpi
// on another, A4 on macOS), so no layout width fit every till (owner tests 2026-11-05). The
// browser now draws the ticket at the head's own resolution and sends it as an ESC/POS raster
// image (GS v 0) with a cut, as an 80 mm thermal printer expects.
const PAPER_MM = 80; // the print formats are laid out for 80 mm paper
const DOTS_PER_MM = 8; // 203 dpi head
const PRINT_DOTS = 576; // printable 72 mm, centered on the paper (SPRT POS8811 self-test)
const MAX_HEIGHT_MM = 600; // longest ticket drawn; anything below is not printed
const BLACK_BELOW = 160; // luminance (0-255) under which a dot prints black
const BAND_ROWS = 256; // rows per GS v 0 command, under the printers' height limit

const CSS_PX_PER_MM = 96 / 25.4;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// An SVG drawn as an image loads nothing from the network: pictures (the logo) go in as data URLs.
// A picture that cannot be fetched is left out rather than failing the print.
async function inlineImages(doc: Document): Promise<void> {
  await Promise.all(
    Array.from(doc.images).map(async (img) => {
      const src = img.getAttribute('src');
      if (!src || src.startsWith('data:')) return;
      try {
        const res = await fetch(src, { credentials: 'include' });
        if (!res.ok) throw new Error(String(res.status));
        img.setAttribute('src', await blobToDataUrl(await res.blob()));
      } catch {
        img.remove();
      }
    })
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(errorMessage('printDraw')));
    img.src = src;
  });
}

// The ticket on 80 mm paper, drawn by the browser (fonts, Arabic, RTL as on screen) at 8 dots
// per mm, then the printable 72 mm in the middle, as a driver would print it.
async function drawTicket(html: string): Promise<ImageData> {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  await inlineImages(doc);
  const xml = new XMLSerializer();
  const content = [...Array.from(doc.head.childNodes), ...Array.from(doc.body.childNodes)]
    .map((node) => xml.serializeToString(node))
    .join('');
  const width = PAPER_MM * DOTS_PER_MM;
  const height = MAX_HEIGHT_MM * DOTS_PER_MM;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${PAPER_MM * CSS_PX_PER_MM} ${MAX_HEIGHT_MM * CSS_PX_PER_MM}">` +
    '<foreignObject x="0" y="0" width="100%" height="100%">' +
    `<div xmlns="http://www.w3.org/1999/xhtml" style="width: ${PAPER_MM}mm; margin: 0; padding: 0; color: #000;">` +
    `${content}</div>` +
    '</foreignObject></svg>';
  const img = await loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error(errorMessage('printDraw'));
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return ctx.getImageData((width - PRINT_DOTS) / 2, 0, PRINT_DOTS, height);
}

// One bit per dot (1 = black), rows packed left to right, trailing blank rows dropped.
function toBits(image: ImageData): { bits: Uint8Array; rows: number } {
  const bytesPerRow = PRINT_DOTS / 8;
  const bits = new Uint8Array(bytesPerRow * image.height);
  const px = image.data;
  let rows = 0;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < PRINT_DOTS; x++) {
      const i = (y * PRINT_DOTS + x) * 4;
      if (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2] < BLACK_BELOW) {
        bits[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
        rows = y + 1;
      }
    }
  }
  return { bits, rows };
}

async function htmlToEscPos(html: string): Promise<string> {
  const { bits, rows } = toBits(await drawTicket(html));
  const bytesPerRow = PRINT_DOTS / 8;
  const bands = Math.ceil(rows / BAND_ROWS);
  const out = new Uint8Array(2 + bands * 8 + rows * bytesPerRow + 4);
  let o = 0;
  out.set([0x1b, 0x40], o); // ESC @: reset the printer
  o += 2;
  for (let y = 0; y < rows; y += BAND_ROWS) {
    const n = Math.min(BAND_ROWS, rows - y);
    // GS v 0, normal size, width in bytes, height in dots
    out.set([0x1d, 0x76, 0x30, 0x00, bytesPerRow & 0xff, bytesPerRow >> 8, n & 0xff, n >> 8], o);
    o += 8;
    out.set(bits.subarray(y * bytesPerRow, (y + n) * bytesPerRow), o);
    o += n * bytesPerRow;
  }
  out.set([0x1d, 0x56, 0x42, 0x00], o); // GS V 66 0: feed to the cutter and cut
  let binary = '';
  for (let i = 0; i < out.length; i += 0x8000) {
    binary += String.fromCharCode(...out.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}
