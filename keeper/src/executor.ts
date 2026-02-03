/**
 * Order Executor
 *
 * Builds and submits transactions to execute triggered orders.
 * Uses Sui's Programmable Transaction Blocks (PTB) to call
 * the entry::execute_order function.
 */

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { config } from './config.js';
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
 * Execute a triggered order
 *
 * Builds a PTB that calls:
 * entry::execute_order(registry, order, vault, executor_cap, price, clock)
 */
export async function executeOrder(
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
