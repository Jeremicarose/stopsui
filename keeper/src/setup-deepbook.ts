/**
 * DeepBook Setup Script
 *
 * One-time setup to create a Balance Manager for the keeper.
 * The Balance Manager acts as the keeper's trading account on DeepBook.
 *
 * Run with: npx tsx src/setup-deepbook.ts
 *
 * After running, update .env with:
 * - BALANCE_MANAGER_ID (the created Balance Manager object ID)
 * - TRADE_CAP_ID (the Trade Cap object ID for authorizing trades)
 */

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { config } from './config.js';

async function main() {
  console.log('=== DeepBook Balance Manager Setup ===\n');

  // Initialize client and keypair
  const client = new SuiClient({ url: config.rpcUrl });

  let keypair: Ed25519Keypair;
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

  const keeperAddress = keypair.toSuiAddress();
  console.log(`Keeper Address: ${keeperAddress}`);
  console.log(`Network: ${config.network}`);
  console.log(`DeepBook Package: ${config.deepbook.packageId}\n`);

  // Check if Balance Manager already exists
  if (config.deepbook.balanceManagerId) {
    console.log('Balance Manager already configured in .env');
    console.log(`  BALANCE_MANAGER_ID=${config.deepbook.balanceManagerId}`);
    console.log(`  TRADE_CAP_ID=${config.deepbook.tradeCapId || 'NOT SET'}`);
    console.log('\nTo create a new one, remove these from .env and run again.');
    return;
  }

  // Build transaction to create Balance Manager
  console.log('Creating Balance Manager...\n');

  const tx = new Transaction();

  // Create Balance Manager
  // new(ctx: &mut TxContext): (BalanceManager, TradeCap)
  // Returns the Balance Manager (shared) and TradeCap (owned by caller)
  const [balanceManager, tradeCap] = tx.moveCall({
    target: `${config.deepbook.packageId}::balance_manager::new`,
    arguments: [],
  });

  // Share the Balance Manager
  tx.moveCall({
    target: `0x2::transfer::public_share_object`,
    typeArguments: [`${config.deepbook.packageId}::balance_manager::BalanceManager`],
    arguments: [balanceManager],
  });

  // Transfer TradeCap to keeper
  tx.transferObjects([tradeCap], keeperAddress);

  // Execute transaction
  console.log('Signing and executing transaction...');

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: {
      showEffects: true,
      showObjectChanges: true,
    },
  });

  console.log(`Transaction digest: ${result.digest}\n`);

  // Check result
  if (result.effects?.status?.status !== 'success') {
    console.error('Transaction failed:', result.effects?.status?.error);
    process.exit(1);
  }

  // Extract created object IDs
  let balanceManagerId: string | undefined;
  let tradeCapId: string | undefined;

  for (const change of result.objectChanges || []) {
    if (change.type === 'created') {
      if (change.objectType.includes('BalanceManager')) {
        balanceManagerId = change.objectId;
      } else if (change.objectType.includes('TradeCap')) {
        tradeCapId = change.objectId;
      }
    }
  }

  console.log('=== Setup Complete! ===\n');
  console.log('Add these to your .env file:\n');
  console.log(`BALANCE_MANAGER_ID=${balanceManagerId}`);
  console.log(`TRADE_CAP_ID=${tradeCapId}`);
  console.log('\nThen set DEEPBOOK_SWAP_ENABLED=true to enable swaps.');
  console.log('\nOptional: Deposit DEEP tokens into your Balance Manager for fee discounts.');
}

main().catch(console.error);
