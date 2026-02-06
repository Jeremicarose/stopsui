"use client";

import { useState, useCallback } from 'react';
import { useSignAndExecuteTransaction, useSuiClient, useCurrentAccount } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { useOrders, type FormattedOrder } from '@/hooks/useOrders';
import { usePrice } from '@/hooks/usePrice';
import { useBalance } from '@/hooks/useBalance';
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
  const isCancelled = order.status === ORDER_STATUS.CANCELLED;

  // Calculate distance from trigger
  const distance = currentPrice
    ? ((order.triggerPriceUsd - currentPrice) / currentPrice * 100)
    : null;

  const cardClass = isPending
    ? isStopLoss ? 'order-card stop-loss' : 'order-card take-profit'
    : isExecuted
      ? 'order-card executed'
      : 'order-card cancelled';

  // Calculate USD value at different prices
  const valueAtTrigger = order.amountSui * order.triggerPriceUsd;
  const valueAtExecution = order.executionPriceUsd
    ? order.amountSui * order.executionPriceUsd
    : null;

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
          <div className="text-xs text-[var(--text-muted)] mb-1">
            {isExecuted ? 'Trigger Price' : 'Trigger Price'}
          </div>
          <div className="font-mono font-semibold">
            ${order.triggerPriceUsd.toFixed(4)}
          </div>
        </div>
      </div>

      {/* Execution details for executed orders */}
      {isExecuted && (
        <div className="mt-3 pt-3 border-t border-[var(--border-subtle)]">
          <div className="grid grid-cols-2 gap-4 mb-3">
            <div>
              <div className="text-xs text-[var(--text-muted)] mb-1">Execution Price</div>
              <div className="font-mono font-semibold text-[var(--take-profit)]">
                ${order.executionPriceUsd?.toFixed(4) || 'N/A'}
              </div>
            </div>
            <div>
              <div className="text-xs text-[var(--text-muted)] mb-1">
                {order.wasSwapped ? 'USDC Received' : 'Value at Execution'}
              </div>
              <div className="font-mono font-semibold">
                {order.wasSwapped && order.usdcReceivedFormatted
                  ? `$${order.usdcReceivedFormatted.toFixed(2)} USDC`
                  : `$${valueAtExecution?.toFixed(2) || 'N/A'}`
                }
              </div>
            </div>
          </div>

          {/* Outcome explanation */}
          <div className="p-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)]">
            <div className="flex items-start gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="mt-0.5 text-[var(--take-profit)] flex-shrink-0">
                <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
              </svg>
              <div className="text-xs text-[var(--text-secondary)]">
                <p className="font-semibold mb-1">Order Executed Successfully</p>
                <p className="text-[var(--text-muted)]">
                  {order.wasSwapped ? (
                    isStopLoss
                      ? `Your ${order.amountSui.toFixed(4)} SUI was swapped for $${order.usdcReceivedFormatted?.toFixed(2) || '?'} USDC when price dropped to $${order.executionPriceUsd?.toFixed(4) || 'trigger'}. This protected you from further losses.`
                      : `Your ${order.amountSui.toFixed(4)} SUI was swapped for $${order.usdcReceivedFormatted?.toFixed(2) || '?'} USDC when price rose to $${order.executionPriceUsd?.toFixed(4) || 'trigger'}. Profits locked in!`
                  ) : (
                    isStopLoss
                      ? `Your ${order.amountSui.toFixed(4)} SUI was returned to your wallet when price dropped to $${order.executionPriceUsd?.toFixed(4) || 'trigger'}. This protected you from further losses.`
                      : `Your ${order.amountSui.toFixed(4)} SUI was returned to your wallet when price rose to $${order.executionPriceUsd?.toFixed(4) || 'trigger'}. Profits locked in!`
                  )}
                </p>
              </div>
            </div>
          </div>

          {order.executedAtFormatted && (
            <div className="mt-2 text-xs text-[var(--text-muted)]">
              Executed: {order.executedAtFormatted}
            </div>
          )}
        </div>
      )}

      {/* Cancelled order info */}
      {isCancelled && (
        <div className="mt-3 pt-3 border-t border-[var(--border-subtle)]">
          <div className="p-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)]">
            <div className="flex items-start gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="mt-0.5 text-[var(--text-muted)] flex-shrink-0">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                <path d="M15 9l-6 6M9 9l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <div className="text-xs text-[var(--text-secondary)]">
                <p className="font-semibold mb-1">Order Cancelled</p>
                <p className="text-[var(--text-muted)]">
                  Your {order.amountSui.toFixed(4)} SUI was returned to your wallet.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pending order progress */}
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
          <div className="mt-2 text-xs text-[var(--text-muted)]">
            Est. value at trigger: <span className="font-mono">${valueAtTrigger.toFixed(2)}</span>
          </div>
        </div>
      )}

      <div className="mt-3 text-xs text-[var(--text-muted)] font-mono truncate">
        ID: {order.id.slice(0, 20)}...
      </div>
    </div>
  );
}

