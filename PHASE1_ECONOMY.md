# GTIND-CSN Phase 1 — Economy

Phase 1 moves account/economy authority from browser localStorage to the Node server.

## Server environment
- GTPS_WEBHOOK_SECRET: secret shared with GTPS Lua webhook calls
- ADMIN_USERNAME: initial server-side admin username
- ADMIN_PASSWORD: initial admin password
- GTPS_PORT: existing GTPS bridge port

Do not commit real values.

## Economy endpoints
- POST /api/auth/register
- POST /api/auth/login
- POST /api/auth/logout
- GET /api/auth/me
- POST /api/auth/migrate
- GET /api/economy/wallet
- GET /api/economy/transactions
- POST /api/economy/tip
- POST /api/admin/balance
- POST /api/admin/status
- GET /api/admin/users
- POST /api/account/growid
- POST /api/account/unlink-growid
- POST /api/gtps/deposit-webhook
- POST /api/gtps/withdraw-request

## Deposit rules
GTPS deposits require a unique transactionId. The same transactionId is idempotent and cannot credit the wallet twice.
The browser never directly credits a deposit. It only refreshes its wallet after the server accepts the GTPS webhook.

## Important hosting note
The current store is data/economy.json. The hosting environment must provide persistent storage for production economy data. If the hosting filesystem is ephemeral, replace this adapter with the persistent database/storage service provided by the host before accepting real-value balances.

## Migration
Old localStorage balances are deliberately not trusted or imported as money. Existing users can migrate their username/password through the one-time migration path; their old browser balance is recorded as ignored legacy data and starts at 0 server balance.

## Scope
This phase does not yet make individual casino games server-authoritative. Betting/RNG/game-result migration is Phase 2.