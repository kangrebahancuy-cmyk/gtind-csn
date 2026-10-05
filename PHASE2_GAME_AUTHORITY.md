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
