/// Executor module for StopSui
/// Handles order execution when price conditions are met
/// Integrates with Pyth Network for price feeds
module stopsui::executor {
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::clock::Clock;
    use sui::event;

    // Pyth imports
    use pyth::price_info::PriceInfoObject;
    use pyth::pyth;
    use pyth::price;
    use pyth::i64;

    use stopsui::vault::{Self, Vault, ExecutorCap};
    use stopsui::order_registry::{Self, StopOrder, OrderRegistry};

    // ============ Errors ============

    const ETriggerNotMet: u64 = 0;
    const EStalePrice: u64 = 1;
    const EOrderNotPending: u64 = 2;
    const ENegativePrice: u64 = 3;
    const EInvalidPriceExponent: u64 = 4;

    // ============ Constants ============

    /// Maximum age of price data (60 seconds)
    const MAX_PRICE_AGE_SECONDS: u64 = 60;

    /// Our internal price precision (1e9 for 9 decimals)
    const PRICE_PRECISION: u64 = 1_000_000_000;

    // ============ Events ============

    public struct OrderExecuted has copy, drop {
        order_id: ID,
        owner: address,
        sui_sold: u64,
        usdc_received: u64,
        execution_price: u64,
        pyth_price: u64,
        pyth_expo: u64,
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

    // ============ Price Helpers ============

    /// Extract price from Pyth PriceInfoObject and convert to our precision
    /// Pyth prices have variable exponents (usually negative, e.g., -8)
    /// We normalize to our PRICE_PRECISION (1e9)
    public fun get_pyth_price(
        price_info_object: &PriceInfoObject,
        clock: &Clock,
    ): u64 {
        // Get price with freshness check (max 60 seconds old)
        let price_struct = pyth::get_price_no_older_than(
            price_info_object,
            clock,
            MAX_PRICE_AGE_SECONDS
        );

        // Extract price value (I64 - can be negative for some assets, but not SUI/USD)
        let price_i64 = price::get_price(&price_struct);
        let price_magnitude = i64::get_magnitude_if_positive(&price_i64);

        // Get exponent (usually negative, e.g., -8 means price is in 1e-8 units)
        let expo_i64 = price::get_expo(&price_struct);
        let expo_negative = i64::get_is_negative(&expo_i64);
        let expo_magnitude = i64::get_magnitude_if_negative(&expo_i64);

        // Convert to our precision (1e9)
        // If expo is -8, price is X * 10^-8
        // We want X * 10^-8 * 10^9 = X * 10^1 = X * 10
        if (expo_negative) {
            // Negative exponent (most common case)
            // expo_magnitude is the absolute value (e.g., 8 for -8)
            if (expo_magnitude <= 9) {
                // Need to multiply by 10^(9 - expo_magnitude)
                let multiplier = pow10(9 - expo_magnitude);
                price_magnitude * multiplier
            } else {
                // expo_magnitude > 9, need to divide
                let divisor = pow10(expo_magnitude - 9);
                price_magnitude / divisor
            }
        } else {
            // Positive exponent (rare for prices)
            let expo_pos = i64::get_magnitude_if_positive(&expo_i64);
            let multiplier = pow10(9 + expo_pos);
            price_magnitude * multiplier
        }
    }

    /// Power of 10 helper
    fun pow10(exp: u64): u64 {
        let mut result = 1u64;
        let mut i = 0u64;
        while (i < exp) {
            result = result * 10;
            i = i + 1;
        };
        result
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

    /// Execute a stop-loss order using Pyth price feed
    /// Called by keeper when price condition is met
    ///
    /// The keeper must first update the Pyth price feed by calling
    /// pyth::update_single_price_feed with fresh VAA data from Hermes
    public fun execute_order_with_pyth(
        registry: &mut OrderRegistry,
        order: &mut StopOrder,
        vault: &mut Vault,
        executor_cap: &ExecutorCap,
        price_info_object: &PriceInfoObject,
        clock: &Clock,
        ctx: &mut TxContext
    ): (Coin<SUI>, ExecutionReceipt) {
        // Verify order is still pending
        assert!(order_registry::is_pending(order), EOrderNotPending);

        // Get current price from Pyth (validated for freshness)
        let current_price = get_pyth_price(price_info_object, clock);

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

        // Calculate USDC equivalent (for receipt purposes)
        // In production, DeepBook will determine actual received amount
        let usdc_received = (sui_amount * current_price) / PRICE_PRECISION;

        // Mark order as executed
        order_registry::mark_executed(registry, order, current_price);

        // Emit execution event
        event::emit(OrderExecuted {
            order_id,
            owner,
            sui_sold: sui_amount,
            usdc_received,
            execution_price: current_price,
            pyth_price: current_price,
            pyth_expo: 9, // Our normalized exponent
        });

        // Create execution receipt
        let receipt = ExecutionReceipt {
            id: object::new(ctx),
            order_id,
            owner,
            sui_sold: sui_amount,
            usdc_received,
            execution_price: current_price,
            timestamp: clock.timestamp_ms(),
        };

        // Return the SUI coin and receipt
        // Caller is responsible for swapping on DeepBook
        (sui_coin, receipt)
    }

    /// Simplified execute that transfers directly to owner
    /// For MVP without DeepBook integration
    public entry fun execute_order_simple(
        registry: &mut OrderRegistry,
        order: &mut StopOrder,
        vault: &mut Vault,
        executor_cap: &ExecutorCap,
        price_info_object: &PriceInfoObject,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let (sui_coin, receipt) = execute_order_with_pyth(
            registry,
            order,
            vault,
            executor_cap,
            price_info_object,
            clock,
            ctx
        );

        // Transfer SUI back to owner (in production, would swap to USDC first)
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
}
