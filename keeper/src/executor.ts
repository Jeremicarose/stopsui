/**
 * Order Executor
 *
 * Builds and submits transactions to execute triggered orders.
 * Uses Sui's Programmable Transaction Blocks (PTB) to call
 * the entry::execute_order function.
 *
 * Cetus Aggregator Integration:
 * - Routes SUI→USDC swaps through all major Sui DEXes (Cetus, DeepBook, Turbos, etc.)
 * - Automatically finds the best route and handles fees
 * - No DEEP tokens required (unlike direct DeepBook integration)
 * - Falls back to simple execution if swap fails
 */

import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { AggregatorClient, Env } from '@cetusprotocol/aggregator-sdk';
import BN from 'bn.js';
import { config } from './config.js';
import { StopOrder, getClient } from './orders.js';

// Keeper's keypair (loaded once)
let keypair: Ed25519Keypair | null = null;

// Cetus aggregator client (loaded once)
let aggregatorClient: AggregatorClient | null = null;

/**
 * Get or create the keeper's keypair
 */
function getKeypair(): Ed25519Keypair {
  if (!keypair) {
    const pk = config.privateKey;

    if (pk.startsWith('suiprivkey')) {
      keypair = Ed25519Keypair.fromSecretKey(pk);
    } else {
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
 * Get or create the Cetus aggregator client
 */
function getAggregatorClient(): AggregatorClient {
  if (!aggregatorClient) {
    const kp = getKeypair();
    aggregatorClient = new AggregatorClient({
      env: config.network === 'mainnet' ? Env.Mainnet : Env.Testnet,
      client: getClient(),
      signer: kp.toSuiAddress(),
    });
  }
  return aggregatorClient;
}

/**
 * Get keeper's address
 */
export function getKeeperAddress(): string {
  return getKeypair().toSuiAddress();
}

/**
 * Execute a triggered order (simple mode - returns SUI to user)
 */
export async function executeOrderSimple(
  order: StopOrder,
  currentPrice: bigint
): Promise<{ success: boolean; digest?: string; error?: string }> {
  const client = getClient();
  const kp = getKeypair();

  try {
    const tx = new Transaction();

    tx.moveCall({
      target: `${config.packageId}::entry::execute_triggered_order`,
      arguments: [
        tx.object(config.orderRegistryId),
        tx.object(order.id),
        tx.object(config.vaultId),
        tx.object(config.executorCapId),
        tx.pure.u64(currentPrice),
        tx.object('0x6'),
      ],
    });

    const result = await client.signAndExecuteTransaction({
      signer: kp,
      transaction: tx,
      options: {
        showEffects: true,
        showEvents: true,
      },
    });

    const status = result.effects?.status?.status;
    if (status === 'success') {
      return { success: true, digest: result.digest };
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
 * Execute a triggered order with swap (SUI → USDC)
 *
 * Uses Cetus Aggregator to find the best swap route across all Sui DEXes:
 * 1. Find best route for SUI→USDC via Cetus aggregator API
 * 2. Execute order and get SUI coin from vault
 * 3. Swap SUI→USDC via aggregator (adds swap calls to same PTB)
 * 4. Complete swap execution - transfer USDC to user
 */
export async function executeOrderWithSwap(
  order: StopOrder,
  currentPrice: bigint
): Promise<{ success: boolean; digest?: string; error?: string; usdcReceived?: string }> {
  const client = getClient();
  const kp = getKeypair();
  const aggregator = getAggregatorClient();

  const { usdcTokenType } = config.deepbook;

  if (!usdcTokenType) {
    return { success: false, error: 'USDC token type not configured' };
  }

  const suiAmount = BigInt(order.baseAmount);

  try {
    // Step 1: Find best swap route via Cetus aggregator
    console.log(`  Finding swap route for ${suiAmount} MIST...`);

    const routers = await aggregator.findRouters({
      from: '0x2::sui::SUI',
      target: usdcTokenType,
      amount: new BN(suiAmount.toString()),
      byAmountIn: true,
      depth: 3,
    });

    if (!routers || routers.insufficientLiquidity) {
      return {
        success: false,
        error: 'No swap route found or insufficient liquidity',
      };
    }

    const expectedUsdc = routers.amountOut.toString();
    console.log(`  Route: ${routers.paths.length} hop(s) → ~${(parseInt(expectedUsdc) / 1_000_000).toFixed(4)} USDC`);

    // Step 2: Build PTB
    const tx = new Transaction();

    // Execute order and get SUI coin from vault
    const [suiCoin, owner, orderId, suiSold, executionPrice] = tx.moveCall({
      target: `${config.packageId}::entry::execute_order_for_swap`,
      arguments: [
        tx.object(config.orderRegistryId),
        tx.object(order.id),
        tx.object(config.vaultId),
        tx.object(config.executorCapId),
        tx.pure.u64(currentPrice),
        tx.object('0x6'),
      ],
    });

    // Step 3: Swap SUI→USDC via Cetus aggregator
    const slippage = config.deepbook.slippageBps / 10000;
    const usdcCoin = await aggregator.routerSwap({
      router: routers,
      inputCoin: suiCoin,
      slippage,
      txb: tx,
    });

    // Step 4: Create a zero SUI coin for remaining_sui parameter
    // (aggregator consumes all input, no remaining SUI)
    const zeroSui = tx.moveCall({
      target: '0x2::coin::zero',
      typeArguments: ['0x2::sui::SUI'],
      arguments: [],
    });

    // Step 5: Complete swap execution - transfer USDC to user
    tx.moveCall({
      target: `${config.packageId}::entry::complete_swap_execution`,
      typeArguments: [usdcTokenType],
      arguments: [
        usdcCoin,
        zeroSui,
        orderId,
        owner,
        suiSold,
        executionPrice,
        tx.object('0x6'),
      ],
    });

    // Sign and execute
    const result = await client.signAndExecuteTransaction({
      signer: kp,
      transaction: tx,
      options: {
        showEffects: true,
        showEvents: true,
        showBalanceChanges: true,
      },
    });

    const status = result.effects?.status?.status;
    if (status === 'success') {
      // Extract USDC received from balance changes
      let usdcReceived: string | undefined;
      if (result.balanceChanges) {
        const usdcChange = result.balanceChanges.find(bc =>
          bc.coinType.toLowerCase().includes('usdc') && parseInt(bc.amount) > 0
        );
        if (usdcChange) {
          usdcReceived = usdcChange.amount;
        }
      }

      // Also check events
      if (!usdcReceived && result.events) {
        const swapEvent = result.events.find(e =>
          e.type.includes('OrderExecutedWithSwapEvent')
        );
        if (swapEvent && swapEvent.parsedJson) {
          const parsed = swapEvent.parsedJson as { usdc_received?: string };
          usdcReceived = parsed.usdc_received;
        }
      }

      return { success: true, digest: result.digest, usdcReceived };
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
 * Uses swap mode if enabled, otherwise simple mode.
 * Falls back to simple execution if swap fails.
 */
export async function executeOrder(
  order: StopOrder,
  currentPrice: bigint
): Promise<{ success: boolean; digest?: string; error?: string }> {
  if (config.deepbook.swapEnabled) {
    const result = await executeOrderWithSwap(order, currentPrice);
    if (!result.success) {
      console.log(`  Swap failed: ${result.error}`);
      console.log(`  Falling back to simple execution...`);
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
