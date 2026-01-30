/**
 * ABOUTME: Type definitions for hierarchical work item decomposition.
 * Defines the 5-level hierarchy (Epic -> Feature -> Story -> Task -> Subtask)
 * and validation gate system for ensuring quality at each level.
 */

/**
 * Work item type representing the 5-level hierarchy.
 * - epic: Large-scale system/feature (2+ weeks)
 * - feature: Independent functional unit (3-5 days)
 * - story: User-facing functionality (1 day or less)
 * - task: Development work unit (2-4 hours)
 * - subtask: Minimum work unit (1 hour or less)
 */
export type WorkItemType = 'epic' | 'feature' | 'story' | 'task' | 'subtask';

/**
 * Depth level for each work item type.
 * Used to determine the position in the hierarchy.
 */
export const WORK_ITEM_DEPTH: Record<WorkItemType, number> = {
  epic: 0,
  feature: 1,
  story: 2,
  task: 3,
  subtask: 4,
};

/**
 * Validation gate type corresponding to each work item level.
 */
export type ValidationGateType =
  | 'subtask-gate'
  | 'task-gate'
  | 'story-gate'
  | 'feature-gate'
  | 'epic-gate';

/**
 * Maps work item type to its corresponding validation gate type.
 */
export const WORK_ITEM_TO_GATE: Record<WorkItemType, ValidationGateType> = {
  subtask: 'subtask-gate',
  task: 'task-gate',
  story: 'story-gate',
  feature: 'feature-gate',
  epic: 'epic-gate',
};

/**
 * Status of a validation gate execution.
 */
export type ValidationGateStatus =
  | 'pending'
  | 'running'
  | 'passed'
  | 'failed'
  | 'skipped';

/**
 * Result of a validation gate execution.
 */
export interface ValidationResult {
  /** Whether the validation passed */
  passed: boolean;

  /** Command that failed (if any) */
  failedCommand?: string;

  /** Command output */
  output?: string;

  /** Human-readable failure reason */
  reason?: string;

  /** Detailed error messages */
  errors?: string[];

  /** Timestamp of execution (ISO 8601) */
  executedAt: string;

  /** Duration in milliseconds */
  durationMs?: number;
}

/**
 * Validation gate configuration and state.
 * Each work item has a validation gate that runs when all children are complete.
 */
export interface ValidationGate {
  /** Gate type corresponding to the work item level */
  type: ValidationGateType;

  /** Current status of the gate */
  status: ValidationGateStatus;

  /** Commands to execute for validation (e.g., ["bun run typecheck"]) */
  commands: string[];

  /** Human-readable criteria for passing (documentation purposes) */
  criteria: string[];

  /** When the gate was last executed (ISO 8601) */
  executedAt?: string;

  /** Result of the last execution */
  result?: ValidationResult;
}

/**
 * Status of a hierarchical work item.
 */
export type WorkItemStatus =
  | 'open'
  | 'in_progress'
  | 'blocked'
  | 'completed'
  | 'failed';

/**
 * Effort estimation size (t-shirt sizing).
 */
export type EffortSize = 'xs' | 's' | 'm' | 'l' | 'xl';

/**
 * Import interface type for component specs.
 * Defined here to avoid circular dependency with interface-types.ts
 */
export interface ComponentSpecRef {
  /** Component name (e.g., PlayerMovement) */
  name: string;

  /** Interface names this component provides */
  provides: string[];

  /** Required interfaces with their providers */
  requires: RequiredInterfaceRef[];

  /** Framework dependencies (e.g., Rigidbody2D, Animator) */
  dependencies?: string[];
}

/**
 * Reference to a required interface.
 */
export interface RequiredInterfaceRef {
  /** Interface name (e.g., IInputProvider) */
  interface: string;

  /** Work item ID that provides this interface */
  providedBy?: string;

  /** Whether this interface is optional */
  optional?: boolean;
}

/**
 * Hierarchical work item representing any level in the 5-level hierarchy.
 * The structure is recursive - each item can have children of the next level.
 */
export interface HierarchicalWorkItem {
  /** Unique identifier using hierarchical format (e.g., E-001, F-001.1, S-001.1.1) */
  id: string;

  /** Type indicating the level in the hierarchy */
  type: WorkItemType;

  /** Short title describing the work item */
  title: string;

  /** Detailed description of what needs to be done */
  description: string;

  /** Current status */
  status: WorkItemStatus;

  /** Priority level (0 = critical, 4 = backlog) */
  priority: number;

  // Hierarchy structure

  /** Parent work item ID (undefined for epics) */
  parentId?: string;

  /** Child work items (next level down in hierarchy) */
  children: HierarchicalWorkItem[];

  /** Depth in the hierarchy (0 = Epic, 4 = Subtask) */
  depth: number;

  // Dependencies

  /** IDs of work items this item depends on (must complete first) */
  dependsOn?: string[];

  /** IDs of work items that depend on this item */
  blocks?: string[];

  // Validation

  /** Validation gate for this work item */
  validationGate: ValidationGate;

  // Interface specification (Feature/Story level)

  /** Component specification for interface contracts */
  componentSpec?: ComponentSpecRef;

  // Metadata

  /** Acceptance criteria (primarily for Story level) */
  acceptanceCriteria?: string[];

  /** Labels/tags for categorization */
  labels?: string[];

  /** Estimated effort (t-shirt sizing) */
  estimatedEffort?: EffortSize;

  /** Assigned developer/team */
  assignee?: string;

  /** Creation timestamp (ISO 8601) */
  createdAt?: string;

