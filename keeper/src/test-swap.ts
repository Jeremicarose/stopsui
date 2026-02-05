/**
 * Test script to debug DeepBook swap independently
 *
 * Tests a standalone swap using the DeepBook v3 SDK properly.
 *
 * Usage: npx tsx src/test-swap.ts
 */

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { DeepBookClient } from '@mysten/deepbook-v3';
import { config } from './config.js';

async function main() {
  const client = new SuiClient({ url: config.rpcUrl });

  let keypair: Ed25519Keypair;
  const pk = config.privateKey;
  if (pk.startsWith('suiprivkey')) {
    keypair = Ed25519Keypair.fromSecretKey(pk);
  } else {
    const decoded = Buffer.from(pk, 'base64');
    keypair = Ed25519Keypair.fromSecretKey(decoded);
  }

  const address = keypair.toSuiAddress();
  console.log(`Address: ${address}`);
  console.log(`Network: ${config.network}`);

  // Initialize DeepBook client with proper configuration
  const dbClient = new DeepBookClient({
    address: address,
    env: config.network === 'mainnet' ? 'mainnet' : 'testnet',
    client: client,
  });

  console.log('\n=== DeepBook Client Initialized ===');
  console.log(`Package ID: ${(dbClient as any).config?.DEEPBOOK_PACKAGE_ID || 'unknown'}`);

  // Get available pools
  console.log('\n--- Checking SUI_USDC pool ---');

  const suiAmount = 1; // 1 SUI (SDK uses decimals automatically)
  const minQuoteOut = 0; // Accept any amount for testing

  try {
    // Build swap transaction using the SDK
    const tx = new Transaction();

    // Use SDK's swapExactBaseForQuote
    console.log(`\nSwapping ${suiAmount} SUI for USDC...`);
    console.log(`Min quote out: ${minQuoteOut}`);

    const [baseCoin, quoteCoin, deepCoin] = dbClient.deepBook.swapExactBaseForQuote({
      poolKey: 'SUI_USDC',
      amount: suiAmount,
      deepAmount: 0, // No DEEP - use input token fees
      minOut: minQuoteOut,
    })(tx);

    // Transfer results to self
    tx.transferObjects([baseCoin, quoteCoin, deepCoin], address);

    console.log('\nDry-running transaction...');
    tx.setSender(address);

    const dryRun = await client.dryRunTransactionBlock({
      transactionBlock: await tx.build({ client }),
    });

    console.log(`\nDry run status: ${dryRun.effects.status.status}`);
    if (dryRun.effects.status.status !== 'success') {
      console.log(`Error: ${dryRun.effects.status.error}`);
      return;
    }

    console.log('\nBalance changes:');
    for (const change of dryRun.balanceChanges) {
      const coinType = change.coinType.split('::').pop();
      console.log(`  ${coinType}: ${change.amount}`);
    }

    // If dry run succeeded, execute for real
    console.log('\nExecuting for real...');

    const result = await client.signAndExecuteTransaction({
      signer: keypair,
      transaction: tx,
      options: {
        showEffects: true,
        showBalanceChanges: true,
      },
    });

    console.log(`\nDigest: ${result.digest}`);
    console.log(`Status: ${result.effects?.status?.status}`);

    if (result.balanceChanges) {
      console.log('\nBalance changes:');
      for (const change of result.balanceChanges) {
        const coinType = change.coinType.split('::').pop();
        console.log(`  ${coinType}: ${change.amount}`);
      }
    }
  } catch (error) {
    console.error('\nError:', error instanceof Error ? error.message : error);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
  }
}

main().catch(console.error);
