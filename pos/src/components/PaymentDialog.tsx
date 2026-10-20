import React, { useState, useEffect } from 'react';
import { X, Percent, Coins } from 'lucide-react';
import { usePOSStore } from '../store/pos-store';
import { formatCurrency, call, parseFrappeError } from '@ury/core';
import { Button, Input, Dialog, DialogContent, showToast } from '@ury/ui';
import { DEFAULT_PAYMENT_MODE } from '../data/order-types';
import { t } from '../i18n';


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

const PaymentDialog: React.FC<PaymentDialogProps> = ({
  onClose,
  grandTotal,
  roundedTotal,
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
  const { paymentModes, fetchPaymentModes, posProfile: storePosProfile, currencySymbol, currency } = usePOSStore();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Patch 07: the cashier enters either a percentage or a fixed amount (two
  // fields, each fills the other); make_invoice always receives a percentage.
  
  // Calculate effective percentage if only amount is provided (for invoice-level discounts)
  const effectivePercentage = discountPercentage 
    ? discountPercentage 
    : (discountAmount && grandTotal + discountAmount > 0 
        ? (discountAmount / (grandTotal + discountAmount)) * 100 
        : 0);
        
  const [discountValue, setDiscountValue] = useState<string>(effectivePercentage > 0 ? String(effectivePercentage) : '');
  const [discountAmountValue, setDiscountAmountValue] = useState<string>(discountAmount ? String(discountAmount) : '');
  const [appliedDiscount, setAppliedDiscount] = useState<number>(discountAmount || 0); // Only tracking transaction discount!
  // Percentage sent to make_invoice, which sets additional_discount_percentage
  // from it. Before Patch 07 the amount was sent here and applied as a
  // percentage (10% of 250 MAD sent 25, the invoice got 25% off).
  const [appliedPercent, setAppliedPercent] = useState<number>(discountAmount ? effectivePercentage : 0);
  const [paymentInputs, setPaymentInputs] = useState<{ [mode: string]: string }>({});
  const [prefilledId, setPrefilledId] = useState<string | null>(null);

  useEffect(() => {
    fetchPaymentModes();
  }, [fetchPaymentModes]);

  // Patch 09: the POS Profile decides the rounding (erp_restaurant
  // custom_round_to_half): up to the next 0.5, or the exact total. The server
  // applies the same rule to the invoice, so the change is 0. null = loading.
  const [roundToHalf, setRoundToHalf] = useState<boolean | null>(null);
  useEffect(() => {
    call.get('erp_restaurant.erp_restaurant.pos_rounding.get_pos_rounding', { pos_profile: posProfile })
      .then((res: any) => setRoundToHalf(res?.message?.round_to_half === 1))
      .catch(() => setRoundToHalf(false));
  }, [posProfile]);

  // baseTotal represents the amount before any invoice-level discount (like pricing rule or manual discount)
  const baseTotal = grandTotal + (discountAmount || 0);

  const round2 = (n: number) => String(Math.round(n * 100) / 100);

  const handleApplyDiscount = () => {
    const value = parseFloat(discountValue);
    if (isNaN(value) || value <= 0) {
      setError(t('errors.invalid_discount'));
      return;
    }
    if (value > 100) {
      setError(t('errors.discount_exceeds_max'));
      return;
    }
    // Patch 09: whole cents, as ERPNext rounds discount_amount, so the amount
    // asked matches the saved total.
    const calculatedDiscount = Math.round(baseTotal * value) / 100;
    setAppliedDiscount(calculatedDiscount);
    setAppliedPercent(value);
    setDiscountAmountValue(round2(calculatedDiscount));
    setError(null);
  };

  const handleApplyDiscountAmount = () => {
    const value = parseFloat(discountAmountValue);
    if (isNaN(value) || value <= 0) {
      setError(t('errors.invalid_discount'));
      return;
    }
    if (value > baseTotal) {
      setError(t('errors.discount_exceeds_total'));
      return;
    }
    const percent = baseTotal > 0 ? (value / baseTotal) * 100 : 0;
    setAppliedDiscount(value);
    setAppliedPercent(percent);
    setDiscountValue(round2(percent));
    setError(null);
  };

  // Order summary logic
  const subtotal = baseTotal;
  const adjustment = roundedTotal - grandTotal;
  const roundedAdjustment = Math.round(adjustment * 100) / 100;
  const showAdjustment = Math.abs(roundedAdjustment) > 0.001;
  const totalDiscount = appliedDiscount;
  const discountedTotal = Math.max(0, subtotal - totalDiscount);
  // Patch 09: up to the next 0.5 or exact (was: up to 1 MAD with a discount,
  // nearest MAD without). Merged bills keep upstream rounding: their total
  // spans two invoices, each rounded by the server.
  const centsTotal = Math.round(discountedTotal * 100) / 100;
  const finalTotal = !allowDiscount
    ? Math.round(discountedTotal)
    : roundToHalf
      ? Math.ceil(Number((centsTotal * 2).toFixed(6))) / 2
      : centsTotal;

  // Calculate split payment total
  const payments = paymentModes
    .map((mode: any) => {
      const id = typeof mode === 'string' ? mode : mode.id;
      const amount = parseFloat(paymentInputs[id] || '');
      return amount > 0 ? { mode_of_payment: id, amount } : null;
    })
    .filter(Boolean);
  const paymentsTotal = payments.reduce((sum, p: any) => sum + p.amount, 0);
  const shortfall = finalTotal - paymentsTotal;
  const isShort = shortfall > 0.005;

  const finalAdjustment = finalTotal - discountedTotal;
  const roundedFinalAdjustment = Math.round(finalAdjustment * 100) / 100;
  const showFinalAdjustment = Math.abs(roundedFinalAdjustment) > 0.001;

  useEffect(()=>{
    const defaultPaymentModePresent=paymentModes.find((mode)=>mode===DEFAULT_PAYMENT_MODE)
    //only one payment mode should be present, then autofill the final amount, if not do not fill
    const otherPaymentModesNotEntered=Object.keys(paymentInputs).length<=1;
    if(finalTotal && paymentModes && DEFAULT_PAYMENT_MODE && defaultPaymentModePresent && otherPaymentModesNotEntered){
      //check if default payment mode is present in paymentModes
      setPaymentInputs((prev)=>({ 
        ...prev,
        [DEFAULT_PAYMENT_MODE]:String(finalTotal) 
      }))
    }
  },[finalTotal,paymentModes])

  // Helper to calculate remaining balance
  const getRemainingBalance = (currentId: string) => {
    const totalEntered = Object.entries(paymentInputs)
      .filter(([id]) => id !== currentId)
      .reduce((sum, [_, val]) => sum + (parseFloat(val) || 0), 0);
    return Math.max(0, finalTotal - totalEntered);
  };

  // Handler for input focus to auto-fill remaining balance
  const handlePaymentInputFocus = (id: string) => {
    // Only auto-fill if the field is empty or zero
    if (!paymentInputs[id] || parseFloat(paymentInputs[id]) === 0) {
      const remaining = getRemainingBalance(id);
      if (remaining > 0) {
        setPaymentInputs(inputs => ({ ...inputs, [id]: String(remaining) }));
        // Patch 19/23: the next keystroke replaces the prefilled amount (tendered cash
        // 100 on 68 gives 100, not 68100), even when typed before the selection shows.
        setPrefilledId(id);
      }
    }
  };

  const handlePaymentInputChange = (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    if (prefilledId === id) {
      const input = e.nativeEvent as InputEvent;
      if (input.inputType === 'insertText' && input.data) value = input.data;
      else if (input.inputType?.startsWith('delete')) value = '';
      setPrefilledId(null);
    }
    setPaymentInputs(inputs => ({ ...inputs, [id]: value }));
  };

  const handlePayment = async () => {
    setIsProcessing(true);
    setError(null);
    try {
      await call.post('ury.ury.doctype.ury_order.ury_order.make_invoice', {
        additionalDiscount: appliedPercent > 0 ? appliedPercent : null,
        cashier,
        customer,
        invoice,
        owner,
        payments,
        pos_profile: posProfile,
        table,
      });
      // The order total, not the cash tendered (the change is not "received").
      showToast.success(t('payment.success', { amount: formatCurrency(finalTotal) }));
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

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent variant="xlarge" className="bg-white w-full max-w-4xl max-h-dialog-max-h flex flex-col md:flex-row p-0" showCloseButton={false}>
        {/* Left Column - Discount and Payment Mode */}
        <div className="md:w-1/2 p-6 border-b md:border-b-0 md:border-r border-gray-200 overflow-y-auto">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900">{t('payment.title')}</h2>
            <Button
              onClick={onClose}
              variant="ghost"
              size="icon"
              className="p-2"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Discount Section (conditional) */}
          {storePosProfile?.enable_discount === 1 && allowDiscount && (
            <div className="space-y-4 mb-6">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Percent className="w-5 h-5" />
                {t('payment.apply_discount')}
              </h3>
              <div className="flex gap-2 items-center">
                <span className="w-12 text-sm font-medium text-gray-700">%</span>
                <Input
                  type="number"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  placeholder={t('payment.discount_placeholder')}
                  size="sm"
                  className="flex-1"
                />
                <Button
                  onClick={handleApplyDiscount}
                  variant="default"
                  size="sm"
                >
                  {t('common.apply')}
                </Button>
              </div>
              <div className="flex gap-2 items-center">
                <span className="w-12 text-sm font-medium text-gray-700">{currencySymbol || currency}</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={discountAmountValue}
                  onChange={(e) => setDiscountAmountValue(e.target.value)}
                  placeholder={t('payment.discount_amount_placeholder')}
                  size="sm"
                  className="flex-1"
                />
                <Button
                  onClick={handleApplyDiscountAmount}
                  variant="default"
                  size="sm"
                >
                  {t('common.apply')}
                </Button>
              </div>
            </div>
          )}

          {/* Payment Methods Section - Split Payment */}
          <div className="space-y-4 mb-6">
            <h3 className="text-lg font-semibold">{t('payment.payment_methods')}</h3>
            <div className="grid grid-cols-1 gap-3">
              {paymentModes.map((mode: any) => {
                const id = typeof mode === 'string' ? mode : mode.id;
                return (
                  <div key={id} className="flex items-center gap-3">
                    <span className="w-24 font-medium">{typeof mode === 'string' ? mode : mode.name}</span>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={paymentInputs[id] || ''}
                      onChange={e => handlePaymentInputChange(id, e)}
                      onBlur={() => setPrefilledId(null)}
                      onFocus={(e) => {
                        handlePaymentInputFocus(id);
                        // Select the prefilled amount so typing the tendered cash replaces it (100, not 68100).
                        const input = e.currentTarget;
                        requestAnimationFrame(() => input.select());
                      }}
                      placeholder={t('payment.amount_placeholder')}
                      className="flex-1"
                      size="sm"
                      disabled={isProcessing}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between mt-2 text-sm">
              <span className="font-medium">{t('payment.total_entered')}</span>
              <span className={`${isShort ? 'text-amber-700' : 'text-green-600'} font-semibold flex items-center gap-1`}>
                {formatCurrency(paymentsTotal)} / {formatCurrency(finalTotal)}
                {paymentsTotal > finalTotal && (
                  <span className="text-yellow-700 font-semibold">
                    <Coins className="inline w-4 h-4 ml-1 text-yellow-500" />
                    <span className="text-yellow-500 font-bold ml-1">{formatCurrency(paymentsTotal - finalTotal)}</span>
                  </span>
                )}
              </span>
            </div>
            {isShort && (
              <p role="status" className="text-amber-700 text-sm font-medium">
                {t('payment.short_by', { amount: formatCurrency(shortfall) })}
              </p>
            )}
            {paymentsTotal > finalTotal && (
              <p className="text-yellow-700 text-sm font-medium">
                {t('payment.change_due', { amount: formatCurrency(paymentsTotal - finalTotal) })}
              </p>
            )}
          </div>
        </div>

        {/* Right Column - Order Summary and Pay Button */}
        <div className="md:w-1/2 p-6 overflow-y-auto">
          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          {/* Order Summary */}
          <div className="space-y-3 mb-6">
            <h3 className="text-lg font-semibold">{t('payment.order_summary')}</h3>
            {tableLabel && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">{t('tables.table_name')}</span>
                <span className="font-medium">{tableLabel}</span>
              </div>
            )}
            <div className="space-y-2 text-sm">
              {/* Subtotal (Grand Total) */}
              <div className="flex justify-between">
                <span className="text-gray-600">{t('payment.subtotal')}</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              {/* Discount */}
              {appliedDiscount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>{t('payment.discount')}</span>
                  <span>-{formatCurrency(appliedDiscount)}</span>
                </div>
              )}
              {/* Adjustment (if any) */}
              {showFinalAdjustment && (
                <div className="flex justify-between text-blue-600">
                  <span>{t('payment.adjustment')}</span>
                  <span>{roundedFinalAdjustment > 0 ? '+' : ''}{formatCurrency(roundedFinalAdjustment)}</span>
                </div>
              )}
              {/* Final Total (Rounded) */}
              <div className="border-t pt-2">
                <div className="flex justify-between font-semibold text-lg">
                  <span>{t('payment.total')}</span>
                  <span>{formatCurrency(finalTotal)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Payment Button */}
          <Button
            onClick={handlePayment}
            disabled={isProcessing || roundToHalf === null || payments.length === 0 || isShort}
            variant={isProcessing || roundToHalf === null || payments.length === 0 || isShort ? "secondary" : "default"}
            className="w-full"
          >
            {isProcessing ? t('payment.processing') : t('payment.pay_button', { amount: formatCurrency(paymentsTotal > 0 ? paymentsTotal : finalTotal) })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PaymentDialog; 