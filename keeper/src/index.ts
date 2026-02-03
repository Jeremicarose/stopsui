/**
 * StopSui Keeper Bot
 *
 * Main entry point. Runs a continuous loop that:
 * 1. Fetches current SUI/USD price from Pyth
 * 2. Fetches pending orders from Sui blockchain
 * 3. Checks which orders should trigger
 * 4. Executes triggered orders
 * 5. Waits and repeats
 */

import { config, logConfig } from './config.js';
import { fetchSuiPrice, formatPrice } from './pyth.js';
import { fetchPendingOrders, getTriggeredOrders, formatOrder, StopOrder } from './orders.js';
import { executeOrders, getKeeperAddress } from './executor.js';

// Track stats
let loopCount = 0;
let totalExecuted = 0;
let totalFailed = 0;

/**
 * Main keeper loop iteration
 */
async function runLoop(): Promise<void> {
  loopCount++;
  const timestamp = new Date().toISOString();

  try {
    // 1. Fetch current price from Pyth
    const currentPrice = await fetchSuiPrice();
    console.log(`\n[${timestamp}] Loop #${loopCount}`);
    console.log(`  Price: ${formatPrice(currentPrice)}`);

    // 2. Fetch pending orders
    const pendingOrders = await fetchPendingOrders();
    console.log(`  Pending orders: ${pendingOrders.length}`);

    if (pendingOrders.length === 0) {
      console.log('  No pending orders to process');
      return;
    }

    // 3. Check which orders should trigger
    const triggeredOrders = pendingOrders.filter(order => {
      const shouldTrigger =
        order.direction === 0
          ? currentPrice <= order.triggerPrice  // Stop-loss
          : currentPrice >= order.triggerPrice; // Take-profit
      return shouldTrigger;
    });

    if (triggeredOrders.length === 0) {
      console.log('  No orders triggered at current price');
      // Log closest orders for debugging
      logClosestOrders(pendingOrders, currentPrice);
      return;
    }

    console.log(`  🎯 ${triggeredOrders.length} order(s) triggered!`);
    for (const order of triggeredOrders) {
      console.log(`    - ${formatOrder(order)}`);
    }

    // 4. Execute triggered orders
    const { executed, failed } = await executeOrders(triggeredOrders, currentPrice);
    totalExecuted += executed;
    totalFailed += failed;

    console.log(`  Results: ${executed} executed, ${failed} failed`);
    console.log(`  Total: ${totalExecuted} executed, ${totalFailed} failed`);

  } catch (error) {
    console.error(`  Error in loop:`, error);
  }
}

/**
 * Log the closest orders to triggering (for debugging)
 */
function logClosestOrders(orders: StopOrder[], currentPrice: bigint): void {
  if (orders.length === 0) return;

  // Sort by how close they are to triggering
  const sorted = [...orders].sort((a, b) => {
    const diffA = Math.abs(Number(currentPrice - a.triggerPrice));
    const diffB = Math.abs(Number(currentPrice - b.triggerPrice));
    return diffA - diffB;
  });

  const closest = sorted.slice(0, 3);
  console.log('  Closest to trigger:');
  for (const order of closest) {
    const diff = Number(currentPrice) - Number(order.triggerPrice);
    const pct = (diff / Number(order.triggerPrice) * 100).toFixed(2);
    const direction = order.direction === 0 ? '↓' : '↑';
    console.log(`    ${direction} ${formatOrder(order)} (${pct}% away)`);
  }
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  console.log('🤖 StopSui Keeper Bot Starting...\n');

  // Log configuration
  logConfig();

  // Log keeper address
  const keeperAddress = getKeeperAddress();
  console.log(`Keeper Address: ${keeperAddress}\n`);

  console.log('Starting main loop...');
  console.log(`Polling every ${config.pollIntervalMs / 1000} seconds\n`);
  console.log('Press Ctrl+C to stop\n');

  // Main loop
  while (true) {
    await runLoop();
    await sleep(config.pollIntervalMs);
  }
}

// Run
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
