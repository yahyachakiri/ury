import { useEffect, useState } from 'react';
import { Download, Loader, Printer, Share2, X } from 'lucide-react';
import { call, parseFrappeError, printWithQz } from '@ury/core';
import { Button, Dialog, DialogContent, showToast } from '@ury/ui';
import { usePOSStore } from '../store/pos-store';
import { printLanguage } from '../lib/invoice-api';
import { t } from '../i18n';

// Patch 47 (ticket 39): the card of a customer enrolled from the till's "New customer" form.
// erp_restaurant draws the QR (loyalty.get_card) and the ticket (print format "Loyalty Card"),
// so the screen, the paper and the picture all hold the same code.
const CARD_FORMAT = 'Loyalty Card';

interface Card {
  customer: string;
  customer_name: string;
  code: string;
  qr: string;
  restaurant: string;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    // decode(): some Safari versions draw an SVG blank right after onload.
    img.onload = () => Promise.resolve(img.decode?.()).catch(() => undefined).then(() => resolve(img));
    img.onerror = reject;
    img.src = src;
  });
}

/** The card as a PNG for WhatsApp, laid out like the owner app's card. */
async function cardImage(card: Card): Promise<Blob> {
  const size = 640;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size + 200;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#111111';
  ctx.textAlign = 'center';
  ctx.font = '600 34px system-ui, sans-serif';
  ctx.fillText(card.restaurant, size / 2, 64);
  ctx.font = '24px system-ui, sans-serif';
  ctx.fillText(t('loyalty.card_title'), size / 2, 104);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(await loadImage(card.qr), 60, 130, size - 120, size - 120);
  ctx.font = '600 30px system-ui, sans-serif';
  ctx.fillText(card.customer_name, size / 2, size + 80);
  ctx.font = '20px ui-monospace, monospace';
  ctx.fillStyle = '#666666';
  ctx.fillText(card.code, size / 2, size + 130);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('png'))), 'image/png'));
}

function download(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const LoyaltyCardDialog: React.FC<{ customer: string; onClose: () => void }> = ({ customer, onClose }) => {
  const posProfile = usePOSStore((s) => s.posProfile);
  const [card, setCard] = useState<Card | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // The PNG is built when the card arrives: Safari allows share() only right after the tap, so
  // the tap handler must not await anything before it.
  const [png, setPng] = useState<File | null>(null);

  useEffect(() => {
    call
      .get<{ message: Card }>('erp_restaurant.erp_restaurant.loyalty.get_card', { customer })
      .then((r) => setCard(r.message))
      .catch((err) => setError(parseFrappeError(err, t('loyalty.card_load_failed'))));
  }, [customer]);

  useEffect(() => {
    if (!card) return;
    let live = true;
    cardImage(card)
      .then((b) => live && setPng(new File([b], `${t('loyalty.card_title')} ${card.customer_name}.png`, { type: 'image/png' })))
      .catch(() => live && setError(t('loyalty.card_image_failed')));
    return () => {
      live = false;
    };
  }, [card]);

  const handlePrint = () => {
    if (!card) return;
    // Same printer as the bill: QZ Tray, else the browser's print view (opened in the tap itself,
    // so it is not blocked as a popup).
    if (posProfile?.print_type !== 'qz' || !posProfile.qz_host) {
      const params = new URLSearchParams({
        doctype: 'Customer',
        name: card.customer,
        format: CARD_FORMAT,
        no_letterhead: '1',
        letterhead: 'No Letterhead',
        settings: '{}',
        trigger_print: '1',
        _lang: printLanguage(),
      });
      window.open(`/printview?${params.toString()}`, '_blank', 'noopener,noreferrer');
      return;
    }
    const qzHost = posProfile.qz_host;
    setBusy(true);
    call
      .get<{ message: { html: string } }>('frappe.www.printview.get_html_and_style', {
        doc: 'Customer',
        name: card.customer,
        print_format: CARD_FORMAT,
        _lang: printLanguage(),
        no_letterhead: 1,
        letterhead: 'No Letterhead',
        settings: {},
      })
      .then((r) => printWithQz(qzHost, r.message.html, posProfile.custom_bill_printer))
      .then(() => showToast.success(t('loyalty.card_printed')))
      .catch((err) => showToast.error(t('loyalty.card_print_failed', { reason: err?.message || String(err) })))
      .finally(() => setBusy(false));
  };

  const handleDownload = () => {
    if (png) download(png);
  };

  const handleShare = async () => {
    if (!card || !png) return;
    if (!navigator.canShare?.({ files: [png] })) {
      download(png);
      showToast.info(t('loyalty.share_unsupported'));
      return;
    }
    try {
      await navigator.share({ files: [png], text: t('loyalty.share_text', { restaurant: card.restaurant }) });
    } catch (err) {
      // Closing the share sheet is not an error; a refused share falls back to a download.
      if (err instanceof DOMException && err.name === 'AbortError') return;
      download(png);
      showToast.info(t('loyalty.share_failed'));
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="w-full max-w-sm p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">{t('loyalty.card_title')}</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label={t('common.cancel')}>
            <X className="h-5 w-5" />
          </button>
        </div>
        {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}
        {!card && !error && (
          <div className="flex justify-center py-10">
            <Loader className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        )}
        {card && (
          <>
            <div className="text-center">
              <div className="text-base font-semibold text-gray-900">{card.customer_name}</div>
              <img src={card.qr} alt="" className="mx-auto my-3 h-56 w-56" style={{ imageRendering: 'pixelated' }} />
              <div dir="ltr" className="font-mono text-xs tracking-wider text-gray-500">
                {card.code}
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <Button type="button" variant="default" onClick={handlePrint} disabled={busy}>
                {busy ? <Loader className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                <span className="ms-1">{t('loyalty.print')}</span>
              </Button>
              <Button type="button" variant="outline" onClick={handleDownload} disabled={!png}>
                <Download className="h-4 w-4" />
                <span className="ms-1">{t('loyalty.download')}</span>
              </Button>
              <Button type="button" variant="outline" onClick={handleShare} disabled={!png}>
                <Share2 className="h-4 w-4" />
                <span className="ms-1">{t('loyalty.share')}</span>
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default LoyaltyCardDialog;
