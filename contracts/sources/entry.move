/// Entry points for StopSui
/// User-facing functions that combine operations atomically
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

        // Transfer order object to user
        transfer::public_transfer(order, ctx.sender());
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

        // Transfer order object to user
        transfer::public_transfer(order, ctx.sender());
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
