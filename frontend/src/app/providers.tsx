"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SuiClientProvider, WalletProvider } from "@mysten/dapp-kit";
import { SuiClient } from "@mysten/sui/client";
import { useState, useMemo } from "react";

import "@mysten/dapp-kit/dist/index.css";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  const suiClient = useMemo(
    () => new SuiClient({ url: "https://fullnode.testnet.sui.io:443" }),
    []
  );

  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider client={suiClient}>
        <WalletProvider autoConnect>
          {children}
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
