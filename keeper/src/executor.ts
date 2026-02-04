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
 */
function calculateMinQuoteOut(suiAmount: bigint, currentPrice: bigint): bigint {
  // Expected USDC = (SUI amount * price) / PRICE_PRECISION
  // Note: SUI has 9 decimals (MIST), USDC has 6 decimals
  // currentPrice is scaled by 1e9, so:
  // expectedUsdc = suiAmount * currentPrice / 1e9 / 1e3 (adjust for decimal diff)
  const expectedUsdc = (suiAmount * currentPrice) / config.pricePrecision / 1000n;

  // Apply slippage tolerance
  const slippageMultiplier = 10000n - BigInt(config.deepbook.slippageBps);
  const minQuoteOut = (expectedUsdc * slippageMultiplier) / 10000n;

  return minQuoteOut;
}

/**
 * Execute a triggered order with DeepBook swap (SUI → USDC)
 *
 * Uses the Balance Manager pattern:
 * 1. Execute order and get SUI coin from vault
 * 2. Deposit SUI into keeper's Balance Manager
 * 3. Place market sell order on DeepBook (SUI → USDC)
 * 4. Withdraw USDC from Balance Manager
 * 5. Transfer USDC to user via complete_swap_execution
 *
 * Prerequisites:
 * - Keeper must have a Balance Manager created (BALANCE_MANAGER_ID)
 * - Keeper must have a Trade Cap for the Balance Manager (TRADE_CAP_ID)
 * - Keeper should deposit DEEP tokens in Balance Manager for fee discounts
 */
export async function executeOrderWithSwap(
  order: StopOrder,
  currentPrice: bigint
): Promise<{ success: boolean; digest?: string; error?: string; usdcReceived?: string }> {
  const client = getClient();
  const kp = getKeypair();

  // Validate DeepBook config
  const validation = validateDeepBookConfig();
  if (!validation.valid) {
    return {
      success: false,
      error: `DeepBook config invalid: ${validation.errors.join(', ')}`,
    };
  }

  const {
    suiUsdcPoolId,
    balanceManagerId,
    tradeCapId,
    deepTokenType,
    usdcTokenType,
  } = config.deepbook;

  try {
    // Calculate minimum USDC output with slippage protection
    const suiAmount = BigInt(order.baseAmount);
    const minQuoteOut = calculateMinQuoteOut(suiAmount, currentPrice);

    console.log(`  Swap details: ${suiAmount} MIST → min ${minQuoteOut} USDC (slippage: ${config.deepbook.slippageBps}bps)`);

    // Build PTB for swap execution using Balance Manager pattern
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

    // Step 2: Deposit SUI into Balance Manager
    // deposit<T>(balance_manager: &mut BalanceManager, coin: Coin<T>)
    tx.moveCall({
      target: `${config.deepbook.packageId}::balance_manager::deposit`,
      typeArguments: ['0x2::sui::SUI'],
      arguments: [
        tx.object(balanceManagerId!),  // balance_manager: &mut BalanceManager
        suiCoin,                        // coin: Coin<SUI>
      ],
    });

    // Step 3a: Generate TradeProof from TradeCap
    // The TradeProof is required for place_market_order (not TradeCap directly)
    const tradeProof = tx.moveCall({
      target: `${config.deepbook.packageId}::balance_manager::generate_proof_as_trader`,
      arguments: [
        tx.object(balanceManagerId!),  // balance_manager: &mut BalanceManager
        tx.object(tradeCapId!),        // trade_cap: &TradeCap
      ],
    });

    // Step 3b: Place market sell order (SUI → USDC)
    // place_market_order<BaseAsset, QuoteAsset>(
    //   pool: &mut Pool<BaseAsset, QuoteAsset>,
    //   balance_manager: &mut BalanceManager,
    //   trade_proof: TradeProof,
    //   client_order_id: u64,
    //   self_matching_option: u8,  // 0 = SELF_MATCHING_ALLOWED
    //   quantity: u64,
    //   is_bid: bool,  // false = sell base (SUI) for quote (USDC)
    //   pay_with_deep: bool,
    //   clock: &Clock,
    // )
    tx.moveCall({
      target: `${config.deepbook.packageId}::pool::place_market_order`,
      typeArguments: [
        '0x2::sui::SUI',  // BaseAsset = SUI
        usdcTokenType!,   // QuoteAsset = USDC
      ],
      arguments: [
        tx.object(suiUsdcPoolId!),     // pool: &mut Pool<SUI, USDC>
        tx.object(balanceManagerId!),  // balance_manager: &mut BalanceManager
        tradeProof,                    // trade_proof: TradeProof
        tx.pure.u64(Date.now()),       // client_order_id: u64 (unique ID)
        tx.pure.u8(0),                 // self_matching_option: 0 = allowed
        suiSold,                        // quantity: u64 (amount of SUI to sell)
        tx.pure.bool(false),           // is_bid: false = sell base for quote
        tx.pure.bool(true),            // pay_with_deep: true (use DEEP for fees if available)
        tx.object('0x6'),              // clock: &Clock
      ],
    });

    // Step 4: Withdraw all USDC from Balance Manager
    // withdraw_all<T>(balance_manager: &mut BalanceManager): Coin<T>
    // Note: Only owner can call withdraw_all (no TradeCap needed)
    const usdcCoin = tx.moveCall({
      target: `${config.deepbook.packageId}::balance_manager::withdraw_all`,
      typeArguments: [usdcTokenType!],
      arguments: [
        tx.object(balanceManagerId!),  // balance_manager: &mut BalanceManager
      ],
    });

    // Step 5: Withdraw any remaining SUI (in case of partial fill)
    const remainingSui = tx.moveCall({
      target: `${config.deepbook.packageId}::balance_manager::withdraw_all`,
      typeArguments: ['0x2::sui::SUI'],
      arguments: [
        tx.object(balanceManagerId!),
      ],
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
 * Uses swap mode if enabled and configured, otherwise simple mode
 */
export async function executeOrder(
  order: StopOrder,
  currentPrice: bigint
): Promise<{ success: boolean; digest?: string; error?: string }> {
  if (config.deepbook.swapEnabled) {
    return executeOrderWithSwap(order, currentPrice);
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
