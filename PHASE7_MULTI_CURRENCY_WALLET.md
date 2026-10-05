# Phase 7 — Multi-Currency Wallet

Status: IMPLEMENTED — CI verification required

## Scope

The casino wallet now has three server-authoritative Growtopia currencies:

- WL — base unit
- DL — 100 WL
- BGL — 10,000 WL

MongoDB Atlas is the only wallet source of truth.

## Wallet document

Collection: `wallets`

```json
{
  "userId": "usr_...",
  "balancesWl": {
    "WL": 1250,
    "DL": 42,
    "BGL": 3
  },
  "balanceDls": 42.0,
  "updatedAt": "..."
}
```

`balancesWl` is canonical. `balanceDls` is retained as a compatibility projection for existing game/session code.

## Ledger

Every wallet mutation creates a ledger entry containing:

- currency
- amount
- amountWl
- amountDls
- balanceBefore / balanceAfter
- balanceBeforeWl / balanceAfterWl
- referenceId
- metadata

Wallet mutations and ledger entries are written in the same MongoDB transaction.

## Supported operations

- Server wallet read
- WL / DL / BGL tips
- WL / DL / BGL GTPS deposits
- WL / DL / BGL GTPS withdrawals
- Admin WL / DL / BGL balance adjustment
- Withdrawal idempotency
- Atomic withdrawal refund/reconciliation
- Game bets and payouts remain DL-authoritative
- Currency-aware financial reconciliation

## API

- GET `/api/economy/wallet`
- GET `/api/economy/transactions`
- GET `/api/economy/currencies`
- POST `/api/economy/tip`
- POST `/api/admin/balance`
- GET `/api/admin/reconciliation`
- GET `/api/admin/withdrawals`
- POST `/api/admin/withdrawals/:id/reconcile`
- POST `/api/gtps/deposit-webhook`
- POST `/api/gtps/withdraw-request`

## Security rules

The browser cannot directly mutate wallet balances. The server validates authentication, currency, amount and available funds. The canonical balance is stored in integer WL units to avoid floating-point drift.

No reward, cashback, referral or promo system is included.
