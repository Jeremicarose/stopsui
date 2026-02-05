/**
 * Test Cetus Aggregator for SUI → USDC swap
 *
 * Cetus aggregator routes through all major Sui DEXes (Cetus, DeepBook, Turbos, etc.)
 * and handles fees automatically - no DEEP tokens required.
 *
 * Usage: npx tsx src/test-swap.ts
 */

import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { AggregatorClient, Env } from '@cetusprotocol/aggregator-sdk';
import BN from 'bn.js';
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

  // Initialize Cetus aggregator
  const aggregator = new AggregatorClient({
    env: network === 'mainnet' ? Env.Mainnet : Env.Testnet,
    client: client,
    signer: address,
  });

  // Swap 1 SUI for USDC
  const suiAmount = 1_000_000_000n; // 1 SUI in MIST
  const usdcType = config.deepbook.usdcTokenType!;

  console.log(`\n=== Cetus Aggregator Test ===`);
  console.log(`Swapping: 1 SUI → USDC`);
  console.log(`USDC type: ${usdcType}`);

  try {
    // Step 1: Find best route
    console.log(`\nFinding best route...`);
    const routers = await aggregator.findRouters({
      from: '0x2::sui::SUI',
      target: usdcType,
      amount: new BN(suiAmount.toString()),
      byAmountIn: true,
      depth: 3,
    });

    if (!routers) {
      console.log('No route found');
      return;
    }

    if (routers.insufficientLiquidity) {
      console.log('Insufficient liquidity');
      return;
    }

    const expectedUsdc = routers.amountOut.toString();
    console.log(`✓ Route found!`);
    console.log(`  Expected USDC: ${expectedUsdc} (${(parseInt(expectedUsdc) / 1_000_000).toFixed(4)} USDC)`);
    console.log(`  Hops: ${routers.paths.length}`);

    // Show route details
    for (const path of routers.paths) {
      console.log(`    → ${path.provider}: ${path.from.split('::').pop()} → ${path.target.split('::').pop()}`);
    }

    // Step 2: Build transaction
    console.log(`\nBuilding transaction...`);
    const tx = new Transaction();

    // Split SUI from gas
    const [suiCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(suiAmount)]);

    // Execute swap via aggregator
    const outputCoin = await aggregator.routerSwap({
      router: routers,
      inputCoin: suiCoin,
      slippage: 0.01, // 1% slippage
      txb: tx,
    });

    // Transfer output to self
    tx.transferObjects([outputCoin], address);

    // Step 3: Dry run
    console.log(`\nDry-running transaction...`);
    tx.setSender(address);

    const dryRun = await client.dryRunTransactionBlock({
      transactionBlock: await tx.build({ client }),
    });

    console.log(`Status: ${dryRun.effects.status.status}`);

    if (dryRun.effects.status.status !== 'success') {
      console.log(`Error: ${dryRun.effects.status.error}`);
      return;
    }

    console.log(`\nBalance changes:`);
    for (const bc of dryRun.balanceChanges) {
      const coinType = bc.coinType.split('::').pop();
      const amount = parseInt(bc.amount);
      if (coinType === 'SUI') {
        console.log(`  SUI: ${(amount / 1_000_000_000).toFixed(4)}`);
      } else if (coinType === 'USDC') {
        console.log(`  USDC: ${(amount / 1_000_000).toFixed(4)}`);
      } else {
        console.log(`  ${coinType}: ${bc.amount}`);
      }
    }

    // Check if we got USDC
    const usdcChange = dryRun.balanceChanges.find(c => c.coinType.toLowerCase().includes('usdc'));
    if (usdcChange && parseInt(usdcChange.amount) > 0) {
      console.log(`\n✓ SUCCESS! Swap would work.`);
      console.log(`  Would receive: ${(parseInt(usdcChange.amount) / 1_000_000).toFixed(4)} USDC`);

      // Execute for real
      console.log(`\nExecuting swap...`);
      const result = await client.signAndExecuteTransaction({
        signer: keypair,
        transaction: tx,
        options: {
          showEffects: true,
          showBalanceChanges: true,
        },
      });

      console.log(`\nTransaction executed!`);
      console.log(`Digest: ${result.digest}`);
      console.log(`Status: ${result.effects?.status?.status}`);

      if (result.balanceChanges) {
        console.log(`\nActual balance changes:`);
        for (const bc of result.balanceChanges) {
          const coinType = bc.coinType.split('::').pop();
          const amount = parseInt(bc.amount);
          if (coinType === 'SUI') {
            console.log(`  SUI: ${(amount / 1_000_000_000).toFixed(4)}`);
          } else if (coinType === 'USDC') {
            console.log(`  USDC: ${(amount / 1_000_000).toFixed(4)}`);
          } else {
            console.log(`  ${coinType}: ${bc.amount}`);
          }
        }
      }
    } else {
      console.log(`\n✗ No USDC in output`);
    }

  } catch (error) {
    console.error(`\nError:`, error instanceof Error ? error.message : error);
  }
}

main().catch(console.error);
