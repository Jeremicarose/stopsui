/**
 * Test script to debug DeepBook swap independently
 *
 * Performs a standalone swap_exact_base_for_quote on the SUI/DBUSDC pool
 * to verify the swap works outside of our contract.
 *
 * Usage: npx tsx src/test-swap.ts
 */

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
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

  const {
    suiUsdcPoolId,
    deepTokenType,
    usdcTokenType,
  } = config.deepbook;

  // Swap 1 SUI for USDC
  const suiAmount = 1_000_000_000n; // 1 SUI
  const minQuoteOut = 0n; // Accept any amount for testing

  console.log(`\nSwapping ${suiAmount} MIST (1 SUI) for DBUSDC...`);
  console.log(`Pool: ${suiUsdcPoolId}`);
  console.log(`DEEP type: ${deepTokenType}`);
  console.log(`USDC type: ${usdcTokenType}`);
  console.log(`Min quote out: ${minQuoteOut}`);

  const tx = new Transaction();

  // Split 1 SUI from gas
  const [suiCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(suiAmount)]);

  // Create zero DEEP coin for fees
  const zeroDeepCoin = tx.moveCall({
    target: '0x2::coin::zero',
    typeArguments: [deepTokenType!],
    arguments: [],
  });

  // Swap SUI for USDC (use ORIGINAL DeepBook package that created the pool)
  const DEEPBOOK_ORIGINAL = '0x2c8d603bc51326b8c13cef9dd07031a408a48dddb541963357661df5d3204809';
  console.log(`\nUsing DeepBook package: ${DEEPBOOK_ORIGINAL} (original)`);
  console.log(`Config package:         ${config.deepbook.packageId} (upgraded)`);
  const [remainingSui, usdcCoin, remainingDeep] = tx.moveCall({
    target: `${DEEPBOOK_ORIGINAL}::pool::swap_exact_base_for_quote`,
    typeArguments: [
      '0x2::sui::SUI',
      usdcTokenType!,
    ],
    arguments: [
      tx.object(suiUsdcPoolId!),
      suiCoin,
      zeroDeepCoin,
      tx.pure.u64(minQuoteOut),
      tx.object('0x6'),
    ],
  });

  // Transfer results to self
  tx.transferObjects([remainingSui, usdcCoin, remainingDeep], address);

  console.log('\nDry-running transaction...');
  tx.setSender(address);

  try {
    const dryRun = await client.dryRunTransactionBlock({
      transactionBlock: await tx.build({ client }),
    });

    console.log(`\nDry run status: ${dryRun.effects.status.status}`);
    if (dryRun.effects.status.status !== 'success') {
      console.log(`Error: ${dryRun.effects.status.error}`);
      return;
    }

    // Check balance changes
    console.log('\nBalance changes:');
    for (const change of dryRun.balanceChanges) {
      console.log(`  ${change.coinType}: ${change.amount}`);
    }

    console.log('\nDry run succeeded! Executing for real...');

    const result = await client.signAndExecuteTransaction({
      signer: keypair,
      transaction: tx,
      options: {
        showEffects: true,
        showEvents: true,
        showBalanceChanges: true,
      },
    });

    console.log(`\nDigest: ${result.digest}`);
    console.log(`Status: ${result.effects?.status?.status}`);

    if (result.balanceChanges) {
      console.log('\nBalance changes:');
      for (const change of result.balanceChanges) {
        console.log(`  ${change.coinType}: ${change.amount}`);
      }
    }
  } catch (error) {
    console.error('\nError:', error instanceof Error ? error.message : error);
  }
}

main().catch(console.error);
