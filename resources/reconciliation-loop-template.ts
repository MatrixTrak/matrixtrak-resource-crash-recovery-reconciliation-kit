/**
 * Reconciliation Loop Template
 * 
 * Detects and corrects state drift between local bot state and exchange reality.
 * Run on every startup before enabling trading.
 * 
 * @see /blog/crash-recovery-reconciliation-loops-trading-bots
 */

// ============================================================================
// Types
// ============================================================================

interface Order {
  clientOrderId: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: 'limit' | 'market';
  price?: number;
  amount: number;
  filled: number;
  status: 'open' | 'filled' | 'canceled' | 'expired';
  timestamp: number;
}

interface Position {
  symbol: string;
  size: number;        // Positive = long, Negative = short
  entryPrice: number;
}

interface TradingState {
  orderIds: Set<string>;
  openOrders: Order[];
  position: Position;
  symbol: string;
  
  // State mutation methods (implement your persistence layer)
  adoptOrder(order: Order): Promise<void>;
  removeOrder(clientOrderId: string): Promise<void>;
  processFill(clientOrderId: string, filled: number, price: number): Promise<void>;
  save(): Promise<void>;
}

interface Exchange {
  fetchOpenOrders(symbol?: string): Promise<Order[]>;
  fetchOrder(clientOrderId: string): Promise<Order | null>;
  fetchPosition(symbol: string): Promise<Position>;
  enableTrading(): void;
  connectWebSocket(): Promise<void>;
}

interface ReconciliationResult {
  orphansFound: number;
  orphansAdopted: number;
  orphansCanceled: number;
  ghostsRemoved: number;
  fillsBackfilled: number;
  positionCorrected: boolean;
  positionDrift?: number;
  durationMs: number;
}

interface ReconciliationConfig {
  symbol: string;
  driftThresholdPct: number;   // Position drift threshold for correction (default: 0.1%)
  adoptOrphanOrders: boolean;  // true = adopt orphans, false = cancel them
  timeoutMs: number;           // Overall reconciliation timeout
}

// ============================================================================
// Core Detection Functions
// ============================================================================

/**
 * Find orders that exist on exchange but not in local state.
 * These are "orphans" - orders that were placed but crashed before saving.
 */
async function findOrphanOrders(
  exchange: Exchange,
  symbol: string,
  localOrderIds: Set<string>
): Promise<Order[]> {
  const exchangeOrders = await exchange.fetchOpenOrders(symbol);
  return exchangeOrders.filter(order => !localOrderIds.has(order.clientOrderId));
}

/**
 * Find orders that exist in local state but not on exchange.
 * These are "ghosts" - orders saved locally but never reached exchange.
 */
async function findGhostOrders(
  exchange: Exchange,
  localOrders: Order[]
): Promise<Order[]> {
  const ghosts: Order[] = [];
  
  for (const local of localOrders) {
    if (local.status === 'open') {
      try {
        const remote = await exchange.fetchOrder(local.clientOrderId);
        if (!remote) {
          ghosts.push(local);
        }
      } catch (error: any) {
        // Order not found = ghost
        if (error.code === 'ORDER_NOT_FOUND' || error.code === -2013) {
          ghosts.push(local);
        } else {
          throw error; // Re-throw unexpected errors
        }
      }
    }
  }
  
  return ghosts;
}

/**
 * Find orders that filled on exchange but show as open locally.
 * These are "stale fills" - fills that happened but weren't processed.
 */
async function findStaleFills(
  exchange: Exchange,
  localOrders: Order[]
): Promise<Array<{ local: Order; remote: Order }>> {
  const staleFills: Array<{ local: Order; remote: Order }> = [];
  
  for (const local of localOrders) {
    if (local.status === 'open' || local.status === 'filled' && local.filled < local.amount) {
      const remote = await exchange.fetchOrder(local.clientOrderId);
      
      if (remote && remote.filled > local.filled) {
        staleFills.push({ local, remote });
      }
    }
  }
  
  return staleFills;
}

/**
 * Compare local position to exchange position.
 * Returns drift amount (0 if matching).
 */
async function checkPositionDrift(
  exchange: Exchange,
  symbol: string,
  localPosition: Position
): Promise<{ drift: number; remote: Position }> {
  const remote = await exchange.fetchPosition(symbol);
  const drift = Math.abs(remote.size - localPosition.size);
  return { drift, remote };
}

