/**
 * Test script to debug DeepBook swap independently
 *
 * Tests multiple swap approaches on the SUI/USDC pool.
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
    packageId,
    suiUsdcPoolId,
    deepTokenType,
    usdcTokenType,
  } = config.deepbook;

  const suiAmount = 1_000_000_000n; // 1 SUI

  console.log(`\nPool: ${suiUsdcPoolId}`);
  console.log(`DeepBook Package: ${packageId}`);
  console.log(`USDC type: ${usdcTokenType}`);

  // === Test 1: Query expected output with input fee ===
  console.log('\n--- Test 1: get_quote_quantity_out (with DEEP fee) ---');
  {
    const tx = new Transaction();
    tx.moveCall({
      target: `${packageId}::pool::get_quote_quantity_out`,
      typeArguments: ['0x2::sui::SUI', usdcTokenType!],
      arguments: [
        tx.object(suiUsdcPoolId!),
        tx.pure.u64(suiAmount),
        tx.object('0x6'),
      ],
    });
    tx.setSender(address);
    try {
      const result = await client.devInspectTransactionBlock({
        transactionBlock: await tx.build({ client }),
        sender: address,
      });
      console.log(`Status: ${result.effects.status.status}`);
      if (result.results?.[0]?.returnValues) {
        for (const rv of result.results[0].returnValues) {
          const bytes = rv[0];
          console.log(`Return value (raw bytes): [${bytes}]`);
        }
      }
    } catch (e) {
      console.log(`Error: ${e instanceof Error ? e.message : e}`);
    }
  }

  // === Test 2: Query expected output with input token fee ===
  console.log('\n--- Test 2: get_quote_quantity_out_input_fee ---');
  {
    const tx = new Transaction();
    tx.moveCall({
      target: `${packageId}::pool::get_quote_quantity_out_input_fee`,
      typeArguments: ['0x2::sui::SUI', usdcTokenType!],
      arguments: [
        tx.object(suiUsdcPoolId!),
        tx.pure.u64(suiAmount),
        tx.object('0x6'),
      ],
    });
    tx.setSender(address);
    try {
      const result = await client.devInspectTransactionBlock({
        transactionBlock: await tx.build({ client }),
        sender: address,
      });
      console.log(`Status: ${result.effects.status.status}`);
      if (result.results?.[0]?.returnValues) {
        for (const rv of result.results[0].returnValues) {
          const bytes = rv[0];
          // Parse u64 from BCS bytes (little-endian)
          let val = 0n;
          for (let i = bytes.length - 1; i >= 0; i--) {
            val = (val << 8n) | BigInt(bytes[i]);
          }
          console.log(`Expected output: ${val}`);
        }
      }
    } catch (e) {
      console.log(`Error: ${e instanceof Error ? e.message : e}`);
    }
  }

  // === Test 3: swap_exact_quantity (takes both base+quote coins) ===
  console.log('\n--- Test 3: swap_exact_quantity (dry run) ---');
  {
    const tx = new Transaction();

    // Split SUI from gas
    const [suiCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(suiAmount)]);

    // Zero USDC coin
    const zeroUsdc = tx.moveCall({
      target: '0x2::coin::zero',
      typeArguments: [usdcTokenType!],
      arguments: [],
    });

    // Zero DEEP coin
    const zeroDeep = tx.moveCall({
      target: '0x2::coin::zero',
      typeArguments: [deepTokenType!],
      arguments: [],
    });

    // swap_exact_quantity takes: pool, baseCoin, quoteCoin, deepCoin, minOut, clock
    const [baseCoinOut, quoteCoinOut, deepCoinOut] = tx.moveCall({
      target: `${packageId}::pool::swap_exact_quantity`,
      typeArguments: ['0x2::sui::SUI', usdcTokenType!],
      arguments: [
        tx.object(suiUsdcPoolId!),
        suiCoin,
        zeroUsdc,
        zeroDeep,
        tx.pure.u64(0), // min out = 0 for testing
        tx.object('0x6'),
      ],
    });

    tx.transferObjects([baseCoinOut, quoteCoinOut, deepCoinOut], address);
    tx.setSender(address);

    try {
      const dryRun = await client.dryRunTransactionBlock({
        transactionBlock: await tx.build({ client }),
      });
      console.log(`Status: ${dryRun.effects.status.status}`);
      if (dryRun.effects.status.status !== 'success') {
        console.log(`Error: ${dryRun.effects.status.error}`);
      } else {
        console.log('Balance changes:');
        for (const bc of dryRun.balanceChanges) {
          console.log(`  ${bc.coinType}: ${bc.amount}`);
        }
      }
    } catch (e) {
      console.log(`Error: ${e instanceof Error ? e.message : e}`);
    }
  }

  // === Test 4: swap_exact_base_for_quote with upgraded package ===
  console.log('\n--- Test 4: swap_exact_base_for_quote (upgraded pkg, dry run) ---');
  {
    const tx = new Transaction();

    const [suiCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(suiAmount)]);

    const zeroDeep = tx.moveCall({
      target: '0x2::coin::zero',
      typeArguments: [deepTokenType!],
      arguments: [],
    });

    const [remainingSui, usdcCoin, remainingDeep] = tx.moveCall({
      target: `${packageId}::pool::swap_exact_base_for_quote`,
      typeArguments: ['0x2::sui::SUI', usdcTokenType!],
      arguments: [
        tx.object(suiUsdcPoolId!),
        suiCoin,
        zeroDeep,
        tx.pure.u64(0),
        tx.object('0x6'),
      ],
    });

    tx.transferObjects([remainingSui, usdcCoin, remainingDeep], address);
    tx.setSender(address);

    try {
      const dryRun = await client.dryRunTransactionBlock({
        transactionBlock: await tx.build({ client }),
      });
      console.log(`Status: ${dryRun.effects.status.status}`);
      if (dryRun.effects.status.status !== 'success') {
        console.log(`Error: ${dryRun.effects.status.error}`);
      } else {
        console.log('Balance changes:');
        for (const bc of dryRun.balanceChanges) {
          console.log(`  ${bc.coinType}: ${bc.amount}`);
        }
      }
    } catch (e) {
      console.log(`Error: ${e instanceof Error ? e.message : e}`);
    }
  }
}

main().catch(console.error);
