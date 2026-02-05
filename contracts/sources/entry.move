/// Entry points for StopSui
/// User-facing functions that combine operations atomically
///
/// DeepBook Integration:
/// - execute_order_with_swap uses PTB to swap SUI→USDC
/// - The keeper builds a PTB that:
///   1. Calls execute_order_for_swap to get SUI
///   2. Calls deepbook::pool::swap_exact_base_for_quote
///   3. Calls complete_swap_execution to finalize
module stopsui::entry {
    use sui::coin::Coin;
    use sui::sui::SUI;
    use sui::clock::Clock;

    use stopsui::vault::{Self, Vault, ExecutorCap};
    use stopsui::order_registry::{Self, OrderRegistry, StopOrder};
    use stopsui::executor;

    // ============ User Entry Points ============

    /// Create a stop-loss order and deposit SUI in one transaction
    /// This is the main function users call from the frontend
    ///
    /// Example: User wants to sell 100 SUI if price drops to $2.50
    /// - sui_coin: 100 SUI
    /// - trigger_price: 2_500_000_000 (scaled by 1e9)
    public entry fun create_stop_loss_order(
        registry: &mut OrderRegistry,
        vault: &mut Vault,
        sui_coin: Coin<SUI>,
        trigger_price: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let amount = sui_coin.value();

        // Create the order
        let order = order_registry::create_stop_loss(
            registry,
            amount,
            trigger_price,
            clock,
            ctx
        );

        // Deposit SUI to vault (linked to order ID)
        let order_id = order_registry::order_id(&order);
        vault::deposit(vault, order_id, sui_coin, ctx);

        // Share the order object so keeper can execute it
        // Owner is stored in the order and verified for cancellation
        order_registry::share_order(order);
    }

    /// Create a take-profit order and deposit SUI in one transaction
    ///
    /// Example: User wants to sell 100 SUI if price rises to $5.00
    /// - sui_coin: 100 SUI
    /// - trigger_price: 5_000_000_000 (scaled by 1e9)
    public entry fun create_take_profit_order(
        registry: &mut OrderRegistry,
        vault: &mut Vault,
        sui_coin: Coin<SUI>,
        trigger_price: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let amount = sui_coin.value();

        // Create the order
        let order = order_registry::create_take_profit(
            registry,
            amount,
            trigger_price,
            clock,
            ctx
        );

        // Deposit SUI to vault (linked to order ID)
        let order_id = order_registry::order_id(&order);
        vault::deposit(vault, order_id, sui_coin, ctx);

        // Share the order object so keeper can execute it
        // Owner is stored in the order and verified for cancellation
        order_registry::share_order(order);
    }

    /// Cancel an order and withdraw deposited SUI
    public entry fun cancel_order(
        registry: &mut OrderRegistry,
        vault: &mut Vault,
        order: &mut StopOrder,
        ctx: &mut TxContext
    ) {
        let order_id = order_registry::order_id(order);

        // Cancel the order (validates ownership)
        order_registry::cancel_order(registry, order, ctx);

        // Withdraw SUI back to owner
        let sui_coin = vault::withdraw_to_owner(vault, order_id, ctx);
        transfer::public_transfer(sui_coin, ctx.sender());
    }

    // ============ Keeper Entry Points ============

    /// Execute a triggered order (original function name for compatibility)
    public entry fun execute_triggered_order(
        registry: &mut OrderRegistry,
        order: &mut StopOrder,
        vault: &mut Vault,
        executor_cap: &ExecutorCap,
        current_price: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let receipt = executor::execute_order(
            registry,
            order,
            vault,
            executor_cap,
            current_price,
            clock,
            ctx
        );

        let (_, owner, _, _, _) = executor::receipt_details(&receipt);
        transfer::public_transfer(receipt, owner);
    }

    /// Execute a triggered order (new alias)
    public entry fun execute_order(
        registry: &mut OrderRegistry,
        order: &mut StopOrder,
        vault: &mut Vault,
        executor_cap: &ExecutorCap,
        pyth_price: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        execute_triggered_order(
            registry,
            order,
            vault,
            executor_cap,
            pyth_price,
            clock,
            ctx
        );
    }

