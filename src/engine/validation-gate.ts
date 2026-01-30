/**
 * ABOUTME: Validation gate execution engine.
 * Runs validation commands for work items and manages the rollup logic
 * for hierarchical completion.
 */

import { execSync, spawn, type ChildProcess } from 'node:child_process';
import type {
  HierarchicalWorkItem,
  WorkItemType,
  ValidationResult,
} from '../prd/hierarchical-types.js';

/**
 * Options for running a validation gate.
 */
export interface ValidationGateOptions {
  /** Working directory for commands (default: process.cwd()) */
  cwd?: string;

  /** Timeout in milliseconds for each command (default: 300000 = 5 minutes) */
  commandTimeoutMs?: number;

  /** Whether to stop on first failure (default: true) */
  stopOnFirstFailure?: boolean;

  /** Custom environment variables */
  env?: Record<string, string>;

  /** Callback for command output streaming */
  onOutput?: (data: string, stream: 'stdout' | 'stderr') => void;

  /** Callback for command start */
  onCommandStart?: (command: string, index: number, total: number) => void;

  /** Callback for command completion */
  onCommandComplete?: (
    command: string,
    success: boolean,
    durationMs: number
  ) => void;
}

/**
 * Result of a single command execution.
 */
export interface CommandExecutionResult {
  /** The command that was executed */
  command: string;

  /** Whether the command succeeded (exit code 0) */
  success: boolean;

  /** Exit code */
  exitCode: number;

  /** Standard output */
  stdout: string;

  /** Standard error */
  stderr: string;

  /** Execution duration in milliseconds */
  durationMs: number;

  /** Error message if the command failed */
  error?: string;
}

/**
 * Result of running all validation gate commands.
 */
export interface ValidationGateExecutionResult {
  /** Work item ID that was validated */
  workItemId: string;

  /** Overall success (all commands passed) */
  passed: boolean;

  /** Results for each command */
  commandResults: CommandExecutionResult[];

  /** Total execution time in milliseconds */
  totalDurationMs: number;

  /** First failed command (if any) */
  failedCommand?: string;

  /** Aggregated error messages */
  errors?: string[];

  /** Timestamp when validation started */
  startedAt: string;

  /** Timestamp when validation completed */
  completedAt: string;

  /** Whether child completion was verified */
  childrenVerified: boolean;

  /** Child verification error (if any) */
  childrenError?: string;
}

/**
 * Rollup result when checking parent completion.
 */
export interface RollupResult {
  /** Work item ID that was checked */
  workItemId: string;

  /** Whether the work item can be rolled up (all children complete) */
  canRollup: boolean;

  /** Child IDs that are not yet complete */
  incompleteChildren: string[];

  /** Validation gate result if rollup was attempted */
  validationResult?: ValidationGateExecutionResult;

  /** Whether the parent was also checked for rollup */
  parentChecked: boolean;

  /** Parent rollup result (recursive) */
  parentResult?: RollupResult;
}

/**
 * Execute a single command with timeout and output streaming.
 */
async function executeCommand(
  command: string,
  options: ValidationGateOptions = {}
): Promise<CommandExecutionResult> {
  const startTime = Date.now();
  const cwd = options.cwd || process.cwd();
  const timeout = options.commandTimeoutMs || 300000;

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    // Use shell for command execution to support pipes, redirects, etc.
    const child: ChildProcess = spawn(command, [], {
      cwd,
      shell: true,
      env: {
        ...process.env,
        ...options.env,
      },
    });

    // Set timeout
    const timeoutId = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL');
        }
      }, 5000);
    }, timeout);

    child.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      stdout += text;
      options.onOutput?.(text, 'stdout');
    });

    child.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      stderr += text;
      options.onOutput?.(text, 'stderr');
    });

    child.on('close', (code: number | null) => {
      clearTimeout(timeoutId);
      const durationMs = Date.now() - startTime;

      if (timedOut) {
        resolve({
          command,
          success: false,
          exitCode: -1,
          stdout,
          stderr,
          durationMs,
          error: `Command timed out after ${timeout}ms`,
        });
        return;
      }

      const exitCode = code ?? 0;
      resolve({
        command,
        success: exitCode === 0,
        exitCode,
        stdout,
        stderr,
        durationMs,
        error: exitCode !== 0 ? `Command exited with code ${exitCode}` : undefined,
      });
    });

    child.on('error', (err: Error) => {
      clearTimeout(timeoutId);
      const durationMs = Date.now() - startTime;
      resolve({
        command,
        success: false,
        exitCode: -1,
        stdout,
        stderr,
        durationMs,
        error: err.message,
      });
    });
  });
}

/**
 * Run validation gate commands for a work item.
 */
