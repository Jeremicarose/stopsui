"use client";

import { useEffect, useState, useCallback } from 'react';
import { useSuiClient, useCurrentAccount } from '@mysten/dapp-kit';
import { CONTRACT, ORDER_STATUS, ORDER_DIRECTION, MIST_PER_SUI, PRICE_PRECISION } from '@/lib/constants';
import type { OrderStatus, OrderDirection } from '@/lib/constants';

export interface Order {
  id: string;
  owner: string;
  baseAmount: bigint;
  triggerPrice: bigint;
  direction: OrderDirection;
  status: OrderStatus;
  createdAt: number;
  // Execution details (populated for executed orders)
  executionPrice?: bigint;
  executedAt?: number;
}

export interface FormattedOrder extends Order {
  amountSui: number;
  triggerPriceUsd: number;
  statusLabel: string;
  typeLabel: string;
  // Formatted execution details
  executionPriceUsd?: number;
  executedAtFormatted?: string;
}

function formatOrder(order: Order): FormattedOrder {
  const formatted: FormattedOrder = {
    ...order,
    amountSui: Number(order.baseAmount) / Number(MIST_PER_SUI),
    triggerPriceUsd: Number(order.triggerPrice) / Number(PRICE_PRECISION),
    statusLabel: order.status === ORDER_STATUS.PENDING
      ? 'Pending'
      : order.status === ORDER_STATUS.EXECUTED
        ? 'Executed'
        : 'Cancelled',
    typeLabel: order.direction === ORDER_DIRECTION.STOP_LOSS ? 'Stop-Loss' : 'Take-Profit',
  };

  // Add execution details if available
  if (order.executionPrice) {
    formatted.executionPriceUsd = Number(order.executionPrice) / Number(PRICE_PRECISION);
  }
  if (order.executedAt) {
    formatted.executedAtFormatted = new Date(order.executedAt).toLocaleString();
  }

  return formatted;
}

export function useOrders() {
  const client = useSuiClient();
  const account = useCurrentAccount();
  const [orders, setOrders] = useState<FormattedOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    if (!account?.address) {
      setOrders([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);

      // Query OrderCreated events for this user
      const createdEvents = await client.queryEvents({
        query: {
          MoveEventType: `${CONTRACT.ORIGINAL_PACKAGE_ID}::order_registry::OrderCreated`,
        },
        limit: 50,
      });

      // Also fetch execution events to get execution details
      const executedEvents = await client.queryEvents({
        query: {
          MoveEventType: `${CONTRACT.ORIGINAL_PACKAGE_ID}::order_registry::OrderExecuted`,
        },
        limit: 50,
      });

      // Build a map of execution details by order ID
      const executionMap = new Map<string, { executionPrice: bigint; executedAt: number }>();
      for (const event of executedEvents.data) {
        const parsed = event.parsedJson as { order_id: string; execution_price: string };
        executionMap.set(parsed.order_id, {
          executionPrice: BigInt(parsed.execution_price),
          executedAt: Number(event.timestampMs),
        });
      }

      // Filter for user's orders and fetch their current state
      const userOrderIds: string[] = [];

      for (const event of createdEvents.data) {
        const parsed = event.parsedJson as { order_id: string; owner: string };
        if (parsed.owner === account.address) {
          userOrderIds.push(parsed.order_id);
        }
      }

      // Fetch order objects
      const orderPromises = userOrderIds.map(async (orderId) => {
        try {
          const obj = await client.getObject({
            id: orderId,
            options: { showContent: true },
          });

          if (obj.data?.content && obj.data.content.dataType === 'moveObject') {
            const fields = obj.data.content.fields as Record<string, unknown>;
            const execution = executionMap.get(orderId);

            return {
              id: orderId,
              owner: fields.owner as string,
              baseAmount: BigInt(fields.base_amount as string),
              triggerPrice: BigInt(fields.trigger_price as string),
              direction: fields.direction as OrderDirection,
              status: fields.status as OrderStatus,
              createdAt: parseInt(fields.created_at as string),
              // Add execution details if available
              executionPrice: execution?.executionPrice,
              executedAt: execution?.executedAt,
            } as Order;
          }
          return null;
        } catch {
          return null;
        }
      });

      const fetchedOrders = await Promise.all(orderPromises);
      const validOrders = fetchedOrders
        .filter((o): o is Order => o !== null)
        .map(formatOrder)
        .sort((a, b) => b.createdAt - a.createdAt);

      setOrders(validOrders);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch orders');
    } finally {
      setIsLoading(false);
    }
  }, [client, account?.address]);

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 10000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  const pendingOrders = orders.filter(o => o.status === ORDER_STATUS.PENDING);
  const historyOrders = orders.filter(o => o.status !== ORDER_STATUS.PENDING);

  return {
    orders,
    pendingOrders,
    historyOrders,
    isLoading,
    error,
    refetch: fetchOrders,
  };
}
