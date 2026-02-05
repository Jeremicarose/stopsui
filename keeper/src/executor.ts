/**
 * Order Executor
 *
 * Builds and submits transactions to execute triggered orders.
 * Uses Sui's Programmable Transaction Blocks (PTB) to call
 * the entry::execute_order function.
 *
 * DeepBook v3 Integration (Balance Manager Pattern):
 * - Keeper has a pre-created Balance Manager (trading account on DeepBook)
 * - When swaps are enabled, builds a PTB that:
 *   1. Calls execute_order_for_swap to get SUI coin
 *   2. Deposits SUI into Balance Manager
 *   3. Places market sell order on DeepBook pool
 *   4. Withdraws USDC from Balance Manager
 *   5. Calls complete_swap_execution to transfer USDC to user
 * - Keeper should have DEEP deposited in Balance Manager for fee discounts
 */

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { config, validateDeepBookConfig } from './config.js';
import { StopOrder, getClient } from './orders.js';

// Keeper's keypair (loaded once)
let keypair: Ed25519Keypair | null = null;

/**
 * Get or create the keeper's keypair
 */
function getKeypair(): Ed25519Keypair {
  if (!keypair) {
    // Support both base64 and hex private keys
    const pk = config.privateKey;

    if (pk.startsWith('suiprivkey')) {
      // Bech32 encoded private key
      keypair = Ed25519Keypair.fromSecretKey(pk);
    } else {
      // Try base64 first, then hex
      try {
        const decoded = Buffer.from(pk, 'base64');
        keypair = Ed25519Keypair.fromSecretKey(decoded);
      } catch {
        const decoded = Buffer.from(pk, 'hex');
        keypair = Ed25519Keypair.fromSecretKey(decoded);
      }
    }
  }
  return keypair;
}

/**
 * Get keeper's address
 */
export function getKeeperAddress(): string {
  return getKeypair().toSuiAddress();
}

/**
 * Execute a triggered order (simple mode - returns SUI to user)
 *
 * Builds a PTB that calls:
 * entry::execute_order(registry, order, vault, executor_cap, price, clock)
 */
