/**
 * ABOUTME: Type definitions for the PRD creation command.
 * Defines the structure for PRD documents, clarifying questions, and generation options.
 * Includes both legacy flat structure and new hierarchical work breakdown structure.
 */

// Re-export hierarchical types for convenience
export type {
  WorkItemType,
  ValidationGateType,
  ValidationGateStatus,
  ValidationResult,
  ValidationGate,
  WorkItemStatus,
  EffortSize,
  ComponentSpecRef,
  RequiredInterfaceRef,
  HierarchicalWorkItem,
  GlobalValidationConfig,
} from './hierarchical-types.js';

export {
  WORK_ITEM_DEPTH,
  WORK_ITEM_TO_GATE,
  WORK_ITEM_ID_PREFIX,
  DEFAULT_GLOBAL_VALIDATION,
  parseWorkItemId,
  generateChildId,
  getParentId,
  createDefaultValidationGate,
  calculateCompletionPercentage,
} from './hierarchical-types.js';

// Re-export interface types for convenience
export type {
  InterfaceParameter,
  InterfaceMethod,
  InterfaceProperty,
  InterfaceEvent,
  InterfaceSpec,
  RequiredInterface,
  ComponentSpec,
  ContractParticipant,
  IntegrationTestScenario,
  IntegrationContract,
  InterfaceValidationResult,
} from './interface-types.js';

export {
  createInterfaceSpec,
  createComponentSpec,
  createIntegrationContract,
  validateInterfaceDependencies,
} from './interface-types.js';

/**
 * A single clarifying question asked during PRD creation.
 */
export interface ClarifyingQuestion {
  /** Unique identifier for the question */
  id: string;

  /** The question text to display */
  question: string;

  /** Category of the question (helps organize the PRD) */
  category: 'scope' | 'users' | 'requirements' | 'constraints' | 'success';

  /** Optional follow-up prompt if the answer is too brief */
  followUp?: string;
}

/**
 * Collected answers from the clarifying questions.
 */
export interface ClarifyingAnswers {
  /** Feature description provided by the user */
  featureDescription: string;

  /** Answers keyed by question ID */
  answers: Record<string, string>;
}

/**
 * A user story extracted/generated for the PRD.
 */
export interface PrdUserStory {
  /** Unique story identifier (e.g., "US-001") */
  id: string;

  /** Short title of the user story */
  title: string;

  /** Full description of the user story */
  description: string;

  /** List of acceptance criteria */
  acceptanceCriteria: string[];

  /** Priority level (1 = highest, 4 = lowest) */
  priority: number;

  /** Labels or tags */
  labels?: string[];

  /** Dependencies - story IDs this story depends on */
  dependsOn?: string[];
}

/**
 * Generated PRD document structure.
 */
export interface GeneratedPrd {
  /** Name/title of the feature */
  name: string;

  /** Slugified version of the name for file naming */
  slug: string;

  /** High-level description/summary */
  description: string;

  /** Target users and personas */
  targetUsers: string;

  /** Problem statement / why this feature is needed */
  problemStatement: string;

  /** Proposed solution overview */
  solution: string;

  /** Success metrics / how we'll measure completion */
  successMetrics: string;

  /** Constraints or limitations */
  constraints: string;

  /** Detailed user stories */
  userStories: PrdUserStory[];

  /** Technical considerations (optional) */
  technicalNotes?: string;

  /** Git branch name suggestion */
  branchName: string;

  /** Creation timestamp */
  createdAt: string;
}

/**
 * Options for PRD generation.
 */
export interface PrdGenerationOptions {
  /** Working directory (default: process.cwd()) */
  cwd?: string;

  /** Number of user stories to generate (default: 5) */
  storyCount?: number;

  /** Output directory (default: ./tasks) */
  outputDir?: string;

  /** Whether to also generate prd.json format */
  generateJson?: boolean;

  /** Story ID prefix (default: "US-") */
  storyPrefix?: string;

  /** Skip confirmation prompts */
  force?: boolean;
}

/**
 * Result of PRD generation.
 */
export interface PrdGenerationResult {
  /** Whether generation was successful */
  success: boolean;

  /** Path to the generated markdown PRD */
  markdownPath?: string;

  /** Path to the generated JSON PRD (if generateJson was true) */
  jsonPath?: string;

  /** The generated PRD content */
  prd?: GeneratedPrd;

  /** Error message if generation failed */
  error?: string;

  /** Whether the user cancelled the operation */
  cancelled?: boolean;
}

/**
 * Tracker format conversion options.
 */
export type TrackerFormat = 'json' | 'beads';

/**
 * Result of tracker format conversion.
 */
export interface ConversionResult {
  /** Whether conversion was successful */
  success: boolean;

  /** Path to the converted file */
  path?: string;

  /** Target format */
  format: TrackerFormat;

  /** Error message if conversion failed */
  error?: string;
}

// =============================================================================
// Hierarchical PRD Types (v2.0)
// =============================================================================

import type {
  HierarchicalWorkItem,
  GlobalValidationConfig,
} from './hierarchical-types.js';

import type {
  InterfaceSpec,
  IntegrationContract,
} from './interface-types.js';

/**
 * PRD version identifier.
 * - '1.0': Legacy flat structure with user stories
 * - '2.0': Hierarchical work breakdown structure
 */
export type PrdVersion = '1.0' | '2.0';

/**
 * Hierarchical PRD document structure (v2.0).
 * Supports 5-level work breakdown with validation gates
 * and interface contracts for component integration.
 */
export interface HierarchicalPrd {
  // Metadata

  /** Name/title of the feature or project */
  name: string;

  /** Slugified version of the name for file naming */
  slug: string;

  /** High-level description/summary */
  description: string;

