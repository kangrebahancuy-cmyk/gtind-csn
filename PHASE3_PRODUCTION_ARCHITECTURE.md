# GTIND-CSN Phase 3 — MongoDB Atlas

Status: **DONE — MongoDB Atlas production architecture and shared game authority migration completed and CI verified.**

MongoDB Atlas is now the selected production persistence target. The repository contains the Atlas connection manager, schema/indexes, initialization command, and an idempotent migration path for the existing JSON/SQLite data.

## Environment

MONGODB_URI=mongodb+srv://username:password@cluster.example.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB=gtind_csn
MONGODB_MAX_POOL_SIZE=50
MONGODB_SERVER_SELECTION_TIMEOUT_MS=5000

Never commit credentials.

## Collections

users, sessions, wallets, ledger, deposits, withdrawals, gameRounds, caseCatalog, caseBattles, crashRounds, crashPlayers, auditLogs, realtimeEvents.

## Commands

npm install
npm run mongo:init
npm run mongo:migrate

The migration is idempotent and uses MongoDB transactions for the account/wallet/ledger/deposit/withdrawal import.

## Production configuration

Set these environment variables in the deployment platform:

```env
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>/?retryWrites=true&w=majority
MONGODB_DB=gtind_csn
MONGODB_MAX_POOL_SIZE=50
MONGODB_SERVER_SELECTION_TIMEOUT_MS=5000
```

Run the one-time initialization:

```bash
npm install
npm run mongo:init
npm run mongo:migrate
```

The application refuses readiness when Atlas is unavailable.

## Phase 3 completion

- Economy/auth/session/wallet/ledger/deposit/withdrawal: MongoDB Atlas.
- Wallet mutations and game settlements: MongoDB transactions.
- Game rounds: Atlas authoritative persistence.
- Case Battles: Atlas authoritative state with atomic join/cancel transitions.
- Crash: shared Atlas player state plus MongoDB leader lease so only one instance owns the round clock.
- Security headers, request IDs, readiness, graceful shutdown: implemented.
- CI: production build, regression tests, and Node syntax checks passed on the final Phase 3 commit.

MongoDB transactions provide atomic multi-document changes, while single-document compound updates provide atomic state transitions. The remaining operational requirement is supplying the real Atlas credentials in the deployment environment; no credentials are committed to the repository.
