# GTIND-CSN Phase 4 — Production Hardening

Status: **IN PROGRESS**

Phase 4 focuses on removing remaining local authoritative state and strengthening game integrity after the MongoDB Atlas migration.

## Completed in this phase

- Case catalog reads/writes now use MongoDB Atlas.
- Case openings persist an immutable case snapshot inside the paid game round.
- Case Battle records persist immutable case snapshots.
- Server-authoritative case RNG and payout resolution.
- Crash startup restores round/player state from MongoDB instead of local `crash-global.json`.
- Crash startup only creates a new round after acquiring the shared MongoDB leader lease.
- Game initialization is awaited before the HTTP server begins listening.
- Regression tests no longer depend on the obsolete local SQLite session store.

## Remaining Phase 4 work

- Remove remaining legacy runtime JSON writes where they are no longer required for migration compatibility.
- Make all financial mutations targeted MongoDB operations instead of whole-state snapshot replacement.
- Move rate limiting to shared persistent state for multi-instance deployments.
- Harden WebSocket authentication and server-generated realtime events.
- Add reconciliation/monitoring metrics for unsettled financial and game states.
- Restore `npm ci` after regenerating a lockfile that includes the MongoDB driver.

Phase 4 is not marked DONE until these items are implemented and the final CI run passes.
