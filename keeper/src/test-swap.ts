/**
 * Test script to debug DeepBook swap independently
 *
 * Tests a standalone swap using the DeepBook v3 SDK v1.0.3.
 *
 * Usage: npx tsx src/test-swap.ts
 */

import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { DeepBookClient } from '@mysten/deepbook-v3';
import { config } from './config.js';

async function main() {
  const network = config.network === 'mainnet' ? 'mainnet' : 'testnet';
  const client = new SuiClient({ url: getFullnodeUrl(network) });

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
  console.log(`Network: ${network}`);

  const dbClient = new DeepBookClient({
    address: address,
    network: network,
    client: client,
  });

  const suiAmount = 1;

  console.log('\n=== Test 1: Check if pool is whitelisted ===');
  try {
    const tx1 = new Transaction();
    dbClient.deepBook.whitelisted('SUI_USDC')(tx1);
    tx1.setSender(address);
    const result1 = await client.devInspectTransactionBlock({
      transactionBlock: await tx1.build({ client }),
      sender: address,
    });
    console.log(`Status: ${result1.effects.status.status}`);
    if (result1.results?.[0]?.returnValues) {
      const bytes = result1.results[0].returnValues[0][0];
      console.log(`Whitelisted: ${bytes[0] === 1 ? 'YES' : 'NO'}`);
    }
  } catch (e) {
    console.log(`Error: ${e instanceof Error ? e.message : e}`);
  }

  console.log('\n=== Test 2: Check pool trade params ===');
  try {
    const tx2 = new Transaction();
    dbClient.deepBook.poolTradeParams('SUI_USDC')(tx2);
    tx2.setSender(address);
    const result2 = await client.devInspectTransactionBlock({
      transactionBlock: await tx2.build({ client }),
      sender: address,
    });
    console.log(`Status: ${result2.effects.status.status}`);
    if (result2.results?.[0]?.returnValues) {
      console.log('Trade params raw:', result2.results[0].returnValues);
    }
  } catch (e) {
    console.log(`Error: ${e instanceof Error ? e.message : e}`);
  }

  console.log('\n=== Test 3: Get quote quantity out (DEEP fee) ===');
  try {
    const tx3 = new Transaction();
    dbClient.deepBook.getQuoteQuantityOut('SUI_USDC', suiAmount)(tx3);
    tx3.setSender(address);
    const result3 = await client.devInspectTransactionBlock({
      transactionBlock: await tx3.build({ client }),
      sender: address,
    });
    console.log(`Status: ${result3.effects.status.status}`);
    if (result3.effects.status.status !== 'success') {
      console.log(`Error: ${result3.effects.status.error}`);
    }
    if (result3.results?.[0]?.returnValues) {
      const bytes = result3.results[0].returnValues[0][0];
      let val = 0n;
      for (let i = bytes.length - 1; i >= 0; i--) {
        val = (val << 8n) | BigInt(bytes[i]);
      }
      console.log(`Expected quote out (DEEP fee): ${val}`);
    }
  } catch (e) {
    console.log(`Error: ${e instanceof Error ? e.message : e}`);
  }

  console.log('\n=== Test 4: Get quote quantity out (INPUT fee) ===');
  try {
    const tx4 = new Transaction();
    dbClient.deepBook.getQuoteQuantityOutInputFee('SUI_USDC', suiAmount)(tx4);
    tx4.setSender(address);
    const result4 = await client.devInspectTransactionBlock({
      transactionBlock: await tx4.build({ client }),
      sender: address,
    });
    console.log(`Status: ${result4.effects.status.status}`);
    if (result4.effects.status.status !== 'success') {
      console.log(`Error: ${result4.effects.status.error}`);
    }
    if (result4.results?.[0]?.returnValues) {
      const bytes = result4.results[0].returnValues[0][0];
      let val = 0n;
      for (let i = bytes.length - 1; i >= 0; i--) {
        val = (val << 8n) | BigInt(bytes[i]);
      }
      console.log(`Expected quote out (INPUT fee): ${val}`);
    }
  } catch (e) {
    console.log(`Error: ${e instanceof Error ? e.message : e}`);
  }

  console.log('\n=== Test 5: Swap with 0.1 DEEP for fees ===');
  try {
    const tx5 = new Transaction();
    const [baseCoin, quoteCoin, deepCoin] = dbClient.deepBook.swapExactBaseForQuote({
      poolKey: 'SUI_USDC',
      amount: suiAmount,
      deepAmount: 0.1, // Provide some DEEP for fees
      minOut: 0,
    })(tx5);
    tx5.transferObjects([baseCoin, quoteCoin, deepCoin], address);
    tx5.setSender(address);

    const dryRun = await client.dryRunTransactionBlock({
      transactionBlock: await tx5.build({ client }),
    });
    console.log(`Status: ${dryRun.effects.status.status}`);
    if (dryRun.effects.status.status !== 'success') {
      console.log(`Error: ${dryRun.effects.status.error}`);
    }
    console.log('Balance changes:');
    for (const bc of dryRun.balanceChanges) {
      const coinType = bc.coinType.split('::').pop();
      console.log(`  ${coinType}: ${bc.amount}`);
    }
  } catch (e) {
    console.log(`Error: ${e instanceof Error ? e.message : e}`);
  }
}

main().catch(console.error);
