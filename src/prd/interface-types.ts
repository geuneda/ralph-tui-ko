/**
 * ABOUTME: Type definitions for interface and component specifications.
 * Enables object-oriented integration through interface contracts
 * between features and stories in the hierarchical work breakdown.
 */

/**
 * Parameter definition for interface methods.
 */
export interface InterfaceParameter {
  /** Parameter name */
  name: string;

  /** Type annotation (e.g., "Vector2", "float", "string") */
  type: string;

  /** Whether the parameter is optional */
  optional?: boolean;

  /** Default value (if optional) */
  defaultValue?: string;

  /** Description of the parameter */
  description?: string;
}

/**
 * Method definition for an interface.
 */
export interface InterfaceMethod {
  /** Method name */
  name: string;

  /** Return type (use "void" for no return) */
  returnType: string;

  /** Method parameters */
  parameters?: InterfaceParameter[];

  /** Whether the method is async */
  async?: boolean;

  /** Description of what the method does */
  description?: string;
}

/**
 * Property definition for an interface.
 */
export interface InterfaceProperty {
  /** Property name */
  name: string;

  /** Type annotation */
  type: string;

  /** Whether the property is read-only */
  readonly?: boolean;

  /** Whether the property is optional */
  optional?: boolean;

  /** Description of the property */
  description?: string;
}

/**
 * Event definition for an interface.
 */
export interface InterfaceEvent {
  /** Event name */
  name: string;

  /** Event argument type (payload) */
  argsType?: string;

  /** Description of when the event fires */
  description?: string;
}

/**
 * Interface specification defining a contract that components can implement.
 */
export interface InterfaceSpec {
  /** Interface name (e.g., IMovable, IInputProvider) */
  name: string;

  /** Description of the interface's purpose */
  description: string;

  /** Methods defined by this interface */
  methods?: InterfaceMethod[];

  /** Properties defined by this interface */
  properties?: InterfaceProperty[];

  /** Events defined by this interface */
  events?: InterfaceEvent[];

  /** Base interfaces this interface extends */
  extends?: string[];

  /** Language/framework hint (e.g., "csharp", "typescript") */
  language?: string;
}

/**
 * Reference to a required interface for a component.
 */
export interface RequiredInterface {
  /** Interface name that is required */
  interface: string;

  /** Work item ID that provides this interface (e.g., "F-002") */
  providedBy?: string;

  /** Whether this dependency is optional */
  optional?: boolean;

  /** Description of why this interface is needed */
  reason?: string;
}

/**
 * Component specification defining what a feature/story provides and requires.
 * Used to establish integration contracts between work items.
 */
export interface ComponentSpec {
  /** Component name (e.g., PlayerMovement, InventorySystem) */
  name: string;

  /** Description of the component's responsibility */
  description?: string;

  /** Interface names this component provides/implements */
  provides: string[];

  /** Interfaces this component requires from other components */
  requires: RequiredInterface[];

  /** Framework/platform dependencies (e.g., Rigidbody2D, Animator) */
  dependencies?: string[];

  /** File path hints for implementation */
  filePaths?: string[];

  /** Namespace or module */
  namespace?: string;
}

/**
 * Participant in an integration contract.
 */
export interface ContractParticipant {
  /** Work item ID that participates */
  workItemId: string;

  /** Role in the contract */
  role: 'provider' | 'consumer';

  /** Interfaces this participant provides or consumes */
  interfaces: string[];
}

/**
 * Test scenario for validating integration contracts.
 */
export interface IntegrationTestScenario {
  /** Scenario name */
  name: string;

  /** Description of what the scenario tests */
  description: string;

  /** Setup steps */
  setup?: string[];

  /** Actions to perform */
  actions: string[];

  /** Expected outcomes to verify */
  expectations: string[];

  /** Whether this scenario is critical (blocks completion) */
  critical?: boolean;
}

/**
 * Integration contract defining how multiple work items interact.
 * Used to ensure components properly integrate at the Feature level.
 */
export interface IntegrationContract {
  /** Unique identifier for this contract */
  id: string;

  /** Human-readable name */
  name: string;

  /** Description of the integration */
  description: string;

  /** Participants in this contract */
  participants: ContractParticipant[];

  /** Test scenarios to verify the integration */
  testScenarios?: IntegrationTestScenario[];

  /** Status of the contract */
  status?: 'draft' | 'active' | 'verified' | 'broken';

  /** When the contract was last verified */
  lastVerified?: string;
}

/**
 * Result of validating interface contracts.
 */
export interface InterfaceValidationResult {
  /** Whether all validations passed */
  valid: boolean;

