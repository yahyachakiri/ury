import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X } from 'lucide-react';
import { usePOSStore } from '../store/pos-store';
import { formatCurrency, call, parseFrappeError } from '@ury/core';
import { Button, Dialog, DialogContent, showToast } from '@ury/ui';
import { DEFAULT_PAYMENT_MODE } from '../data/order-types';
import { t } from '../i18n';
import { printKitchenTickets, printOrder } from '../lib/print';

// Patch 54: touch payment dialog. No field here is a text input, so the system keyboard never
// opens: amounts are buttons that open an on-screen keypad, cash is tapped as bills.
// Bill values: a constant so they can move to POS Profile config later.
const BILLS = [20, 50, 100, 200];
// Tinted after the Moroccan notes. bg / border / text when unused, solid when tapped.
const BILL_COLORS: Record<number, { bg: string; line: string; fg: string; solid: string }> = {
  20: { bg: '#F1EAF9', line: '#7C4FB0', fg: '#4B2A7B', solid: '#5B3594' },
  50: { bg: '#E6F4EC', line: '#2E8B5B', fg: '#14573A', solid: '#1B6B47' },
  100: { bg: '#F6ECE1', line: '#A9713A', fg: '#6A411A', solid: '#7C4F24' },
  200: { bg: '#E4EEF8', line: '#2F6FA8', fg: '#163F66', solid: '#1E4F7C' },
};
const BILL_FALLBACK = { bg: '#F9FAFB', line: '#6B7280', fg: '#111827', solid: '#374151' };
// Cheap touch panels fire twice: a second tap on the same bill this soon is ignored.
const BILL_DEBOUNCE_MS = 150;
const KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', 'del'];
const MAX_KEYPAD_CHARS = 7;

type KeypadTarget =
  | { kind: 'mode'; mode: string }
  | { kind: 'discount' }
  | { kind: 'points' };

