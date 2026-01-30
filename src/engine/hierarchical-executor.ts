/**
 * ABOUTME: Hierarchical execution engine for 5-level work breakdown.
 * Executes work items in the correct order (depth-first, dependencies respected)
 * with validation gates at each level.
 */

import type {
  HierarchicalWorkItem,
  WorkItemType,
  WorkItemStatus,
} from '../prd/hierarchical-types.js';

import type {
  HierarchicalTrackerPlugin,
  WorkItemFilter,
} from '../plugins/trackers/types.js';

import type { AgentPlugin } from '../plugins/agents/types.js';

import {
  ValidationGateExecutor,
  type ValidationGateExecutionResult,
  type ValidationGateOptions,
} from './validation-gate.js';

/**
 * Event types emitted by the hierarchical executor.
 */
export type HierarchicalExecutorEventType =
  | 'executor:started'
  | 'executor:stopped'
  | 'executor:paused'
  | 'executor:resumed'
  | 'workitem:selected'
  | 'workitem:started'
  | 'workitem:completed'
  | 'workitem:failed'
  | 'workitem:skipped'
  | 'validation:started'
  | 'validation:passed'
  | 'validation:failed'
  | 'rollup:triggered'
  | 'rollup:completed'
  | 'progress:updated'
  | 'all:complete';

/**
 * Base event interface.
 */
export interface HierarchicalExecutorEventBase {
  type: HierarchicalExecutorEventType;
  timestamp: string;
}

/**
 * Executor started event.
 */
export interface ExecutorStartedEvent extends HierarchicalExecutorEventBase {
  type: 'executor:started';
  totalWorkItems: number;
  rootEpicId?: string;
}

/**
 * Executor stopped event.
 */
export interface ExecutorStoppedEvent extends HierarchicalExecutorEventBase {
  type: 'executor:stopped';
  reason: 'completed' | 'max_iterations' | 'interrupted' | 'error' | 'no_work';
  totalIterations: number;
  workItemsCompleted: number;
}

/**
 * Work item selected event.
 */
export interface WorkItemSelectedEvent extends HierarchicalExecutorEventBase {
  type: 'workitem:selected';
  workItem: HierarchicalWorkItem;
  depth: number;
  iteration: number;
}

/**
 * Work item started event.
 */
export interface WorkItemStartedEvent extends HierarchicalExecutorEventBase {
  type: 'workitem:started';
  workItem: HierarchicalWorkItem;
  iteration: number;
}

/**
 * Work item completed event.
 */
export interface WorkItemCompletedEvent extends HierarchicalExecutorEventBase {
  type: 'workitem:completed';
  workItem: HierarchicalWorkItem;
  iteration: number;
  durationMs: number;
}

/**
 * Work item failed event.
 */
export interface WorkItemFailedEvent extends HierarchicalExecutorEventBase {
  type: 'workitem:failed';
  workItem: HierarchicalWorkItem;
  iteration: number;
  error: string;
  action: 'retry' | 'skip' | 'abort';
}

/**
 * Work item skipped event.
 */
export interface WorkItemSkippedEvent extends HierarchicalExecutorEventBase {
  type: 'workitem:skipped';
  workItem: HierarchicalWorkItem;
  reason: string;
}

/**
 * Validation started event.
 */
export interface ValidationStartedEvent extends HierarchicalExecutorEventBase {
  type: 'validation:started';
  workItemId: string;
  gateType: string;
}

/**
 * Validation passed event.
 */
export interface ValidationPassedEvent extends HierarchicalExecutorEventBase {
  type: 'validation:passed';
  workItemId: string;
  result: ValidationGateExecutionResult;
}

/**
 * Validation failed event.
 */
export interface ValidationFailedEvent extends HierarchicalExecutorEventBase {
  type: 'validation:failed';
  workItemId: string;
  result: ValidationGateExecutionResult;
}

/**
 * Rollup triggered event.
 */
export interface RollupTriggeredEvent extends HierarchicalExecutorEventBase {
  type: 'rollup:triggered';
  childId: string;
  parentId: string;
}

/**
 * Rollup completed event.
 */
export interface RollupCompletedEvent extends HierarchicalExecutorEventBase {
  type: 'rollup:completed';
  parentId: string;
  success: boolean;
  newStatus: WorkItemStatus;
}

/**
 * Progress updated event.
 */
export interface ProgressUpdatedEvent extends HierarchicalExecutorEventBase {
  type: 'progress:updated';
  total: number;
  completed: number;
  percentage: number;
  byLevel: Record<WorkItemType, { total: number; completed: number }>;
}

/**
 * All work complete event.
 */
export interface AllCompleteEvent extends HierarchicalExecutorEventBase {
  type: 'all:complete';
  totalIterations: number;
  totalCompleted: number;
}

