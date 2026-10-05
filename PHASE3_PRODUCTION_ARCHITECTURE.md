# GTIND-CSN Phase 3 — MongoDB Atlas

Status: **IN PROGRESS — economy/auth/game settlement cut over to Atlas; shared Crash/Case Battle state and final CI verification remain.**

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

## Production cutover requirements

Economy/auth HTTP handlers are now async and use Atlas collections. Wallet debit and game payout are executed with MongoDB transactions. Crash/Case Battle room state is the remaining shared-state cutover.

Do not claim the casino is MongoDB-backed in production until:
1. economy routes use Atlas as source of truth;
2. game round, Crash, and Case Battle mutations use Atlas;
3. wallet changes and ledger writes are performed in MongoDB transactions;
4. settlement references are protected by unique indexes;
5. Crash/Case Battle room ownership uses atomic MongoDB updates or a distributed lock;
6. the final CI run executes install, build, syntax checks and tests.

MongoDB supports ACID multi-document transactions through the official Node.js driver.
