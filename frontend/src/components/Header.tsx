"use client";

import { ConnectButton, useCurrentAccount } from '@mysten/dapp-kit';

export function Header() {
  const account = useCurrentAccount();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 glass">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="relative">
            {/* Shield icon */}
            <svg
              width="36"
              height="36"
              viewBox="0 0 24 24"
              fill="none"
              className="shield-glow"
            >
              <path
                d="M12 2L4 6v6c0 5.25 3.4 10.1 8 11.5 4.6-1.4 8-6.25 8-11.5V6l-8-4z"
                fill="url(#shield-gradient)"
                stroke="url(#shield-stroke)"
                strokeWidth="1.5"
              />
              <path
                d="M12 7v6M12 16v.01"
                stroke="#0a0b0f"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <defs>
                <linearGradient id="shield-gradient" x1="4" y1="2" x2="20" y2="19.5" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#f59e0b" />
                  <stop offset="1" stopColor="#d97706" />
                </linearGradient>
                <linearGradient id="shield-stroke" x1="4" y1="2" x2="20" y2="19.5" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#fbbf24" />
                  <stop offset="1" stopColor="#f59e0b" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              Stop<span className="text-[var(--stop-loss)]">Sui</span>
            </h1>
            <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest">
              Smart Order Protection
            </p>
          </div>
        </div>

        {/* Network badge + Connect */}
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--bg-tertiary)] border border-[var(--border-subtle)]">
            <span className="w-2 h-2 rounded-full bg-[var(--take-profit)] animate-pulse" />
            <span className="text-xs font-medium text-[var(--text-secondary)]">Mainnet</span>
          </div>

          <div className="connect-wallet">
            <ConnectButton
              connectText="Connect Wallet"
              className="!bg-[var(--bg-elevated)] !border !border-[var(--border-medium)] !rounded-xl !px-5 !py-2.5 !font-semibold !text-sm hover:!bg-[var(--bg-tertiary)] !transition-all"
            />
          </div>

          {account && (
            <div className="hidden md:flex items-center gap-2 text-xs text-[var(--text-muted)]">
              <span className="font-mono">
                {account.address.slice(0, 6)}...{account.address.slice(-4)}
              </span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
