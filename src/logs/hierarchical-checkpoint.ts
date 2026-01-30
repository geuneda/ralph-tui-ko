/**
 * ABOUTME: Hierarchical checkpoint system for work item progress tracking.
 * Provides checkpointing at each level of the 5-level hierarchy with
 * progress visualization utilities.
 */

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type {
  HierarchicalWorkItem,
  WorkItemType,
  WorkItemStatus,
  ValidationResult,
} from '../prd/hierarchical-types.js';

/**
 * Directory for storing hierarchical checkpoints.
 */
export const CHECKPOINTS_DIR = '.ralph-tui/checkpoints';

/**
 * Checkpoint for a single work item.
 */
export interface WorkItemCheckpoint {
  /** Checkpoint ID (auto-generated) */
  id: string;

  /** Work item ID this checkpoint belongs to */
  workItemId: string;

  /** Work item type */
  workItemType: WorkItemType;

  /** Checkpoint timestamp (ISO 8601) */
  timestamp: string;

  /** Status at checkpoint time */
  status: WorkItemStatus;

  /** Child completion rate (0.0 - 1.0) */
  childCompletionRate: number;

  /** Total children count */
  childrenTotal: number;

  /** Completed children count */
  childrenCompleted: number;

  /** Validation result if validation was run */
  validationResult?: ValidationResult;

  /** IDs of ancestor checkpoints */
  ancestorCheckpoints: string[];

  /** Custom notes or context */
  notes?: string;
}

/**
 * Progress snapshot for an entire PRD.
 */
export interface PrdProgressSnapshot {
  /** Snapshot ID */
  id: string;

  /** PRD name */
  prdName: string;

  /** Timestamp (ISO 8601) */
  timestamp: string;

  /** Total work items */
  total: number;

  /** Completed work items */
  completed: number;

  /** In progress work items */
  inProgress: number;

  /** Blocked work items */
  blocked: number;

  /** Failed work items */
  failed: number;

  /** Overall percentage */
  percentage: number;

  /** Breakdown by level */
  byLevel: Record<
    WorkItemType,
    {
      total: number;
      completed: number;
      percentage: number;
    }
  >;

  /** Individual checkpoints for all work items */
  workItemCheckpoints: WorkItemCheckpoint[];
}

/**
 * Progress bar character sets.
 */
export const PROGRESS_CHARS = {
  filled: '=',
  empty: '-',
  head: '>',
  leftBracket: '[',
  rightBracket: ']',
};

/**
 * Status icons for visualization.
 */
export const STATUS_ICONS: Record<WorkItemStatus | 'pending', string> = {
  open: ' ',
  in_progress: '>',
  blocked: '!',
  completed: 'v',
  failed: 'x',
  pending: '.',
};

/**
 * Generate a unique checkpoint ID.
 */
function generateCheckpointId(): string {
  return `chk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Create a checkpoint for a work item.
 */
export function createWorkItemCheckpoint(
  workItem: HierarchicalWorkItem,
  ancestorCheckpoints: string[] = []
): WorkItemCheckpoint {
  const childrenTotal = workItem.children.length;
  const childrenCompleted = workItem.children.filter(
    (c) => c.status === 'completed'
  ).length;
  const childCompletionRate =
    childrenTotal > 0 ? childrenCompleted / childrenTotal : 1;

  return {
    id: generateCheckpointId(),
    workItemId: workItem.id,
    workItemType: workItem.type,
    timestamp: new Date().toISOString(),
    status: workItem.status,
    childCompletionRate,
    childrenTotal,
    childrenCompleted,
    validationResult: workItem.validationGate.result,
    ancestorCheckpoints,
  };
}

/**
 * Create a progress snapshot for an entire work breakdown.
 */
export function createProgressSnapshot(
  prdName: string,
  workBreakdown: HierarchicalWorkItem[]
): PrdProgressSnapshot {
  const byLevel: PrdProgressSnapshot['byLevel'] = {
    epic: { total: 0, completed: 0, percentage: 0 },
    feature: { total: 0, completed: 0, percentage: 0 },
    story: { total: 0, completed: 0, percentage: 0 },
    task: { total: 0, completed: 0, percentage: 0 },
    subtask: { total: 0, completed: 0, percentage: 0 },
  };

  const workItemCheckpoints: WorkItemCheckpoint[] = [];
  let total = 0;
  let completed = 0;
  let inProgress = 0;
  let blocked = 0;
  let failed = 0;

  function processItem(
    item: HierarchicalWorkItem,
    ancestorCheckpoints: string[]
  ): void {
    total++;
    byLevel[item.type].total++;

    switch (item.status) {
      case 'completed':
        completed++;
        byLevel[item.type].completed++;
        break;
      case 'in_progress':
        inProgress++;
        break;
      case 'blocked':
        blocked++;
        break;
      case 'failed':
        failed++;
        break;
    }

    const checkpoint = createWorkItemCheckpoint(item, ancestorCheckpoints);
    workItemCheckpoints.push(checkpoint);

    for (const child of item.children) {
      processItem(child, [...ancestorCheckpoints, checkpoint.id]);
    }
  }

  for (const item of workBreakdown) {
    processItem(item, []);
  }

  // Calculate percentages
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  for (const type of Object.keys(byLevel) as WorkItemType[]) {
    const level = byLevel[type];
    level.percentage =
      level.total > 0 ? Math.round((level.completed / level.total) * 100) : 0;
  }

  return {
    id: generateCheckpointId(),
    prdName,
    timestamp: new Date().toISOString(),
    total,
    completed,
    inProgress,
    blocked,
    failed,
    percentage,
    byLevel,
    workItemCheckpoints,
  };
}

/**
 * Render a progress bar.
 */
export function renderProgressBar(
  percentage: number,
  width: number = 20
): string {
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;

  const filledStr =
    filled > 0
      ? PROGRESS_CHARS.filled.repeat(Math.max(0, filled - 1)) +
        (filled > 0 ? PROGRESS_CHARS.head : '')
      : '';

  const emptyStr = PROGRESS_CHARS.empty.repeat(empty);

  return `${PROGRESS_CHARS.leftBracket}${filledStr}${emptyStr}${PROGRESS_CHARS.rightBracket}`;
}

/**
 * Render status with icon.
 */
export function renderStatus(status: WorkItemStatus): string {
  const icon = STATUS_ICONS[status] || ' ';
  return `${icon} ${status.toUpperCase()}`;
}

/**
 * Render a hierarchical progress tree.
 */
export function renderProgressTree(
  workBreakdown: HierarchicalWorkItem[],
  options: {
    maxDepth?: number;
    showPercentage?: boolean;
    indent?: string;
  } = {}
): string {
  const { maxDepth = 5, showPercentage = true, indent = '  ' } = options;
  const lines: string[] = [];

  function renderItem(item: HierarchicalWorkItem, depth: number): void {
    if (depth > maxDepth) return;

    const prefix = indent.repeat(depth);
    const isLast = false; // Simplified - could track this properly
    const connector = isLast ? '`-' : '|-';

    // Calculate percentage for this item
    let percentage = 0;
    if (item.status === 'completed') {
      percentage = 100;
    } else if (item.children.length > 0) {
      const completedChildren = item.children.filter(
        (c) => c.status === 'completed'
      ).length;
      percentage = Math.round((completedChildren / item.children.length) * 100);
    }

    // Status indicator
    const statusIcon = STATUS_ICONS[item.status] || ' ';

    // Progress bar
    const progressBar = showPercentage ? ` ${renderProgressBar(percentage, 10)} ${percentage}%` : '';

    lines.push(
      `${prefix}${connector} ${statusIcon} ${item.id}: ${item.title}${progressBar}`
    );

    for (const child of item.children) {
      renderItem(child, depth + 1);
    }
  }

  for (const item of workBreakdown) {
    renderItem(item, 0);
  }

  return lines.join('\n');
}

