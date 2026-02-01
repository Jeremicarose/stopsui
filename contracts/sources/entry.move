/// Entry points for StopSui
/// User-facing functions that combine operations atomically
module stopsui::entry {
    use sui::coin::Coin;
    use sui::sui::SUI;
    use sui::transfer;
    use sui::tx_context::TxContext;
    use sui::clock::Clock;

    use stopsui::vault::{Self, Vault, ExecutorCap};
    use stopsui::order_registry::{Self, OrderRegistry};
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
        let amount = sui::coin::value(&sui_coin);

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
        transfer::public_transfer(order, sui::tx_context::sender(ctx));
    }

    /// Cancel an order and withdraw deposited SUI
    public entry fun cancel_order(
        registry: &mut OrderRegistry,
        vault: &mut Vault,
        order: &mut stopsui::order_registry::StopOrder,
        ctx: &mut TxContext
    ) {
        let order_id = order_registry::order_id(order);

        // Cancel the order (validates ownership)
        order_registry::cancel_order(registry, order, ctx);

        // Withdraw SUI back to owner
        let sui_coin = vault::withdraw_to_owner(vault, order_id, ctx);
        transfer::public_transfer(sui_coin, sui::tx_context::sender(ctx));
    }

    // ============ Keeper Entry Points ============

    /// Execute a triggered order (called by keeper)
    public entry fun execute_triggered_order(
        registry: &mut OrderRegistry,
        order: &mut stopsui::order_registry::StopOrder,
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

        // Transfer receipt to order owner for their records
        let (_, owner, _, _, _) = executor::receipt_details(&receipt);
        transfer::public_transfer(receipt, owner);
    }
}