// ============================================================================
// Main Reconciliation Loop
// ============================================================================

/**
 * Full reconciliation sequence. Call on every startup.
 */
async function reconcileOnStartup(
  exchange: Exchange,
  state: TradingState,
  config: ReconciliationConfig
): Promise<ReconciliationResult> {
  const startTime = Date.now();
  
  const result: ReconciliationResult = {
    orphansFound: 0,
    orphansAdopted: 0,
    orphansCanceled: 0,
    ghostsRemoved: 0,
    fillsBackfilled: 0,
    positionCorrected: false,
    durationMs: 0,
  };

  console.log(`[Reconciliation] Starting for ${config.symbol}...`);

  // Phase 1: Detect orphan orders
  console.log('[Reconciliation] Phase 1: Checking for orphan orders...');
  const orphans = await findOrphanOrders(exchange, config.symbol, state.orderIds);
  result.orphansFound = orphans.length;
  
  for (const orphan of orphans) {
    console.log(`[Reconciliation] Found orphan order: ${orphan.clientOrderId}`);
    
    if (config.adoptOrphanOrders) {
      await state.adoptOrder(orphan);
      result.orphansAdopted++;
      console.log(`[Reconciliation] Adopted orphan: ${orphan.clientOrderId}`);
    } else {
      // Cancel orphan orders (uncomment and implement if needed)
      // await exchange.cancelOrder(orphan.clientOrderId);
      result.orphansCanceled++;
      console.log(`[Reconciliation] Would cancel orphan: ${orphan.clientOrderId}`);
    }
  }

  // Phase 2: Remove ghost orders
  console.log('[Reconciliation] Phase 2: Checking for ghost orders...');
  const ghosts = await findGhostOrders(exchange, state.openOrders);
  
  for (const ghost of ghosts) {
    console.log(`[Reconciliation] Found ghost order: ${ghost.clientOrderId}`);
    await state.removeOrder(ghost.clientOrderId);
    result.ghostsRemoved++;
  }

  // Phase 3: Backfill stale fills
  console.log('[Reconciliation] Phase 3: Checking for stale fills...');
  const staleFills = await findStaleFills(exchange, state.openOrders);
  
  for (const { local, remote } of staleFills) {
    console.log(`[Reconciliation] Found stale fill: ${local.clientOrderId} (${local.filled} → ${remote.filled})`);
    await state.processFill(local.clientOrderId, remote.filled, remote.price || local.price || 0);
    result.fillsBackfilled++;
  }

  // Phase 4: Position reconciliation (final verification)
  console.log('[Reconciliation] Phase 4: Verifying position...');
  const { drift, remote } = await checkPositionDrift(exchange, config.symbol, state.position);
  const driftPct = (drift / Math.abs(state.position.size || 1)) * 100;
  
  result.positionDrift = drift;
  
  if (driftPct > config.driftThresholdPct) {
    console.warn(`[Reconciliation] Position drift detected: local=${state.position.size}, exchange=${remote.size}`);
    
    // Exchange is source of truth
    state.position.size = remote.size;
    state.position.entryPrice = remote.entryPrice;
    result.positionCorrected = true;
  }

  // Save reconciled state
  await state.save();
  
  result.durationMs = Date.now() - startTime;
  console.log(`[Reconciliation] Complete in ${result.durationMs}ms:`, result);
  
  return result;
}

// ============================================================================
// Safe Wrapper with Error Handling
// ============================================================================

/**
 * Wrapper that handles reconciliation failures gracefully.
 * Returns null if reconciliation fails (caller should NOT proceed to trade).
 */
async function safeReconciliation(
  exchange: Exchange,
  state: TradingState,
  config: ReconciliationConfig
): Promise<ReconciliationResult | null> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('RECONCILIATION_TIMEOUT')), config.timeoutMs);
  });

  try {
    return await Promise.race([
      reconcileOnStartup(exchange, state, config),
      timeoutPromise,
    ]);
  } catch (error: any) {
    console.error('[Reconciliation] Failed:', error.message);

    if (error.message === 'RECONCILIATION_TIMEOUT') {
      console.error('[Reconciliation] Timed out - exchange may be slow or unreachable');
      return null;
    }

    if (error.code === 'RATE_LIMITED' || error.code === -1015) {
      console.error('[Reconciliation] Rate limited - waiting 60s before retry');
      await delay(60_000);
      return safeReconciliation(exchange, state, config); // Retry once
    }

    if (error.code === 'EXCHANGE_DOWN' || error.code === 'ENOTFOUND') {
      console.error('[Reconciliation] Exchange unreachable - cannot reconcile');
      return null;
    }

    // Unknown error - log and return null (don't trade)
    console.error('[Reconciliation] Unknown error:', error);
    return null;
  }
}

