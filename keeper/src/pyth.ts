/**
 * Pyth Price Feed Integration
 *
 * Fetches SUI/USD price from Pyth Hermes API.
 * Hermes is Pyth's off-chain price service that provides
 * the latest prices without needing to read from blockchain.
 */

import { config } from './config.js';

// Pyth price response structure
interface PythPriceUpdate {
  id: string;
  price: {
    price: string;      // Price as string (to avoid precision loss)
    conf: string;       // Confidence interval
    expo: number;       // Exponent (usually negative, e.g., -8)
    publish_time: number;
  };
}

interface HermesResponse {
  parsed: PythPriceUpdate[];
}

/**
 * Fetch current SUI/USD price from Pyth Hermes
 *
 * @returns Price scaled to our precision (1e9)
 *          e.g., $3.50 returns 3_500_000_000
 */
export async function fetchSuiPrice(): Promise<bigint> {
  // Remove 0x prefix if present for Hermes API
  const feedId = config.suiUsdPriceFeedId.replace('0x', '');

  const url = `${config.pythHermesUrl}/v2/updates/price/latest?ids[]=${feedId}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Pyth API error: ${response.status} ${response.statusText}`);
  }

  const data: HermesResponse = await response.json();

  if (!data.parsed || data.parsed.length === 0) {
    throw new Error('No price data returned from Pyth');
  }

  const priceUpdate = data.parsed[0];
  const rawPrice = BigInt(priceUpdate.price.price);
  const expo = priceUpdate.price.expo;

  // Convert to our precision (1e9)
  // Pyth expo is usually negative (e.g., -8 means price is X * 10^-8)
  // We want: price * 10^9
  // So: rawPrice * 10^(9 + expo)

  const targetExpo = 9;
  const adjustment = targetExpo + expo;

  let scaledPrice: bigint;
  if (adjustment >= 0) {
    scaledPrice = rawPrice * BigInt(10 ** adjustment);
  } else {
    scaledPrice = rawPrice / BigInt(10 ** (-adjustment));
  }

  return scaledPrice;
}

/**
 * Format price for display
 * e.g., 3_500_000_000n → "$3.50"
 */
export function formatPrice(price: bigint): string {
  const dollars = Number(price) / Number(config.pricePrecision);
  return `$${dollars.toFixed(4)}`;
}

/**
 * Get price info with metadata
 */
export async function getPriceInfo(): Promise<{
  price: bigint;
  formatted: string;
  timestamp: Date;
}> {
  const price = await fetchSuiPrice();
  return {
    price,
    formatted: formatPrice(price),
    timestamp: new Date(),
  };
}
