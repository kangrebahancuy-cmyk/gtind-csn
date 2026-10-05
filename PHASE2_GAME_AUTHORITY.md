# GTIND-CSN Phase 2 — Game Authority

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
- Case Battles (server-vs-house)
- Crash

The server rejects any game ID outside this whitelist. The migrated frontend game components contain no calls to the legacy client-side balance settlement methods.

Important:
- Game configuration and payout tables used for settlement are server-owned.
- Cases use a server-owned case catalog in `data/cases.json`.
- Roulette validates the submitted stake against the amount debited in DLS.
- Crash settlement uses server-side elapsed time and crash point.
- True player-vs-player Case Battle matchmaking is intentionally disabled; the real-money path is server-vs-house.
- File-backed JSON persistence still requires migration to transactional persistent storage before high-value production.

## Validation
- Added GitHub Actions CI for Vite build and Node syntax checks.
- Game payout settlement is idempotent by round ID in the economy ledger.
- Regression tests cover deterministic RNG, Blackjack deck/scoring, Mines, Roulette, Keno, and Crash.

## Production requirement
Phase 2 game authority is complete at the application-logic level, but production/high-value wagering must wait for transactional persistent storage, concurrency control, and a true shared Crash/PvP matchmaking service.

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
- Demo bot lobby entries have been removed.
- The current real-money path uses a server-authoritative house battle round; client-side PvP matchmaking is intentionally blocked until a server lobby/join/settlement service is implemented.
- Client animation must never be treated as the settlement source.

### Crash
- Bet debit is server-side.
- Crash point is generated and stored server-side.
- Cashout is validated against server time and server crash point.
- Client no longer awards payout or records a loss as the money authority.
- The server round starts after the same five-second betting window.
