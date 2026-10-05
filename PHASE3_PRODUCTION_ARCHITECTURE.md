# GTIND-CSN Phase 3 — Production Architecture

**Status: IN PROGRESS — core hardening implemented; shared PostgreSQL/Redis migration remains.**

## Completed in this phase

- Authentication sessions moved from process memory to persistent SQLite storage.
- Session lookup, expiry and deletion are database-backed.
- WebSocket clients can no longer inject LIVE_BET or Case Battle realtime events.
- JSON request body size is limited to 64 KiB.
- Express X-Powered-By header is disabled.
- SIGINT/SIGTERM graceful shutdown was added.
- Regression coverage includes persistent session creation, lookup and deletion.
- Crash state remains persisted across process restarts.
- Withdrawals now support an `Idempotency-Key` and include the withdrawal ID when calling the GTPS bridge.
- A bridge/network uncertainty no longer triggers an automatic refund; the withdrawal becomes `UNKNOWN` and requires reconciliation.
- Admins can list and reconcile `PENDING`/`UNKNOWN` withdrawals as `complete` or `fail_refund`.
- Security response headers, request IDs, JSON body limits, readiness checks, and graceful shutdown are enabled.
- Case Battle state remains persisted and server-authoritative.

## Architecture target

Phase 3 is intended to make the casino safe for a persistent VM/bare-metal deployment and prepare it for shared multi-instance deployment.

Current durable local storage:
- SQLite economy database
- SQLite persistent sessions
- JSON round/case/Crash/Case Battle state

Target shared production storage:
- PostgreSQL for users, wallets, ledger, rounds and withdrawals
- Redis for distributed locks, Crash room state and pub/sub
- Idempotency keys on all money-moving endpoints
- Transactional wallet ledger with database constraints
- Centralized realtime event publication

## Remaining Phase 3 work

1. Replace JSON game/Crash/Case Battle state with transactional database tables.
2. Add database-level wallet locking and idempotency constraints.
3. Add distributed locking for Crash betting/cashout and Case Battle joins.
4. Add withdrawal state machine with durable retry/reconciliation.
5. Add server-generated realtime betting/battle feeds only.
6. Add security headers, request correlation IDs and structured audit logs.
7. Add readiness/liveness checks for deployment.
8. Execute CI/build/test against the final production snapshot.

## Important deployment constraint

The current implementation is durable on a single persistent server. It is **not yet safe for multiple independent server instances sharing no common database**. Do not run multiple casino instances until the shared PostgreSQL/Redis stage is completed.