/**
 * Render a compact summary line.
 */
export function renderCompactSummary(snapshot: PrdProgressSnapshot): string {
  const bar = renderProgressBar(snapshot.percentage, 30);
  return `${snapshot.prdName}: ${bar} ${snapshot.percentage}% (${snapshot.completed}/${snapshot.total})`;
}

/**
 * Render a detailed level-by-level summary.
 */
export function renderLevelSummary(snapshot: PrdProgressSnapshot): string {
  const lines: string[] = [];

  lines.push(`=== ${snapshot.prdName} Progress ===`);
  lines.push('');

  const levelOrder: WorkItemType[] = [
    'epic',
    'feature',
    'story',
    'task',
    'subtask',
  ];

  for (const type of levelOrder) {
    const level = snapshot.byLevel[type];
    if (level.total > 0) {
      const bar = renderProgressBar(level.percentage, 15);
      const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
      lines.push(
        `${typeLabel.padEnd(8)}: ${bar} ${level.percentage.toString().padStart(3)}% (${level.completed}/${level.total})`
      );
    }
  }

  lines.push('');
  lines.push(`Overall: ${renderProgressBar(snapshot.percentage, 20)} ${snapshot.percentage}%`);

  if (snapshot.inProgress > 0 || snapshot.blocked > 0 || snapshot.failed > 0) {
    lines.push('');
    lines.push('Status breakdown:');
    lines.push(`  In Progress: ${snapshot.inProgress}`);
    lines.push(`  Blocked:     ${snapshot.blocked}`);
    lines.push(`  Failed:      ${snapshot.failed}`);
  }

  return lines.join('\n');
}

/**
 * Save a checkpoint to disk.
 */
export async function saveCheckpoint(
  checkpoint: WorkItemCheckpoint,
  cwd: string = process.cwd()
): Promise<string> {
  const checkpointPath = join(
    cwd,
    CHECKPOINTS_DIR,
    `${checkpoint.workItemId}-${checkpoint.id}.json`
  );

  await mkdir(dirname(checkpointPath), { recursive: true });
  await writeFile(checkpointPath, JSON.stringify(checkpoint, null, 2), 'utf-8');

  return checkpointPath;
}

/**
 * Save a progress snapshot to disk.
 */
export async function saveProgressSnapshot(
  snapshot: PrdProgressSnapshot,
  cwd: string = process.cwd()
): Promise<string> {
  const snapshotPath = join(
    cwd,
    CHECKPOINTS_DIR,
    `snapshot-${snapshot.id}.json`
  );

  await mkdir(dirname(snapshotPath), { recursive: true });
  await writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf-8');

  return snapshotPath;
}

/**
 * Load a checkpoint from disk.
 */
export async function loadCheckpoint(
  filePath: string
): Promise<WorkItemCheckpoint> {
  const content = await readFile(filePath, 'utf-8');
  return JSON.parse(content) as WorkItemCheckpoint;
}

/**
 * Load a progress snapshot from disk.
 */
export async function loadProgressSnapshot(
  filePath: string
): Promise<PrdProgressSnapshot> {
  const content = await readFile(filePath, 'utf-8');
  return JSON.parse(content) as PrdProgressSnapshot;
}
