/// Order Registry for StopSui
/// Manages stop-loss and take-profit orders
module stopsui::order_registry {
    use sui::object::{Self, UID, ID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::clock::Clock;
    use sui::event;

    // ============ Errors ============

    const ENotOrderOwner: u64 = 0;
    const EOrderNotPending: u64 = 1;
    const EInvalidTriggerPrice: u64 = 2;

    // ============ Constants ============

    /// Order directions
    const DIRECTION_STOP_LOSS: u8 = 0;    // Sell when price drops below trigger
    const DIRECTION_TAKE_PROFIT: u8 = 1;  // Sell when price rises above trigger

    /// Order statuses
    const STATUS_PENDING: u8 = 0;
    const STATUS_EXECUTED: u8 = 1;
    const STATUS_CANCELLED: u8 = 2;

    // ============ Types ============

    /// Individual stop-loss/take-profit order
    /// Owned by the user who created it
    public struct StopOrder has key, store {
        id: UID,
        owner: address,
        base_amount: u64,       // Amount of SUI to sell
        trigger_price: u64,     // Price threshold (scaled by 1e9)
        direction: u8,          // STOP_LOSS or TAKE_PROFIT
        status: u8,             // PENDING, EXECUTED, or CANCELLED
        created_at: u64,        // Timestamp in ms
    }

    /// Shared registry tracking all orders
    public struct OrderRegistry has key {
        id: UID,
        total_orders: u64,
        active_orders: u64,
    }

    // ============ Events ============

    public struct OrderCreated has copy, drop {
        order_id: ID,
        owner: address,
        base_amount: u64,
        trigger_price: u64,
        direction: u8,
    }

    struct OrderCancelled has copy, drop {
        order_id: ID,
        owner: address,
    }

    struct OrderExecuted has copy, drop {
        order_id: ID,
        owner: address,
        execution_price: u64,
    }

    // ============ Init ============

    fun init(ctx: &mut TxContext) {
        let registry = OrderRegistry {
            id: object::new(ctx),
            total_orders: 0,
            active_orders: 0,
        };
        transfer::share_object(registry);
    }

    // ============ Public Functions ============

    /// Create a new stop-loss order
    public fun create_stop_loss(
        registry: &mut OrderRegistry,
        base_amount: u64,
        trigger_price: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ): StopOrder {
        assert!(trigger_price > 0, EInvalidTriggerPrice);

        let owner = tx_context::sender(ctx);
        let order = StopOrder {
            id: object::new(ctx),
            owner,
            base_amount,
            trigger_price,
            direction: DIRECTION_STOP_LOSS,
            status: STATUS_PENDING,
            created_at: sui::clock::timestamp_ms(clock),
        };

        registry.total_orders = registry.total_orders + 1;
        registry.active_orders = registry.active_orders + 1;

        event::emit(OrderCreated {
            order_id: object::uid_to_inner(&order.id),
            owner,
            base_amount,
            trigger_price,
            direction: DIRECTION_STOP_LOSS,
        });

        order
    }

    /// Cancel a pending order (only owner can cancel)
    public fun cancel_order(
        registry: &mut OrderRegistry,
        order: &mut StopOrder,
        ctx: &TxContext
    ) {
        assert!(order.owner == tx_context::sender(ctx), ENotOrderOwner);
        assert!(order.status == STATUS_PENDING, EOrderNotPending);

        order.status = STATUS_CANCELLED;
        registry.active_orders = registry.active_orders - 1;

        event::emit(OrderCancelled {
            order_id: object::uid_to_inner(&order.id),
            owner: order.owner,
        });
    }

    /// Mark order as executed (called by executor module)
    public fun mark_executed(
        registry: &mut OrderRegistry,
        order: &mut StopOrder,
        execution_price: u64,
    ) {
        assert!(order.status == STATUS_PENDING, EOrderNotPending);

        order.status = STATUS_EXECUTED;
        registry.active_orders = registry.active_orders - 1;

        event::emit(OrderExecuted {
            order_id: object::uid_to_inner(&order.id),
            owner: order.owner,
            execution_price,
        });
    }

    // ============ View Functions ============

    public fun order_id(order: &StopOrder): ID {
        object::uid_to_inner(&order.id)
    }

    public fun order_owner(order: &StopOrder): address {
        order.owner
    }

    public fun order_amount(order: &StopOrder): u64 {
        order.base_amount
    }

    public fun order_trigger_price(order: &StopOrder): u64 {
        order.trigger_price
    }

    public fun order_status(order: &StopOrder): u8 {
        order.status
    }

    public fun order_direction(order: &StopOrder): u8 {
        order.direction
    }

    public fun is_pending(order: &StopOrder): bool {
        order.status == STATUS_PENDING
    }

    public fun registry_stats(registry: &OrderRegistry): (u64, u64) {
        (registry.total_orders, registry.active_orders)
    }

    // ============ Test Helpers ============

    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ctx)
    }
}