/**
 * Union of all hierarchical executor events.
 */
export type HierarchicalExecutorEvent =
  | ExecutorStartedEvent
  | ExecutorStoppedEvent
  | WorkItemSelectedEvent
  | WorkItemStartedEvent
  | WorkItemCompletedEvent
  | WorkItemFailedEvent
  | WorkItemSkippedEvent
  | ValidationStartedEvent
  | ValidationPassedEvent
  | ValidationFailedEvent
  | RollupTriggeredEvent
  | RollupCompletedEvent
  | ProgressUpdatedEvent
  | AllCompleteEvent;

/**
 * Event listener type.
 */
export type HierarchicalExecutorEventListener = (
  event: HierarchicalExecutorEvent
) => void;

/**
 * Executor configuration.
 */
export interface HierarchicalExecutorConfig {
  /** Maximum iterations to run (default: unlimited) */
  maxIterations?: number;

  /** Working directory */
  cwd?: string;

  /** Root epic ID to start from (optional, defaults to first epic) */
  rootEpicId?: string;

  /** Whether to run validation gates automatically */
  autoValidate?: boolean;

  /** Whether to auto-commit after completing work items */
  autoCommit?: boolean;

  /** Work item types to execute (default: all leaf types) */
  executeTypes?: WorkItemType[];

  /** Filter for selecting work items */
  filter?: WorkItemFilter;

  /** Validation gate options */
  validationOptions?: ValidationGateOptions;

  /** Error handling strategy */
  errorStrategy?: 'retry' | 'skip' | 'abort';

  /** Maximum retries per work item */
  maxRetries?: number;

  /** Delay between retries in milliseconds */
  retryDelayMs?: number;
}

/**
 * Executor state.
 */
export interface HierarchicalExecutorState {
  /** Current status */
  status: 'idle' | 'running' | 'pausing' | 'paused' | 'stopping';

  /** Current iteration number */
  iteration: number;

  /** Current work item being executed */
  currentWorkItem: HierarchicalWorkItem | null;

  /** Total work items */
  totalWorkItems: number;

  /** Completed work items count */
  completedWorkItems: number;

  /** Failed work items IDs (for skip strategy) */
  failedWorkItemIds: Set<string>;

  /** Start time */
  startedAt: string | null;

  /** Current agent output */
  currentOutput: string;
}

/**
 * Default configuration values.
 */
const DEFAULT_CONFIG: Required<
  Omit<HierarchicalExecutorConfig, 'rootEpicId' | 'filter'>
> = {
  maxIterations: Infinity,
  cwd: process.cwd(),
  autoValidate: true,
  autoCommit: false,
  executeTypes: ['subtask', 'task'], // Default to executing leaf-level items
  validationOptions: {},
  errorStrategy: 'skip',
  maxRetries: 2,
  retryDelayMs: 1000,
};

/**
 * Hierarchical execution engine.
 */
export class HierarchicalExecutor {
  private config: Required<
    Omit<HierarchicalExecutorConfig, 'rootEpicId' | 'filter'>
  > &
    Pick<HierarchicalExecutorConfig, 'rootEpicId' | 'filter'>;
  private tracker: HierarchicalTrackerPlugin;
  private _agent: AgentPlugin; // Reserved for future agent execution
  private validationExecutor: ValidationGateExecutor;
  private state: HierarchicalExecutorState;
  private listeners: Set<HierarchicalExecutorEventListener> = new Set();
  private abortController: AbortController | null = null;

  constructor(
    tracker: HierarchicalTrackerPlugin,
    agent: AgentPlugin,
    config: HierarchicalExecutorConfig = {}
  ) {
    this.tracker = tracker;
    this._agent = agent;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.validationExecutor = new ValidationGateExecutor(
      this.config.validationOptions
    );
    this.state = this.createInitialState();
  }

  /**
   * Get the agent plugin (for external use or future integration).
   */
  get agent(): AgentPlugin {
    return this._agent;
  }

  /**
   * Create initial state.
   */
  private createInitialState(): HierarchicalExecutorState {
    return {
      status: 'idle',
      iteration: 0,
      currentWorkItem: null,
      totalWorkItems: 0,
      completedWorkItems: 0,
      failedWorkItemIds: new Set(),
      startedAt: null,
      currentOutput: '',
    };
  }

  /**
   * Add an event listener.
   */
  addEventListener(listener: HierarchicalExecutorEventListener): void {
    this.listeners.add(listener);
  }

  /**
   * Remove an event listener.
   */
  removeEventListener(listener: HierarchicalExecutorEventListener): void {
    this.listeners.delete(listener);
  }