  /** Git branch name for development */
  branchName: string;

  /** Creation timestamp (ISO 8601) */
  createdAt: string;

  /** Last update timestamp (ISO 8601) */
  updatedAt?: string;

  /** PRD version (always '2.0' for hierarchical PRDs) */
  version: '2.0';

  // Hierarchical work breakdown

  /**
   * Top-level work items (Epics).
   * Each epic contains features, stories, tasks, and subtasks.
   */
  workBreakdown: HierarchicalWorkItem[];

  // Interface registry

  /**
   * Global interface definitions.
   * Components in the work breakdown reference these interfaces.
   */
  interfaces: InterfaceSpec[];

  // Integration contracts

  /**
   * Contracts defining how components interact.
   * Used for validation at the Feature level.
   */
  integrationContracts: IntegrationContract[];

  // Global validation settings

  /**
   * Default validation commands and criteria per work item type.
   * Individual work items can override these settings.
   */
  globalValidation: GlobalValidationConfig;

  // Optional metadata

  /** Target users and personas (optional, for documentation) */
  targetUsers?: string;

  /** Problem statement (optional, for documentation) */
  problemStatement?: string;

  /** Proposed solution overview (optional, for documentation) */
  solution?: string;

  /** Success metrics (optional, for documentation) */
  successMetrics?: string;

  /** Constraints or limitations (optional, for documentation) */
  constraints?: string;

  /** Technical considerations (optional, for documentation) */
  technicalNotes?: string;
}

/**
 * Options for hierarchical PRD generation.
 */
export interface HierarchicalPrdGenerationOptions extends PrdGenerationOptions {
  /** Maximum depth of work breakdown (1-5, default: 5) */
  maxDepth?: number;

  /** Whether to generate interface specifications */
  generateInterfaces?: boolean;

  /** Whether to generate integration contracts */
  generateContracts?: boolean;

  /** Custom global validation configuration */
  globalValidation?: Partial<GlobalValidationConfig>;
}

/**
 * Result of hierarchical PRD generation.
 */
export interface HierarchicalPrdGenerationResult extends PrdGenerationResult {
  /** The generated hierarchical PRD (if version 2.0) */
  hierarchicalPrd?: HierarchicalPrd;

  /** Total number of work items generated */
  totalWorkItems?: number;

  /** Work item counts per level */
  workItemCounts?: Record<string, number>;
}

/**
 * Type guard to check if a PRD is hierarchical (v2.0).
 * @param prd The PRD object to check
 * @returns True if the PRD is a HierarchicalPrd
 */
export function isHierarchicalPrd(
  prd: GeneratedPrd | HierarchicalPrd
): prd is HierarchicalPrd {
  return 'version' in prd && prd.version === '2.0' && 'workBreakdown' in prd;
}

/**
 * Count work items in a hierarchical PRD.
 * @param prd The hierarchical PRD
 * @returns Total count and counts per type
 */
export function countWorkItems(prd: HierarchicalPrd): {
  total: number;
  byType: Record<string, number>;
} {
  const byType: Record<string, number> = {
    epic: 0,
    feature: 0,
    story: 0,
    task: 0,
    subtask: 0,
  };

  function countRecursive(items: HierarchicalWorkItem[]): number {
    let count = 0;
    for (const item of items) {
      count++;
      byType[item.type] = (byType[item.type] || 0) + 1;
      if (item.children.length > 0) {
        count += countRecursive(item.children);
      }
    }
    return count;
  }

  const total = countRecursive(prd.workBreakdown);
  return { total, byType };
}

/**
 * Find a work item by ID in a hierarchical PRD.
 * @param prd The hierarchical PRD
 * @param id Work item ID to find
 * @returns The work item or undefined if not found
 */
export function findWorkItemById(
  prd: HierarchicalPrd,
  id: string
): HierarchicalWorkItem | undefined {
  function findRecursive(
    items: HierarchicalWorkItem[]
  ): HierarchicalWorkItem | undefined {
    for (const item of items) {
      if (item.id === id) {
        return item;
      }
      if (item.children.length > 0) {
        const found = findRecursive(item.children);
        if (found) {
          return found;
        }
      }
    }
    return undefined;
  }

  return findRecursive(prd.workBreakdown);
}

/**
 * Get all work items at a specific depth level.
 * @param prd The hierarchical PRD
 * @param depth Depth level (0 = epic, 4 = subtask)
 * @returns Array of work items at that depth
 */
export function getWorkItemsByDepth(
  prd: HierarchicalPrd,
  depth: number
): HierarchicalWorkItem[] {
  const result: HierarchicalWorkItem[] = [];

  function collectRecursive(items: HierarchicalWorkItem[]): void {
    for (const item of items) {
      if (item.depth === depth) {
        result.push(item);
      }
      if (item.children.length > 0) {
        collectRecursive(item.children);
      }
    }
  }

  collectRecursive(prd.workBreakdown);
  return result;
}

/**
 * Get the ancestor chain for a work item.
 * @param prd The hierarchical PRD
 * @param id Work item ID
 * @returns Array of ancestors from root (epic) to parent
 */
export function getAncestors(
  prd: HierarchicalPrd,
  id: string
): HierarchicalWorkItem[] {
  const ancestors: HierarchicalWorkItem[] = [];

  function findWithPath(
    items: HierarchicalWorkItem[],
    path: HierarchicalWorkItem[]
  ): boolean {
    for (const item of items) {
      if (item.id === id) {
        ancestors.push(...path);
        return true;
      }
      if (item.children.length > 0) {
        if (findWithPath(item.children, [...path, item])) {
          return true;
        }
      }
    }
    return false;
  }

  findWithPath(prd.workBreakdown, []);
  return ancestors;
}
