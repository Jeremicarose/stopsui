/**
 * Order Management
 *
 * Fetches and filters pending orders from the Sui blockchain.
 * Uses event queries to find OrderCreated events, then checks
 * which orders are still pending.
 */

import { SuiClient } from '@mysten/sui/client';
import { config } from './config.js';

// Order structure (matches contract)
export interface StopOrder {
  id: string;           // Object ID
  owner: string;        // Owner address
  baseAmount: bigint;   // SUI amount (in MIST)
  triggerPrice: bigint; // Trigger price (scaled by 1e9)
  direction: number;    // 0 = stop-loss, 1 = take-profit
  status: number;       // 0 = pending, 1 = executed, 2 = cancelled
  createdAt: number;    // Timestamp in ms
}

// Create Sui client
let client: SuiClient | null = null;

export function getClient(): SuiClient {
  if (!client) {
    client = new SuiClient({ url: config.rpcUrl });
  }
  return client;
}

/**
 * Fetch all OrderCreated events
 * Returns order IDs that were created
 */
async function fetchOrderCreatedEvents(): Promise<string[]> {
  const client = getClient();

  const events = await client.queryEvents({
    query: {
      MoveEventType: `${config.packageId}::order_registry::OrderCreated`,
    },
    limit: 100,
  });

  const orderIds: string[] = [];
  for (const event of events.data) {
    const parsedJson = event.parsedJson as { order_id: string };
    if (parsedJson?.order_id) {
      orderIds.push(parsedJson.order_id);
    }
  }

  return orderIds;
}

/**
 * Fetch order object by ID
 */
export async function fetchOrder(orderId: string): Promise<StopOrder | null> {
  const client = getClient();

  try {
    const object = await client.getObject({
      id: orderId,
      options: { showContent: true },
    });

    if (!object.data?.content || object.data.content.dataType !== 'moveObject') {
      return null;
    }

    const fields = object.data.content.fields as Record<string, unknown>;

    return {
      id: orderId,
      owner: fields.owner as string,
      baseAmount: BigInt(fields.base_amount as string),
      triggerPrice: BigInt(fields.trigger_price as string),
      direction: fields.direction as number,
      status: fields.status as number,
      createdAt: parseInt(fields.created_at as string),
    };
  } catch (error) {
    console.error(`Error fetching order ${orderId}:`, error);
    return null;
  }
}

/**
 * Fetch all pending orders
 * Filters for status = 0 (pending)
 */
export async function fetchPendingOrders(): Promise<StopOrder[]> {
  // Get all order IDs from events
  const orderIds = await fetchOrderCreatedEvents();

  // Fetch each order and filter for pending
  const orders: StopOrder[] = [];

  for (const orderId of orderIds) {
    const order = await fetchOrder(orderId);
    if (order && order.status === 0) {
      orders.push(order);
    }
  }

  return orders;
}

/**
 * Check if an order should trigger at the given price
 */
export function shouldTrigger(order: StopOrder, currentPrice: bigint): boolean {
  if (order.direction === 0) {
    // Stop-loss: trigger when price drops to or below threshold
    return currentPrice <= order.triggerPrice;
  } else {
    // Take-profit: trigger when price rises to or above threshold
    return currentPrice >= order.triggerPrice;
  }
}

/**
 * Get orders that should be triggered at current price
 */
export async function getTriggeredOrders(currentPrice: bigint): Promise<StopOrder[]> {
  const pendingOrders = await fetchPendingOrders();
  return pendingOrders.filter(order => shouldTrigger(order, currentPrice));
}

/**
 * Format order for logging
 */
export function formatOrder(order: StopOrder): string {
  const type = order.direction === 0 ? 'STOP-LOSS' : 'TAKE-PROFIT';
  const amount = Number(order.baseAmount) / 1e9;
  const trigger = Number(order.triggerPrice) / 1e9;
  return `${type} | ${amount.toFixed(4)} SUI @ $${trigger.toFixed(4)} | ID: ${order.id.slice(0, 10)}...`;
}
