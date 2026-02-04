/**
 * Deposit DEEP Tokens Script
 *
 * Deposits DEEP tokens into the keeper's Balance Manager for fee discounts.
 * DeepBook charges lower fees when paying with DEEP tokens.
 *
 * Run with: npx tsx src/deposit-deep.ts <amount>
 * Example: npx tsx src/deposit-deep.ts 100
 *
 * Prerequisites:
 * - Balance Manager must be created (run setup-deepbook.ts first)
 * - Keeper wallet must have DEEP tokens
 */

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { config } from './config.js';

async function main() {
  const args = process.argv.slice(2);
  const amount = args[0] ? parseFloat(args[0]) : 0;

  if (amount <= 0) {
    console.log('Usage: npx tsx src/deposit-deep.ts <amount>');
    console.log('Example: npx tsx src/deposit-deep.ts 100');
    process.exit(1);
  }

  console.log('=== Deposit DEEP Tokens ===\n');

  // Validate config
  if (!config.deepbook.balanceManagerId) {
    console.error('Error: BALANCE_MANAGER_ID not set in .env');
    console.error('Run setup-deepbook.ts first to create a Balance Manager.');
    process.exit(1);
  }

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
  console.log(`Balance Manager: ${config.deepbook.balanceManagerId}`);
  console.log(`Amount to deposit: ${amount} DEEP\n`);

  // DEEP has 6 decimals
  const amountInSmallestUnit = BigInt(Math.floor(amount * 1_000_000));

  // Find DEEP coins owned by keeper
  const coins = await client.getCoins({
    owner: keeperAddress,
    coinType: config.deepbook.deepTokenType,
  });

  if (coins.data.length === 0) {
    console.error('Error: No DEEP tokens found in keeper wallet.');
    console.error(`Expected type: ${config.deepbook.deepTokenType}`);
    process.exit(1);
  }

  // Calculate total DEEP balance
  const totalBalance = coins.data.reduce(
    (sum, coin) => sum + BigInt(coin.balance),
    0n
  );
  console.log(`Available DEEP: ${Number(totalBalance) / 1_000_000}`);

  if (totalBalance < amountInSmallestUnit) {
    console.error(`Error: Insufficient DEEP balance. Need ${amount}, have ${Number(totalBalance) / 1_000_000}`);
    process.exit(1);
  }

  // Build transaction
  const tx = new Transaction();

  // If we need to merge coins or split
  if (coins.data.length === 1 && BigInt(coins.data[0].balance) >= amountInSmallestUnit) {
    // Single coin with enough balance - split if needed
    const coinToDeposit = tx.splitCoins(tx.object(coins.data[0].coinObjectId), [
      tx.pure.u64(amountInSmallestUnit),
    ]);

    // Deposit into Balance Manager
    tx.moveCall({
      target: `${config.deepbook.packageId}::balance_manager::deposit`,
      typeArguments: [config.deepbook.deepTokenType],
      arguments: [
        tx.object(config.deepbook.balanceManagerId!),
        coinToDeposit,
      ],
    });
  } else {
    // Merge all coins first, then split
    const [firstCoin, ...restCoins] = coins.data;

    if (restCoins.length > 0) {
      tx.mergeCoins(
        tx.object(firstCoin.coinObjectId),
        restCoins.map(c => tx.object(c.coinObjectId))
      );
    }

    const coinToDeposit = tx.splitCoins(tx.object(firstCoin.coinObjectId), [
      tx.pure.u64(amountInSmallestUnit),
    ]);

    // Deposit into Balance Manager
    tx.moveCall({
      target: `${config.deepbook.packageId}::balance_manager::deposit`,
      typeArguments: [config.deepbook.deepTokenType],
      arguments: [
        tx.object(config.deepbook.balanceManagerId!),
        coinToDeposit,
      ],
    });
  }

  // Execute transaction
  console.log('Signing and executing transaction...');

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: {
      showEffects: true,
    },
  });

  console.log(`Transaction digest: ${result.digest}\n`);

  if (result.effects?.status?.status === 'success') {
    console.log(`Successfully deposited ${amount} DEEP into Balance Manager!`);
    console.log('DEEP tokens will be used automatically for trading fee discounts.');
  } else {
    console.error('Transaction failed:', result.effects?.status?.error);
    process.exit(1);
  }
}

main().catch(console.error);