const ORDERS_PER_PAGE = 3; // Show 3 orders at a time

export function OrdersList() {
  const { pendingOrders, historyOrders, isLoading, refetch } = useOrders();
  const { priceData } = usePrice();
  const { refetch: refetchBalance } = useBalance();
  const account = useCurrentAccount();
  const client = useSuiClient();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');
  const [historyPage, setHistoryPage] = useState(1);
  const [pendingPage, setPendingPage] = useState(1);

  // Paginated orders
  const paginatedHistory = historyOrders.slice(0, historyPage * ORDERS_PER_PAGE);
  const paginatedPending = pendingOrders.slice(0, pendingPage * ORDERS_PER_PAGE);
  const hasMoreHistory = historyOrders.length > paginatedHistory.length;
  const hasMorePending = pendingOrders.length > paginatedPending.length;

  const handleCancel = useCallback(async (orderId: string) => {
    if (!account) return;

    try {
      setCancellingId(orderId);

      const tx = new Transaction();
      tx.setGasBudget(50000000); // 0.05 SUI max gas

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
      refetchBalance(); // Update balance after cancel
    } catch (err) {
      console.error('Failed to cancel order:', err);
    } finally {
      setCancellingId(null);
    }
  }, [account, signAndExecute, client, refetch, refetchBalance]);


  return (
    <div className="card p-6 animate-slide-up delay-200">
      {/* Connected wallet info */}
      {account && (
        <div className="mb-4 p-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)]">
          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <rect x="2" y="6" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="2"/>
              <path d="M16 12h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <span>Connected: </span>
            <span className="font-mono text-[var(--text-secondary)]">
              {account.address.slice(0, 8)}...{account.address.slice(-6)}
            </span>
            <button
              onClick={() => navigator.clipboard.writeText(account.address)}
              className="ml-1 hover:text-[var(--text-secondary)] transition-colors"
              title="Copy address"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <rect x="8" y="8" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="2"/>
                <path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" stroke="currentColor" strokeWidth="2"/>
              </svg>
            </button>
          </div>
        </div>
      )}

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
            {paginatedPending.map(order => (
              <OrderCard
                key={order.id}
                order={order}
                currentPrice={priceData?.price ?? null}
                onCancel={handleCancel}
                isCancelling={cancellingId === order.id}
              />
            ))}
            {/* Pagination controls for pending */}
            {(hasMorePending || pendingPage > 1) && (
              <div className="flex items-center justify-center gap-3 pt-2">
                {pendingPage > 1 && (
                  <button
                    onClick={() => setPendingPage(1)}
                    className="text-xs px-3 py-1.5 rounded-lg bg-[var(--bg-primary)] hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] transition-colors"
                  >
                    Show Less
                  </button>
                )}
                {hasMorePending && (
                  <button
                    onClick={() => setPendingPage(p => p + 1)}
                    className="text-xs px-3 py-1.5 rounded-lg bg-[var(--bg-primary)] hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] transition-colors"
                  >
                    Show More ({pendingOrders.length - paginatedPending.length} more)
                  </button>
                )}
              </div>
            )}
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
            {paginatedHistory.map(order => (
              <OrderCard
                key={order.id}
                order={order}
                currentPrice={priceData?.price ?? null}
                onCancel={handleCancel}
                isCancelling={false}
              />
            ))}
            {/* Pagination controls for history */}
            {(hasMoreHistory || historyPage > 1) && (
              <div className="flex items-center justify-center gap-3 pt-2">
                {historyPage > 1 && (
                  <button
                    onClick={() => setHistoryPage(1)}
                    className="text-xs px-3 py-1.5 rounded-lg bg-[var(--bg-primary)] hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] transition-colors"
                  >
                    Show Less
                  </button>
                )}
                {hasMoreHistory && (
                  <button
                    onClick={() => setHistoryPage(p => p + 1)}
                    className="text-xs px-3 py-1.5 rounded-lg bg-[var(--bg-primary)] hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] transition-colors"
                  >
                    Show More ({historyOrders.length - paginatedHistory.length} more)
                  </button>
                )}
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
}
