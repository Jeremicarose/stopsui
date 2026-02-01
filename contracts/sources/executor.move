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
}
