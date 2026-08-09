/**
 * Game-wide constants — single source of truth for magic numbers.
 * Import from here instead of hardcoding values in handlers.
 */

// ── Mining ──────────────────────────────────────────────────────────────────

/** A full resource node holds ten seconds of its normal output. */
export const RESOURCE_BUFFER_SECONDS = 10;

// ── Repair ──────────────────────────────────────────────────────────────────

/** Data cost to repair an infected node. */
export const REPAIR_DATA_COST = 500;

// ── Worker Status ───────────────────────────────────────────────────────────

export const WORKER_STATUS = {
  DEPLOYING: 'deploying',
  RUNNING: 'running',
  SUSPENDING: 'suspending',
  SUSPENDED: 'suspended',
  CRASHED: 'crashed',
  ERROR: 'error',
  IDLE: 'idle',
  MOVING: 'moving',
  HARVESTING: 'harvesting',
  DEAD: 'dead',
} as const;

export type WorkerStatus = (typeof WORKER_STATUS)[keyof typeof WORKER_STATUS];

// ── UI Timing ───────────────────────────────────────────────────────────────

/** How long success/error messages stay visible in the UI (ms). */
export const UI_MSG_TIMEOUT_MS = 2000;

// ── Deploy Defaults ─────────────────────────────────────────────────────────

export const BASE_COMPUTE_POINTS = 1;
export const BASE_WORKER_CAPACITY = 50;
export const RAM_CAPACITY_MULTIPLIER = 50;