    // ============ DeepBook Swap Entry Points ============

    /// Step 1 of swap execution: Execute order and get SUI coin
    /// Called by keeper's PTB before the DeepBook swap
    ///
    /// Returns the SUI coin that will be passed to DeepBook swap
    public fun execute_order_for_swap(
        registry: &mut OrderRegistry,
        order: &mut StopOrder,
        vault: &mut Vault,
        executor_cap: &ExecutorCap,
        pyth_price: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ): (Coin<SUI>, address, ID, u64, u64) {
        executor::execute_order_for_swap(
            registry,
            order,
            vault,
            executor_cap,
            pyth_price,
            clock,
            ctx
        )
    }

    /// Step 2 of swap execution: Finalize after DeepBook swap
    /// Called by keeper's PTB after the DeepBook swap completes
    ///
    /// - usdc_coin: The USDC received from DeepBook swap
    /// - remaining_sui: Any SUI not swapped (returned to keeper)
    /// - remaining_deep: Unused DEEP tokens (returned to keeper)
    /// - order_id, owner, sui_sold, execution_price: From step 1
    public entry fun complete_swap_execution<QuoteAsset>(
        usdc_coin: Coin<QuoteAsset>,
        remaining_sui: Coin<SUI>,
        order_id: ID,
        owner: address,
        sui_sold: u64,
        execution_price: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let usdc_received = usdc_coin.value();

        // Abort if swap produced nothing (pool has no liquidity)
        assert!(usdc_received > 0, 100);

        // Transfer USDC to user
        transfer::public_transfer(usdc_coin, owner);

        // Return remaining SUI to user (not keeper) - handles partial fills
        if (remaining_sui.value() > 0) {
            transfer::public_transfer(remaining_sui, owner);
        } else {
            remaining_sui.destroy_zero();
        };

        // Emit swap execution event
        executor::emit_swap_execution_event(
            order_id,
            owner,
            sui_sold,
            usdc_received,
            execution_price,
            clock,
        );

        // Create and transfer execution receipt to user
        let receipt = executor::create_swap_receipt(
            order_id,
            owner,
            sui_sold,
            usdc_received,
            execution_price,
            clock,
            ctx
        );
        transfer::public_transfer(receipt, owner);
    }

    /// Simplified swap completion that returns DEEP to keeper
    /// Use this version when you have DEEP tokens to return
    public entry fun complete_swap_execution_with_deep<QuoteAsset, DeepAsset>(
        usdc_coin: Coin<QuoteAsset>,
        remaining_sui: Coin<SUI>,
        remaining_deep: Coin<DeepAsset>,
        order_id: ID,
        owner: address,
        sui_sold: u64,
        execution_price: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let usdc_received = usdc_coin.value();

        // Transfer USDC to user
        transfer::public_transfer(usdc_coin, owner);

        // Return remaining SUI to keeper (should be zero or dust)
        if (remaining_sui.value() > 0) {
            transfer::public_transfer(remaining_sui, ctx.sender());
        } else {
            remaining_sui.destroy_zero();
        };

        // Return remaining DEEP to keeper
        if (remaining_deep.value() > 0) {
            transfer::public_transfer(remaining_deep, ctx.sender());
        } else {
            remaining_deep.destroy_zero();
        };

        // Emit swap execution event
        executor::emit_swap_execution_event(
            order_id,
            owner,
            sui_sold,
            usdc_received,
            execution_price,
            clock,
        );

        // Create and transfer execution receipt to user
        let receipt = executor::create_swap_receipt(
            order_id,
            owner,
            sui_sold,
            usdc_received,
            execution_price,
            clock,
            ctx
        );
        transfer::public_transfer(receipt, owner);
    }

    // ============ View Helpers ============

    /// Check if an order would trigger at a given price
    public fun would_trigger(
        order: &StopOrder,
        price: u64,
    ): bool {
        executor::check_trigger(order, price)
    }

    /// Get the price precision used by the contract
    public fun price_precision(): u64 {
        executor::price_precision()
    }
}
