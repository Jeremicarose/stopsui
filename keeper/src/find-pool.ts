/**
 * Find DeepBook Pool Script
 *
 * Queries the DeepBook registry to find the SUI/USDC pool ID.
 * Since DeepBook v3 supports permissionless pool creation,
 * there may be multiple pools - this finds the active one.
 *
 * Run with: npx tsx src/find-pool.ts
 */

import { SuiClient } from '@mysten/sui/client';
import { config } from './config.js';

// Known DeepBook v3 addresses
const DEEPBOOK_TESTNET = {
  packageId: '0x56d90d0c055edb534b22820571f0ff6d2b484c38f659e17d99c22fe0214c66e4',
  // Pool Registry - contains all registered pools
  registryId: '0x36d5ee0a30f3e9e71e9ae6c5881a7d3ff930cd9e8c4e1f2b29e3b0c5b9d8a4e7', // placeholder
};

const DEEPBOOK_MAINNET = {
  packageId: '0x2c8d603bc51326b8c13cef9dd07031a408a48dddb541963357661df5d3204809',
};

// Token types
const TOKENS = {
  testnet: {
    SUI: '0x2::sui::SUI',
    USDC: '0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC',
    DEEP: '0x36dbef866a1d62bf7328989a10fb2f07d769f4ee587c0de4a0a256e57e0a58a8::deep::DEEP',
  },
  mainnet: {
    SUI: '0x2::sui::SUI',
    USDC: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
    DEEP: '0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP',
  },
};

async function main() {
  console.log('=== Find DeepBook SUI/USDC Pool ===\n');

  const client = new SuiClient({ url: config.rpcUrl });
  const isTestnet = config.network === 'testnet';
  const tokens = isTestnet ? TOKENS.testnet : TOKENS.mainnet;
  const deepbookPkg = config.deepbook.packageId;

  console.log(`Network: ${config.network}`);
  console.log(`DeepBook Package: ${deepbookPkg}`);
  console.log(`SUI Type: ${tokens.SUI}`);
  console.log(`USDC Type: ${tokens.USDC}\n`);

  // Method 1: Search for Pool objects by type
  console.log('Searching for SUI/USDC pools...\n');

  try {
    // Query for Pool<SUI, USDC> objects
    const poolType = `${deepbookPkg}::pool::Pool<${tokens.SUI}, ${tokens.USDC}>`;

    const pools = await client.queryEvents({
      query: {
        MoveEventType: `${deepbookPkg}::pool::PoolCreated`,
      },
      limit: 50,
    });

    console.log(`Found ${pools.data.length} PoolCreated events\n`);

    // Parse pool creation events
    const suiUsdcPools: string[] = [];

    for (const event of pools.data) {
      const parsed = event.parsedJson as {
        pool_id?: string;
        base_asset?: { name: string };
        quote_asset?: { name: string };
      };

      console.log('Pool Event:', JSON.stringify(parsed, null, 2));

      if (parsed.pool_id) {
        suiUsdcPools.push(parsed.pool_id);
      }
    }

    if (suiUsdcPools.length > 0) {
      console.log('\n=== Found Pools ===');
      for (const poolId of suiUsdcPools) {
        console.log(`Pool ID: ${poolId}`);

        // Get pool details
        try {
          const poolObj = await client.getObject({
            id: poolId,
            options: { showContent: true, showType: true },
          });

          if (poolObj.data?.type) {
            console.log(`  Type: ${poolObj.data.type}`);

            // Check if this is a SUI/USDC pool
            if (poolObj.data.type.includes('sui::SUI') &&
                poolObj.data.type.toLowerCase().includes('usdc')) {
              console.log('  ✓ This is a SUI/USDC pool!');
              console.log(`\nAdd to .env:\nSUI_USDC_POOL_ID=${poolId}`);
            }
          }
        } catch (e) {
          console.log(`  Error fetching pool: ${e}`);
        }
      }
    }

  } catch (error) {
    console.log('Event query failed, trying alternative method...\n');
  }

  // Method 2: Query owned objects (if keeper has interacted with pools)
  console.log('\n--- Alternative: Check DeepBook documentation ---');
  console.log('The SUI/USDC pool ID can be found at:');
  console.log('1. https://docs.sui.io/standards/deepbookv3-sdk');
  console.log('2. DeepBook Discord/Telegram for testnet pool IDs');
  console.log('3. Query the DeepBook indexer API');

  // Method 3: Known pool IDs (from documentation)
  console.log('\n--- Known Pool IDs (from DeepBook docs) ---');
  if (isTestnet) {
    console.log('Testnet pools may vary. Check DeepBook testnet faucet/docs.');
  } else {
    console.log('Mainnet DEEP_SUI: 0xb663828d6217467c8a1838a03793da896cbe745b150ebd57d82f814ca579fc22');
    console.log('Mainnet DEEP_USDC: 0xf948981b806057580f91622417534f491da5f61aeaf33d0ed8e69fd5691c95ce');
  }

  console.log('\n--- DeepBook Indexer Query ---');
  const indexerUrl = isTestnet
    ? 'https://deepbook-indexer.testnet.sui.io'
    : 'https://deepbook-indexer.mainnet.sui.io';
  console.log(`Indexer URL: ${indexerUrl}`);
  console.log('Try: curl ${indexerUrl}/pools');
}

main().catch(console.error);
