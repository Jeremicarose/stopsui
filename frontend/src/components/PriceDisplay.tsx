"use client";

import { usePrice } from '@/hooks/usePrice';
import { useEffect, useState } from 'react';

export function PriceDisplay() {
  const { priceData, isLoading, error } = usePrice(3000);
  const [animateKey, setAnimateKey] = useState(0);

  useEffect(() => {
    if (priceData?.direction !== 'neutral') {
      setAnimateKey(prev => prev + 1);
    }
  }, [priceData?.price, priceData?.direction]);

  if (isLoading && !priceData) {
    return (
      <div className="card p-6 animate-slide-up">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-medium text-[var(--text-muted)]">SUI / USD</span>
          <span className="text-xs text-[var(--text-muted)]">via Pyth Network</span>
        </div>
        <div className="skeleton h-12 w-40" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-6 animate-slide-up border-red-500/30">
        <div className="text-sm text-red-400">Failed to load price</div>
      </div>
    );
  }

  const priceColor = priceData?.direction === 'up'
    ? 'text-[var(--take-profit)]'
    : priceData?.direction === 'down'
      ? 'text-[var(--stop-loss)]'
      : 'text-[var(--text-primary)]';

  const ArrowIcon = priceData?.direction === 'up'
    ? () => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[var(--take-profit)]">
          <path d="M12 5v14M5 12l7-7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )
    : priceData?.direction === 'down'
      ? () => (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[var(--stop-loss)]">
            <path d="M12 19V5M5 12l7 7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )
      : () => null;

  return (
    <div className="card p-6 animate-slide-up">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {/* SUI Logo */}
          <div className="w-8 h-8 rounded-full bg-[#4da2ff] flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h-2v-6h2v6zm4 0h-2v-6h2v6zm0-8H9V7h6v2z"/>
            </svg>
          </div>
          <span className="text-sm font-semibold text-[var(--text-secondary)]">SUI / USD</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[var(--take-profit)] animate-pulse-glow" />
          <span className="text-xs text-[var(--text-muted)]">Live</span>
        </div>
      </div>

      <div className="flex items-end gap-3">
        <span
          key={animateKey}
          className={`price-display ${priceColor} ${priceData?.direction !== 'neutral' ? 'animate-price-tick' : ''}`}
        >
          ${priceData?.price.toFixed(4)}
        </span>
        <ArrowIcon />
      </div>

      {priceData?.confidence && (
        <div className="mt-2 text-xs text-[var(--text-muted)]">
          ±${priceData.confidence.toFixed(4)} confidence
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-[var(--border-subtle)]">
        <div className="flex items-center justify-between text-xs">
          <span className="text-[var(--text-muted)]">Oracle</span>
          <a
            href="https://pyth.network"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors flex items-center gap-1"
          >
            Pyth Network
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/>
            </svg>
          </a>
        </div>
      </div>
    </div>
  );
}