  /**
   * Emit an event to all listeners.
   */
  private emit(event: HierarchicalExecutorEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('Event listener error:', err);
      }
    }
  }

  /**
   * Get current state.
   */
  getState(): Readonly<HierarchicalExecutorState> {
    return { ...this.state };
  }

  /**
   * Start execution.
   */
  async start(): Promise<void> {
    if (this.state.status !== 'idle') {
      throw new Error(`Cannot start: executor is ${this.state.status}`);
    }

    this.abortController = new AbortController();
    this.state.status = 'running';
    this.state.startedAt = new Date().toISOString();
    this.state.iteration = 0;

    // Get initial progress
    const progress = await this.tracker.getProgress(this.config.rootEpicId);
    this.state.totalWorkItems = progress.total;
    this.state.completedWorkItems = progress.completed;

    this.emit({
      type: 'executor:started',
      timestamp: new Date().toISOString(),
      totalWorkItems: progress.total,
      rootEpicId: this.config.rootEpicId,
    });

    // Run main loop
    try {
      await this.runMainLoop();
    } catch (err) {
      if (err instanceof Error && err.message === 'Executor stopped') {
        // Normal stop
      } else {
        throw err;
      }
    }
  }

  /**
   * Stop execution.
   */
  async stop(): Promise<void> {
    if (this.state.status === 'idle') {
      return;
    }

    this.state.status = 'stopping';
    this.abortController?.abort();
    this.validationExecutor.cancelAll();

    this.emit({
      type: 'executor:stopped',
      timestamp: new Date().toISOString(),
      reason: 'interrupted',
      totalIterations: this.state.iteration,
      workItemsCompleted: this.state.completedWorkItems,
    });

    this.state = this.createInitialState();
  }

  /**
   * Pause execution.
   */
  pause(): void {
    if (this.state.status === 'running') {
      this.state.status = 'pausing';
    }
  }

  /**
   * Resume execution.
   */
  resume(): void {
    if (this.state.status === 'paused') {
      this.state.status = 'running';
    }
  }

  /**
   * Main execution loop.
   */
  private async runMainLoop(): Promise<void> {
    while (this.state.status === 'running' || this.state.status === 'pausing') {
      // Check for pause
      if (this.state.status === 'pausing') {
        this.state.status = 'paused';
        continue;
      }

      // Check max iterations
      if (this.state.iteration >= this.config.maxIterations) {
        this.emit({
          type: 'executor:stopped',
          timestamp: new Date().toISOString(),
          reason: 'max_iterations',
          totalIterations: this.state.iteration,
          workItemsCompleted: this.state.completedWorkItems,
        });
        break;
      }

      // Get next work item
      const filter: WorkItemFilter = {
        ...this.config.filter,
        workItemType: this.config.executeTypes,
        excludeIds: [...this.state.failedWorkItemIds],
      };

      const nextItem = await this.tracker.getNextWorkItem(filter);

      if (!nextItem) {
        // Check if all complete
        const progress = await this.tracker.getProgress(this.config.rootEpicId);

        if (progress.completed === progress.total) {
          this.emit({
            type: 'all:complete',
            timestamp: new Date().toISOString(),
            totalIterations: this.state.iteration,
            totalCompleted: progress.completed,
          });
        }

        this.emit({
          type: 'executor:stopped',
          timestamp: new Date().toISOString(),
          reason: progress.completed === progress.total ? 'completed' : 'no_work',
          totalIterations: this.state.iteration,
          workItemsCompleted: this.state.completedWorkItems,
        });
        break;
      }

      // Execute the work item
      this.state.iteration++;
      this.state.currentWorkItem = nextItem;

      this.emit({
        type: 'workitem:selected',
        timestamp: new Date().toISOString(),
        workItem: nextItem,
        depth: nextItem.depth,
        iteration: this.state.iteration,
      });

      await this.executeWorkItem(nextItem);

      // Update progress
      const updatedProgress = await this.tracker.getProgress(
        this.config.rootEpicId
      );
      this.state.completedWorkItems = updatedProgress.completed;

      this.emit({
        type: 'progress:updated',
        timestamp: new Date().toISOString(),
        total: updatedProgress.total,
        completed: updatedProgress.completed,
        percentage: updatedProgress.percentage,
        byLevel: updatedProgress.byLevel,
      });
    }

    this.state = this.createInitialState();
  }

  /**
   * Execute a single work item.
   */
  private async executeWorkItem(workItem: HierarchicalWorkItem): Promise<void> {
    const startTime = Date.now();

    this.emit({
      type: 'workitem:started',
      timestamp: new Date().toISOString(),
      workItem,
      iteration: this.state.iteration,
    });

    // Update status to in_progress
    await this.tracker.updateWorkItemStatus(workItem.id, 'in_progress');

    let retryCount = 0;
    let success = false;

    while (!success && retryCount <= this.config.maxRetries) {
      try {
        // Execute with agent
        // Note: This is a placeholder - actual agent execution would happen here
        // For now, we assume the agent will be called externally and the status
        // will be updated through the tracker

        // Simulate waiting for completion (in real use, this would be async agent execution)
        // await this.executeWithAgent(workItem);

        success = true;

        // Run validation gate if auto-validate is enabled
        if (this.config.autoValidate) {
          const validationResult = await this.runValidation(workItem);
          success = validationResult.passed;

          if (!success) {
            throw new Error(
              `Validation failed: ${validationResult.errors?.join(', ')}`
            );
          }
        }

        // Mark as completed
        await this.tracker.updateWorkItemStatus(workItem.id, 'completed');

        const durationMs = Date.now() - startTime;

        this.emit({
          type: 'workitem:completed',
          timestamp: new Date().toISOString(),
          workItem,
          iteration: this.state.iteration,
          durationMs,
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);

        if (retryCount < this.config.maxRetries) {
          retryCount++;
          await this.delay(this.config.retryDelayMs);
          continue;
        }

        // Handle failure based on strategy
        switch (this.config.errorStrategy) {
          case 'abort':
            await this.tracker.updateWorkItemStatus(workItem.id, 'failed');
            this.emit({
              type: 'workitem:failed',
              timestamp: new Date().toISOString(),
              workItem,
              iteration: this.state.iteration,
              error: errorMessage,
              action: 'abort',
            });
            throw new Error('Executor stopped');

          case 'skip':
            await this.tracker.updateWorkItemStatus(workItem.id, 'failed');
            this.state.failedWorkItemIds.add(workItem.id);
            this.emit({
              type: 'workitem:failed',
              timestamp: new Date().toISOString(),
              workItem,
              iteration: this.state.iteration,
              error: errorMessage,
              action: 'skip',
            });
            return;

          case 'retry':
          default:
            // Already retried max times
            await this.tracker.updateWorkItemStatus(workItem.id, 'failed');
            this.state.failedWorkItemIds.add(workItem.id);
            this.emit({
              type: 'workitem:failed',
              timestamp: new Date().toISOString(),
              workItem,
              iteration: this.state.iteration,
              error: errorMessage,
              action: 'skip',
            });
            return;
        }
      }
    }
  }

  /**
   * Run validation gate for a work item.
   */
  private async runValidation(
    workItem: HierarchicalWorkItem
  ): Promise<ValidationGateExecutionResult> {
    this.emit({
      type: 'validation:started',
      timestamp: new Date().toISOString(),
      workItemId: workItem.id,
      gateType: workItem.validationGate.type,
    });

    const result = await this.validationExecutor.validate(workItem);

    if (result.passed) {
      this.emit({
        type: 'validation:passed',
        timestamp: new Date().toISOString(),
        workItemId: workItem.id,
        result,
      });

      // Trigger rollup check
      await this.checkAndTriggerRollup(workItem.id);
    } else {
      this.emit({
        type: 'validation:failed',
        timestamp: new Date().toISOString(),
        workItemId: workItem.id,
        result,
      });
    }

    return result;
  }

  /**
   * Check and trigger rollup for parent work items.
   */
  private async checkAndTriggerRollup(childId: string): Promise<void> {
    const ancestors = await this.tracker.getAncestors(childId);

    if (ancestors.length === 0) {
      return;
    }

    // Check from immediate parent up
    for (let i = ancestors.length - 1; i >= 0; i--) {
      const parent = ancestors[i];
      if (!parent) continue;

      // Get fresh data
      const freshParent = await this.tracker.getWorkItem(parent.id, true);
      if (!freshParent) continue;

      // Check if all children are complete
      const allChildrenComplete = freshParent.children.every(
        (child) => child.status === 'completed'
      );

      if (!allChildrenComplete) {
        // Can't roll up further
        break;
      }

      this.emit({
        type: 'rollup:triggered',
        timestamp: new Date().toISOString(),
        childId,
        parentId: parent.id,
      });

      // Run validation for parent
      const validationResult = await this.validationExecutor.validate(freshParent);

      const newStatus: WorkItemStatus = validationResult.passed
        ? 'completed'
        : 'failed';
      await this.tracker.updateWorkItemStatus(parent.id, newStatus);

      this.emit({
        type: 'rollup:completed',
        timestamp: new Date().toISOString(),
        parentId: parent.id,
        success: validationResult.passed,
        newStatus,
      });

      if (!validationResult.passed) {
        // Stop rollup on failure
        break;
      }
    }
  }

  /**
   * Helper to delay execution.
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create a hierarchical executor instance.
 */
export function createHierarchicalExecutor(
  tracker: HierarchicalTrackerPlugin,
  agent: AgentPlugin,
  config?: HierarchicalExecutorConfig
): HierarchicalExecutor {
  return new HierarchicalExecutor(tracker, agent, config);
}