export async function executeOrderSimple(
  order: StopOrder,
  currentPrice: bigint
): Promise<{ success: boolean; digest?: string; error?: string }> {
  const client = getClient();
  const kp = getKeypair();

  try {
    // Build transaction
    const tx = new Transaction();

    // Call execute_triggered_order (deployed function name)
    tx.moveCall({
      target: `${config.packageId}::entry::execute_triggered_order`,
      arguments: [
        tx.object(config.orderRegistryId),    // registry: &mut OrderRegistry
        tx.object(order.id),                   // order: &mut StopOrder
        tx.object(config.vaultId),             // vault: &mut Vault
        tx.object(config.executorCapId),       // executor_cap: &ExecutorCap
        tx.pure.u64(currentPrice),             // pyth_price: u64
        tx.object('0x6'),                      // clock: &Clock (system clock)
      ],
    });

    // Sign and execute
    const result = await client.signAndExecuteTransaction({
      signer: kp,
      transaction: tx,
      options: {
        showEffects: true,
        showEvents: true,
      },
    });

    // Check if successful
    const status = result.effects?.status?.status;
    if (status === 'success') {
      return {
        success: true,
        digest: result.digest,
      };
    } else {
      return {
        success: false,
        error: result.effects?.status?.error || 'Unknown error',
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Calculate minimum USDC output with slippage protection
 *
 * Note: On testnet, pools have thin liquidity so we add extra buffer.
 * The actual slippage should be configured via SLIPPAGE_BPS in .env
 */
function calculateMinQuoteOut(suiAmount: bigint, currentPrice: bigint): bigint {
  // Expected USDC = (SUI amount * price) / PRICE_PRECISION
  // Note: SUI has 9 decimals (MIST), USDC has 6 decimals
  // currentPrice is scaled by 1e9, so:
  // expectedUsdc = suiAmount * currentPrice / 1e9 / 1e3 (adjust for decimal diff)
  const expectedUsdc = (suiAmount * currentPrice) / config.pricePrecision / 1000n;

  // Apply slippage tolerance
  const slippageMultiplier = 10000n - BigInt(config.deepbook.slippageBps);
  let minQuoteOut = (expectedUsdc * slippageMultiplier) / 10000n;

  // Extra safety buffer for testnet thin liquidity (additional 2%)
  // This helps avoid validate_inputs failures due to order book depth
  minQuoteOut = (minQuoteOut * 98n) / 100n;

  return minQuoteOut;
}

/**
 * Execute a triggered order with DeepBook swap (SUI → USDC)
 *
 * Uses the simpler swap_exact_base_for_quote function:
 * 1. Execute order and get SUI coin from vault
 * 2. Create zero DEEP coin for fees
 * 3. Call swap_exact_base_for_quote (handles lot sizes automatically)
 * 4. Transfer USDC to user, return leftover SUI to keeper
 *
 * This approach is simpler than Balance Manager and handles lot size alignment.
 */
export async function executeOrderWithSwap(
  order: StopOrder,
  currentPrice: bigint
): Promise<{ success: boolean; digest?: string; error?: string; usdcReceived?: string }> {
  const client = getClient();
  const kp = getKeypair();

  const {
    suiUsdcPoolId,
    deepTokenType,
    usdcTokenType,
  } = config.deepbook;

  // Basic validation
  if (!suiUsdcPoolId || !usdcTokenType || !deepTokenType) {
    return {
      success: false,
      error: 'DeepBook pool or token types not configured',
    };
  }

  try {
    // Calculate minimum USDC output with slippage protection
    const suiAmount = BigInt(order.baseAmount);
    const minQuoteOut = calculateMinQuoteOut(suiAmount, currentPrice);

    console.log(`  Swap details: ${suiAmount} MIST → min ${minQuoteOut} USDC (slippage: ${config.deepbook.slippageBps}bps)`);

    // Build PTB for swap execution using swap_exact_base_for_quote
    const tx = new Transaction();

    // Step 1: Execute order and get SUI coin from vault
    // Returns: (Coin<SUI>, address, ID, u64, u64) = (sui_coin, owner, order_id, sui_sold, execution_price)
    const [suiCoin, owner, orderId, suiSold, executionPrice] = tx.moveCall({
      target: `${config.packageId}::entry::execute_order_for_swap`,
      arguments: [
        tx.object(config.orderRegistryId),
        tx.object(order.id),
        tx.object(config.vaultId),
        tx.object(config.executorCapId),
        tx.pure.u64(currentPrice),
        tx.object('0x6'), // Clock
      ],
    });

    // Step 2: Create a zero DEEP coin for fees
    // We use coin::zero to create an empty DEEP coin
    const zeroDeepCoin = tx.moveCall({
      target: '0x2::coin::zero',
      typeArguments: [deepTokenType],
      arguments: [],
    });

    // Step 3: Swap SUI for USDC using swap_exact_base_for_quote
    // This function handles lot sizes automatically and returns leftover
    // Returns: (Coin<BaseAsset>, Coin<QuoteAsset>, Coin<DEEP>) = (leftover_sui, usdc_out, leftover_deep)
    const [remainingSui, usdcCoin, remainingDeep] = tx.moveCall({
      target: `${config.deepbook.packageId}::pool::swap_exact_base_for_quote`,
      typeArguments: [
        '0x2::sui::SUI',  // BaseAsset = SUI
        usdcTokenType,    // QuoteAsset = USDC
      ],
      arguments: [
        tx.object(suiUsdcPoolId),  // pool: &mut Pool<SUI, USDC>
        suiCoin,                    // base_in: Coin<SUI>
        zeroDeepCoin,               // deep_in: Coin<DEEP> (zero - fees paid in quote)
        tx.pure.u64(minQuoteOut),  // min_quote_out: u64
        tx.object('0x6'),          // clock: &Clock
      ],
    });

    // Step 4: Destroy the returned DEEP coin (should be zero)
    tx.moveCall({
      target: '0x2::coin::destroy_zero',
      typeArguments: [deepTokenType],
      arguments: [remainingDeep],
    });

    // Step 6: Complete swap execution - transfer USDC to user
    tx.moveCall({
      target: `${config.packageId}::entry::complete_swap_execution`,
      typeArguments: [usdcTokenType!],
      arguments: [
        usdcCoin,         // usdc_coin: Coin<USDC>
        remainingSui,     // remaining_sui: Coin<SUI>
        orderId,          // order_id: ID
        owner,            // owner: address
        suiSold,          // sui_sold: u64
        executionPrice,   // execution_price: u64
        tx.object('0x6'), // clock: &Clock
      ],
    });

    // Sign and execute
    const result = await client.signAndExecuteTransaction({
      signer: kp,
      transaction: tx,
      options: {
        showEffects: true,
        showEvents: true,
      },
    });

    // Check if successful
    const status = result.effects?.status?.status;
    if (status === 'success') {
      // Try to extract USDC received from events
      let usdcReceived: string | undefined;
      if (result.events) {
        const swapEvent = result.events.find(e =>
          e.type.includes('OrderExecutedWithSwapEvent')
        );
        if (swapEvent && swapEvent.parsedJson) {
          const parsed = swapEvent.parsedJson as { usdc_received?: string };
          usdcReceived = parsed.usdc_received;
        }
      }

      return {
        success: true,
        digest: result.digest,
        usdcReceived,
      };
    } else {
      return {
        success: false,
        error: result.effects?.status?.error || 'Unknown error',
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Execute a triggered order
 * Uses swap mode if enabled and configured, otherwise simple mode.
 * Falls back to simple execution if swap fails (e.g. no pool liquidity).
 */
export async function executeOrder(
  order: StopOrder,
  currentPrice: bigint
): Promise<{ success: boolean; digest?: string; error?: string }> {
  if (config.deepbook.swapEnabled) {
    const result = await executeOrderWithSwap(order, currentPrice);
    if (!result.success) {
      console.log(`  Swap failed, falling back to simple execution...`);
      return executeOrderSimple(order, currentPrice);
    }
    return result;
  } else {
    return executeOrderSimple(order, currentPrice);
  }
}

/**
 * Execute multiple orders
 */
export async function executeOrders(
  orders: StopOrder[],
  currentPrice: bigint
): Promise<{ executed: number; failed: number }> {
  let executed = 0;
  let failed = 0;

  for (const order of orders) {
    console.log(`Executing order ${order.id}...`);

    const result = await executeOrder(order, currentPrice);

    if (result.success) {
      console.log(`  ✓ Success! Digest: ${result.digest}`);
      executed++;
    } else {
      console.log(`  ✗ Failed: ${result.error}`);
      failed++;
    }
  }

  return { executed, failed };
}
