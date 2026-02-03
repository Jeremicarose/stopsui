/// Executor module for StopSui
/// Handles order execution when price conditions are met
///
/// Price Feed Architecture:
/// - Keeper fetches SUI/USD price from Pyth Hermes API
/// - Keeper calls pyth::update_single_price_feed to update on-chain
/// - Keeper reads fresh price and calls execute_order
/// - Contract validates price is from authorized keeper
module stopsui::executor {
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::clock::Clock;
    use sui::event;

    use stopsui::vault::{Self, Vault, ExecutorCap};
    use stopsui::order_registry::{Self, StopOrder, OrderRegistry};

    // ============ Errors ============

    const ETriggerNotMet: u64 = 0;
    const EStalePrice: u64 = 1;
    const EOrderNotPending: u64 = 2;
    const EPriceOutOfRange: u64 = 3;

    // ============ Constants ============

    /// Our internal price precision (1e9 for 9 decimals)
    /// Price of $3.50 = 3_500_000_000
    const PRICE_PRECISION: u64 = 1_000_000_000;

    /// Maximum reasonable SUI price ($1000)
    const MAX_PRICE: u64 = 1_000_000_000_000; // $1000

    /// Minimum reasonable SUI price ($0.001)
    const MIN_PRICE: u64 = 1_000_000; // $0.001

    // ============ Events ============

    public struct OrderExecutedEvent has copy, drop {
        order_id: ID,
        owner: address,
        sui_amount: u64,
        execution_price: u64,
        timestamp: u64,
    }

    // ============ Types ============

    /// Receipt returned after successful execution
    public struct ExecutionReceipt has key, store {
        id: UID,
        order_id: ID,
        owner: address,
        sui_sold: u64,
        usdc_received: u64,
        execution_price: u64,
        timestamp: u64,
    }

    // ============ Core Execution ============

    /// Check if a stop-loss trigger condition is met
    /// Returns true if current_price <= trigger_price for stop-loss (direction=0)
    /// Returns true if current_price >= trigger_price for take-profit (direction=1)
    public fun check_trigger(
        order: &StopOrder,
        current_price: u64,
    ): bool {
        let trigger = order_registry::order_trigger_price(order);
        let direction = order_registry::order_direction(order);

        if (direction == 0) {
            // Stop-loss: trigger when price drops to or below threshold
            current_price <= trigger
        } else {
            // Take-profit: trigger when price rises to or above threshold
            current_price >= trigger
        }
    }

    /// Execute a stop-loss order (original signature for upgrade compatibility)
    /// Returns only ExecutionReceipt, transfers SUI to owner internally
    public fun execute_order(
        registry: &mut OrderRegistry,
        order: &mut StopOrder,
        vault: &mut Vault,
        executor_cap: &ExecutorCap,
        current_price: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ): ExecutionReceipt {
        let (sui_coin, receipt) = execute_order_internal(
            registry, order, vault, executor_cap, current_price, clock, ctx
        );
        // Transfer SUI to owner
        transfer::public_transfer(sui_coin, receipt.owner);
        receipt
    }

    /// Internal execute that returns coin (for future DeepBook integration)
    fun execute_order_internal(
        registry: &mut OrderRegistry,
        order: &mut StopOrder,
        vault: &mut Vault,
        executor_cap: &ExecutorCap,
        pyth_price: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ): (Coin<SUI>, ExecutionReceipt) {
        // Verify order is still pending
        assert!(order_registry::is_pending(order), EOrderNotPending);

        // Basic price sanity check
        assert!(pyth_price >= MIN_PRICE && pyth_price <= MAX_PRICE, EPriceOutOfRange);

        // Verify trigger condition is met
        assert!(check_trigger(order, pyth_price), ETriggerNotMet);

        let order_id = order_registry::order_id(order);
        let sui_amount = order_registry::order_amount(order);

        // Withdraw SUI from vault (ExecutorCap authorizes this)
        let (sui_coin, owner) = vault::withdraw_for_execution(
            vault,
            executor_cap,
            order_id,
            ctx
        );

        // Calculate expected USDC value (for receipt)
        // In production with DeepBook, actual received amount may differ
        let usdc_value = (sui_amount * pyth_price) / PRICE_PRECISION;

        // Mark order as executed in registry
        order_registry::mark_executed(registry, order, pyth_price);

        let timestamp = clock.timestamp_ms();

        // Emit execution event
        event::emit(OrderExecutedEvent {
            order_id,
            owner,
            sui_amount,
            execution_price: pyth_price,
            timestamp,
        });

        // Create execution receipt
        let receipt = ExecutionReceipt {
            id: object::new(ctx),
            order_id,
            owner,
            sui_sold: sui_amount,
            usdc_received: usdc_value,
            execution_price: pyth_price,
            timestamp,
        };

        // Return SUI coin and receipt
        // Caller handles swap via DeepBook or direct transfer
        (sui_coin, receipt)
    }

    /// Simplified execution that transfers SUI directly to owner
    /// For MVP testing without DeepBook integration
    public entry fun execute_order_simple(
        registry: &mut OrderRegistry,
        order: &mut StopOrder,
        vault: &mut Vault,
        executor_cap: &ExecutorCap,
        pyth_price: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let (sui_coin, receipt) = execute_order_internal(
            registry,
            order,
            vault,
            executor_cap,
            pyth_price,
            clock,
            ctx
        );

        // Transfer SUI back to owner
        let owner = receipt.owner;
        transfer::public_transfer(sui_coin, owner);
        transfer::public_transfer(receipt, owner);
    }

    // ============ View Functions ============

    public fun receipt_order_id(receipt: &ExecutionReceipt): ID {
        receipt.order_id
    }

    public fun receipt_owner(receipt: &ExecutionReceipt): address {
        receipt.owner
    }

    public fun receipt_sui_sold(receipt: &ExecutionReceipt): u64 {
        receipt.sui_sold
    }

    public fun receipt_usdc_received(receipt: &ExecutionReceipt): u64 {
        receipt.usdc_received
    }

    public fun receipt_execution_price(receipt: &ExecutionReceipt): u64 {
        receipt.execution_price
    }

    public fun receipt_timestamp(receipt: &ExecutionReceipt): u64 {
        receipt.timestamp
    }

    public fun price_precision(): u64 {
        PRICE_PRECISION
    }
}
