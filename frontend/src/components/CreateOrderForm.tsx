"use client";

import { useState, useCallback } from 'react';
import { useSignAndExecuteTransaction, useSuiClient, useCurrentAccount } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { CONTRACT, MIST_PER_SUI, PRICE_PRECISION, ORDER_DIRECTION } from '@/lib/constants';
import { usePrice } from '@/hooks/usePrice';

interface CreateOrderFormProps {
  onSuccess?: () => void;
}

export function CreateOrderForm({ onSuccess }: CreateOrderFormProps) {
  const [orderType, setOrderType] = useState<'stop-loss' | 'take-profit'>('stop-loss');
  const [amount, setAmount] = useState('');
  const [triggerPrice, setTriggerPrice] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const account = useCurrentAccount();
  const client = useSuiClient();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const { priceData } = usePrice();

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!account) {
      setError('Please connect your wallet');
      return;
    }

    const amountNum = parseFloat(amount);
    const priceNum = parseFloat(triggerPrice);

    if (isNaN(amountNum) || amountNum <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    if (isNaN(priceNum) || priceNum <= 0) {
      setError('Please enter a valid trigger price');
      return;
    }

    try {
      setIsSubmitting(true);

      // Convert to MIST and scaled price
      const amountMist = BigInt(Math.floor(amountNum * Number(MIST_PER_SUI)));
      const scaledPrice = BigInt(Math.floor(priceNum * Number(PRICE_PRECISION)));

      // Build transaction
      const tx = new Transaction();

      // Split coin for the order
      const [coin] = tx.splitCoins(tx.gas, [amountMist]);

      // Call create_stop_loss_order or create_take_profit_order
      const functionName = orderType === 'stop-loss'
        ? 'create_stop_loss_order'
        : 'create_take_profit_order';

      tx.moveCall({
        target: `${CONTRACT.PACKAGE_ID}::entry::${functionName}`,
        arguments: [
          tx.object(CONTRACT.ORDER_REGISTRY),
          tx.object(CONTRACT.VAULT),
          coin,
          tx.pure.u64(scaledPrice),
          tx.object(CONTRACT.CLOCK),
        ],
      });

      // Execute
      const result = await signAndExecute({
        transaction: tx,
      });

      // Wait for transaction
      await client.waitForTransaction({
        digest: result.digest,
      });

      setSuccess(`Order created! Digest: ${result.digest.slice(0, 12)}...`);
      setAmount('');
      setTriggerPrice('');
      onSuccess?.();
    } catch (err) {
      console.error('Failed to create order:', err);
      setError(err instanceof Error ? err.message : 'Failed to create order');
    } finally {
      setIsSubmitting(false);
    }
  }, [account, amount, triggerPrice, orderType, signAndExecute, client, onSuccess]);

  const isStopLoss = orderType === 'stop-loss';
  const buttonClass = isStopLoss ? 'btn-stop-loss' : 'btn-take-profit';
  const inputClass = isStopLoss ? '' : 'take-profit';

  // Calculate distance from current price
  const priceDistance = priceData && triggerPrice
    ? ((parseFloat(triggerPrice) - priceData.price) / priceData.price * 100)
    : null;

  return (
    <div className="card p-6 animate-slide-up delay-100">
      <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[var(--text-muted)]">
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
        Create Order
      </h2>

      <form onSubmit={handleSubmit}>
        {/* Order Type Toggle */}
        <div className="toggle-container mb-6">
          <button
            type="button"
            className={`toggle-option ${orderType === 'stop-loss' ? 'active-stop-loss' : ''}`}
            onClick={() => setOrderType('stop-loss')}
          >
            <span className="flex items-center justify-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L4 6v6c0 5.25 3.4 10.1 8 11.5 4.6-1.4 8-6.25 8-11.5V6l-8-4z" stroke="currentColor" strokeWidth="2"/>
                <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Stop-Loss
            </span>
          </button>
          <button
            type="button"
            className={`toggle-option ${orderType === 'take-profit' ? 'active-take-profit' : ''}`}
            onClick={() => setOrderType('take-profit')}
          >
            <span className="flex items-center justify-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M12 2v20M2 12l10-10 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Take-Profit
            </span>
          </button>
        </div>

        {/* Amount Input */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
            Amount (SUI)
          </label>
          <div className="relative">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              step="0.01"
              min="0"
              className={inputClass}
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-sm font-medium">
              SUI
            </span>
          </div>
        </div>

        {/* Trigger Price Input */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
            Trigger Price (USD)
          </label>
          <div className="relative">
            <input
              type="number"
              value={triggerPrice}
              onChange={(e) => setTriggerPrice(e.target.value)}
              placeholder={priceData ? priceData.price.toFixed(4) : '0.00'}
              step="0.0001"
              min="0"
              className={inputClass}
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-sm font-medium">
              USD
            </span>
          </div>
          {priceDistance !== null && triggerPrice && (
            <div className={`mt-2 text-xs ${priceDistance >= 0 ? 'text-[var(--take-profit)]' : 'text-[var(--stop-loss)]'}`}>
              {priceDistance >= 0 ? '↑' : '↓'} {Math.abs(priceDistance).toFixed(2)}% from current price
            </div>
          )}
        </div>

        {/* Info box */}
        <div className="mb-6 p-4 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)]">
          <div className="flex items-start gap-3">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="mt-0.5 text-[var(--text-muted)] flex-shrink-0">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
              <path d="M12 16v-4M12 8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              {isStopLoss
                ? 'Your order will execute when SUI price drops to or below the trigger price, protecting you from further losses.'
                : 'Your order will execute when SUI price rises to or above the trigger price, locking in your profits.'}
            </p>
          </div>
        </div>

        {/* Error/Success messages */}
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-3 rounded-lg bg-[var(--take-profit-dim)] border border-[var(--take-profit)]/30 text-[var(--take-profit)] text-sm">
            {success}
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={!account || isSubmitting || !amount || !triggerPrice}
          className={`btn w-full ${buttonClass}`}
        >
          {isSubmitting ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
              </svg>
              Creating Order...
            </span>
          ) : !account ? (
            'Connect Wallet'
          ) : (
            `Create ${isStopLoss ? 'Stop-Loss' : 'Take-Profit'} Order`
          )}
        </button>
      </form>
    </div>
  );
}