interface PaymentDialogProps {
  onClose: () => void;
  grandTotal: number;
  roundedTotal: number;
  invoice: string;
  customer: string;
  posProfile: string;
  table: string | null;
  tableLabel?: string | null;
  cashier: string;
  owner: string;
  fetchOrders: () => Promise<void>;
  clearSelectedOrder: () => void;
  discountPercentage?: number;
  discountAmount?: number;
  // Patch 07: false for merged bills. make_invoice applies the percentage to the
  // primary invoice only, while grandTotal here is the combined total.
  allowDiscount?: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

const CloseIcon = ({ size = 24, strong = false }: { size?: number; strong?: boolean }) => (
  <X width={size} height={size} strokeWidth={strong ? 2.4 : 2} aria-hidden="true" />
);

const PaymentDialog: React.FC<PaymentDialogProps> = ({
  onClose,
  grandTotal,
  invoice,
  customer,
  posProfile,
  table,
  tableLabel,
  cashier,
  owner,
  fetchOrders,
  clearSelectedOrder,
  discountPercentage,
  discountAmount,
  allowDiscount = true
}) => {
  const { paymentModes: allPaymentModes, fetchPaymentModes, posProfile: storePosProfile, currencySymbol, currency } = usePOSStore();
  // Patch 45: methods this customer may not use (the company account method for a customer
  // without an active account, erp_restaurant pos_invoice_company_account). If the call fails
  // every method stays visible and the server still refuses the payment.
  const [hiddenModes, setHiddenModes] = useState<string[]>([]);
  useEffect(() => {
    call
      .get<{ message: string[] }>('erp_restaurant.erp_restaurant.pos_invoice_company_account.hidden_payment_modes', { customer })
      .then((r) => setHiddenModes(r.message || []))
      .catch(() => setHiddenModes([]));
  }, [customer]);
  // Patch 47 (ticket 39): the customer's loyalty points (erp_restaurant loyalty.get_customer_loyalty).
  // Not on merged bills (the server refuses them there). make_invoice gets the points used.
  const [loyalty, setLoyalty] = useState<{ points: number; conversion_factor: number } | null>(null);
  const [pointsWanted, setPointsWanted] = useState(0);
  useEffect(() => {
    setLoyalty(null);
    setPointsWanted(0);
    if (!allowDiscount) return;
    call
      .get<{ message: { enrolled: boolean; points: number; conversion_factor: number } }>(
        'erp_restaurant.erp_restaurant.loyalty.get_customer_loyalty',
        { customer }
      )
      .then((r) => setLoyalty(r.message?.enrolled && r.message.points > 0 ? r.message : null))
      .catch(() => setLoyalty(null));
  }, [customer, allowDiscount]);
  const modeIds = useMemo(
    () => allPaymentModes
      .map((mode: string | { id: string }) => (typeof mode === 'string' ? mode : mode.id))
      .filter((id) => !hiddenModes.includes(id)),
    [allPaymentModes, hiddenModes]
  );
  // Patch 54: the cash method is found by its type on the server (erp_restaurant cash_payment_modes):
  // sites made by our provisioning call it "Espèces", URY only knew the name "Cash" (kept as fallback).
  const [cashModes, setCashModes] = useState<string[]>([]);
  useEffect(() => {
    call
      .get<{ message: string[] }>('erp_restaurant.erp_restaurant.pos_invoice_company_account.cash_payment_modes')
      .then((r) => setCashModes(r.message || []))
      .catch(() => setCashModes([]));
  }, []);
  const cashMode = modeIds.find((id) => cashModes.includes(id)) ?? (modeIds.includes(DEFAULT_PAYMENT_MODE) ? DEFAULT_PAYMENT_MODE : '');
  const hasCash = cashMode !== '';
  const otherModes = modeIds.filter((id) => id !== cashMode);

  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Patch 07: make_invoice always receives a percentage.
  // Effective percentage of an invoice-level discount already on the order.
  const effectivePercentage = discountPercentage
    ? discountPercentage
    : (discountAmount && grandTotal + discountAmount > 0
        ? (discountAmount / (grandTotal + discountAmount)) * 100
        : 0);
  const [appliedDiscount, setAppliedDiscount] = useState<number>(discountAmount || 0);
  // Percentage sent to make_invoice, which sets additional_discount_percentage from it. Before
  // Patch 07 the amount was sent here and applied as a percentage.
  const [appliedPercent, setAppliedPercent] = useState<number>(discountAmount ? effectivePercentage : 0);
  // Patch 54: the percentage shown on the remise row ("Remise 10 %"), null for a fixed amount.
  const [shownPercent, setShownPercent] = useState<number | null>(
    discountAmount && discountPercentage ? discountPercentage : null
  );

  // Patch 54: amounts per payment mode. Cash stays "prefilled" (it follows what is left to pay)
  // until the cashier taps a bill or validates a cash amount; after that it is never overwritten.
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [cashPrefilled, setCashPrefilled] = useState(true);
  const [tally, setTally] = useState<Record<number, number>>({});
  const lastBillTap = useRef<{ value: number; at: number } | null>(null);

  const [keypad, setKeypad] = useState<KeypadTarget | null>(null);
  const [buf, setBuf] = useState('');
  const [keypadError, setKeypadError] = useState<string | null>(null);
  // Kept while the dialog is open: the last unit used for a remise.
  const [discountUnit, setDiscountUnit] = useState<'pct' | 'amt'>('pct');

  // Patch 45: an amount entered in a row before it was hidden must not count.
  useEffect(() => {
    if (!hiddenModes.length) return;
    setAmounts((prev) => {
      const next = { ...prev };
      hiddenModes.forEach((id) => delete next[id]);
      return next;
    });
  }, [hiddenModes]);

  useEffect(() => {
    fetchPaymentModes();
  }, [fetchPaymentModes]);

  // Patch 09: the POS Profile decides the rounding (erp_restaurant
  // custom_round_to_half): up to the next 0.5, or the exact total. The server
  // applies the same rule to the invoice, so the change is 0. null = loading.
  const [roundToHalf, setRoundToHalf] = useState<boolean | null>(null);
  useEffect(() => {
    call.get<{ message?: { round_to_half?: number } }>('erp_restaurant.erp_restaurant.pos_rounding.get_pos_rounding', { pos_profile: posProfile })
      .then((res) => setRoundToHalf(res?.message?.round_to_half === 1))
      .catch(() => setRoundToHalf(false));
  }, [posProfile]);

  // baseTotal: the amount before any invoice-level discount.
  const baseTotal = grandTotal + (discountAmount || 0);
  const subtotal = baseTotal;
  const discountedTotal = Math.max(0, subtotal - appliedDiscount);
  // Patch 09: up to the next 0.5 or exact. Merged bills keep upstream rounding: their total
  // spans two invoices, each rounded by the server.
  const centsTotal = round2(discountedTotal);
  const orderTotal = !allowDiscount
    ? Math.round(discountedTotal)
    : roundToHalf
      ? Math.ceil(Number((centsTotal * 2).toFixed(6))) / 2
      : centsTotal;
  // Patch 47: points used lower what is left to pay (ERPNext counts them as paid).
  const maxPoints = loyalty && loyalty.conversion_factor > 0
    ? Math.min(loyalty.points, Math.floor(orderTotal / loyalty.conversion_factor + 1e-9))
    : 0;
  const pointsUsed = Math.min(maxPoints, pointsWanted);
  const loyaltyAmount = loyalty ? round2(pointsUsed * loyalty.conversion_factor) : 0;
  const finalTotal = Math.max(0, round2(orderTotal - loyaltyAmount));

  const otherSum = otherModes.reduce((sum, id) => sum + (amounts[id] || 0), 0);
  // Patch 54: prefilled cash is derived, so it follows the remise, points and other methods,
  // and a tapped or validated amount is never overwritten (the old autofill effect did).
  const cashAmount = !hasCash ? 0 : cashPrefilled ? Math.max(0, round2(finalTotal - otherSum)) : (amounts[cashMode] || 0);
  // Patch 54: "Montant exact" when cash is exactly what the other methods leave, prefilled or tapped.
  const cashIsExact = hasCash && cashAmount > 0 && Math.abs(cashAmount - round2(finalTotal - otherSum)) < 0.005;
  const amountOf = (id: string) => (id === cashMode ? cashAmount : amounts[id] || 0);

  const payments = modeIds
    .map((id) => ({ mode_of_payment: id, amount: round2(amountOf(id)) }))
    .filter((p) => p.amount > 0);
  const paymentsTotal = round2(payments.reduce((sum, p) => sum + p.amount, 0));
  // Patch 47: an order paid entirely with points still needs one payment row (ERPNext), at 0,
  // on the cash method when the till has it.
  const zeroRowMode = hasCash ? cashMode : modeIds[0] ?? null;
  const paidByPoints = loyaltyAmount > 0 && finalTotal <= 0.005 && payments.length === 0 && !!zeroRowMode;
  const paymentsSent = paidByPoints ? [{ mode_of_payment: zeroRowMode as string, amount: 0 }] : payments;
  const diff = round2(paymentsTotal - finalTotal);
  const isShort = diff < -0.005;

  const finalAdjustment = round2(orderTotal - discountedTotal);
  const showFinalAdjustment = Math.abs(finalAdjustment) > 0.001;

  const discountEnabled = storePosProfile?.enable_discount === 1 && allowDiscount;
  const locked = isProcessing;

  // --- Cash and other methods ---

  const tapBill = (value: number) => {
    if (locked) return;
    const now = Date.now();
    const last = lastBillTap.current;
    if (last && last.value === value && now - last.at < BILL_DEBOUNCE_MS) return;
    lastBillTap.current = { value, at: now };
    setError(null);
    if (cashPrefilled) {
      // First bill replaces the prefilled amount (68 order, tap 20 = 20, not 88).
      setCashPrefilled(false);
      setTally({ [value]: 1 });
      setAmounts((prev) => ({ ...prev, [cashMode]: value }));
      return;
    }
    setTally((prev) => ({ ...prev, [value]: (prev[value] || 0) + 1 }));
    setAmounts((prev) => ({ ...prev, [cashMode]: round2((prev[cashMode] || 0) + value) }));
  };

  const setExactCash = () => {
    if (locked) return;
    setCashPrefilled(true);
    setTally({});
    setAmounts((prev) => {
      const next = { ...prev };
      delete next[cashMode];
      return next;
    });
  };

  const clearMode = (id: string) => {
    if (locked) return;
    if (id === cashMode) {
      setCashPrefilled(false);
      setTally({});
    }
    setAmounts((prev) => ({ ...prev, [id]: 0 }));
  };

  // "Reste": this method takes what the other methods leave. Prefilled cash counts as 0.
  const restToMode = (id: string) => {
    if (locked) return;
    const others = modeIds
      .filter((m) => m !== id)
      .reduce((sum, m) => sum + (m === cashMode ? (cashPrefilled ? 0 : amounts[m] || 0) : amounts[m] || 0), 0);
    if (hasCash && cashPrefilled) {
      setCashPrefilled(false);
      setTally({});
    }
    setAmounts((prev) => ({
      ...prev,
      ...(hasCash && cashPrefilled ? { [cashMode]: 0 } : {}),
      [id]: Math.max(0, round2(finalTotal - others)),
    }));
  };

  // --- Keypad ---

  const openKeypad = (target: KeypadTarget) => {
    if (locked) return;
    setKeypad(target);
    setBuf('');
    setKeypadError(null);
  };

  const closeKeypad = () => {
    setKeypad(null);
    setBuf('');
    setKeypadError(null);
  };

  const pressKey = (k: string) => {
    setKeypadError(null);
    setBuf((b) => {
      if (k === 'del') return b.slice(0, -1);
      if (k === '.') return b.includes('.') ? b : (b || '0') + '.';
      if (b.length >= MAX_KEYPAD_CHARS) return b;
      // At most two decimals (cents).
      const dot = b.indexOf('.');
      if (dot >= 0 && b.length - dot > 2) return b;
      return b + k;
    });
  };

  const removeDiscount = () => {
    setAppliedDiscount(0);
    setAppliedPercent(0);
    setShownPercent(null);
  };

  const confirmKeypad = () => {
    if (!keypad) return;
    const v = parseFloat(buf) || 0;
    if (keypad.kind === 'mode') {
      if (keypad.mode === cashMode) {
        setCashPrefilled(false);
        setTally({});
      }
      setAmounts((prev) => ({ ...prev, [keypad.mode]: round2(v) }));
    } else if (keypad.kind === 'discount') {
      if (v <= 0) {
        removeDiscount();
      } else if (discountUnit === 'pct') {
        if (v > 100) {
          setKeypadError(t('errors.discount_exceeds_max'));
          return;
        }
        // Patch 09: whole cents, as ERPNext rounds discount_amount, so the amount asked
        // matches the saved total.
        setAppliedDiscount(Math.round(baseTotal * v) / 100);
        setAppliedPercent(v);
        setShownPercent(v);
      } else {
        if (v > baseTotal) {
          setKeypadError(t('errors.discount_exceeds_total'));
          return;
        }
        setAppliedDiscount(round2(v));
        setAppliedPercent(baseTotal > 0 ? (v / baseTotal) * 100 : 0);
        setShownPercent(null);
      }
    } else {
      const pts = Math.floor(v);
      if (pts > maxPoints) {
        setKeypadError(t('loyalty.points_exceed_max', { max: maxPoints }));
        return;
      }
      setPointsWanted(pts);
    }
    setError(null);
    closeKeypad();
  };

  const handlePayment = async () => {
    setIsProcessing(true);
    setError(null);
    try {
      const paid = await call.post<{ message?: { kitchen_tickets?: number; kitchen_ticket_failed?: number } | null }>('ury.ury.doctype.ury_order.ury_order.make_invoice', {
        additionalDiscount: appliedPercent > 0 ? appliedPercent : null,
        cashier,
        customer,
        invoice,
        owner,
        payments: paymentsSent,
        pos_profile: posProfile,
        table,
        redeem_points: pointsUsed > 0 ? pointsUsed : null,
      });
      // The order total, not the cash tendered (the change is not "received").
      showToast.success(t('payment.success', { amount: formatCurrency(orderTotal) }));
      // Patch 47: a payment with points prints the receipt (erp_restaurant Restaurant Receipt:
      // points used, earned and the new balance). A failed print does not undo the payment.
      // QZ only: network printing reports no failure, and the browser print view opened after
      // the await would be blocked as a popup on the iPad.
      if (pointsUsed > 0 && storePosProfile?.print_type === 'qz') {
        printOrder({ orderId: invoice, posProfile: storePosProfile, printFormat: storePosProfile.print_format }).catch((err) =>
          showToast.error(t('loyalty.receipt_print_failed', { reason: err?.message || String(err) }))
        );
      }
      // Patch 10 (ticket 40): a customer QR pickup order reaches the kitchen once paid; erp_restaurant
      // created its kitchen ticket with this payment. Printed like a confirmed order's ticket.
      if (paid?.message?.kitchen_tickets && storePosProfile?.custom_auto_print_kitchen_ticket) {
        printKitchenTickets({ invoice, posProfile: storePosProfile }).catch((err) =>
          showToast.error(t('kitchen.print_failed', { reason: err?.message || String(err) }))
        );
      }
      if (paid?.message?.kitchen_ticket_failed) {
        showToast.error(t('kitchen.not_created_on_payment'));
      }
      onClose();
      clearSelectedOrder();
      await fetchOrders();
    } catch (err) {
      console.error('Payment failed:', err);
      // parseFrappeError extracts human-readable message from _server_messages (e.g. stock validation error)
      setError(parseFrappeError(err, t('errors.payment_failed')));
    } finally {
      setIsProcessing(false);
    }
  };

  // --- Rendering helpers ---

  const isEditing = (target: KeypadTarget) =>
    !!keypad && keypad.kind === target.kind && (target.kind !== 'mode' || (keypad.kind === 'mode' && keypad.mode === target.mode));
  const fieldBorder = (target: KeypadTarget) =>
    isEditing(target) ? 'border-2 border-primary' : 'border border-gray-300';
  const sideButton = 'h-16 rounded-[10px] border border-gray-300 bg-gray-50 font-semibold text-gray-900 disabled:opacity-50';
  const clearButton = 'h-16 w-16 shrink-0 rounded-[10px] border border-gray-300 bg-gray-50 text-red-700 flex items-center justify-center disabled:opacity-50';

  const keypadHint = (() => {
    if (!keypad) return '';
    if (keypad.kind === 'mode') return keypad.mode === cashMode ? t('payment.keypad_cash') : t('payment.keypad_card', { mode: keypad.mode });
    if (keypad.kind === 'discount') return discountUnit === 'pct' ? t('payment.keypad_discount_pct') : t('payment.keypad_discount_amount');
    return t('loyalty.points_placeholder', { max: maxPoints });
  })();
  const keypadDisplay = (buf || '0') + (keypad?.kind === 'discount' && discountUnit === 'pct' ? ' %' : '');

  const modeRow = (id: string) => {
    const amount = amounts[id] || 0;
    return (
      <div key={id} className="flex items-center gap-2.5 h-16 shrink-0">
        <span className="w-24 shrink-0 text-base font-semibold leading-5 break-words">{id}</span>
        <Button variant="outline"
          type="button"
          aria-label={id}
          onClick={() => openKeypad({ kind: 'mode', mode: id })}
          disabled={locked}
          className={`flex-1 min-w-0 h-16 rounded-[10px] bg-white px-3.5 flex items-center justify-start ${fieldBorder({ kind: 'mode', mode: id })}`}
        >
          <span className={`text-[26px] font-semibold truncate ${amount > 0 ? 'text-gray-900' : 'text-gray-500'}`}>
            {amount > 0 ? formatCurrency(amount) : t('payment.none')}
          </span>
        </Button>
        <Button variant="outline" type="button" onClick={() => restToMode(id)} disabled={locked} className={`${sideButton} w-[88px] shrink-0 text-[17px]`}>
          {t('payment.rest')}
        </Button>
        <Button variant="outline" type="button" aria-label={t('payment.clear_mode', { mode: id })} onClick={() => clearMode(id)} disabled={locked} className={clearButton}>
          <CloseIcon strong />
        </Button>
      </div>
    );
  };

  let hero: { label: string; value: number; bg: string; fg: string };
  if (diff > 0.005) hero = { label: t('payment.to_return'), value: diff, bg: '#ECFDF3', fg: '#065F46' };
  else if (isShort) hero = { label: t('payment.missing'), value: -diff, bg: '#FFFBEB', fg: '#92400E' };
  else hero = { label: t('payment.exact_change'), value: 0, bg: '#F3F4F6', fg: '#1F2937' };

  // Patch 54: not while the keypad is open, or a typed but unvalidated amount would be dropped.
  const payDisabled = isProcessing || roundToHalf === null || paymentsSent.length === 0 || isShort || keypad !== null;

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent
        variant="xlarge"
        className="bg-white w-full max-w-[976px] max-h-[94vh] lg:h-[min(720px,94vh)] flex flex-col lg:flex-row p-0 overflow-y-auto lg:overflow-hidden tabular-nums text-gray-900"
        showCloseButton={false}
      >
        {/* Left column: cash, bills or keypad, other methods */}
        <div className="lg:w-[580px] lg:shrink-0 px-7 py-6 flex flex-col gap-3.5 border-b lg:border-b-0 lg:border-e border-gray-200 lg:overflow-y-auto">
          <div className="flex items-center justify-between h-12 shrink-0">
            <h2 className="text-[26px] font-bold">{t('payment.title')}</h2>
            <Button variant="ghost" type="button" aria-label={t('payment.close')} onClick={onClose} className="w-12 h-12 flex items-center justify-center">
              <CloseIcon />
            </Button>
          </div>

          {hasCash && (
            <div className="flex items-center gap-2.5 h-16 shrink-0">
              <span className="w-24 shrink-0 text-lg font-semibold break-words leading-5">{cashMode}</span>
              <Button variant="outline"
                type="button"
                aria-label={t('payment.keypad_cash')}
                onClick={() => openKeypad({ kind: 'mode', mode: cashMode })}
                disabled={locked}
                className={`flex-1 min-w-0 h-16 rounded-[10px] bg-white px-3.5 flex items-center justify-between gap-2 ${fieldBorder({ kind: 'mode', mode: cashMode })}`}
              >
                {/* The amount never shrinks; the tapped bills show on their own badges, not here. */}
                <span className={`text-[26px] font-semibold shrink-0 ${cashPrefilled ? 'text-gray-500' : 'text-gray-900'}`}>
                  {formatCurrency(cashAmount)}
                </span>
                {cashIsExact && (
                  <span className="text-[15px] font-medium text-gray-600 whitespace-nowrap truncate">{t('payment.exact_amount')}</span>
                )}
              </Button>
              <Button variant="outline" type="button" onClick={setExactCash} disabled={locked} className={`${sideButton} w-[88px] shrink-0 text-[17px]`}>
                {t('payment.exact')}
              </Button>
              <Button variant="outline"
                type="button"
                aria-label={t('payment.clear_mode', { mode: cashMode })}
                onClick={() => clearMode(cashMode)}
                disabled={locked}
                className={clearButton}
              >
                <CloseIcon strong />
              </Button>
            </div>
          )}

          {keypad ? (
            <div className="h-[380px] lg:h-auto lg:flex-1 lg:min-h-[300px] flex flex-col gap-2.5">
              <div className="min-h-14 shrink-0 flex items-center gap-2.5">
                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <span className={`text-sm font-medium leading-4 line-clamp-2 ${keypadError ? 'text-red-700' : 'text-gray-600'}`} role={keypadError ? 'alert' : undefined}>
                    {keypadError || keypadHint}
                  </span>
                  <span className="text-[26px] font-bold leading-[30px] min-h-[30px]" dir="ltr">{keypadDisplay}</span>
                </div>
                {keypad.kind === 'discount' && (
                  <>
                    <Button variant="outline"
                      type="button"
                      onClick={() => { setDiscountUnit('pct'); setKeypadError(null); }}
                      className={`w-14 h-[52px] rounded-[10px] border border-gray-300 text-lg font-semibold ${discountUnit === 'pct' ? 'bg-primary text-white' : 'bg-gray-50 text-gray-900'}`}
                    >
                      %
                    </Button>
                    <Button variant="outline"
                      type="button"
                      onClick={() => { setDiscountUnit('amt'); setKeypadError(null); }}
                      className={`min-w-[64px] px-2 h-[52px] rounded-[10px] border border-gray-300 text-base font-semibold ${discountUnit === 'amt' ? 'bg-primary text-white' : 'bg-gray-50 text-gray-900'}`}
                    >
                      {currencySymbol || currency}
                    </Button>
                  </>
                )}
                <Button variant="ghost" type="button" aria-label={t('payment.close_keypad')} onClick={closeKeypad} className="w-[52px] h-[52px] flex items-center justify-center">
                  <CloseIcon size={22} />
                </Button>
              </div>
              <div dir="ltr" className="flex-1 min-h-0 grid grid-cols-[repeat(3,minmax(0,1fr))_116px] grid-rows-4 gap-2">
                <Button variant="default"
                  type="button"
                  onClick={confirmKeypad}
                  style={{ gridColumn: 4, gridRow: '1 / span 4' }}
                  className="h-auto rounded-[10px] bg-primary text-white text-[19px] font-semibold"
                >
                  {t('payment.validate')}
                </Button>
                {KEYS.map((k, i) => (
                  <Button variant="outline"
                    key={k}
                    type="button"
                    aria-label={k === 'del' ? t('payment.backspace') : k}
                    onClick={() => pressKey(k)}
                    disabled={k === '.' && keypad.kind === 'points'}
                    style={{ gridColumn: (i % 3) + 1, gridRow: Math.floor(i / 3) + 1 }}
                    className="h-auto rounded-[10px] border border-gray-300 bg-gray-50 text-[28px] font-semibold disabled:opacity-40"
                  >
                    {k === 'del' ? '⌫' : k}
                  </Button>
                ))}
              </div>
            </div>
          ) : hasCash ? (
            <div className="h-[380px] lg:h-auto lg:flex-1 lg:min-h-[300px] flex flex-col gap-3">
              <div className="flex-1 min-h-0 grid grid-cols-2 grid-rows-2 gap-3">
                {BILLS.map((v) => {
                  const c = BILL_COLORS[v] || BILL_FALLBACK;
                  const count = cashPrefilled ? 0 : tally[v] || 0;
                  const used = count > 0;
                  return (
                    <Button variant="outline"
                      key={v}
                      type="button"
                      aria-label={t('payment.add_bill', { value: v })}
                      onClick={() => tapBill(v)}
                      disabled={locked}
                      className="relative h-auto rounded-xl border-2 text-[60px] font-bold tracking-[-0.02em] select-none touch-manipulation"
                      style={{ background: used ? c.solid : c.bg, borderColor: used ? c.solid : c.line, color: used ? '#FFFFFF' : c.fg }}
                    >
                      {v}
                      {used && (
                        <span
                          className="absolute top-3 end-3 min-w-[32px] px-2.5 py-1 rounded-2xl bg-white text-xl font-bold tracking-normal"
                          style={{ color: c.solid }}
                          dir="ltr"
                        >
                          × {count}
                        </span>
                      )}
                    </Button>
                  );
                })}
              </div>
              <Button variant="outline"
                type="button"
                onClick={() => openKeypad({ kind: 'mode', mode: cashMode })}
                disabled={locked}
                className="h-[60px] shrink-0 rounded-[10px] border border-gray-300 bg-gray-50 text-lg font-semibold disabled:opacity-50"
              >
                {t('payment.other_amount')}
              </Button>
            </div>
          ) : (
            <div className="lg:flex-1" />
          )}

          {otherModes.map(modeRow)}
        </div>

        {/* Right column: summary, change, pay */}
        <div className="flex-1 min-w-0 px-7 py-6 flex flex-col gap-3.5 lg:overflow-y-auto">
          <h3 className="h-12 shrink-0 flex items-center text-[22px] font-bold">{t('payment.order_summary')}</h3>
          {tableLabel && (
            <div className="flex justify-between text-lg text-gray-600">
              <span>{t('tables.table_name')}</span>
              <span className="font-medium text-gray-900">{tableLabel}</span>
            </div>
          )}
          <div className="flex justify-between text-lg text-gray-600">
            <span>{t('payment.subtotal')}</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>

          {discountEnabled ? (
            <div className="flex gap-2.5 h-14 shrink-0">
              <Button variant="outline"
                type="button"
                onClick={() => openKeypad({ kind: 'discount' })}
                disabled={locked}
                className={`flex-1 min-w-0 h-14 rounded-[10px] bg-white px-3.5 flex items-center justify-between gap-2 text-[17px] font-semibold ${fieldBorder({ kind: 'discount' })} ${appliedDiscount > 0 ? 'text-green-700' : 'text-gray-900'}`}
              >
                <span className="truncate">
                  {appliedDiscount > 0
                    ? shownPercent !== null
                      ? t('payment.discount_pct_label', { pct: round2(shownPercent) })
                      : t('payment.discount')
                    : t('payment.add_discount')}
                </span>
                {appliedDiscount > 0 && <span className="whitespace-nowrap">−{formatCurrency(appliedDiscount)}</span>}
              </Button>
              {appliedDiscount > 0 && (
                <Button variant="outline"
                  type="button"
                  aria-label={t('payment.remove_discount')}
                  onClick={() => { if (!locked) { removeDiscount(); if (keypad?.kind === 'discount') closeKeypad(); } }}
                  disabled={locked}
                  className="w-14 h-14 shrink-0 rounded-[10px] border border-gray-300 bg-gray-50 text-red-700 flex items-center justify-center disabled:opacity-50"
                >
                  <CloseIcon strong />
                </Button>
              )}
            </div>
          ) : appliedDiscount > 0 ? (
            <div className="flex justify-between text-lg text-green-700">
              <span>{t('payment.discount')}</span>
              <span>−{formatCurrency(appliedDiscount)}</span>
            </div>
          ) : null}

          {showFinalAdjustment && (
            <div className="flex justify-between text-base text-gray-600">
              <span>{t('payment.adjustment')}</span>
              <span>{finalAdjustment > 0 ? '+' : ''}{formatCurrency(finalAdjustment)}</span>
            </div>
          )}
          <div className="flex justify-between items-baseline text-[26px] font-bold border-t border-gray-200 pt-3.5">
            <span>{t('payment.total')}</span>
            <span>{formatCurrency(orderTotal)}</span>
          </div>
          {/* Patch 47 / 54: loyalty points of the order's customer, keypad-edited */}
          {loyalty && maxPoints > 0 && (
            <div className="flex gap-2.5 h-14 shrink-0">
              <Button variant="outline"
                type="button"
                onClick={() => openKeypad({ kind: 'points' })}
                disabled={locked}
                className={`flex-1 min-w-0 h-14 rounded-[10px] bg-white px-3.5 flex items-center justify-between gap-2 text-[15px] font-semibold ${fieldBorder({ kind: 'points' })} ${pointsUsed > 0 ? 'text-green-700' : 'text-gray-900'}`}
              >
                <span className="truncate">
                  {pointsUsed > 0
                    ? t('loyalty.points_used', { points: pointsUsed })
                    : t('loyalty.available', { points: loyalty.points, amount: formatCurrency(loyalty.points * loyalty.conversion_factor) })}
                </span>
                {pointsUsed > 0 && <span className="whitespace-nowrap">−{formatCurrency(loyaltyAmount)}</span>}
              </Button>
              {pointsUsed > 0 ? (
                <Button variant="outline"
                  type="button"
                  aria-label={t('loyalty.remove_points')}
                  onClick={() => { if (!locked) setPointsWanted(0); }}
                  disabled={locked}
                  className="w-14 h-14 shrink-0 rounded-[10px] border border-gray-300 bg-gray-50 text-red-700 flex items-center justify-center disabled:opacity-50"
                >
                  <CloseIcon strong />
                </Button>
              ) : (
                <Button variant="outline"
                  type="button"
                  onClick={() => { if (!locked) setPointsWanted(maxPoints); }}
                  disabled={locked}
                  className="h-14 shrink-0 px-3 rounded-[10px] border border-gray-300 bg-gray-50 text-[15px] font-semibold disabled:opacity-50"
                >
                  {t('loyalty.use_max')}
                </Button>
              )}
            </div>
          )}
          {loyaltyAmount > 0 && (
            <div className="flex justify-between text-lg font-semibold">
              <span>{t('loyalty.left_to_pay')}</span>
              <span>{formatCurrency(finalTotal)}</span>
            </div>
          )}
          <div className="flex justify-between text-lg text-gray-600">
            <span>{t('payment.received')}</span>
            <span>{formatCurrency(paymentsTotal)}</span>
          </div>

          <div className="flex-1 min-h-0 flex flex-col justify-end">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg" role="alert">
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}
          </div>

          <div
            className="h-[156px] min-h-[112px] shrink rounded-xl p-5 flex flex-col justify-center gap-1"
            style={{ background: hero.bg, color: hero.fg }}
            role="status"
          >
            <span className="text-[19px] font-semibold">{hero.label}</span>
            {/* Long amounts drop to 44px so they fit the ~300px panel instead of being cut. */}
            <span className={`font-bold tracking-[-0.02em] truncate ${formatCurrency(hero.value).length > 9 ? 'text-[44px] leading-[52px]' : 'text-[60px] leading-[68px]'}`}>{formatCurrency(hero.value)}</span>
          </div>
          <Button variant="default"
            type="button"
            onClick={handlePayment}
            disabled={payDisabled}
            className={`h-[76px] shrink-0 rounded-xl text-[22px] font-bold disabled:opacity-100 ${payDisabled ? 'bg-gray-200 text-gray-600' : 'bg-primary text-white'}`}
          >
            {isProcessing ? t('payment.processing') : t('payment.pay_button', { amount: formatCurrency(finalTotal) })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PaymentDialog;
