# Phase 6 — Player Identity & Progression

Status: IMPLEMENTED

## Scope
- Persistent MongoDB Atlas player profiles.
- Server-authoritative XP, levels and tiers.
- Unlockable avatars.
- Persistent game statistics.
- Public/private profile visibility.
- Progression updates are tied to server-side game debit/payout transactions.

## Rules
- Level starts at 1.
- XP required per level: max(100, floor(100 * level^1.5)).
- Verified game bets grant floor(betDls / 10), capped at 1,000 XP per bet.
- Positive net wins grant additional XP from verified settlement, capped at 500 XP.
- XP events are uniquely keyed to prevent duplicate rewards.
- Tiers: Bronze 1+, Silver 10+, Gold 25+, Platinum 50+, Diamond 100+, Elite 200+.

## Collections
- profiles
- playerStats
- playerXp
- xpEvents

## API
- GET /api/profile/me
- GET /api/profile/:username
- PATCH /api/profile/me
- GET /api/profile/catalog

## Security
The client cannot set XP, level, tier, statistics, or unlocked avatars. Avatar selection is validated server-side. Game progression mutations execute inside the same MongoDB transaction as the wallet mutation.