  /** List of missing interface implementations */
  missingImplementations: Array<{
    interface: string;
    requiredBy: string;
    expectedProvider?: string;
  }>;

  /** List of broken contracts */
  brokenContracts: Array<{
    contractId: string;
    reason: string;
  }>;

  /** List of circular dependencies detected */
  circularDependencies: Array<{
    cycle: string[];
  }>;

  /** Validation timestamp */
  validatedAt: string;
}

/**
 * Create an empty interface spec.
 * @param name Interface name
 * @param description Description
 * @returns New interface spec
 */
export function createInterfaceSpec(
  name: string,
  description: string
): InterfaceSpec {
  return {
    name,
    description,
    methods: [],
    properties: [],
    events: [],
  };
}

/**
 * Create an empty component spec.
 * @param name Component name
 * @returns New component spec
 */
export function createComponentSpec(name: string): ComponentSpec {
  return {
    name,
    provides: [],
    requires: [],
    dependencies: [],
  };
}

/**
 * Create an integration contract between two work items.
 * @param id Contract ID
 * @param name Contract name
 * @param providerId Provider work item ID
 * @param consumerId Consumer work item ID
 * @param interfaces Interfaces involved
 * @returns New integration contract
 */
export function createIntegrationContract(
  id: string,
  name: string,
  providerId: string,
  consumerId: string,
  interfaces: string[]
): IntegrationContract {
  return {
    id,
    name,
    description: `Integration between ${providerId} and ${consumerId}`,
    participants: [
      {
        workItemId: providerId,
        role: 'provider',
        interfaces,
      },
      {
        workItemId: consumerId,
        role: 'consumer',
        interfaces,
      },
    ],
    status: 'draft',
  };
}

/**
 * Validate that all required interfaces are provided.
 * @param components Array of component specs to validate
 * @param interfaces Available interface definitions
 * @returns Validation result
 */
export function validateInterfaceDependencies(
  components: ComponentSpec[],
  _interfaces: InterfaceSpec[]
): InterfaceValidationResult {
  const result: InterfaceValidationResult = {
    valid: true,
    missingImplementations: [],
    brokenContracts: [],
    circularDependencies: [],
    validatedAt: new Date().toISOString(),
  };

  // Build a map of what each component provides
  const providedByMap = new Map<string, string>();
  for (const component of components) {
    for (const interfaceName of component.provides) {
      providedByMap.set(interfaceName, component.name);
    }
  }

  // Check that all required interfaces are provided
  for (const component of components) {
    for (const required of component.requires) {
      if (!required.optional && !providedByMap.has(required.interface)) {
        result.valid = false;
        result.missingImplementations.push({
          interface: required.interface,
          requiredBy: component.name,
          expectedProvider: required.providedBy,
        });
      }
    }
  }

  // Check for circular dependencies
  const cycles = detectCircularDependencies(components);
  if (cycles.length > 0) {
    result.valid = false;
    result.circularDependencies = cycles.map((cycle) => ({ cycle }));
  }

  return result;
}

/**
 * Detect circular dependencies in component specs.
 * @param components Array of component specs
 * @returns Array of cycles (each cycle is an array of component names)
 */
function detectCircularDependencies(components: ComponentSpec[]): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  // Build adjacency list
  const graph = new Map<string, string[]>();
  const componentMap = new Map<string, ComponentSpec>();

  for (const component of components) {
    componentMap.set(component.name, component);
    graph.set(component.name, []);
  }

  // Build a map of interface -> provider component
  const providerMap = new Map<string, string>();
  for (const component of components) {
    for (const iface of component.provides) {
      providerMap.set(iface, component.name);
    }
  }

  // Build edges based on required interfaces
  for (const component of components) {
    const edges: string[] = [];
    for (const required of component.requires) {
      const provider = providerMap.get(required.interface);
      if (provider && provider !== component.name) {
        edges.push(provider);
      }
    }
    graph.set(component.name, edges);
  }

  function dfs(node: string, path: string[]): void {
    if (recursionStack.has(node)) {
      // Found a cycle
      const cycleStart = path.indexOf(node);
      if (cycleStart !== -1) {
        cycles.push(path.slice(cycleStart).concat(node));
      }
      return;
    }

    if (visited.has(node)) {
      return;
    }

    visited.add(node);
    recursionStack.add(node);

    const neighbors = graph.get(node) || [];
    for (const neighbor of neighbors) {
      dfs(neighbor, [...path, node]);
    }

    recursionStack.delete(node);
  }

  for (const component of components) {
    if (!visited.has(component.name)) {
      dfs(component.name, []);
    }
  }

  return cycles;
}
