# Phase 8 — Social Layer

## Status

Implementation complete; CI verification required before merge.

## Global Chat

Global chat is intentionally **temporary**.

- MongoDB collection: `chatMessages`
- Retention: **24 hours**
- Every message has `expiresAt`
- MongoDB TTL index automatically removes expired documents
- API only returns messages with `expiresAt > now`
- Hourly cleanup worker removes expired records proactively
- Maximum message length: 500 characters
- Authentication required
- Muted/banned users cannot send
- Client cannot choose `userId`, `username`, timestamps, or expiration

This means chat history is not a permanent archive and should not grow indefinitely.

## Live Bets

Live Bets are derived from the authoritative `ledger` BET entries. The browser cannot create fake live-bet events.

## High Rollers

High Rollers are derived from verified server BET ledger entries. Current threshold is 100 DL per bet.

## Player Profiles

Phase 6 public profiles are extended with optional admin tags.

Admin endpoint:

- PATCH `/api/admin/profile/:username/tag`

## Realtime

Authenticated WebSocket clients receive:

- CHAT_MESSAGE
- LIVE_BET
- GAME_SETTLED
- existing Crash and battle events

Client-supplied LIVE_BET/BATTLE events remain rejected.

## Important

Rewards, cashback, referral and promo systems remain intentionally excluded from this phase.
