/**
 * ABOUTME: Iteration logs module exports.
 * Provides persistence and management for iteration output logs,
 * plus structured logging for headless/CI mode.
 */

export type {
  AgentSwitchEntry,
  IterationLog,
  IterationLogMetadata,
  IterationLogSummary,
  LogFilterOptions,
  LogCleanupOptions,
  LogCleanupResult,
  SubagentHierarchyNode,
  SubagentTraceStats,
  SubagentTrace,
} from './types.js';

export { ITERATIONS_DIR } from './types.js';

export type { SaveIterationLogOptions } from './persistence.js';

export {
  generateLogFilename,
  getIterationsDir,
  ensureIterationsDir,
  buildMetadata,
  saveIterationLog,
  loadIterationLog,
  listIterationLogs,
  getIterationLogByNumber,
  getIterationLogsByTask,
  cleanupIterationLogs,
  getIterationLogCount,
  hasIterationLogs,
  getIterationLogsDiskUsage,
  buildSubagentTrace,
} from './persistence.js';

export type {
  LogLevel,
  LogComponent,
  StructuredLoggerConfig,
} from './structured-logger.js';

export {
  StructuredLogger,
  createStructuredLogger,
} from './structured-logger.js';

export type { ProgressEntry } from './progress.js';

export {
  PROGRESS_FILE,
  createProgressEntry,
  appendProgress,
  readProgress,
  getRecentProgressSummary,
  getCodebasePatternsForPrompt,
  clearProgress,
} from './progress.js';

// Hierarchical checkpoint system
export type {
  WorkItemCheckpoint,
  PrdProgressSnapshot,
} from './hierarchical-checkpoint.js';

export {
  CHECKPOINTS_DIR,
  PROGRESS_CHARS,
  STATUS_ICONS,
  createWorkItemCheckpoint,
  createProgressSnapshot,
  renderProgressBar,
  renderStatus,
  renderProgressTree,
  renderCompactSummary,
  renderLevelSummary,
  saveCheckpoint,
  saveProgressSnapshot,
  loadCheckpoint,
  loadProgressSnapshot,
} from './hierarchical-checkpoint.js';
