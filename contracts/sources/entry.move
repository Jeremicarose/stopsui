/// Entry points for StopSui
/// User-facing functions that combine operations atomically
module stopsui::entry {
    use sui::coin::Coin;
    use sui::sui::SUI;
    use sui::clock::Clock;

    // Pyth imports
    use pyth::price_info::PriceInfoObject;

    use stopsui::vault::{Self, Vault, ExecutorCap};
    use stopsui::order_registry::{Self, OrderRegistry, StopOrder};
    use stopsui::executor;

    // ============ User Entry Points ============

    /// Create a stop-loss order and deposit SUI in one transaction
    /// This is the main function users call from the frontend
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

    /// Execute a triggered order using Pyth oracle price
    /// Called by keeper when price condition is met
    ///
    /// Prerequisites:
    /// 1. Keeper must call pyth::update_single_price_feed with fresh VAA
    /// 2. Price must be fresh (< 60 seconds old)
    /// 3. Price must trigger the order condition
    public entry fun execute_order(
        registry: &mut OrderRegistry,
        order: &mut StopOrder,
        vault: &mut Vault,
        executor_cap: &ExecutorCap,
        price_info_object: &PriceInfoObject,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        executor::execute_order_simple(
            registry,
            order,
            vault,
            executor_cap,
            price_info_object,
            clock,
            ctx
        );
    }

    // ============ View Helpers ============

    /// Get current price from Pyth (for frontend display)
    public fun get_current_price(
        price_info_object: &PriceInfoObject,
        clock: &Clock,
    ): u64 {
        executor::get_pyth_price(price_info_object, clock)
    }

    /// Check if an order would trigger at the current price
    public fun would_trigger(
        order: &StopOrder,
        price_info_object: &PriceInfoObject,
        clock: &Clock,
    ): bool {
        let current_price = executor::get_pyth_price(price_info_object, clock);
        executor::check_trigger(order, current_price)
    }
}
