/**
 * ABOUTME: Hierarchical JSON tracker plugin for hierarchical-prd.json files.
 * Supports 5-level work breakdown (Epic -> Feature -> Story -> Task -> Subtask)
 * with validation gates and interface contracts.
 */

import { readFile, writeFile, access, constants } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execSync } from 'node:child_process';
import { BaseTrackerPlugin } from '../../base.js';
import type {
  TrackerPluginMeta,
  TrackerPluginFactory,
  TrackerTask,
  TrackerTaskStatus,
  TaskPriority,
  TaskFilter,
  TaskCompletionResult,
  SetupQuestion,
  HierarchicalTrackerPlugin,
  WorkItemFilter,
  ValidationGateResult,
} from '../../types.js';

import type {
  HierarchicalWorkItem,
  WorkItemType,
  ValidationResult,
  GlobalValidationConfig,
  WorkItemStatus,
} from '../../../../prd/hierarchical-types.js';

import { getParentId } from '../../../../prd/hierarchical-types.js';

import type {
  InterfaceSpec,
  IntegrationContract,
  InterfaceValidationResult,
  ComponentSpec,
} from '../../../../prd/interface-types.js';

import { validateInterfaceDependencies } from '../../../../prd/interface-types.js';

/**
 * Root structure of a hierarchical-prd.json file.
 */
interface HierarchicalPrdJson {
  /** Name of the project or feature */
  name: string;

  /** Slugified name for file naming */
  slug: string;

  /** High-level description */
  description: string;

  /** Git branch name */
  branchName: string;

  /** Creation timestamp (ISO 8601) */
  createdAt: string;

  /** Last update timestamp (ISO 8601) */
  updatedAt?: string;

  /** PRD version (always '2.0' for hierarchical) */
  version: '2.0';

  /** Top-level work items (Epics) */
  workBreakdown: HierarchicalWorkItem[];

  /** Global interface definitions */
  interfaces: InterfaceSpec[];

  /** Integration contracts */
  integrationContracts: IntegrationContract[];

  /** Global validation settings */
  globalValidation: GlobalValidationConfig;

  /** Optional metadata */
  targetUsers?: string;
  problemStatement?: string;
  solution?: string;
  successMetrics?: string;
  constraints?: string;
  technicalNotes?: string;

  /** Validation history storage */
  validationHistory?: Record<string, ValidationResult[]>;
}

/** Template cache */
let templateCache: string | null = null;

/** Fallback template for hierarchical tracker */
const FALLBACK_TEMPLATE = `## Your Task: {{taskId}} - {{taskTitle}}

{{#if taskDescription}}
### Description
{{taskDescription}}
{{/if}}

{{#if acceptanceCriteria}}
### Acceptance Criteria
{{acceptanceCriteria}}
{{/if}}

{{#if parentContext}}
### Context
Parent: {{parentContext.title}} ({{parentContext.id}})
{{/if}}

## Workflow
1. Implement this {{workItemType}} following acceptance criteria
2. Run quality checks
3. Commit with: \`feat: {{taskId}} - {{taskTitle}}\`
4. Signal completion with: <promise>COMPLETE</promise>
`;

/**
 * Convert WorkItemStatus to TrackerTaskStatus.
 */
function mapWorkItemStatus(status: WorkItemStatus): TrackerTaskStatus {
  switch (status) {
    case 'open':
      return 'open';
    case 'in_progress':
      return 'in_progress';
    case 'blocked':
      return 'blocked';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'blocked'; // Map failed to blocked for engine compatibility
    default:
      return 'open';
  }
}

/**
 * Convert TrackerTaskStatus to WorkItemStatus.
 */
function mapTrackerStatus(status: TrackerTaskStatus): WorkItemStatus {
  switch (status) {
    case 'open':
      return 'open';
    case 'in_progress':
      return 'in_progress';
    case 'blocked':
      return 'blocked';
    case 'completed':
      return 'completed';
    case 'cancelled':
      return 'completed';
    default:
      return 'open';
  }
}

