# GTIND-CSN Phase 4 — Production Hardening

Status: **DONE — production hardening completed and CI #76 passed.**

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

## Phase 4 completion

- Legacy game JSON shadow writes are disabled; Atlas is the runtime authority.
- Case catalog is Atlas-authoritative.
- Case rounds and PvP battles use immutable case snapshots.
- Case RNG and payout resolution are server-authoritative.
- Crash startup restores from Atlas and uses the distributed leader lease.
- Shared Atlas rate limiting protects registration, login, GTPS linking, and withdrawals across instances.
- WebSocket connections require authenticated sessions.
- WebSocket chat identity is server-derived and message text is length-limited.
- Server startup waits for game-authority initialization.
- Regression tests no longer depend on the obsolete SQLite session store.

Final verification: CI #76 passed production build, regression tests, and all Node syntax checks.
