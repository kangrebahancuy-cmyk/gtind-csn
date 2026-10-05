# Phase 10 — GTPS Integration

Status: implementation complete.

## Authority

MongoDB Atlas remains the casino source of truth.

GTPS SQLite is **not** a casino balance authority. It may keep local operational/link state, but casino WL/DL/BGL balances live in Atlas.

## Supported GTPS flow

### 1. Link

Website creates a six-digit link code for the player.

GTPS Lua checks:

`GET /api/gtps/check-link?code=XXXXXX`

Then the GTPS side sends:

`POST /api/gtps/link-growid`

with `secretKey`, `code`, and `growid`.

The website verifies the secret, prevents GrowID collisions, and stores the normalized GrowID on the casino user.

### 2. Deposit

GTPS removes the real WL/DL/BGL items first.

Then Lua sends:

`POST /api/gtps/deposit-webhook`

with:

- `transactionId`
- `growId`
- `currency`
- `amount`
- `secretKey`

The deposit is committed in one Atlas transaction:

1. check unique transaction ID
2. find linked GrowID
3. mutate canonical WL-unit wallet
4. insert ledger entry
5. insert deposit record

A repeated transaction ID is idempotent.

### 3. Withdrawal

Withdrawal is intentionally **not** a direct website → undocumented GTPS HTTP command.

The website:

1. validates the authenticated player
2. validates linked GrowID
3. reserves the requested currency from the Atlas wallet
4. writes a `WITHDRAW_PENDING` ledger entry
5. creates a `PENDING` withdrawal

GTPS Lua polls:

`GET /api/gtps/withdraw-pending?growId=...&secretKey=...`

The server atomically claims one pending withdrawal as `PROCESSING` and returns a short-lived claim token.

GTPS then gives the requested item using the documented Lua player inventory API.

After successful delivery, Lua calls:

`POST /api/gtps/withdraw-confirm`

with:

- `withdrawalId`
- `claimToken`
- `growId`
- `secretKey`

Only a matching, unexpired claim can become `COMPLETED`.

If delivery fails:

`POST /api/gtps/withdraw-fail`

refunds the reserved WL units atomically and changes the withdrawal to `FAILED`.

Expired processing claims can be returned to `PENDING` by the next poll.

## Security

- GTPS secret is server-side environment configuration.
- Secret comparison uses constant-time comparison.
- Withdrawal claims expire after 2 minutes.
- Withdrawal confirmation requires the claim token and GrowID match.
- Duplicate deposits use MongoDB uniqueness/idempotency.
- Wallet mutations use MongoDB transactions.
- Admin reconciliation accepts PENDING, PROCESSING, and UNKNOWN withdrawals.
- No client-side balance is authoritative.

## Lua API compatibility

The integration uses only the documented operations already present in the supplied GTPS Lua reference:

- `http:get(url, headers)`
- `http:post(url, headers, postData)`
- `player:getName()`
- `player:getInventoryItemCount(itemId)`
- `player:removeItem(itemId, amount)`
- `player:giveItem(itemId, amount)`
- `onPlayerCommandCallback(...)`
- `onPlayerDialogCallback(...)`

No undocumented GTPS callback or inbound HTTP server method is required.

## Important migration rule

Do not keep a second casino balance in GTPS SQLite.

The old Lua sample's local `accounts.balance` should be removed or treated as display/cache only. Deposit/withdraw settlement must be confirmed by the Atlas-backed website APIs above.