  /** Last update timestamp (ISO 8601) */
  updatedAt?: string;

  /** Completion timestamp (ISO 8601) */
  completedAt?: string;
}

/**
 * Global validation configuration for all work item types.
 * Provides default commands and criteria for each level.
 */
export interface GlobalValidationConfig {
  /** Default validation commands per work item type */
  commands: Record<WorkItemType, string[]>;

  /** Default validation criteria per work item type (human-readable) */
  criteria: Record<WorkItemType, string[]>;
}

/**
 * Default global validation configuration.
 * Can be customized per project in the PRD.
 */
export const DEFAULT_GLOBAL_VALIDATION: GlobalValidationConfig = {
  commands: {
    subtask: ['bun run typecheck'],
    task: ['bun run typecheck', 'bun run test'],
    story: ['bun run test:integration'],
    feature: ['bun run test:e2e'],
    epic: ['bun run test:all', 'bun run build'],
  },
  criteria: {
    subtask: ['코드 컴파일 성공'],
    task: ['관련 단위 테스트 통과'],
    story: ['모든 수용 기준 충족'],
    feature: ['인터페이스 계약 충족', 'E2E 테스트 통과'],
    epic: ['전체 시스템 통합 완료', '성능 기준 충족'],
  },
};

/**
 * ID prefix patterns for each work item type.
 */
export const WORK_ITEM_ID_PREFIX: Record<WorkItemType, string> = {
  epic: 'E-',
  feature: 'F-',
  story: 'S-',
  task: 'T-',
  subtask: 'ST-',
};

/**
 * Parse a hierarchical work item ID to extract its components.
 * @param id The full hierarchical ID (e.g., "F-001.2.3")
 * @returns Parsed components or null if invalid
 */
export function parseWorkItemId(id: string): {
  type: WorkItemType;
  segments: number[];
} | null {
  // Check each prefix
  for (const [type, prefix] of Object.entries(WORK_ITEM_ID_PREFIX)) {
    if (id.startsWith(prefix)) {
      const remainder = id.slice(prefix.length);
      const segments = remainder.split('.').map(Number);

      // Validate all segments are valid numbers
      if (segments.every((n) => !isNaN(n) && n > 0)) {
        return { type: type as WorkItemType, segments };
      }
    }
  }

  return null;
}

/**
 * Generate the next child ID for a parent work item.
 * @param parent The parent work item
 * @param childType The type of child to create
 * @returns The next available child ID
 */
export function generateChildId(
  parent: HierarchicalWorkItem,
  childType: WorkItemType
): string {
  const prefix = WORK_ITEM_ID_PREFIX[childType];
  const parsed = parseWorkItemId(parent.id);

  if (!parsed) {
    throw new Error(`Invalid parent ID: ${parent.id}`);
  }

  // Find the highest existing child number
  const childNumbers = parent.children
    .map((child) => {
      const childParsed = parseWorkItemId(child.id);
      if (childParsed) {
        return childParsed.segments[childParsed.segments.length - 1];
      }
      return 0;
    })
    .filter((n) => n > 0);

  const nextNumber = childNumbers.length > 0 ? Math.max(...childNumbers) + 1 : 1;

  // Build the new ID
  const newSegments = [...parsed.segments, nextNumber];
  return `${prefix}${newSegments.join('.')}`;
}

/**
 * Get the parent ID from a child work item ID.
 * @param childId The child work item ID
 * @returns The parent ID or null if it's a top-level item
 */
export function getParentId(childId: string): string | null {
  const parsed = parseWorkItemId(childId);
  if (!parsed || parsed.segments.length <= 1) {
    return null;
  }

  // Get the parent type (one level up)
  const parentDepth = WORK_ITEM_DEPTH[parsed.type] - 1;
  const parentType = (Object.entries(WORK_ITEM_DEPTH).find(
    ([, depth]) => depth === parentDepth
  )?.[0] ?? null) as WorkItemType | null;

  if (!parentType) {
    return null;
  }

  const parentPrefix = WORK_ITEM_ID_PREFIX[parentType];
  const parentSegments = parsed.segments.slice(0, -1);

  return `${parentPrefix}${parentSegments.join('.')}`;
}

/**
 * Create a default validation gate for a work item type.
 * @param type The work item type
 * @param globalConfig Optional global validation config
 * @returns A new validation gate with default settings
 */
export function createDefaultValidationGate(
  type: WorkItemType,
  globalConfig: GlobalValidationConfig = DEFAULT_GLOBAL_VALIDATION
): ValidationGate {
  return {
    type: WORK_ITEM_TO_GATE[type],
    status: 'pending',
    commands: [...globalConfig.commands[type]],
    criteria: [...globalConfig.criteria[type]],
  };
}

/**
 * Calculate completion percentage for a work item based on its children.
 * @param item The work item to calculate percentage for
 * @returns Completion percentage (0-100)
 */
export function calculateCompletionPercentage(item: HierarchicalWorkItem): number {
  if (item.children.length === 0) {
    // Leaf node - based on status
    return item.status === 'completed' ? 100 : 0;
  }

  // Calculate based on children
  const totalChildren = item.children.length;
  const completedChildren = item.children.filter(
    (child) => child.status === 'completed'
  ).length;

  // Include partial completion from in-progress children
  const inProgressChildren = item.children.filter(
    (child) => child.status === 'in_progress'
  );

  let partialProgress = 0;
  for (const child of inProgressChildren) {
    partialProgress += calculateCompletionPercentage(child) / 100;
  }

  return Math.round(((completedChildren + partialProgress) / totalChildren) * 100);
}
