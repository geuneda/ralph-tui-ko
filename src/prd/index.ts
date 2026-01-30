/**
 * ABOUTME: PRD creation module for ralph-tui.
 * Exports types, questions, generator, and wizard for PRD creation.
 */

// Types
export type {
  ClarifyingQuestion,
  ClarifyingAnswers,
  PrdUserStory,
  GeneratedPrd,
  PrdGenerationOptions,
  PrdGenerationResult,
  TrackerFormat,
  ConversionResult,
} from './types.js';

// Questions
export {
  CLARIFYING_QUESTIONS,
  getQuestionCount,
  getQuestionById,
  getQuestionIds,
} from './questions.js';

// Generator
export {
  slugify,
  generateBranchName,
  generateUserStories,
  generatePrd,
  renderPrdMarkdown,
  convertToPrdJson,
} from './generator.js';

// Wizard
export { runPrdWizard, prdExists } from './wizard.js';

// Parser
export type { ParsedPrd, ParseOptions } from './parser.js';
export { parsePrdMarkdown, parsedPrdToGeneratedPrd } from './parser.js';

// Hierarchical Types (v2.0)
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

// Interface Types
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

// Hierarchical PRD Types
export type {
  PrdVersion,
  HierarchicalPrd,
  HierarchicalPrdGenerationOptions,
  HierarchicalPrdGenerationResult,
} from './types.js';

export {
  isHierarchicalPrd,
  countWorkItems,
  findWorkItemById,
  getWorkItemsByDepth,
  getAncestors,
} from './types.js';
