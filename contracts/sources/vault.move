/// Vault module for StopSui
/// Holds user deposits that are locked until their stop-loss order is triggered or cancelled.
/// Non-custodial design: only the order owner can cancel, only executor can trigger execution.
module stopsui::vault {
    use sui::object::{Self, UID, ID};
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::table::{Self, Table};
    use sui::event;

    // ============ Errors ============

    /// Caller is not authorized to perform this action
    const ENotAuthorized: u64 = 0;
    /// Deposit not found for the given order ID
    const EDepositNotFound: u64 = 1;
    /// Insufficient balance in deposit
    const EInsufficientBalance: u64 = 2;

    // ============ Types ============

    /// Shared vault that holds all user deposits
    /// Uses a Table to map order IDs to their locked deposits
    public struct Vault has key {
        id: UID,
        /// Maps order_id -> Deposit
        deposits: Table<ID, Deposit>,
        /// Total SUI held in vault (for transparency)
        total_balance: u64,
    }

    /// Individual deposit locked for a specific order
    public struct Deposit has store {
        /// Owner of this deposit (can cancel)
        owner: address,
        /// Locked SUI balance
        balance: Balance<SUI>,
        /// Associated order ID
        order_id: ID,
    }

    /// Capability that allows the executor to withdraw from vault
    /// Only one exists, held by the executor module
    public struct ExecutorCap has key, store {
        id: UID,
    }

    // ============ Events ============

    public struct DepositEvent has copy, drop {
        order_id: ID,
        owner: address,
        amount: u64,
    }

    public struct WithdrawEvent has copy, drop {
        order_id: ID,
        owner: address,
        amount: u64,
        reason: u8, // 0 = cancelled, 1 = executed
    }

    // ============ Init ============

    /// Initialize the vault as a shared object
    fun init(ctx: &mut TxContext) {
        let vault = Vault {
            id: object::new(ctx),
            deposits: table::new(ctx),
            total_balance: 0,
        };
        transfer::share_object(vault);

        // Create executor capability and transfer to deployer
        // In production, this would be transferred to the executor module
        let executor_cap = ExecutorCap {
            id: object::new(ctx),
        };
        transfer::transfer(executor_cap, tx_context::sender(ctx));
    }

    // ============ Public Functions ============

    /// Deposit SUI into the vault for a specific order
    /// Called when a user creates a new stop-loss order
    public fun deposit(
        vault: &mut Vault,
        order_id: ID,
        coin: Coin<SUI>,
        ctx: &mut TxContext
    ): u64 {
        let amount = coin::value(&coin);
        let owner = tx_context::sender(ctx);

        let deposit = Deposit {
            owner,
            balance: coin::into_balance(coin),
            order_id,
        };

        table::add(&mut vault.deposits, order_id, deposit);
        vault.total_balance = vault.total_balance + amount;

        event::emit(DepositEvent {
            order_id,
            owner,
            amount,
        });

        amount
    }

    /// Withdraw SUI from the vault (for order cancellation)
    /// Only the deposit owner can call this
    public fun withdraw_to_owner(
        vault: &mut Vault,
        order_id: ID,
        ctx: &mut TxContext
    ): Coin<SUI> {
        let sender = tx_context::sender(ctx);

        assert!(table::contains(&vault.deposits, order_id), EDepositNotFound);

        let deposit = table::borrow(&vault.deposits, order_id);
        assert!(deposit.owner == sender, ENotAuthorized);

        let Deposit { owner, balance, order_id: _ } = table::remove(&mut vault.deposits, order_id);
        let amount = balance::value(&balance);
        vault.total_balance = vault.total_balance - amount;

        event::emit(WithdrawEvent {
            order_id,
            owner,
            amount,
            reason: 0, // cancelled
        });

        coin::from_balance(balance, ctx)
    }

    /// Withdraw SUI from the vault for order execution
    /// Only callable by executor with ExecutorCap
    public fun withdraw_for_execution(
        vault: &mut Vault,
        _executor_cap: &ExecutorCap,
        order_id: ID,
        ctx: &mut TxContext
    ): (Coin<SUI>, address) {
        assert!(table::contains(&vault.deposits, order_id), EDepositNotFound);

        let Deposit { owner, balance, order_id: _ } = table::remove(&mut vault.deposits, order_id);
        let amount = balance::value(&balance);
        vault.total_balance = vault.total_balance - amount;

        event::emit(WithdrawEvent {
            order_id,
            owner,
            amount,
            reason: 1, // executed
        });

        (coin::from_balance(balance, ctx), owner)
    }

    // ============ View Functions ============

    /// Get the deposit amount for an order
    public fun get_deposit_amount(vault: &Vault, order_id: ID): u64 {
        if (table::contains(&vault.deposits, order_id)) {
            balance::value(&table::borrow(&vault.deposits, order_id).balance)
        } else {
            0
        }
    }

    /// Get the deposit owner for an order
    public fun get_deposit_owner(vault: &Vault, order_id: ID): address {
        table::borrow(&vault.deposits, order_id).owner
    }

    /// Check if a deposit exists for an order
    public fun has_deposit(vault: &Vault, order_id: ID): bool {
        table::contains(&vault.deposits, order_id)
    }

    /// Get total balance held in vault
    public fun total_balance(vault: &Vault): u64 {
        vault.total_balance
    }

    // ============ Test Helpers ============

    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ctx)
    }

    #[test_only]
    public fun create_executor_cap_for_testing(ctx: &mut TxContext): ExecutorCap {
        ExecutorCap {
            id: object::new(ctx),
        }
    }
}
