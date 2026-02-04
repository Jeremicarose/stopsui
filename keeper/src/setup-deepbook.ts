/**
 * DeepBook Setup Script
 *
 * One-time setup to create a Balance Manager for the keeper.
 * The Balance Manager acts as the keeper's trading account on DeepBook.
 *
 * Usage:
 *   npx tsx src/setup-deepbook.ts           # Create Balance Manager (step 1)
 *   npx tsx src/setup-deepbook.ts mint-cap  # Mint TradeCap after BM created (step 2)
 *
 * After running both steps, update .env with:
 * - BALANCE_MANAGER_ID (the created Balance Manager object ID)
 * - TRADE_CAP_ID (the Trade Cap object ID for authorizing trades)
 */

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { config } from './config.js';

async function createBalanceManager(client: SuiClient, keypair: Ed25519Keypair) {
  const keeperAddress = keypair.toSuiAddress();
  console.log('Creating Balance Manager...\n');

  const tx = new Transaction();

  // Create Balance Manager using new() which returns a BalanceManager
  const balanceManager = tx.moveCall({
    target: `${config.deepbook.packageId}::balance_manager::new`,
    arguments: [],
  });

  // Share the Balance Manager so it can be used by anyone
  tx.moveCall({
    target: '0x2::transfer::public_share_object',
    arguments: [balanceManager],
    typeArguments: [`${config.deepbook.packageId}::balance_manager::BalanceManager`],
  });

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

  if (result.effects?.status?.status !== 'success') {
    console.error('Transaction failed:', result.effects?.status?.error);
    process.exit(1);
  }

  // Extract created Balance Manager ID
  let balanceManagerId: string | undefined;

  for (const change of result.objectChanges || []) {
    if (change.type === 'created' && change.objectType.includes('BalanceManager')) {
      balanceManagerId = change.objectId;
    }
  }

  console.log('=== Balance Manager Created! ===\n');
  console.log('Add this to your .env file:\n');
  console.log(`BALANCE_MANAGER_ID=${balanceManagerId}`);
  console.log('\nThen run: npx tsx src/setup-deepbook.ts mint-cap');
  console.log('to create a TradeCap for this Balance Manager.');
}

async function mintTradeCap(client: SuiClient, keypair: Ed25519Keypair) {
  const keeperAddress = keypair.toSuiAddress();

  if (!config.deepbook.balanceManagerId) {
    console.error('Error: BALANCE_MANAGER_ID not set in .env');
    console.error('Run: npx tsx src/setup-deepbook.ts');
    console.error('first to create a Balance Manager.');
    process.exit(1);
  }

  console.log(`Minting TradeCap for Balance Manager: ${config.deepbook.balanceManagerId}\n`);

  const tx = new Transaction();

  // Mint a TradeCap for the existing Balance Manager
  const tradeCap = tx.moveCall({
    target: `${config.deepbook.packageId}::balance_manager::mint_trade_cap`,
    arguments: [tx.object(config.deepbook.balanceManagerId)],
  });

  // Transfer TradeCap to keeper
  tx.transferObjects([tradeCap], keeperAddress);

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

  if (result.effects?.status?.status !== 'success') {
    console.error('Transaction failed:', result.effects?.status?.error);
    process.exit(1);
  }

  // Extract created TradeCap ID
  let tradeCapId: string | undefined;

  for (const change of result.objectChanges || []) {
    if (change.type === 'created' && change.objectType.includes('TradeCap')) {
      tradeCapId = change.objectId;
    }
  }

  console.log('=== TradeCap Created! ===\n');
  console.log('Add this to your .env file:\n');
  console.log(`TRADE_CAP_ID=${tradeCapId}`);
  console.log('\nThen set DEEPBOOK_SWAP_ENABLED=true to enable swaps.');
  console.log('\nOptional: Deposit DEEP tokens into your Balance Manager for fee discounts.');
  console.log('  npx tsx src/deposit-deep.ts <amount>');
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'create';

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

  if (command === 'mint-cap') {
    await mintTradeCap(client, keypair);
  } else {
    // Check if Balance Manager already exists
    if (config.deepbook.balanceManagerId && config.deepbook.tradeCapId) {
      console.log('Balance Manager already configured in .env');
      console.log(`  BALANCE_MANAGER_ID=${config.deepbook.balanceManagerId}`);
      console.log(`  TRADE_CAP_ID=${config.deepbook.tradeCapId}`);
      console.log('\nTo create a new one, remove these from .env and run again.');
      return;
    }

    if (config.deepbook.balanceManagerId && !config.deepbook.tradeCapId) {
      console.log('Balance Manager exists but TradeCap is missing.');
      console.log('Run: npx tsx src/setup-deepbook.ts mint-cap');
      return;
    }

    await createBalanceManager(client, keypair);
  }
}

main().catch(console.error);
