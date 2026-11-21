import { useEffect, useRef, useState } from 'react';
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Input } from '@ury/ui';
import { t } from '../../i18n';

// Patch 82 (ticket 116, owner 2026-11-21): the waiter scans a customer's loyalty card with the phone's camera (or
// types its code). The browser's own BarcodeDetector where it exists (Chrome on Android); else jsQR 1.4.0, served by
// erp_restaurant (public/js/vendor, loaded only then: the server's POS build installs no new package).
const CARD = /LOY[A-Z]{12}/;
const JSQR_URL = '/assets/erp_restaurant/js/vendor/jsqr-1.4.0.min.js';
const EVERY_MS = 250;
const RETRY_AFTER_MS = 3000;

type Detector = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> };
type DetectorClass = { new (options: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> };
type JsQr = (data: Uint8ClampedArray, width: number, height: number, options?: { inversionAttempts?: string }) => { data: string } | null;

async function nativeDetector(): Promise<Detector | null> {
  const Native = (window as unknown as { BarcodeDetector?: DetectorClass }).BarcodeDetector;
  if (!Native) return null;
  try {
    const formats = (await Native.getSupportedFormats?.()) ?? ['qr_code'];
    return formats.includes('qr_code') ? new Native({ formats: ['qr_code'] }) : null;
  } catch {
    return null;
  }
}

let jsQrPromise: Promise<JsQr | null> | null = null;
function loadJsQr(): Promise<JsQr | null> {
  const ready = (window as unknown as { jsQR?: JsQr }).jsQR;
  if (ready) return Promise.resolve(ready);
  if (!jsQrPromise) {
    jsQrPromise = new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = JSQR_URL;
      script.async = true;
      script.onload = () => resolve((window as unknown as { jsQR?: JsQr }).jsQR ?? null);
      script.onerror = () => {
        jsQrPromise = null;
        resolve(null);
      };
      document.head.appendChild(script);
    });
  }
  return jsQrPromise;
}

interface CaptainScanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with a card code; resolves once applied, throws when refused (the caller shows the message). */
  onCode: (code: string) => Promise<void>;
}

export default function CaptainScanDialog({ open, onOpenChange, onCode }: CaptainScanDialogProps) {
  const video = useRef<HTMLVideoElement>(null);
  const [camera, setCamera] = useState<'starting' | 'on' | 'off'>('starting');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const busyRef = useRef(false);
  // The last code that failed, and when: the camera keeps seeing it, so it is skipped for a few seconds.
  const failedRef = useRef<{ code: string; at: number } | null>(null);
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;

  const submit = async (code: string, fromCamera = false) => {
    if (busyRef.current) return;
    const failed = failedRef.current;
    if (fromCamera && failed && failed.code === code && Date.now() - failed.at < RETRY_AFTER_MS) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await onCodeRef.current(code);
      failedRef.current = null;
    } catch {
      failedRef.current = { code, at: Date.now() };
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    let timer = 0;
    let stopped = false;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });

    const start = async () => {
      setCamera('starting');
      if (!navigator.mediaDevices?.getUserMedia) return setCamera('off');
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      } catch {
        return setCamera('off');
      }
      if (stopped || !video.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      video.current.srcObject = stream;
      await video.current.play().catch(() => undefined);
      setCamera('on');
      const detector = await nativeDetector();
      const jsQR = detector ? null : await loadJsQr();
      const tick = async () => {
        if (stopped) return;
        const v = video.current;
        let text: string | null = null;
        if (!busyRef.current && v && v.readyState >= 2 && v.videoWidth) {
          try {
            if (detector) {
              text = (await detector.detect(v)).map((r) => r.rawValue).find((value) => CARD.test(value)) ?? null;
            } else if (jsQR && context) {
              const scale = Math.min(1, 640 / v.videoWidth);
              canvas.width = Math.round(v.videoWidth * scale);
              canvas.height = Math.round(v.videoHeight * scale);
              context.drawImage(v, 0, 0, canvas.width, canvas.height);
              const image = context.getImageData(0, 0, canvas.width, canvas.height);
              const found = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });
              text = found && CARD.test(found.data) ? found.data : null;
            }
          } catch {
            text = null;
          }
        }
        const match = text?.match(CARD)?.[0];
        if (match) await submit(match, true);
        timer = window.setTimeout(tick, EVERY_MS);
      };
      void tick();
    };
    void start();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [open, attempt]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('loyalty_scan.title')}</DialogTitle>
          <DialogDescription>{t('loyalty_scan.hint')}</DialogDescription>
        </DialogHeader>
        <div className="relative overflow-hidden rounded-lg bg-black">
          <video ref={video} muted playsInline autoPlay className="aspect-[4/3] w-full object-cover" />
          {camera !== 'on' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center text-sm text-white">
              <p>{t(camera === 'starting' ? 'loyalty_scan.camera_starting' : 'loyalty_scan.camera_off')}</p>
              {camera === 'off' && (
                <Button variant="outline" onClick={() => setAttempt((n) => n + 1)}>
                  {t('loyalty_scan.camera_retry')}
                </Button>
              )}
            </div>
          )}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const code = typed.replace(/\s/g, '').toUpperCase();
            if (CARD.test(code)) void submit(code).then(() => setTyped(''));
          }}
        >
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={t('loyalty_scan.code_placeholder')}
            aria-label={t('loyalty_scan.code_placeholder')}
            autoComplete="off"
            className="flex-1"
          />
          <Button type="submit" disabled={busy || !CARD.test(typed.replace(/\s/g, '').toUpperCase())}>
            {t('loyalty_scan.apply')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
