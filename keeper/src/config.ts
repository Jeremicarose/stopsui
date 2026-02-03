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

export const config = {
  // Network
  network: optionalEnv('SUI_NETWORK', 'testnet'),
  rpcUrl: optionalEnv('SUI_RPC_URL', 'https://fullnode.testnet.sui.io:443'),

  // Keeper wallet
  privateKey: requireEnv('KEEPER_PRIVATE_KEY'),

  // Contract addresses
  packageId: requireEnv('PACKAGE_ID'),
  orderRegistryId: requireEnv('ORDER_REGISTRY_ID'),
  vaultId: requireEnv('VAULT_ID'),
  executorCapId: requireEnv('EXECUTOR_CAP_ID'),

  // Pyth oracle
  pythHermesUrl: optionalEnv('PYTH_HERMES_URL', 'https://hermes.pyth.network'),
  suiUsdPriceFeedId: optionalEnv(
    'SUI_USD_PRICE_FEED_ID',
    '0x5a035d5440f5c163069af66062bac6c79377bf88396fa27e6067bfca8096d280'
  ),

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
  console.log('============================');
}
