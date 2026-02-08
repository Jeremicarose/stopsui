# StopSui

Non-custodial stop-loss and take-profit orders for SUI tokens on Sui mainnet.

## What This Does

StopSui automates conditional token sales on Sui. Users deposit SUI into an on-chain vault and specify a trigger price. A keeper bot monitors Pyth Network oracle prices. When the price crosses the trigger threshold, the keeper executes a transaction that withdraws SUI from the vault, swaps it to USDC via Cetus DEX aggregator, and transfers the USDC to the user's wallet.

If you deploy this:
- Users can create orders through a web interface
- Orders are stored as shared objects on Sui with funds held in a vault contract
- A keeper process polls price data and executes triggered orders automatically
- Executed orders result in USDC delivered to user wallets

The system handles two order types:
- **Stop-loss**: Executes when price drops to or below the trigger (downside protection)
- **Take-profit**: Executes when price rises to or above the trigger (profit locking)

## Why This Exists

Sui DeFi lacks native conditional order functionality. Centralized exchanges provide stop-losses; decentralized exchanges on Sui do not.

The practical problem: token holders cannot protect positions without manual monitoring. On a chain with sub-second finality, price movements complete before users can react. A 15% overnight drop results in losses that could have been avoided with automated exits.

Existing alternatives:
- Manual trading requires constant attention
- Price alerts notify but don't execute
- No protocol on Sui currently offers this functionality

## How It Works

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Frontend  │────▶│  Sui Chain  │◀────│   Keeper    │
│  (Next.js)  │     │   (Move)    │     │ (TypeScript)│
└─────────────┘     └─────────────┘     └─────────────┘
                           │                   │
                           │                   ▼
                           │            ┌─────────────┐
                           │            │    Pyth     │
                           │            │   Oracle    │
                           │            └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │   Cetus     │
                    │ Aggregator  │
                    └─────────────┘
