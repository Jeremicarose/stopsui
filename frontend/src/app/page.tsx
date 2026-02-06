"use client";

import { useState } from 'react';
import { useCurrentAccount } from '@mysten/dapp-kit';
import { Header, PriceDisplay, CreateOrderForm, OrdersList, ScalingOrders } from '@/components';
import { useOrders } from '@/hooks/useOrders';

export default function Home() {
  const account = useCurrentAccount();
  const { refetch } = useOrders();
  const [activeMode, setActiveMode] = useState<'simple' | 'scaling'>('simple');

  return (
    <div className="min-h-screen relative z-10">
      <Header />

      {/* Main content */}
      <main className="pt-24 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Hero section */}
          <div className="text-center mb-12 animate-fade-in">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight mb-4">
              Protect Your{' '}
              <span className="bg-gradient-to-r from-[var(--stop-loss)] to-[var(--take-profit)] bg-clip-text text-transparent">
                SUI Position
              </span>
            </h1>
            <p className="text-lg sm:text-xl text-[var(--text-secondary)] max-w-2xl mx-auto">
              Set stop-loss and take-profit orders to automatically manage your risk.
              Powered by Pyth Network oracles on Sui.
            </p>
          </div>

          {/* Stats bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-12 animate-slide-up">
            <div className="card-elevated p-4 text-center">
              <div className="text-2xl font-bold text-[var(--stop-loss)]">0.05%</div>
              <div className="text-xs text-[var(--text-muted)]">Protocol Fee</div>
            </div>
            <div className="card-elevated p-4 text-center">
              <div className="text-2xl font-bold text-[var(--take-profit)]">24/7</div>
              <div className="text-xs text-[var(--text-muted)]">Monitoring</div>
            </div>
            <div className="card-elevated p-4 text-center">
              <div className="text-2xl font-bold">~3s</div>
              <div className="text-xs text-[var(--text-muted)]">Execution Time</div>
            </div>
            <div className="card-elevated p-4 text-center">
              <div className="text-2xl font-bold">Mainnet</div>
              <div className="text-xs text-[var(--text-muted)]">Network</div>
            </div>
          </div>

          {/* Main grid */}
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Left column - Price & Mode toggle */}
            <div className="lg:col-span-1 space-y-6">
              <PriceDisplay />

              {/* Mode toggle */}
              <div className="card p-4 animate-slide-up delay-100">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-[var(--text-secondary)]">Order Mode</span>
                </div>
                <div className="toggle-container">
                  <button
                    className={`toggle-option ${activeMode === 'simple' ? 'active-stop-loss' : ''}`}
                    onClick={() => setActiveMode('simple')}
                  >
                    Simple
                  </button>
                  <button
                    className={`toggle-option ${activeMode === 'scaling' ? 'active-take-profit' : ''}`}
                    onClick={() => setActiveMode('scaling')}
                  >
                    Scaling
                  </button>
                </div>
              </div>

              {/* How it works */}
              <div className="card p-6 animate-slide-up delay-200">
                <h3 className="text-sm font-bold mb-4 text-[var(--text-secondary)]">How It Works</h3>
                <div className="space-y-4">
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-[var(--stop-loss-dim)] flex items-center justify-center flex-shrink-0">
                      <span className="text-[var(--stop-loss)] font-bold text-sm">1</span>
                    </div>
                    <div>
                      <div className="text-sm font-medium">Create Order</div>
                      <div className="text-xs text-[var(--text-muted)]">Set your trigger price and amount</div>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center flex-shrink-0">
                      <span className="text-[var(--text-secondary)] font-bold text-sm">2</span>
                    </div>
                    <div>
                      <div className="text-sm font-medium">Keeper Monitors</div>
                      <div className="text-xs text-[var(--text-muted)]">Our bot watches Pyth prices 24/7</div>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-[var(--take-profit-dim)] flex items-center justify-center flex-shrink-0">
                      <span className="text-[var(--take-profit)] font-bold text-sm">3</span>
                    </div>
                    <div>
                      <div className="text-sm font-medium">Auto Execute</div>
                      <div className="text-xs text-[var(--text-muted)]">Triggered orders execute instantly</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Middle column - Order form */}
            <div className="lg:col-span-1">
              {activeMode === 'simple' ? (
                <CreateOrderForm onSuccess={refetch} />
              ) : (
                <ScalingOrders onSuccess={refetch} />
              )}
            </div>

            {/* Right column - Orders list */}
            <div className="lg:col-span-1">
              <OrdersList />
            </div>
          </div>

          {/* Footer info */}
          <div className="mt-16 text-center animate-fade-in">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-[var(--text-muted)]">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="2"/>
              </svg>
              <span className="text-sm text-[var(--text-muted)]">
                Secured by Sui Move smart contracts
              </span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
