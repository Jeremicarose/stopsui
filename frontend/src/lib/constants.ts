// Contract addresses
export const CONTRACT = {
  PACKAGE_ID: '0x095030a92f86bcb898178319c60e33e2f3e16235baa747d3c0dc229a48c7fa7c',
  ORIGINAL_PACKAGE_ID: '0x5fcf6a73809b96a201790e4c5bbd510c791ec8bd6abee4d31821dd2ceec24f9f',
  ORDER_REGISTRY: '0x29b26e6e70f322847607e8599941c8c4ed506af8eef7cfcbf165871e38f2c1aa',
  VAULT: '0xbbdad1e29c3fba29ee7e5e2be60b01da4004375a1f8e0303d7771d6ac75f0dc1',
  CLOCK: '0x6',
} as const;

// Pyth price feed
export const PYTH = {
  HERMES_URL: 'https://hermes.pyth.network',
  SUI_USD_FEED_ID: '23d7315113f5b1d3ba7a83604c44b94d79f4fd69af77f804fc7f920a6dc65744',
} as const;

// Price precision (1e9)
export const PRICE_PRECISION = 1_000_000_000n;
export const MIST_PER_SUI = 1_000_000_000n;

// Order directions
export const ORDER_DIRECTION = {
  STOP_LOSS: 0,
  TAKE_PROFIT: 1,
} as const;

// Order statuses
export const ORDER_STATUS = {
  PENDING: 0,
  EXECUTED: 1,
  CANCELLED: 2,
} as const;

export type OrderDirection = typeof ORDER_DIRECTION[keyof typeof ORDER_DIRECTION];
export type OrderStatus = typeof ORDER_STATUS[keyof typeof ORDER_STATUS];