```

**Smart Contracts (Move)**

Four modules deployed as a single package:
- `vault`: Holds user deposits in a `Table<ID, Deposit>` mapping. Enforces that only the owner can cancel and only the ExecutorCap holder can withdraw for execution.
- `order_registry`: Manages order lifecycle (pending, executed, cancelled). Orders are shared objects accessible to the keeper.
- `executor`: Validates trigger conditions against provided prices. Returns SUI coins for swap execution.
- `entry`: Composes atomic transactions. The `execute_order_for_swap` function returns a SUI coin that feeds into Cetus swap calls within the same PTB.

**Keeper Bot (TypeScript)**

Runs as a persistent process:
1. Polls Pyth Hermes API for SUI/USD price (default: 5 second interval)
2. Queries `OrderCreated` events to discover pending orders
3. Fetches order objects and checks trigger conditions
4. For triggered orders: builds a Programmable Transaction Block that calls `execute_order_for_swap`, pipes the returned SUI coin through Cetus aggregator `routerSwap`, then calls `complete_swap_execution` to transfer USDC to the user
5. Signs and submits the transaction

**Frontend (Next.js)**

Standard dApp interface using `@mysten/dapp-kit`:
- Wallet connection via Sui Wallet, Phantom, or Suiet
- Order creation forms for stop-loss and take-profit
- Order history with execution details
- Real-time price display from Pyth

## Key Capabilities

- Atomic execution via Sui PTB: withdraw, swap, and transfer happen in one transaction
- Multi-DEX routing through Cetus aggregator (routes across Cetus, DeepBook, Turbos, etc.)
- Capability-based access control: ExecutorCap restricts who can trigger withdrawals
- Event-based order indexing: no on-chain iteration required
- Slippage protection: configurable tolerance on swap execution
- Cancellation: users can withdraw deposited funds at any time before execution

## Example Flow

1. User connects wallet to frontend at `localhost:3002`
2. User creates stop-loss order: 1 SUI, trigger price $0.95
3. Frontend builds transaction calling `entry::create_stop_loss_order`
4. User signs; transaction deposits SUI to vault, creates shared order object, emits `OrderCreated` event
5. Keeper discovers order via event query
6. Keeper polls Pyth: current price $0.98
7. Price drops to $0.94
8. Keeper detects trigger condition met (0.94 <= 0.95)
9. Keeper calls Cetus aggregator `findRouters` for SUI→USDC route
10. Keeper builds PTB: `execute_order_for_swap` → `routerSwap` → `complete_swap_execution`
11. Keeper signs and submits transaction
12. User receives USDC in wallet; order marked executed; `OrderExecutedWithSwapEvent` emitted

## Setup

**Prerequisites**
- Node.js 20+
- Sui CLI (for contract deployment)
- Sui wallet with mainnet SUI for gas

**Contracts**

Already deployed to mainnet. If redeploying:

```bash
cd contracts
sui client publish --gas-budget 100000000
```

Update `Published.toml` with new object IDs.

**Keeper**

```bash
cd keeper
cp .env.example .env
# Edit .env with:
# - KEEPER_PRIVATE_KEY (base64 or suiprivkey format)
# - PACKAGE_ID, ORDER_REGISTRY_ID, VAULT_ID, EXECUTOR_CAP_ID
# - Set DEEPBOOK_SWAP_ENABLED=true for USDC swaps
npm install
npm run start
```

**Frontend**

```bash
cd frontend
npm install
npm run dev -- -p 3002
```

Update `src/lib/constants.ts` if using different contract deployment.

## Limitations

**Operational**
- Single keeper instance: no redundancy or failover
- Keeper requires funded wallet for gas
- No keeper incentive mechanism: operator pays gas without compensation
- Event-based order discovery does not paginate: will degrade with thousands of orders

**Functional**
- SUI/USDC pair only
- No partial fills: entire order amount swaps or fails
- No trailing stops or OCO orders
- Price source is Pyth only: no fallback oracle
- Swap routing depends on Cetus aggregator availability

**Security**
- Keeper private key must be secured; compromise allows early execution (but not theft)
- No price freshness validation in contract: keeper provides price, contract trusts it if within sanity bounds
- ExecutorCap is a single point of authorization

**Scale**
- Order objects are shared: contention possible under high throughput
- No batching: one transaction per order execution

## Intended Use

This is functional software deployed on mainnet with real value. It is suitable for:
- Personal use with amounts you can afford to lose
- Demonstration of Sui DeFi patterns
- Foundation for production systems with additional infrastructure

Not suitable for:
- High-value positions without additional monitoring
- Systems requiring guaranteed uptime
- Use cases needing audit certification

## Configuration

**Keeper Environment Variables**

| Variable | Description |
|----------|-------------|
| `SUI_NETWORK` | `mainnet` or `testnet` |
| `SUI_RPC_URL` | Sui fullnode RPC endpoint |
| `KEEPER_PRIVATE_KEY` | Signing key for keeper transactions |
| `PACKAGE_ID` | Deployed contract package ID |
| `ORDER_REGISTRY_ID` | OrderRegistry shared object ID |
| `VAULT_ID` | Vault shared object ID |
| `EXECUTOR_CAP_ID` | ExecutorCap object ID (owned by keeper) |
| `DEEPBOOK_SWAP_ENABLED` | `true` to enable SUI→USDC swaps |
| `USDC_TOKEN_TYPE` | USDC coin type for swaps |
| `SLIPPAGE_BPS` | Slippage tolerance in basis points |

## Contract Addresses (Mainnet)

```
Package: 0x4300e4889fe3948458703fb3b230c9529f4a7db04b8241fbda8277d7e21a8914
OrderRegistry: 0xa39f651cc3b3657143b0cb996d10880479ffc11464f882a175a4fe84ebf73bc4
Vault: 0xde76bef37df24183721dffc6f7479b95fc4e302aef0762f0241b38a4805e8ac2
ExecutorCap: 0xda8f3b4ff323b3983aa1e86c0b42d2be97c111eb7d9620007a1b961f48bf3b30
```

## License

MIT
