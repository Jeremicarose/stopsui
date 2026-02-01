/// Executor module for StopSui
/// Handles order execution when price conditions are met
module stopsui::executor {
    use sui::object::{Self, UID};
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::clock::Clock;

    use stopsui::vault::{Self, Vault, ExecutorCap};
    use stopsui::order_registry::{Self, StopOrder, OrderRegistry};

    // ============ Errors ============

    const ETriggerNotMet: u64 = 0;
    const EStalePrice: u64 = 1;
    const EOrderNotPending: u64 = 2;

    // ============ Constants ============

    /// Maximum age of price data (60 seconds)
    const MAX_PRICE_AGE_SECONDS: u64 = 60;

    /// Price precision (Pyth uses 1e9 scaling)
    const PRICE_PRECISION: u64 = 1_000_000_000;

    // ============ Types ============

    /// Receipt returned after successful execution
    struct ExecutionReceipt has key, store {
        id: UID,
        order_id: sui::object::ID,
        owner: address,
        sui_sold: u64,
        usdc_received: u64,
        execution_price: u64,
        timestamp: u64,
    }

    // ============ Core Execution ============

    /// Check if a stop-loss trigger condition is met
    /// Returns true if current_price <= trigger_price for stop-loss
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

    /// Execute a stop-loss order
    /// Called by keeper when price condition is met
    public fun execute_order(
        registry: &mut OrderRegistry,
        order: &mut StopOrder,
        vault: &mut Vault,
        executor_cap: &ExecutorCap,
        current_price: u64,  // Price from Pyth (validated off-chain by keeper)
        clock: &Clock,
        ctx: &mut TxContext
    ): ExecutionReceipt {
        // Verify order is still pending
        assert!(order_registry::is_pending(order), EOrderNotPending);

        // Verify trigger condition is met
        assert!(check_trigger(order, current_price), ETriggerNotMet);

        let order_id = order_registry::order_id(order);
        let sui_amount = order_registry::order_amount(order);

        // Withdraw SUI from vault
        let (sui_coin, owner) = vault::withdraw_for_execution(
            vault,
            executor_cap,
            order_id,
            ctx
        );

        // TODO: Execute swap on DeepBook
        // For MVP, we'll simulate by just returning the SUI value as USDC
        // In production: call deepbook::clob_v2::swap_exact_base_for_quote
        let usdc_received = (sui_amount * current_price) / PRICE_PRECISION;

        // Mark order as executed
        order_registry::mark_executed(registry, order, current_price);

        // Transfer SUI back to owner (in production, this would be USDC from DeepBook)
        transfer::public_transfer(sui_coin, owner);

        // Create and return execution receipt
        ExecutionReceipt {
            id: object::new(ctx),
            order_id,
            owner,
            sui_sold: sui_amount,
            usdc_received,
            execution_price: current_price,
            timestamp: sui::clock::timestamp_ms(clock),
        }
    }

    // ============ View Functions ============

    public fun receipt_details(receipt: &ExecutionReceipt): (sui::object::ID, address, u64, u64, u64) {
        (receipt.order_id, receipt.owner, receipt.sui_sold, receipt.usdc_received, receipt.execution_price)
    }
}
