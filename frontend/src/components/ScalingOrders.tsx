"use client";

import { useState, useCallback } from 'react';
import { useSignAndExecuteTransaction, useSuiClient, useCurrentAccount } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { CONTRACT, MIST_PER_SUI, PRICE_PRECISION } from '@/lib/constants';
import { usePrice } from '@/hooks/usePrice';

interface ScaleLevel {
  id: number;
  percentage: number;
  priceOffset: number; // negative for stop-loss, positive for take-profit
}

const DEFAULT_STOP_LOSS_LEVELS: ScaleLevel[] = [
  { id: 1, percentage: 30, priceOffset: -2 },
  { id: 2, percentage: 30, priceOffset: -5 },
  { id: 3, percentage: 40, priceOffset: -10 },
];

const DEFAULT_TAKE_PROFIT_LEVELS: ScaleLevel[] = [
  { id: 1, percentage: 30, priceOffset: 5 },
  { id: 2, percentage: 30, priceOffset: 10 },
  { id: 3, percentage: 40, priceOffset: 20 },
];

export function ScalingOrders({ onSuccess }: { onSuccess?: () => void }) {
  const [orderType, setOrderType] = useState<'stop-loss' | 'take-profit'>('stop-loss');
  const [totalAmount, setTotalAmount] = useState('');
  const [levels, setLevels] = useState<ScaleLevel[]>(DEFAULT_STOP_LOSS_LEVELS);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const account = useCurrentAccount();
  const client = useSuiClient();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const { priceData } = usePrice();

  const updateLevel = (id: number, field: 'percentage' | 'priceOffset', value: number) => {
    setLevels(prev => prev.map(l =>
      l.id === id ? { ...l, [field]: value } : l
    ));
  };

  const totalPercentage = levels.reduce((sum, l) => sum + l.percentage, 0);

  const handleTypeChange = (type: 'stop-loss' | 'take-profit') => {
    setOrderType(type);
    setLevels(type === 'stop-loss' ? DEFAULT_STOP_LOSS_LEVELS : DEFAULT_TAKE_PROFIT_LEVELS);
  };

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!account || !priceData) {
      setError('Please connect wallet and wait for price data');
      return;
    }

    const total = parseFloat(totalAmount);
    if (isNaN(total) || total <= 0) {
      setError('Please enter a valid total amount');
      return;
    }

    if (totalPercentage !== 100) {
      setError('Percentages must add up to 100%');
      return;
    }

    try {
      setIsSubmitting(true);

      const tx = new Transaction();
      tx.setGasBudget(50000000); // 0.05 SUI max gas

      const functionName = orderType === 'stop-loss'
        ? 'create_stop_loss_order'
        : 'create_take_profit_order';

      // Calculate total MIST needed
      const totalMist = BigInt(Math.floor(total * Number(MIST_PER_SUI)));

      // Split all coins at once
      const amounts = levels.map(level =>
        BigInt(Math.floor((level.percentage / 100) * total * Number(MIST_PER_SUI)))
      );

      const coins = tx.splitCoins(tx.gas, amounts);

      // Create an order for each level
      levels.forEach((level, index) => {
        const triggerPrice = priceData.price * (1 + level.priceOffset / 100);
        const scaledPrice = BigInt(Math.floor(triggerPrice * Number(PRICE_PRECISION)));

        tx.moveCall({
          target: `${CONTRACT.PACKAGE_ID}::entry::${functionName}`,
          arguments: [
            tx.object(CONTRACT.ORDER_REGISTRY),
            tx.object(CONTRACT.VAULT),
            coins[index],
            tx.pure.u64(scaledPrice),
            tx.object(CONTRACT.CLOCK),
          ],
        });
      });

      const result = await signAndExecute({ transaction: tx });
      await client.waitForTransaction({ digest: result.digest });

      setSuccess(`Created ${levels.length} scaling orders! Digest: ${result.digest.slice(0, 12)}...`);
      setTotalAmount('');
      onSuccess?.();
    } catch (err) {
      console.error('Failed to create scaling orders:', err);
      setError(err instanceof Error ? err.message : 'Failed to create orders');
    } finally {
      setIsSubmitting(false);
    }
  }, [account, priceData, totalAmount, levels, orderType, totalPercentage, signAndExecute, client, onSuccess]);

  const isStopLoss = orderType === 'stop-loss';

  return (
    <div className="card p-6 animate-slide-up delay-300">
      <h2 className="text-lg font-bold mb-2 flex items-center gap-2">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[var(--text-muted)]">
          <path d="M3 3v18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          <path d="M7 16l4-4 4 4 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Scaling Orders
      </h2>
      <p className="text-xs text-[var(--text-muted)] mb-6">
        Create multiple orders at different price levels to scale in/out of positions
      </p>

      <form onSubmit={handleSubmit}>
        {/* Order Type Toggle */}
        <div className="toggle-container mb-6">
          <button
            type="button"
            className={`toggle-option ${orderType === 'stop-loss' ? 'active-stop-loss' : ''}`}
            onClick={() => handleTypeChange('stop-loss')}
          >
            Scale Out (Stop-Loss)
          </button>
          <button
            type="button"
            className={`toggle-option ${orderType === 'take-profit' ? 'active-take-profit' : ''}`}
            onClick={() => handleTypeChange('take-profit')}
          >
            Scale Out (Take-Profit)
          </button>
        </div>

        {/* Total Amount */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
            Total Amount (SUI)
          </label>
          <input
            type="number"
            value={totalAmount}
            onChange={(e) => setTotalAmount(e.target.value)}
            placeholder="1.00"
            step="0.01"
            min="0"
            className={isStopLoss ? '' : 'take-profit'}
          />
        </div>

        {/* Levels */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium text-[var(--text-secondary)]">
              Price Levels
            </label>
            <span className={`text-xs font-mono ${totalPercentage === 100 ? 'text-[var(--take-profit)]' : 'text-[var(--stop-loss)]'}`}>
              {totalPercentage}% / 100%
            </span>
          </div>

          <div className="space-y-3">
            {levels.map((level, index) => {
              const triggerPrice = priceData
                ? priceData.price * (1 + level.priceOffset / 100)
                : 0;
              const amount = totalAmount
                ? (parseFloat(totalAmount) * level.percentage / 100).toFixed(4)
                : '0';

              return (
                <div
                  key={level.id}
                  className={`p-4 rounded-lg border ${
                    isStopLoss
                      ? 'bg-[var(--stop-loss-dim)] border-[var(--stop-loss)]/20'
                      : 'bg-[var(--take-profit-dim)] border-[var(--take-profit)]/20'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold">Level {index + 1}</span>
                    <span className="font-mono text-sm">
                      {amount} SUI @ ${triggerPrice.toFixed(4)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-[var(--text-muted)] mb-1">
                        Allocation %
                      </label>
                      <input
                        type="number"
                        value={level.percentage}
                        onChange={(e) => updateLevel(level.id, 'percentage', parseInt(e.target.value) || 0)}
                        min="0"
                        max="100"
                        className="!py-2 !text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-[var(--text-muted)] mb-1">
                        Price Offset %
                      </label>
                      <input
                        type="number"
                        value={level.priceOffset}
                        onChange={(e) => updateLevel(level.id, 'priceOffset', parseFloat(e.target.value) || 0)}
                        step="0.5"
                        className="!py-2 !text-sm"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Current price reference */}
        {priceData && (
          <div className="mb-6 p-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)]">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--text-muted)]">Current SUI Price</span>
              <span className="font-mono font-semibold">${priceData.price.toFixed(4)}</span>
            </div>
          </div>
        )}

        {/* Error/Success */}
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

        {/* Submit */}
        <button
          type="submit"
          disabled={!account || isSubmitting || !totalAmount || totalPercentage !== 100}
          className={`btn w-full ${isStopLoss ? 'btn-stop-loss' : 'btn-take-profit'}`}
        >
          {isSubmitting ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
              </svg>
              Creating {levels.length} Orders...
            </span>
          ) : !account ? (
            'Connect Wallet'
          ) : (
            `Create ${levels.length} Scaling Orders`
          )}
        </button>
      </form>
    </div>
  );
}
