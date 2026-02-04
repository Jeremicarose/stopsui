"use client";

import { useEffect, useState, useCallback } from 'react';
import { useSuiClient, useCurrentAccount } from '@mysten/dapp-kit';
import { MIST_PER_SUI } from '@/lib/constants';

export interface Balance {
  totalMist: bigint;
  totalSui: number;
  formatted: string;
}

export function useBalance() {
  const client = useSuiClient();
  const account = useCurrentAccount();
  const [balance, setBalance] = useState<Balance | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchBalance = useCallback(async () => {
    if (!account?.address) {
      setBalance(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);

      const balanceResult = await client.getBalance({
        owner: account.address,
        coinType: '0x2::sui::SUI',
      });

      const totalMist = BigInt(balanceResult.totalBalance);
      const totalSui = Number(totalMist) / Number(MIST_PER_SUI);

      setBalance({
        totalMist,
        totalSui,
        formatted: totalSui.toLocaleString(undefined, {
          minimumFractionDigits: 4,
          maximumFractionDigits: 4
        }),
      });
    } catch (err) {
      console.error('Failed to fetch balance:', err);
      setBalance(null);
    } finally {
      setIsLoading(false);
    }
  }, [client, account?.address]);

  useEffect(() => {
    fetchBalance();
    // Refresh balance every 15 seconds
    const interval = setInterval(fetchBalance, 15000);
    return () => clearInterval(interval);
  }, [fetchBalance]);

  return {
    balance,
    isLoading,
    refetch: fetchBalance,
  };
}