// ============================================================================
// Startup Sequence
// ============================================================================

interface BotConfig {
  symbol: string;
  stateFile: string;
  riskLimits: {
    maxPositionSize: number;
    maxDrawdownPct: number;
  };
  reconciliation: ReconciliationConfig;
}

/**
 * Complete startup sequence with reconciliation.
 * Call this instead of just starting the bot.
 */
async function startupSequence(
  config: BotConfig,
  loadState: (file: string) => Promise<TradingState>,
  createExchange: () => Exchange,
  isWithinRiskLimits: (position: Position, limits: BotConfig['riskLimits']) => boolean
): Promise<{ state: TradingState; exchange: Exchange } | null> {
  console.log('=== Bot Startup Sequence ===');

  // Step 1: Load persisted state
  console.log('Step 1: Loading state...');
  const state = await loadState(config.stateFile);
  console.log(`Loaded state: ${state.openOrders.length} open orders, position size: ${state.position.size}`);

  // Step 2: Create exchange connection (trading disabled)
  console.log('Step 2: Creating exchange connection...');
  const exchange = createExchange();

  // Step 3: Run reconciliation
  console.log('Step 3: Running reconciliation...');
  const result = await safeReconciliation(exchange, state, config.reconciliation);

  if (!result) {
    console.error('FATAL: Reconciliation failed. Refusing to start.');
    return null;
  }

  // Step 4: Verify risk limits post-reconciliation
  console.log('Step 4: Checking risk limits...');
  if (!isWithinRiskLimits(state.position, config.riskLimits)) {
    console.error('FATAL: Position exceeds risk limits after reconciliation.');
    console.error(`Position: ${state.position.size}, Max: ${config.riskLimits.maxPositionSize}`);
    return null;
  }

  // Step 5: Enable trading
  console.log('Step 5: Enabling trading...');
  exchange.enableTrading();

  // Step 6: Connect WebSocket for live updates
  console.log('Step 6: Connecting WebSocket...');
  await exchange.connectWebSocket();

  console.log('=== Startup Complete ===');
  return { state, exchange };
}

// ============================================================================
// Periodic Reconciliation (Runtime)
// ============================================================================

/**
 * Light reconciliation to run periodically during operation.
 * Catches drift from WebSocket message loss.
 */
async function periodicReconciliation(
  exchange: Exchange,
  state: TradingState,
  driftThresholdPct: number
): Promise<boolean> {
  const { drift, remote } = await checkPositionDrift(exchange, state.symbol, state.position);
  const driftPct = (drift / Math.abs(state.position.size || 1)) * 100;

  if (driftPct > driftThresholdPct) {
    console.warn(`[Periodic] Position drift: ${drift} (${driftPct.toFixed(2)}%)`);
    state.position.size = remote.size;
    state.position.entryPrice = remote.entryPrice;
    await state.save();
    return true; // Drift corrected
  }

  return false; // No drift
}

/**
 * Start periodic reconciliation timer.
 */
function startPeriodicReconciliation(
  exchange: Exchange,
  state: TradingState,
  intervalMs: number = 5 * 60 * 1000, // 5 minutes
  driftThresholdPct: number = 0.1
): NodeJS.Timer {
  return setInterval(async () => {
    try {
      const corrected = await periodicReconciliation(exchange, state, driftThresholdPct);
      if (corrected) {
        console.log('[Periodic] Position drift corrected');
      }
    } catch (error) {
      console.error('[Periodic] Reconciliation check failed:', error);
    }
  }, intervalMs);
}

// ============================================================================
// Utilities
// ============================================================================

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// Exports
// ============================================================================

// Type exports (required for isolatedModules)
export type {
  Order,
  Position,
  TradingState,
  Exchange,
  ReconciliationResult,
  ReconciliationConfig,
  BotConfig,
};

// Function exports
export {
  findOrphanOrders,
  findGhostOrders,
  findStaleFills,
  checkPositionDrift,
  reconcileOnStartup,
  safeReconciliation,
  startupSequence,
  periodicReconciliation,
  startPeriodicReconciliation,
};
