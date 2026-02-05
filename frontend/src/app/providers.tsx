"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SuiClientProvider, WalletProvider, createNetworkConfig } from "@mysten/dapp-kit";
import { useState } from "react";

import "@mysten/dapp-kit/dist/index.css";

// Network configuration with required 'network' property
const { networkConfig } = createNetworkConfig({
  testnet: {
    url: "https://fullnode.testnet.sui.io:443",
    network: "testnet",
  },
  mainnet: {
    url: "https://fullnode.mainnet.sui.io:443",
    network: "mainnet",
  },
  devnet: {
    url: "https://fullnode.devnet.sui.io:443",
    network: "devnet",
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig} defaultNetwork="mainnet">
        <WalletProvider
          autoConnect
          preferredWallets={['Sui Wallet', 'Suiet', 'Phantom']}
        >
          {children}
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
