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

## Current frontend migration
Coinflip has been migrated to the server-authoritative round API.

Other games still contain legacy client-side game logic and must be migrated before they are considered production-safe.

## Production requirement
Do not accept real-value wagers on an un-migrated game. Phase 2 is intentionally incremental so a client-side payout API is not mistaken for secure server-side gambling logic.

## Next
Migrate Roulette, Mines, Towers, Keno, Blackjack, Cases, Case Battles, Crash and remaining legacy games one by one, with server-side game state and settlement tests.


## Current migration status (updated)
Server-authoritative real-value rounds are currently enabled only for:
- Coinflip
- Mines
- Towers
- Roulette
- Keno
- Dice

The server rejects round creation for games that have not been migrated yet. This is intentional: Blackjack, Cases, Case Battles, Crash, and any legacy/orphaned game must not accept real-value bets until their complete server state machine is implemented.

Important:
- Cases must use a server-owned case catalog; client-supplied item/chance lists are rejected.
- Crash requires an authoritative shared server round before real-value betting is enabled.
- Blackjack requires server-owned deck/state/actions.
- Case Battles requires server-owned lobby, participants, case catalog, RNG, winner and settlement.
- The current file-backed round/economy store still requires persistent storage and stronger transactional locking before production/high-value use.


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