export async function runValidationGateCommands(
  workItem: HierarchicalWorkItem,
  options: ValidationGateOptions = {}
): Promise<ValidationGateExecutionResult> {
  const startedAt = new Date().toISOString();
  const startTime = Date.now();
  const gate = workItem.validationGate;
  const commands = gate.commands;
  const commandResults: CommandExecutionResult[] = [];
  const errors: string[] = [];
  let passed = true;
  let failedCommand: string | undefined;

  // Execute each command
  for (let i = 0; i < commands.length; i++) {
    const command = commands[i];
    if (!command) continue;

    options.onCommandStart?.(command, i, commands.length);

    const result = await executeCommand(command, options);
    commandResults.push(result);

    options.onCommandComplete?.(command, result.success, result.durationMs);

    if (!result.success) {
      passed = false;
      failedCommand = command;
      if (result.error) {
        errors.push(`${command}: ${result.error}`);
      }

      if (options.stopOnFirstFailure !== false) {
        break;
      }
    }
  }

  // Verify children completion
  let childrenVerified = true;
  let childrenError: string | undefined;

  if (workItem.children.length > 0) {
    const incompleteChildren = workItem.children.filter(
      (child) => child.status !== 'completed'
    );

    if (incompleteChildren.length > 0) {
      childrenVerified = false;
      passed = false;
      childrenError = `${incompleteChildren.length} children not completed: ${incompleteChildren.map((c) => c.id).join(', ')}`;
      errors.push(childrenError);
    }
  }

  const completedAt = new Date().toISOString();
  const totalDurationMs = Date.now() - startTime;

  return {
    workItemId: workItem.id,
    passed,
    commandResults,
    totalDurationMs,
    failedCommand,
    errors: errors.length > 0 ? errors : undefined,
    startedAt,
    completedAt,
    childrenVerified,
    childrenError,
  };
}

/**
 * Convert a ValidationGateExecutionResult to a ValidationResult for storage.
 */
export function toValidationResult(
  execResult: ValidationGateExecutionResult
): ValidationResult {
  return {
    passed: execResult.passed,
    failedCommand: execResult.failedCommand,
    output: execResult.commandResults
      .map((r) => `$ ${r.command}\n${r.stdout}${r.stderr}`)
      .join('\n---\n'),
    reason: execResult.errors?.join('; '),
    errors: execResult.errors,
    executedAt: execResult.completedAt,
    durationMs: execResult.totalDurationMs,
  };
}

/**
 * Check if a work item can be rolled up (all children complete).
 */
export function canRollup(workItem: HierarchicalWorkItem): {
  canRollup: boolean;
  incompleteChildren: string[];
} {
  if (workItem.children.length === 0) {
    // Leaf node - can always roll up if manually marked complete
    return { canRollup: true, incompleteChildren: [] };
  }

  const incompleteChildren = workItem.children
    .filter((child) => child.status !== 'completed')
    .map((child) => child.id);

  return {
    canRollup: incompleteChildren.length === 0,
    incompleteChildren,
  };
}

/**
 * Validation gate executor class for managing validation state.
 */
export class ValidationGateExecutor {
  private options: ValidationGateOptions;
  private runningGates: Map<string, Promise<ValidationGateExecutionResult>> =
    new Map();

  constructor(options: ValidationGateOptions = {}) {
    this.options = options;
  }

  /**
   * Run validation for a work item.
   * Returns existing promise if validation is already running for this item.
   */
  async validate(
    workItem: HierarchicalWorkItem
  ): Promise<ValidationGateExecutionResult> {
    // Check if already running
    const existing = this.runningGates.get(workItem.id);
    if (existing) {
      return existing;
    }

    // Start new validation
    const promise = runValidationGateCommands(workItem, this.options);
    this.runningGates.set(workItem.id, promise);

    try {
      const result = await promise;
      return result;
    } finally {
      this.runningGates.delete(workItem.id);
    }
  }

  /**
   * Check if validation is currently running for a work item.
   */
  isRunning(workItemId: string): boolean {
    return this.runningGates.has(workItemId);
  }

  /**
   * Cancel all running validations (best effort).
   */
  cancelAll(): void {
    // Note: This doesn't actually kill running processes,
    // but prevents new results from being used.
    this.runningGates.clear();
  }

  /**
   * Get the number of currently running validations.
   */
  get runningCount(): number {
    return this.runningGates.size;
  }
}

/**
 * Create a quick synchronous validation (for simple checks).
 * Use this for fast validation that doesn't need async execution.
 */
export function runQuickValidation(
  commands: string[],
  cwd: string = process.cwd()
): { passed: boolean; failedCommand?: string; error?: string } {
  for (const command of commands) {
    try {
      execSync(command, {
        cwd,
        stdio: 'pipe',
        encoding: 'utf-8',
        timeout: 60000, // 1 minute timeout for quick validation
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        passed: false,
        failedCommand: command,
        error: message,
      };
    }
  }

  return { passed: true };
}

/**
 * Determine the appropriate commit type for a work item.
 */
export function getCommitType(type: WorkItemType): string {
  switch (type) {
    case 'epic':
      return 'feat';
    case 'feature':
      return 'feat';
    case 'story':
      return 'feat';
    case 'task':
      return 'feat';
    case 'subtask':
      return 'chore';
    default:
      return 'chore';
  }
}

/**
 * Generate a suggested commit message for a completed work item.
 */
export function generateCommitMessage(workItem: HierarchicalWorkItem): string {
  const type = getCommitType(workItem.type);
  return `${type}: ${workItem.id} - ${workItem.title}`;
}
