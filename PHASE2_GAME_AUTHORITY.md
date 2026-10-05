# GTIND-CSN Phase 2 — Game Authority

**Status: DONE — server-authoritative game/economy migration and hardening completed.**

This phase adds a server-authoritative game-round API.

## Core rules
- The server creates each round and debits the wallet.
- The server generates a random server seed and exposes only its SHA-256 commitment before resolution.
- Resolution uses HMAC-SHA256 with server seed, client seed, nonce and step.
- Payout is calculated on the server.
- A round cannot be resolved twice after it is finished.
- Coinflip multi-step rounds keep the wager locked server-side until loss, full completion, or cashout.
- The browser is animation/UI only; it must not be the source of truth for wallet changes.

## Endpoints
- POST /api/games/start
- POST /api/games/resolve
- GET /api/games/fairness

## Current migration status
All currently server-authorized real-value games use the server round API:
- Coinflip
- Mines
- Towers
- Roulette
- Keno
- Dice
- Blackjack
- Cases
- Case Battles (server-authoritative 1v1 PvP)
- Crash

The server rejects any game ID outside this whitelist. The migrated frontend game components contain no calls to the legacy client-side balance settlement methods.

Important:
- Game configuration and payout tables used for settlement are server-owned.
- Cases use a server-owned case catalog in `data/cases.json`.
- Roulette validates the submitted stake against the amount debited in DLS and rejects unknown bet keys.
- Towers accepts only a named server-owned difficulty configuration; columns, traps, and multipliers are derived server-side.
- Case Battle publishes the full two-player pot after the second stake is locked.
- Crash settlement uses server-side elapsed time and a server-seed-derived crash point; the seed hash is public before the round and the seed is revealed after the round.
- Crash global state persists round seed/hash, timing, and player stakes so a process restart can recover the active round instead of silently losing locked wagers.
- Crash point is capped at 10,000x and uses a deterministic HMAC-SHA256 derivation.
- Case Battle 1v1 PvP matchmaking is server-authoritative: creator stake is locked, opponent stake is locked on join, both players use the same server-owned battle seed, and winner/tie settlement is server-side. Bots are disabled.
- Economy persistence now uses a file-backed SQLite store (`data/economy.sqlite`) with WAL, FULL synchronous durability, and optimistic version checks. The previous `data/economy.json` is imported automatically on first startup when present.

## Validation
- Added GitHub Actions CI for Vite build and Node syntax checks.
- Game payout settlement is idempotent by round ID in the economy ledger.
- Economy writes use SQLite transactions and optimistic version checks to reject stale concurrent writes.
- Regression tests cover deterministic RNG, Crash seed derivation/cap, Blackjack deck/scoring, Mines, Towers, Roulette (including unknown-key rejection), Keno, and Crash.

## Verification note

GitHub Actions workflow is present and configured for Node 24, Vite build, tests, and server syntax checks. The GitHub connector currently reports no workflow run for the latest commit, so CI is **not** claimed as passed from this environment. Source-level regression coverage and repository searches were completed; the final deployment should still execute `npm ci`, `npm test`, `npm run build`, and the syntax checks.

## Production requirement
Phase 2 game authority now has transactional local persistence and concurrency conflict detection for the economy. High-value production still requires a deployment with durable shared storage (not ephemeral/serverless disk) and the true shared Crash/PvP services described below.

## Four-game authority hardening

### Blackjack
- Deck generation and shuffle are server-owned.
- Player/dealer hands live in the server round state.
- Hit, stand, and double-down are server actions.
- Double-down debits the additional stake server-side.
- Natural blackjack/push settlement is server-side.
- Client card arrays are display-only.

### Cases
- Case catalog is server-owned in `data/cases.json`.
- Admin case changes are sent to the server catalog.
- Opening a case creates a server round and debits the wager server-side.
- Item selection uses server-side weighted RNG.
- Payout uses server-owned item values.
- Client no longer calls `awardPayout` for a case win.
- Demo/practice spins remain non-money UI only.

### Case Battles
- Client-funded joins and client-side payout have been disabled.
- Demo bot lobby entries and bot filling are disabled.
- The real-money path now uses a server lobby with 1v1 player-vs-player matchmaking.
- The server locks both stakes, generates the battle seed, rolls each player's case items, compares totals, and settles the winner or refunds both players on a draw.
- The legacy generic `gameId=case-battles` house endpoint is disabled; clients must use the dedicated PvP endpoints.

### Crash
- Bet debit is server-side.
- Crash point is generated and stored server-side.
- Cashout is validated against server time and server crash point.
- Client no longer awards payout or records a loss as the money authority.
- The server round starts after the same five-second betting window.
