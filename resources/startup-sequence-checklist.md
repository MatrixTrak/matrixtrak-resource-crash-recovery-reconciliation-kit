# Startup Sequence Checklist

Use this checklist for every trading bot startup—cold start, restart after crash, or scheduled restart.

---

## Pre-Startup Verification

### Environment Check
- [ ] API keys are valid and not expired
- [ ] Exchange is operational (check status page)
- [ ] Network connectivity confirmed
- [ ] Sufficient funds/margin for trading

### Configuration Check
- [ ] Correct symbol/market configured
- [ ] Risk limits set appropriately
- [ ] State file path accessible
- [ ] Logging enabled

---

## Startup Sequence

### 1. Load Local State
```
Action: Load persisted state from disk/database
Verify: File exists and parses correctly
Fallback: If corrupted, use backup or start fresh with position reconciliation
```
- [ ] State file loaded successfully
- [ ] Order count logged
- [ ] Position size logged
- [ ] Last update timestamp checked

### 2. Create Exchange Connection
```
Action: Initialize exchange API client (trading disabled)
Verify: Connection succeeds, credentials valid
Fallback: If auth fails, abort startup
```
- [ ] Exchange connected
- [ ] API credentials validated
- [ ] Trading flag set to FALSE

### 3. Run Reconciliation

#### 3a. Orphan Order Detection
```
Action: Compare exchange open orders to local state
Find: Orders on exchange not in local orderIds
```
- [ ] Fetched exchange open orders
- [ ] Compared to local order IDs
- [ ] Orphans identified (count: ____)
- [ ] Orphans adopted OR canceled per strategy rules

#### 3b. Ghost Order Cleanup
```
Action: For each local open order, verify existence on exchange
Find: Orders in local state not on exchange
```
- [ ] Each local open order verified
- [ ] Ghosts identified (count: ____)
- [ ] Ghosts removed from local state

#### 3c. Stale Fill Backfill
```
Action: For each local order, compare fill amount
Find: Orders with more fills on exchange than recorded locally
```
- [ ] Fill amounts compared
- [ ] Stale fills identified (count: ____)
- [ ] Fills processed and position updated

#### 3d. Position Verification
```
Action: Compare local position to exchange position
Fix: If drift exceeds threshold, trust exchange
```
- [ ] Exchange position fetched
- [ ] Local position compared
- [ ] Drift calculated: ____% 
- [ ] Position corrected if needed

### 4. Save Reconciled State
```
Action: Persist corrected state to disk/database
Verify: Write succeeded
```
- [ ] Reconciled state saved
- [ ] Backup created (optional)

### 5. Risk Limit Check
```
Action: Verify position is within configured limits
Abort: If limits exceeded, do not enable trading
```
- [ ] Position size within max
- [ ] Unrealized PnL within drawdown limit
- [ ] Margin utilization acceptable

### 6. Enable Trading
```
Action: Set trading flag to TRUE
Verify: Order placement functions now available
```
- [ ] Trading enabled
- [ ] Logged: "Trading enabled at [timestamp]"

### 7. Connect Live Data
```
Action: Subscribe to WebSocket for real-time updates
Verify: Receiving market data and order updates
```
- [ ] WebSocket connected
- [ ] Receiving market data
- [ ] Order update channel active

---

## Post-Startup Verification

### Immediate Checks (First 60 Seconds)
- [ ] No unexpected errors in logs
- [ ] Position matches pre-reconciliation expectation
- [ ] No orphan orders created
- [ ] WebSocket heartbeat stable

### First Trade Verification
- [ ] First order placed successfully
- [ ] Order appears in local state
- [ ] Order confirmed on exchange
- [ ] Client order ID matches

---

## Abort Conditions

Stop startup and investigate if any of these occur:

| Condition | Action |
|-----------|--------|
| State file corrupted | Manual recovery required |
| Exchange unreachable | Wait and retry (max 3 attempts) |
| Reconciliation timeout | Check exchange status |
| Position drift > 10% | Manual investigation |
| Risk limits exceeded | Do not trade, alert operator |
| Unknown errors during reconciliation | Do not trade, investigate |

---

## Recovery from Failed Startup

If startup fails:

1. **Check logs** for error details
2. **Verify exchange status** (not an exchange outage)
3. **Check state file** for corruption
4. **Manual reconciliation** if automated fails:
   - Log into exchange UI
   - List open orders manually
   - Verify position manually
   - Update local state or start fresh

5. **Document the failure** for future prevention

---

## Scheduled Restart Procedure

For planned restarts (maintenance, updates):

1. **Stop creating new orders** (cool-down period)
2. **Wait for pending orders** to fill or cancel
3. **Flush state to disk**
4. **Graceful shutdown**
5. **Perform startup sequence** (this checklist)
6. **Verify continuity** with previous state

---

## Logging Requirements

Ensure these are logged during startup:

```
[STARTUP] Beginning startup sequence
[STARTUP] State loaded: X orders, position Y
[RECONCILIATION] Orphans found: N
[RECONCILIATION] Ghosts removed: N  
[RECONCILIATION] Fills backfilled: N
[RECONCILIATION] Position drift: X%
[RECONCILIATION] Complete in Nms
[STARTUP] Risk check: PASSED
[STARTUP] Trading enabled
[STARTUP] WebSocket connected
[STARTUP] Startup complete
```

---

## Quick Reference Times

| Phase | Expected Duration |
|-------|------------------|
| Load state | < 100ms |
| Exchange connect | 200-500ms |
| Orphan detection | 200-2000ms (depends on order count) |
| Ghost detection | 200-2000ms |
| Fill backfill | 200-2000ms |
| Position verify | 100-500ms |
| Total reconciliation | 1-10 seconds |
| WebSocket connect | 500-2000ms |
| **Total startup** | **3-15 seconds** |

If startup takes longer than 30 seconds, investigate bottleneck.
