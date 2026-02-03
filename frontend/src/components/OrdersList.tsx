"use client";

import { useState, useCallback } from 'react';
import { useSignAndExecuteTransaction, useSuiClient, useCurrentAccount } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { useOrders, type FormattedOrder } from '@/hooks/useOrders';
import { usePrice } from '@/hooks/usePrice';
import { CONTRACT, ORDER_STATUS, ORDER_DIRECTION } from '@/lib/constants';

function OrderCard({
  order,
  currentPrice,
  onCancel,
  isCancelling,
}: {
  order: FormattedOrder;
  currentPrice: number | null;
  onCancel: (orderId: string) => void;
  isCancelling: boolean;
}) {
  const isStopLoss = order.direction === ORDER_DIRECTION.STOP_LOSS;
  const isPending = order.status === ORDER_STATUS.PENDING;
  const isExecuted = order.status === ORDER_STATUS.EXECUTED;

  // Calculate distance from trigger
  const distance = currentPrice
    ? ((order.triggerPriceUsd - currentPrice) / currentPrice * 100)
    : null;

  const cardClass = isPending
    ? isStopLoss ? 'order-card stop-loss' : 'order-card take-profit'
    : isExecuted
      ? 'order-card executed'
      : 'order-card cancelled';

  return (
    <div className={cardClass}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`badge ${isStopLoss ? 'badge-stop-loss' : 'badge-take-profit'}`}>
            {order.typeLabel}
          </span>
          <span className={`badge ${
            isPending ? 'badge-pending' :
            isExecuted ? 'badge-executed' : 'badge-cancelled'
          }`}>
            {order.statusLabel}
          </span>
        </div>
        {isPending && (
          <button
            onClick={() => onCancel(order.id)}
            disabled={isCancelling}
            className="btn btn-danger text-xs py-1.5 px-3"
          >
            {isCancelling ? 'Cancelling...' : 'Cancel'}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-xs text-[var(--text-muted)] mb-1">Amount</div>
          <div className="font-mono font-semibold">
            {order.amountSui.toFixed(4)} <span className="text-[var(--text-muted)]">SUI</span>
          </div>
        </div>
        <div>
          <div className="text-xs text-[var(--text-muted)] mb-1">Trigger Price</div>
          <div className="font-mono font-semibold">
            ${order.triggerPriceUsd.toFixed(4)}
          </div>
        </div>
      </div>

      {isPending && distance !== null && (
        <div className="mt-3 pt-3 border-t border-[var(--border-subtle)]">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[var(--text-muted)]">Distance from trigger</span>
            <span className={`font-mono ${
              isStopLoss
                ? distance <= 0 ? 'text-[var(--stop-loss)]' : 'text-[var(--text-secondary)]'
                : distance >= 0 ? 'text-[var(--take-profit)]' : 'text-[var(--text-secondary)]'
            }`}>
              {distance >= 0 ? '↑' : '↓'} {Math.abs(distance).toFixed(2)}%
            </span>
          </div>
          {/* Progress bar to trigger */}
          <div className="mt-2 h-1.5 bg-[var(--bg-primary)] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                isStopLoss ? 'bg-[var(--stop-loss)]' : 'bg-[var(--take-profit)]'
              }`}
              style={{
                width: `${Math.min(100, Math.max(0, 100 - Math.abs(distance) * 10))}%`,
              }}
            />
          </div>
        </div>
      )}

      <div className="mt-3 text-xs text-[var(--text-muted)] font-mono truncate">
        ID: {order.id.slice(0, 20)}...
      </div>
    </div>
  );
}

export function OrdersList() {
  const { pendingOrders, historyOrders, isLoading, refetch } = useOrders();
  const { priceData } = usePrice();
  const account = useCurrentAccount();
  const client = useSuiClient();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');

  const handleCancel = useCallback(async (orderId: string) => {
    if (!account) return;

    try {
      setCancellingId(orderId);

      const tx = new Transaction();

      tx.moveCall({
        target: `${CONTRACT.PACKAGE_ID}::entry::cancel_order`,
        arguments: [
          tx.object(CONTRACT.ORDER_REGISTRY),
          tx.object(CONTRACT.VAULT),
          tx.object(orderId),
        ],
      });

      const result = await signAndExecute({ transaction: tx });

      await client.waitForTransaction({ digest: result.digest });

      refetch();
    } catch (err) {
      console.error('Failed to cancel order:', err);
    } finally {
      setCancellingId(null);
    }
  }, [account, signAndExecute, client, refetch]);


  return (
    <div className="card p-6 animate-slide-up delay-200">
      {/* Tab navigation */}
      <div className="flex items-center gap-1 mb-6 p-1 bg-[var(--bg-primary)] rounded-lg">
        <button
          onClick={() => setActiveTab('pending')}
          className={`flex-1 py-2.5 px-4 rounded-md text-sm font-semibold transition-all ${
            activeTab === 'pending'
              ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
          }`}
        >
          Pending
          {pendingOrders.length > 0 && (
            <span className="ml-2 px-2 py-0.5 bg-[var(--pending)] text-white text-xs rounded-full">
              {pendingOrders.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex-1 py-2.5 px-4 rounded-md text-sm font-semibold transition-all ${
            activeTab === 'history'
              ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
          }`}
        >
          History
          {historyOrders.length > 0 && (
            <span className="ml-2 px-2 py-0.5 bg-[var(--text-muted)] text-white text-xs rounded-full">
              {historyOrders.length}
            </span>
          )}
        </button>
      </div>

      {isLoading && (pendingOrders.length === 0 && historyOrders.length === 0) ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="skeleton h-32" />
          ))}
        </div>
      ) : activeTab === 'pending' ? (
        pendingOrders.length === 0 ? (
          <div className="text-center py-12">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" className="mx-auto mb-4 text-[var(--text-muted)]">
              <path d="M12 2L4 6v6c0 5.25 3.4 10.1 8 11.5 4.6-1.4 8-6.25 8-11.5V6l-8-4z" stroke="currentColor" strokeWidth="2"/>
              <path d="M9 12h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <p className="text-[var(--text-muted)] mb-2">No pending orders</p>
            <p className="text-xs text-[var(--text-muted)]">Create your first stop-loss or take-profit order</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendingOrders.map(order => (
              <OrderCard
                key={order.id}
                order={order}
                currentPrice={priceData?.price ?? null}
                onCancel={handleCancel}
                isCancelling={cancellingId === order.id}
              />
            ))}
          </div>
        )
      ) : (
        historyOrders.length === 0 ? (
          <div className="text-center py-12">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" className="mx-auto mb-4 text-[var(--text-muted)]">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
              <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <p className="text-[var(--text-muted)]">No order history yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {historyOrders.map(order => (
              <OrderCard
                key={order.id}
                order={order}
                currentPrice={priceData?.price ?? null}
                onCancel={handleCancel}
                isCancelling={false}
              />
            ))}
          </div>
        )
      )}
    </div>
  );
}