/**
 * Convert priority to TaskPriority (0-4).
 */
function mapPriority(priority: number): TaskPriority {
  const clamped = Math.max(0, Math.min(4, priority));
  return clamped as TaskPriority;
}

/**
 * Convert HierarchicalWorkItem to TrackerTask.
 */
function workItemToTask(item: HierarchicalWorkItem): TrackerTask {
  return {
    id: item.id,
    title: item.title,
    status: mapWorkItemStatus(item.status),
    priority: mapPriority(item.priority),
    description: item.description,
    labels: item.labels,
    type: item.type,
    parentId: item.parentId,
    dependsOn: item.dependsOn,
    blocks: item.blocks,
    assignee: item.assignee,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    metadata: {
      acceptanceCriteria: item.acceptanceCriteria,
      depth: item.depth,
      estimatedEffort: item.estimatedEffort,
      validationGate: item.validationGate,
      componentSpec: item.componentSpec,
      childCount: item.children.length,
    },
  };
}

/**
 * Hierarchical JSON tracker plugin implementation.
 */
export class HierarchicalJsonTrackerPlugin
  extends BaseTrackerPlugin
  implements HierarchicalTrackerPlugin
{
  readonly meta: TrackerPluginMeta = {
    id: 'hierarchical-json',
    name: '계층적 JSON 트래커',
    description: '5단계 계층적 작업 분해를 지원하는 hierarchical-prd.json 트래커',
    version: '1.0.0',
    supportsBidirectionalSync: false,
    supportsHierarchy: true,
    supportsDependencies: true,
  };

  readonly supportsHierarchicalOperations = true as const;

  private filePath: string = '';
  private prdCache: HierarchicalPrdJson | null = null;
  private cacheTime: number = 0;
  private readonly CACHE_TTL_MS = 1000;
  private epicId: string = '';

  override async initialize(config: Record<string, unknown>): Promise<void> {
    await super.initialize(config);

    // Accept both 'path' and 'prdPath' for compatibility
    const configPath = config.path ?? config.prdPath;
    if (typeof configPath === 'string') {
      this.filePath = resolve(configPath);
    }

    if (this.filePath) {
      try {
        await access(this.filePath, constants.R_OK | constants.W_OK);
        this.ready = true;
      } catch {
        this.ready = false;
      }
    }
  }

  override async isReady(): Promise<boolean> {
    if (!this.filePath) {
      return false;
    }

    try {
      await access(this.filePath, constants.R_OK | constants.W_OK);
      this.ready = true;
      return true;
    } catch {
      this.ready = false;
      return false;
    }
  }

  getSetupQuestions(): SetupQuestion[] {
    return [];
  }

  override async validateSetup(
    _answers: Record<string, unknown>
  ): Promise<string | null> {
    return null;
  }

  /**
   * Read and parse the hierarchical PRD file.
   */
  private async readPrd(): Promise<HierarchicalPrdJson> {
    const now = Date.now();

    if (this.prdCache && now - this.cacheTime < this.CACHE_TTL_MS) {
      return this.prdCache;
    }

    const content = await readFile(this.filePath, 'utf-8');
    const parsed = JSON.parse(content) as HierarchicalPrdJson;

    // Validate version
    if (parsed.version !== '2.0') {
      throw new Error(
        `Invalid hierarchical PRD version: ${parsed.version}. Expected 2.0.`
      );
    }

    this.prdCache = parsed;
    this.cacheTime = now;

    return this.prdCache;
  }

  /**
   * Write the hierarchical PRD file.
   */
  private async writePrd(prd: HierarchicalPrdJson): Promise<void> {
    prd.updatedAt = new Date().toISOString();
    const content = JSON.stringify(prd, null, 2);
    await writeFile(this.filePath, content, 'utf-8');
    this.prdCache = prd;
    this.cacheTime = Date.now();
  }

  /**
   * Flatten work items into a flat array for task-based operations.
   */
  private flattenWorkItems(items: HierarchicalWorkItem[]): HierarchicalWorkItem[] {
    const result: HierarchicalWorkItem[] = [];

    function flatten(items: HierarchicalWorkItem[]): void {
      for (const item of items) {
        result.push(item);
        if (item.children.length > 0) {
          flatten(item.children);
        }
      }
    }

    flatten(items);
    return result;
  }

  /**
   * Find a work item by ID in the tree.
   */
  private findWorkItemInTree(
    items: HierarchicalWorkItem[],
    id: string
  ): HierarchicalWorkItem | undefined {
    for (const item of items) {
      if (item.id === id) {
        return item;
      }
      if (item.children.length > 0) {
        const found = this.findWorkItemInTree(item.children, id);
        if (found) {
          return found;
        }
      }
    }
    return undefined;
  }

  /**
   * Update a work item in the tree.
   */
  private updateWorkItemInTree(
    items: HierarchicalWorkItem[],
    id: string,
    updater: (item: HierarchicalWorkItem) => HierarchicalWorkItem
  ): boolean {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item) continue;

      if (item.id === id) {
        items[i] = updater(item);
        return true;
      }
      if (item.children.length > 0) {
        if (this.updateWorkItemInTree(item.children, id, updater)) {
          return true;
        }
      }
    }
    return false;
  }

  // ==========================================================================
  // TrackerPlugin interface implementation
  // ==========================================================================

  async getTasks(filter?: TaskFilter): Promise<TrackerTask[]> {
    if (!this.filePath) {
      return [];
    }

    try {
      const prd = await this.readPrd();
      const allItems = this.flattenWorkItems(prd.workBreakdown);
      const tasks = allItems.map(workItemToTask);
      return this.filterTasks(tasks, filter);
    } catch (err) {
      console.error('Failed to read hierarchical PRD:', err);
      return [];
    }
  }

  override async getTask(id: string): Promise<TrackerTask | undefined> {
    const tasks = await this.getTasks();
    return tasks.find((t) => t.id === id);
  }

  override async getNextTask(filter?: TaskFilter): Promise<TrackerTask | undefined> {
    // For hierarchical tracker, we prefer the deepest executable items first
    const nextWorkItem = await this.getNextWorkItem(filter as WorkItemFilter);
    return nextWorkItem ? workItemToTask(nextWorkItem) : undefined;
  }

  async completeTask(id: string, reason?: string): Promise<TaskCompletionResult> {
    try {
      const prd = await this.readPrd();
      const item = this.findWorkItemInTree(prd.workBreakdown, id);

      if (!item) {
        return {
          success: false,
          message: `Work item ${id} not found`,
          error: 'Work item not found',
        };
      }

      // Update status
      this.updateWorkItemInTree(prd.workBreakdown, id, (item) => ({
        ...item,
        status: 'completed' as WorkItemStatus,
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));

      // Trigger rollup check for parent
      await this.checkAndRollup(prd, id);

      await this.writePrd(prd);

      const updatedItem = this.findWorkItemInTree(prd.workBreakdown, id);

      return {
        success: true,
        message: `Work item ${id} marked as complete${reason ? `: ${reason}` : ''}`,
        task: updatedItem ? workItemToTask(updatedItem) : undefined,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        message: `Failed to complete work item ${id}`,
        error: message,
      };
    }
  }

  async updateTaskStatus(
    id: string,
    status: TrackerTaskStatus
  ): Promise<TrackerTask | undefined> {
    const result = await this.updateWorkItemStatus(id, mapTrackerStatus(status));
    return result ? workItemToTask(result) : undefined;
  }

  override async isComplete(filter?: TaskFilter): Promise<boolean> {
    const tasks = await this.getTasks(filter);
    return tasks.every(
      (t) => t.status === 'completed' || t.status === 'cancelled'
    );
  }

  override async getEpics(): Promise<TrackerTask[]> {
    if (!this.filePath) {
      return [];
    }

    try {
      const prd = await this.readPrd();
      return prd.workBreakdown
        .filter((item) => item.type === 'epic')
        .map(workItemToTask);
    } catch (err) {
      console.error('Failed to get epics:', err);
      return [];
    }
  }

  setEpicId(epicId: string): void {
    this.epicId = epicId;
  }

  getEpicId(): string {
    return this.epicId;
  }

  override getTemplate(): string {
    if (templateCache !== null) {
      return templateCache;
    }

    const templatePath = join(__dirname, 'template.hbs');
    try {
      templateCache = readFileSync(templatePath, 'utf-8');
      return templateCache;
    } catch {
      templateCache = FALLBACK_TEMPLATE;
      return templateCache;
    }
  }

  async getPrdContext(): Promise<{
    name: string;
    description?: string;
    content: string;
    completedCount: number;
    totalCount: number;
  } | null> {
    if (!this.filePath) {
      return null;
    }

    try {
      const prd = await this.readPrd();
      const allItems = this.flattenWorkItems(prd.workBreakdown);
      const completedCount = allItems.filter(
        (i) => i.status === 'completed'
      ).length;

      return {
        name: prd.name,
        description: prd.description,
        content: '', // Could load source PRD if needed
        completedCount,
        totalCount: allItems.length,
      };
    } catch {
      return null;
    }
  }

  // ==========================================================================
  // HierarchicalTrackerPlugin interface implementation
  // ==========================================================================

  async getWorkItemTree(rootId?: string): Promise<HierarchicalWorkItem[]> {
    const prd = await this.readPrd();

    if (rootId) {
      const item = this.findWorkItemInTree(prd.workBreakdown, rootId);
      return item ? [item] : [];
    }

    return prd.workBreakdown;
  }

  async getWorkItemsByLevel(
    level: WorkItemType,
    _filter?: WorkItemFilter
  ): Promise<HierarchicalWorkItem[]> {
    const prd = await this.readPrd();
    const allItems = this.flattenWorkItems(prd.workBreakdown);
    return allItems.filter((item) => item.type === level);
  }

  async getWorkItem(
    id: string,
    _includeChildren?: boolean
  ): Promise<HierarchicalWorkItem | undefined> {
    const prd = await this.readPrd();
    return this.findWorkItemInTree(prd.workBreakdown, id);
  }

  async getNextWorkItem(
    filter?: WorkItemFilter
  ): Promise<HierarchicalWorkItem | undefined> {
    const prd = await this.readPrd();
    const allItems = this.flattenWorkItems(prd.workBreakdown);

    // Filter to open items
    let candidates = allItems.filter((item) => item.status === 'open');

    // Apply depth filter
    if (filter?.depth !== undefined) {
      const depths = Array.isArray(filter.depth) ? filter.depth : [filter.depth];
      candidates = candidates.filter((item) => depths.includes(item.depth));
    }

    // Apply work item type filter
    if (filter?.workItemType) {
      const types = Array.isArray(filter.workItemType)
        ? filter.workItemType
        : [filter.workItemType];
      candidates = candidates.filter((item) => types.includes(item.type));
    }

    // Filter ready items (no unresolved dependencies)
    candidates = candidates.filter((item) => {
      if (!item.dependsOn || item.dependsOn.length === 0) {
        return true;
      }

      // Check all dependencies are completed
      return item.dependsOn.every((depId) => {
        const dep = this.findWorkItemInTree(prd.workBreakdown, depId);
        return dep?.status === 'completed';
      });
    });

    // Filter items whose children are all complete (leaf items or items with completed children)
    candidates = candidates.filter((item) => {
      if (item.children.length === 0) {
        return true; // Leaf node - can execute
      }

      // For non-leaf nodes, all children must be completed
      return item.children.every((child) => child.status === 'completed');
    });

    if (candidates.length === 0) {
      return undefined;
    }

    // Sort by depth (deepest first) then by priority
    candidates.sort((a, b) => {
      if (b.depth !== a.depth) {
        return b.depth - a.depth; // Deeper items first
      }
      return a.priority - b.priority; // Lower priority number = higher priority
    });

    return candidates[0];
  }

  async runValidationGate(id: string): Promise<ValidationGateResult> {
    const prd = await this.readPrd();
    const item = this.findWorkItemInTree(prd.workBreakdown, id);

    if (!item) {
      throw new Error(`Work item ${id} not found`);
    }

    const gate = item.validationGate;
    const startTime = Date.now();
    const errors: string[] = [];
    let passed = true;
    let failedCommand: string | undefined;

    // Update gate status to running
    this.updateWorkItemInTree(prd.workBreakdown, id, (item) => ({
      ...item,
      validationGate: {
        ...item.validationGate,
        status: 'running',
      },
    }));
    await this.writePrd(prd);

    // Execute validation commands
    for (const command of gate.commands) {
      try {
        execSync(command, {
          cwd: process.cwd(),
          stdio: 'pipe',
          encoding: 'utf-8',
        });
      } catch (err) {
        passed = false;
        failedCommand = command;
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`Command failed: ${command}\n${message}`);
        break;
      }
    }

    // Check children completion for non-leaf nodes
    if (passed && item.children.length > 0) {
      const allChildrenComplete = item.children.every(
        (child) => child.status === 'completed'
      );
      if (!allChildrenComplete) {
        passed = false;
        errors.push('Not all children are completed');
      }
    }

    const result: ValidationResult = {
      passed,
      failedCommand,
      errors: errors.length > 0 ? errors : undefined,
      executedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
    };

    // Update gate with result
    const newStatus: WorkItemStatus = passed ? 'completed' : 'failed';

    this.updateWorkItemInTree(prd.workBreakdown, id, (item) => ({
      ...item,
      status: newStatus,
      validationGate: {
        ...item.validationGate,
        status: passed ? 'passed' : 'failed',
        executedAt: result.executedAt,
        result,
      },
      updatedAt: new Date().toISOString(),
      completedAt: passed ? new Date().toISOString() : undefined,
    }));

    // Store in validation history
    if (!prd.validationHistory) {
      prd.validationHistory = {};
    }
    if (!prd.validationHistory[id]) {
      prd.validationHistory[id] = [];
    }
    prd.validationHistory[id].unshift(result);
    // Keep last 10 entries
    prd.validationHistory[id] = prd.validationHistory[id].slice(0, 10);

    await this.writePrd(prd);

    return {
      workItemId: id,
      gateType: gate.type,
      result,
      statusUpdated: true,
      newStatus,
    };
  }

  async getValidationHistory(
    id: string,
    limit: number = 10
  ): Promise<ValidationResult[]> {
    const prd = await this.readPrd();
    const history = prd.validationHistory?.[id] || [];
    return history.slice(0, limit);
  }

  async validateInterfaces(): Promise<InterfaceValidationResult> {
    const prd = await this.readPrd();
    const allItems = this.flattenWorkItems(prd.workBreakdown);

    // Collect all component specs
    const componentSpecs: ComponentSpec[] = [];
    for (const item of allItems) {
      if (item.componentSpec) {
        componentSpecs.push({
          name: item.componentSpec.name,
          provides: item.componentSpec.provides,
          requires: item.componentSpec.requires.map((r) => ({
            interface: r.interface,
            providedBy: r.providedBy,
            optional: r.optional,
          })),
          dependencies: item.componentSpec.dependencies,
        });
      }
    }

    return validateInterfaceDependencies(componentSpecs, prd.interfaces);
  }

  async getAncestors(id: string): Promise<HierarchicalWorkItem[]> {
    const prd = await this.readPrd();
    const ancestors: HierarchicalWorkItem[] = [];

    let currentId: string | null = id;
    while (currentId) {
      const parentId = getParentId(currentId);
      if (parentId) {
        const parent = this.findWorkItemInTree(prd.workBreakdown, parentId);
        if (parent) {
          ancestors.unshift(parent);
        }
      }
      currentId = parentId;
    }

    return ancestors;
  }

  async updateWorkItemStatus(
    id: string,
    status: WorkItemStatus
  ): Promise<HierarchicalWorkItem | undefined> {
    const prd = await this.readPrd();

    const updated = this.updateWorkItemInTree(prd.workBreakdown, id, (item) => ({
      ...item,
      status,
      updatedAt: new Date().toISOString(),
      completedAt: status === 'completed' ? new Date().toISOString() : undefined,
    }));

    if (!updated) {
      return undefined;
    }

    // Trigger rollup if completing
    if (status === 'completed') {
      await this.checkAndRollup(prd, id);
    }

    await this.writePrd(prd);

    return this.findWorkItemInTree(prd.workBreakdown, id);
  }

  async getProgress(id?: string): Promise<{
    total: number;
    completed: number;
    inProgress: number;
    blocked: number;
    failed: number;
    percentage: number;
    byLevel: Record<WorkItemType, { total: number; completed: number }>;
  }> {
    const prd = await this.readPrd();

    let items: HierarchicalWorkItem[];
    if (id) {
      const root = this.findWorkItemInTree(prd.workBreakdown, id);
      items = root ? this.flattenWorkItems([root]) : [];
    } else {
      items = this.flattenWorkItems(prd.workBreakdown);
    }

    const byLevel: Record<WorkItemType, { total: number; completed: number }> = {
      epic: { total: 0, completed: 0 },
      feature: { total: 0, completed: 0 },
      story: { total: 0, completed: 0 },
      task: { total: 0, completed: 0 },
      subtask: { total: 0, completed: 0 },
    };

    let completed = 0;
    let inProgress = 0;
    let blocked = 0;
    let failed = 0;

    for (const item of items) {
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
    }

    const total = items.length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      total,
      completed,
      inProgress,
      blocked,
      failed,
      percentage,
      byLevel,
    };
  }

  // ==========================================================================
  // Private helper methods
  // ==========================================================================

  /**
   * Check if parent can be completed and trigger rollup.
   */
  private async checkAndRollup(
    prd: HierarchicalPrdJson,
    childId: string
  ): Promise<void> {
    const parentId = getParentId(childId);
    if (!parentId) {
      return;
    }

    const parent = this.findWorkItemInTree(prd.workBreakdown, parentId);
    if (!parent) {
      return;
    }

    // Check if all children are completed
    const allChildrenComplete = parent.children.every(
      (child) => child.status === 'completed'
    );

    if (allChildrenComplete) {
      // Auto-run validation gate
      const gateResult = await this.runValidationGate(parentId);

      // If gate passed, recursively check parent's parent
      if (gateResult.result.passed) {
        await this.checkAndRollup(prd, parentId);
      }
    }
  }

  /**
   * Set file path and reinitialize.
   */
  async setFilePath(path: string): Promise<boolean> {
    const resolvedPath = resolve(path);
    try {
      await access(resolvedPath, constants.R_OK | constants.W_OK);
      this.filePath = resolvedPath;
      this.prdCache = null;
      this.cacheTime = 0;
      this.ready = true;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get current file path.
   */
  getFilePath(): string {
    return this.filePath;
  }
}

/**
 * Factory function for the hierarchical JSON tracker plugin.
 */
const createHierarchicalJsonTracker: TrackerPluginFactory = () =>
  new HierarchicalJsonTrackerPlugin();

export default createHierarchicalJsonTracker;
