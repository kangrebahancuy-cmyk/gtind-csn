# GTIND-CSN

Production-oriented Growtopia casino platform for GTIND.

## Storage

GTIND-CSN uses **local SQLite** as the persistent source of truth.

- No MongoDB Atlas.
- No cloud database dependency.
- Casino wallet is server authoritative.
- Canonical wallet units are integer WL:
  - 1 WL = 1
  - 1 DL = 100 WL
  - 1 BGL = 10,000 WL
- Database file: `data/gtind-csn.sqlite`
- WAL mode and synchronous FULL are enabled.
- Runtime database files are ignored by Git.

## GTPS bridge

GTPS communicates with the website through the documented GTPS Cloud HTTP API.

Deposit:

`GTPS item -> /api/gtps/deposit-webhook -> SQLite transaction -> wallet`

Withdrawal:

`Website wallet reserve -> PENDING -> GTPS poll -> PROCESSING claim -> giveItem -> confirm`

If item delivery fails, GTPS calls `withdraw-fail` and the website refunds the reserved wallet amount atomically.

The GTPS server does **not** keep a second casino balance.

## Local setup

Create `.env` from `.env.example` and set:

```env
SQLITE_DB_PATH=./data/gtind-csn.sqlite
GTPS_WEBHOOK_SECRET=your-long-random-secret
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-strong-password
```

Initialize the database:

```bash
npm install
npm run sqlite:init
```

Run:

```bash
npm run dev
```

Production:

```bash
npm run build
npm start
```

## GTPS Lua

Edit:

`gtps_lua/supreme_sync.lua`

Set:

- `WEB_API_URL`
- `SECRET_KEY`

The bridge supports:

- `/link <code>`
- `/deposit <amount> <wl|dl|bgl>`
- `/withdraw`
- `/balance`

A withdrawal must first be created from the website Wallet. The in-game command only claims and delivers an existing pending withdrawal.

## Security model

- Browser is never authoritative for wallet balances.
- GTPS is never authoritative for casino balances.
- Game outcomes are server generated.
- Deposits are idempotent by transaction ID.
- Withdrawals reserve funds before GTPS delivery.
- Withdrawal claims use short-lived claim tokens.
- GTPS requests require the shared secret header.
- Global chat is temporary and expires after 24 hours.

Rewards, cashback, referral and promo-code systems are intentionally excluded.
