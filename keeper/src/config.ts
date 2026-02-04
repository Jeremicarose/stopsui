/**
 * Configuration for StopSui Keeper
 *
 * Loads settings from environment variables.
 * All contract addresses and API endpoints in one place.
 */

import dotenv from 'dotenv';

// Load .env file
dotenv.config();

// Helper to get required env var (throws if missing)
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// Helper to get optional env var with default
function optionalEnv(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

// Helper to get optional env var (returns undefined if missing)
function optionalEnvOrUndefined(name: string): string | undefined {
  return process.env[name] || undefined;
}

export const config = {
  // Network
  network: optionalEnv('SUI_NETWORK', 'testnet'),
  rpcUrl: optionalEnv('SUI_RPC_URL', 'https://fullnode.testnet.sui.io:443'),

  // Keeper wallet
  privateKey: requireEnv('KEEPER_PRIVATE_KEY'),

  // Contract addresses
  packageId: requireEnv('PACKAGE_ID'),
  // Original package ID for event queries (events are tied to original type definitions)
  originalPackageId: optionalEnv('ORIGINAL_PACKAGE_ID', requireEnv('PACKAGE_ID')),
  orderRegistryId: requireEnv('ORDER_REGISTRY_ID'),
  vaultId: requireEnv('VAULT_ID'),
  executorCapId: requireEnv('EXECUTOR_CAP_ID'),

  // Pyth oracle
  pythHermesUrl: optionalEnv('PYTH_HERMES_URL', 'https://hermes.pyth.network'),
  // SUI/USD feed ID from Pyth Hermes (Crypto.SUI/USD)
  suiUsdPriceFeedId: optionalEnv(
    'SUI_USD_PRICE_FEED_ID',
    '23d7315113f5b1d3ba7a83604c44b94d79f4fd69af77f804fc7f920a6dc65744'
  ),

  // DeepBook v3 Configuration (for SUI→USDC swaps)
  // Package IDs from @mysten/deepbook-v3 SDK constants
  // Testnet: 0x22be4cade64bf2d02412c7e8d0e8beea2f78828b948118d46735315409371a3c
  // Mainnet: 0x337f4f4f6567fcd778d5454f27c16c70e2f274cc6377ea6249ddf491482ef497
  deepbook: {
    packageId: optionalEnv(
      'DEEPBOOK_PACKAGE_ID',
      '0x22be4cade64bf2d02412c7e8d0e8beea2f78828b948118d46735315409371a3c' // testnet default
    ),
    // SUI/USDC pool object ID (must be configured per network)
    suiUsdcPoolId: optionalEnvOrUndefined('SUI_USDC_POOL_ID'),
    // Keeper's Balance Manager object ID (created once, used for all swaps)
    // This is a shared object that acts as the keeper's trading account on DeepBook
    balanceManagerId: optionalEnvOrUndefined('BALANCE_MANAGER_ID'),
    // Keeper's trade cap for the balance manager (authorizes trading)
    tradeCapId: optionalEnvOrUndefined('TRADE_CAP_ID'),
    // DEEP token type (testnet vs mainnet)
    deepTokenType: optionalEnv(
      'DEEP_TOKEN_TYPE',
      '0x36dbef866a1d62bf7328989a10fb2f07d769f4ee587c0de4a0a256e57e0a58a8::deep::DEEP' // testnet
    ),
    // USDC/DBUSDC token type (testnet uses DBUSDC - DeepBook USDC)
    // Testnet: DBUSDC (0xf7152c...::DBUSDC::DBUSDC)
    // Mainnet: USDC (0xdba346...::usdc::USDC)
    usdcTokenType: optionalEnv(
      'USDC_TOKEN_TYPE',
      '0xf7152c05930480cd740d7311b5b8b45c6f488e3a53a11c3f74a6fac36a52e0d7::DBUSDC::DBUSDC' // testnet DBUSDC
    ),
    // Slippage tolerance in basis points (100 = 1%)
    slippageBps: parseInt(optionalEnv('SLIPPAGE_BPS', '50')), // 0.5% default
    // Enable/disable swap functionality
    swapEnabled: optionalEnv('DEEPBOOK_SWAP_ENABLED', 'false') === 'true',
  },

  // Polling
  pollIntervalMs: parseInt(optionalEnv('POLL_INTERVAL_MS', '5000')),

  // Price precision (must match contract: 1e9)
  pricePrecision: 1_000_000_000n,
};

// Log config on startup (hide private key)
export function logConfig() {
  console.log('=== Keeper Configuration ===');
  console.log(`Network: ${config.network}`);
  console.log(`RPC URL: ${config.rpcUrl}`);
  console.log(`Package ID: ${config.packageId}`);
  console.log(`Order Registry: ${config.orderRegistryId}`);
  console.log(`Vault: ${config.vaultId}`);
  console.log(`Executor Cap: ${config.executorCapId}`);
  console.log(`Poll Interval: ${config.pollIntervalMs}ms`);
  console.log('--- DeepBook Settings ---');
  console.log(`Swap Enabled: ${config.deepbook.swapEnabled}`);
  if (config.deepbook.swapEnabled) {
    console.log(`DeepBook Package: ${config.deepbook.packageId}`);
    console.log(`SUI/USDC Pool: ${config.deepbook.suiUsdcPoolId || 'NOT SET'}`);
    console.log(`Balance Manager: ${config.deepbook.balanceManagerId || 'NOT SET'}`);
    console.log(`Trade Cap: ${config.deepbook.tradeCapId || 'NOT SET'}`);
    console.log(`Slippage: ${config.deepbook.slippageBps} bps`);
  }
  console.log('============================');
}

// Validate DeepBook configuration
export function validateDeepBookConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (config.deepbook.swapEnabled) {
    if (!config.deepbook.suiUsdcPoolId) {
      errors.push('SUI_USDC_POOL_ID is required when swaps are enabled');
    }
    if (!config.deepbook.balanceManagerId) {
      errors.push('BALANCE_MANAGER_ID is required when swaps are enabled');
    }
    if (!config.deepbook.tradeCapId) {
      errors.push('TRADE_CAP_ID is required when swaps are enabled');
    }
  }

  return { valid: errors.length === 0, errors };
}
