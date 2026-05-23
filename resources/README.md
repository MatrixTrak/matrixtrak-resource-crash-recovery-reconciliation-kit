# Crash Recovery Reconciliation Kit

Reconciliation loop pattern for trading bots—detect and correct state drift on startup to prevent double orders and orphan positions.

## Contents

| File | Purpose |
|------|---------|
| `reconciliation-loop-template.ts` | TypeScript implementation of the full reconciliation pattern |
| `startup-sequence-checklist.md` | Step-by-step checklist for crash-proof startup |

## Quick Start

1. Copy `reconciliation-loop-template.ts` into your bot
2. Implement the exchange adapter interface (uses ccxt-style API)
3. Call `reconcileOnStartup()` before enabling trading
4. Configure `safeReconciliation()` wrapper with your error handling

## Key Concepts

### The Three Drift Types

1. **Orphan Orders**: Exchange has them, you don't (order sent, crash before saving)
2. **Ghost Orders**: You have them, exchange doesn't (saved locally, never sent)
3. **Stale Fills**: Exchange filled them, you show open (fill notification missed)

### Reconciliation Order

```
Load State → Detect Orphans → Remove Ghosts → Backfill Fills → Verify Position → Enable Trading
```

Never skip position verification. Even if orders look correct, fills during downtime can create drift.

## Integration Points

**State Storage:** The template expects a `TradingState` object. Implement your own persistence (SQLite, Redis, JSON file).

**Exchange Adapter:** Uses standard REST methods:
- `fetchOpenOrders(symbol)`
- `fetchOrder(clientOrderId)`
- `fetchPosition(symbol)`

Most ccxt exchanges support these directly.

## Risk Note

Reconciliation is not optional. Running a bot with unknown state creates the conditions for catastrophic loss. If reconciliation fails, the bot should refuse to trade.

## Related Blog Post

[Crash Recovery: Reconciliation Loops That Prevent Double Orders](https://matrixtrak.com/blog/crash-recovery-reconciliation-loops-trading-bots)
