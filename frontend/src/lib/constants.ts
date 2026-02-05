// Contract addresses
export const CONTRACT = {
  PACKAGE_ID: '0x4300e4889fe3948458703fb3b230c9529f4a7db04b8241fbda8277d7e21a8914',
  ORIGINAL_PACKAGE_ID: '0x4300e4889fe3948458703fb3b230c9529f4a7db04b8241fbda8277d7e21a8914',
  ORDER_REGISTRY: '0xa39f651cc3b3657143b0cb996d10880479ffc11464f882a175a4fe84ebf73bc4',
  VAULT: '0xde76bef37df24183721dffc6f7479b95fc4e302aef0762f0241b38a4805e8ac2',
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
