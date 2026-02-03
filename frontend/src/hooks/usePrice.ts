"use client";

import { useState, useEffect, useCallback } from 'react';
import { PYTH } from '@/lib/constants';

interface PriceData {
  price: number;
  confidence: number;
  timestamp: number;
  previousPrice: number | null;
  direction: 'up' | 'down' | 'neutral';
}

export function usePrice(refreshInterval = 5000) {
  const [priceData, setPriceData] = useState<PriceData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPrice = useCallback(async () => {
    try {
      const url = `${PYTH.HERMES_URL}/api/latest_price_feeds?ids[]=${PYTH.SUI_USD_FEED_ID}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error('Failed to fetch price');
      }

      const data = await response.json();

      if (!data || data.length === 0) {
        throw new Error('No price data available');
      }

      const feed = data[0];
      const priceInfo = feed.price;

      // Convert to human readable price
      const price = Number(priceInfo.price) * Math.pow(10, priceInfo.expo);
      const confidence = Number(priceInfo.conf) * Math.pow(10, priceInfo.expo);

      setPriceData(prev => ({
        price,
        confidence,
        timestamp: Date.now(),
        previousPrice: prev?.price ?? null,
        direction: prev
          ? price > prev.price ? 'up' : price < prev.price ? 'down' : 'neutral'
          : 'neutral',
      }));

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrice();
    const interval = setInterval(fetchPrice, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchPrice, refreshInterval]);

  return { priceData, isLoading, error, refetch: fetchPrice };
}
