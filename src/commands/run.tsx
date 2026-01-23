/**
 * ABOUTME: ralph-tui의 실행 명령어 구현.
 * CLI 인자 파싱, 설정 로딩, 세션 관리,
 * TUI와 함께 실행 엔진 시작을 처리합니다.
 * Ctrl+C 확인 다이얼로그를 통한 우아한 중단을 구현합니다.
 */

import { useState, useEffect, useMemo } from 'react';
import { createCliRenderer } from '@opentui/core';
import { createRoot } from '@opentui/react';
import { buildConfig, validateConfig, loadStoredConfig, saveProjectConfig } from '../config/index.js';
import type { RuntimeOptions, StoredConfig, SandboxConfig } from '../config/types.js';
import {
  checkSession,
  createSession,
  resumeSession,
  endSession,
  hasPersistedSession,
  loadPersistedSession,
  savePersistedSession,
  deletePersistedSession,
  createPersistedSession,
  updateSessionAfterIteration,
  pauseSession,
  completeSession,
  failSession,
  isSessionResumable,
  getSessionSummary,
  addActiveTask,
  removeActiveTask,
  clearActiveTasks,
  getActiveTasks,
  setSubagentPanelVisible,
  acquireLockWithPrompt,
  releaseLockNew,
  registerLockCleanupHandlers,
  checkLock,
  detectAndRecoverStaleSession,
  registerSession,
  unregisterSession,
  updateRegistryStatus,
  type PersistedSessionState,
} from '../session/index.js';
import { ExecutionEngine } from '../engine/index.js';
import { registerBuiltinAgents } from '../plugins/agents/builtin/index.js';
import { registerBuiltinTrackers } from '../plugins/trackers/builtin/index.js';
import { getAgentRegistry } from '../plugins/agents/registry.js';
import { getTrackerRegistry } from '../plugins/trackers/registry.js';
import { RunApp } from '../tui/components/RunApp.js';
import { EpicSelectionApp } from '../tui/components/EpicSelectionApp.js';
import type { TrackerPlugin, TrackerTask } from '../plugins/trackers/types.js';
import { BeadsTrackerPlugin } from '../plugins/trackers/builtin/beads/index.js';
import type { RalphConfig } from '../config/types.js';
import { projectConfigExists, runSetupWizard, checkAndMigrate } from '../setup/index.js';
import { createInterruptHandler } from '../interruption/index.js';
import type { InterruptHandler } from '../interruption/types.js';
import { createStructuredLogger, clearProgress } from '../logs/index.js';
import { sendCompletionNotification, sendMaxIterationsNotification, sendErrorNotification, resolveNotificationsEnabled } from '../notifications.js';
import type { NotificationSoundMode } from '../config/types.js';
import { detectSandboxMode } from '../sandbox/index.js';
import type { SandboxMode } from '../sandbox/index.js';
import {
  createRemoteServer,
  getOrCreateServerToken,
  getServerTokenInfo,
  rotateServerToken,
  DEFAULT_LISTEN_OPTIONS,
  InstanceManager,
  type RemoteServer,
  type InstanceTab,
} from '../remote/index.js';
import type { ConnectionToastMessage } from '../tui/components/Toast.js';
import { spawnSync } from 'node:child_process';
import { basename } from 'node:path';

/**
 * Get git repository information for the current working directory.
 * Returns undefined values if not a git repository or git command fails.
 */
function getGitInfo(cwd: string): {
  repoName?: string;
  branch?: string;
  isDirty?: boolean;
  commitHash?: string;
} {
  try {
    // Get repository root name
    const repoRoot = spawnSync('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      encoding: 'utf-8',
      timeout: 5000,
    });
    const repoName = repoRoot.status === 0 ? basename(repoRoot.stdout.trim()) : undefined;

    // Get current branch
    const branchResult = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd,
      encoding: 'utf-8',
      timeout: 5000,
    });
    const branch = branchResult.status === 0 ? branchResult.stdout.trim() : undefined;

    // Check for uncommitted changes
    const statusResult = spawnSync('git', ['status', '--porcelain'], {
      cwd,
      encoding: 'utf-8',
      timeout: 5000,
    });
    const isDirty = statusResult.status === 0 ? statusResult.stdout.trim().length > 0 : undefined;

    // Get short commit hash
    const hashResult = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd,
      encoding: 'utf-8',
      timeout: 5000,
    });
    const commitHash = hashResult.status === 0 ? hashResult.stdout.trim() : undefined;

    return { repoName, branch, isDirty, commitHash };
  } catch {
    return {};
  }
}

/**
 * Extended runtime options with noSetup, verify, and listen flags
 */
interface ExtendedRuntimeOptions extends RuntimeOptions {
  noSetup?: boolean;
  verify?: boolean;
  /** Enable remote listener (implies headless) */
  listen?: boolean;
  /** Port for remote listener (default: 7890) */
  listenPort?: number;
  /** Rotate server token before starting listener */
  rotateToken?: boolean;
}

/**
 * Parse CLI arguments for the run command
 */
export function parseRunArgs(args: string[]): ExtendedRuntimeOptions {
  const options: ExtendedRuntimeOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    if (arg.startsWith('--sandbox=')) {
      const mode = arg.split('=')[1];
      if (mode === 'bwrap' || mode === 'sandbox-exec') {
        options.sandbox = {
          ...options.sandbox,
          enabled: true,
          mode,
        };
      }
      continue;
    }

    switch (arg) {
      case '--epic':
        if (nextArg && !nextArg.startsWith('-')) {
          options.epicId = nextArg;
          i++;
        }
        break;

      case '--prd':
        if (nextArg && !nextArg.startsWith('-')) {
          options.prdPath = nextArg;
          i++;
        }
        break;

      case '--agent':
        if (nextArg && !nextArg.startsWith('-')) {
          options.agent = nextArg;
          i++;
        }
        break;

      case '--model':
        if (nextArg && !nextArg.startsWith('-')) {
          options.model = nextArg;
          i++;
        }
        break;

      case '--variant':
        if (nextArg && !nextArg.startsWith('-')) {
          options.variant = nextArg;
          i++;
        }
        break;

      case '--tracker':
        if (nextArg && !nextArg.startsWith('-')) {
          options.tracker = nextArg;
          i++;
        }
        break;

      case '--iterations':
        if (nextArg && !nextArg.startsWith('-')) {
          const parsed = parseInt(nextArg, 10);
          if (!isNaN(parsed)) {
            options.iterations = parsed;
          }
          i++;
        }
        break;

      case '--delay':
        if (nextArg && !nextArg.startsWith('-')) {
          const parsed = parseInt(nextArg, 10);
          if (!isNaN(parsed)) {
            options.iterationDelay = parsed;
          }
          i++;
        }
        break;

      case '--cwd':
        if (nextArg && !nextArg.startsWith('-')) {
          options.cwd = nextArg;
          i++;
        }
        break;

      case '--resume':
        options.resume = true;
        break;

      case '--force':
        options.force = true;
        break;

      case '--headless':
      case '--no-tui':
        options.headless = true;
        break;

      case '--no-setup':
        options.noSetup = true;
        break;

      case '--sandbox':
        options.sandbox = {
          ...options.sandbox,
          enabled: true,
          mode: 'auto',
        };
        break;

      case '--no-sandbox':
        options.sandbox = {
          ...options.sandbox,
          enabled: false,
          mode: 'off',
        };
        break;

      case '--no-network':
        options.sandbox = {
          ...options.sandbox,
          enabled: true,
          network: false,
        };
        break;

      case '--prompt':
        if (nextArg && !nextArg.startsWith('-')) {
          options.promptPath = nextArg;
          i++;
        }
        break;

      case '--output-dir':
      case '--log-dir':
        if (nextArg && !nextArg.startsWith('-')) {
          options.outputDir = nextArg;
          i++;
        }
        break;

      case '--progress-file':
        if (nextArg && !nextArg.startsWith('-')) {
          options.progressFile = nextArg;
          i++;
        }
        break;

      case '--notify':
        options.notify = true;
        break;

      case '--no-notify':
        options.notify = false;
        break;

      case '--verify':
        options.verify = true;
        break;

      case '--listen':
        options.listen = true;
        options.headless = true; // Listen mode implies headless
        break;

      case '--listen-port':
        if (nextArg && !nextArg.startsWith('-')) {
          const parsed = parseInt(nextArg, 10);
          if (!isNaN(parsed) && parsed > 0 && parsed < 65536) {
            options.listenPort = parsed;
          }
          i++;
        }
        break;

      case '--rotate-token':
        options.rotateToken = true;
        break;
    }
  }

  return options;
}

/**
 * 실행 명령어 도움말 출력
 */
export function printRunHelp(): void {
  console.log(`
ralph-tui run - Ralph 실행 시작

사용법: ralph-tui run [옵션]

옵션:
  --epic <id>         beads 트래커용 에픽 ID (생략 시 에픽 선택 화면 표시)
  --prd <path>        PRD 파일 경로 (자동으로 json 트래커로 전환)
  --agent <name>      에이전트 플러그인 재정의 (예: claude, opencode)
  --model <name>      모델 재정의 (예: opus, sonnet)
  --variant <level>   모델 변형/추론 수준 (minimal, high, max)
  --tracker <name>    트래커 플러그인 재정의 (예: beads, beads-bv, json)
  --prompt <path>     커스텀 프롬프트 파일 (기본값: 트래커 모드 기반)
  --output-dir <path> 반복 로그 디렉토리 (기본값: .ralph-tui/iterations)
  --progress-file <path> 반복 간 컨텍스트용 진행 파일 (기본값: .ralph-tui/progress.md)
  --iterations <n>    최대 반복 횟수 (0 = 무제한)
  --delay <ms>        반복 간 지연 시간 (밀리초)
  --cwd <path>        작업 디렉토리
  --resume            기존 세션 재개
  --force             잠금 상태여도 강제 시작
  --headless          TUI 없이 실행 (별칭: --no-tui)
  --no-tui            TUI 없이 실행, 구조화된 로그를 stdout으로 출력
  --no-setup          설정이 없어도 대화형 설정 건너뛰기
  --verify            시작 전 에이전트 사전 점검 실행
  --notify            데스크톱 알림 강제 활성화
  --no-notify         데스크톱 알림 강제 비활성화
  --sandbox           샌드박싱 활성화 (자동 모드)
  --sandbox=bwrap     Bubblewrap 샌드박싱 강제 (Linux)
  --sandbox=sandbox-exec  sandbox-exec 강제 (macOS)
  --no-sandbox        샌드박싱 비활성화
  --no-network        샌드박스에서 네트워크 접근 비활성화
  --listen            원격 리스너 활성화 (--headless 암시)
  --listen-port <n>   원격 리스너 포트 (기본값: 7890)
  --rotate-token      리스너 시작 전 서버 토큰 교체

로그 출력 형식 (--no-tui 모드):
  [timestamp] [level] [component] message

  레벨: INFO, WARN, ERROR, DEBUG
  컴포넌트: progress, agent, engine, tracker, session, system

  출력 예시:
    [10:42:15] [INFO] [engine] Ralph 시작됨. 총 작업: 5
    [10:42:15] [INFO] [progress] 반복 1/10: US-001 - 로그인 추가 작업 중
    [10:42:15] [INFO] [agent] 작업용 프롬프트 빌드 중...
    [10:42:30] [INFO] [progress] 반복 1 완료. 작업 US-001: 완료됨. 소요 시간: 15s

예시:
  ralph-tui run                              # 기본값으로 시작
  ralph-tui run --epic ralph-tui-45r         # 특정 에픽으로 실행
  ralph-tui run --prd ./prd.json             # PRD 파일로 실행
  ralph-tui run --agent claude --model opus  # 에이전트 설정 재정의
  ralph-tui run --tracker beads-bv           # beads-bv 트래커 사용
  ralph-tui run --iterations 20              # 20회 반복으로 제한
  ralph-tui run --resume                     # 이전 세션 재개
  ralph-tui run --no-tui                     # CI/스크립트용 헤드리스 실행
  ralph-tui run --listen --prd ./prd.json    # 원격 리스너 활성화하여 실행
`);
}

/**
 * Initialize plugin registries
 */
async function initializePlugins(): Promise<void> {
  // Register built-in plugins
  registerBuiltinAgents();
  registerBuiltinTrackers();

  // Initialize registries (discovers user plugins)
  const agentRegistry = getAgentRegistry();
  const trackerRegistry = getTrackerRegistry();

  await Promise.all([agentRegistry.initialize(), trackerRegistry.initialize()]);
}

/**
 * Result of detecting stale in_progress tasks
 */
interface StaleTasksResult {
  /** Task IDs that are stale in_progress from a crashed session */
  staleTasks: string[];
  /** Whether any tasks were reset */
  tasksReset: boolean;
  /** Count of tasks that were reset */
  resetCount: number;
}

/**
 * Detect and handle stale in_progress tasks from crashed sessions.
 *
 * This checks:
 * 1. If there's a persisted session file from a previous run
 * 2. If the lock is stale (previous process no longer running)
 * 3. If that session had any tasks marked as "active" (in_progress)
 *
 * If stale tasks are found, prompts the user whether to reset them back to open.
 *
 * @param cwd - Working directory
 * @param tracker - Tracker plugin instance
 * @param headless - Whether running in headless mode (auto-reset without prompt)
 * @returns Information about any stale tasks found and reset
 */
async function detectAndHandleStaleTasks(
  cwd: string,
  tracker: TrackerPlugin,
  headless: boolean
): Promise<StaleTasksResult> {
  const result: StaleTasksResult = {
    staleTasks: [],
    tasksReset: false,
    resetCount: 0,
  };

  // Check for persisted session from a previous run
  const hasSession = await hasPersistedSession(cwd);
  if (!hasSession) {
    return result;
  }

  const persistedState = await loadPersistedSession(cwd);
  if (!persistedState) {
    return result;
  }

  // Get active task IDs from the previous session
  const activeTaskIds = getActiveTasks(persistedState);
  if (activeTaskIds.length === 0) {
    return result;
  }

  // Check if the previous session's lock is stale (process no longer running)
  const lockStatus = await checkLock(cwd);

  // If the lock is still held by a running process, don't touch the tasks
  if (lockStatus.isLocked && !lockStatus.isStale) {
    return result;
  }

  // Found stale in_progress tasks from a crashed session!
  result.staleTasks = activeTaskIds;

  // Get task details for display
  const taskDetails: Array<{ id: string; title: string }> = [];
  for (const taskId of activeTaskIds) {
    try {
      const task = await tracker.getTask(taskId);
      if (task) {
        taskDetails.push({ id: task.id, title: task.title });
      } else {
        taskDetails.push({ id: taskId, title: '(task not found)' });
      }
    } catch {
      taskDetails.push({ id: taskId, title: '(error loading task)' });
    }
  }

  // 경고 표시
  console.log('');
  console.log('⚠️  지연된 in_progress 작업 감지됨');
  console.log('');
  console.log('이전 Ralph 세션이 정상적으로 종료되지 않았습니다.');
  console.log(`"in_progress" 상태로 멈춘 ${activeTaskIds.length}개 작업을 발견했습니다:`);
  console.log('');
  for (const task of taskDetails) {
    console.log(`  • ${task.id}: ${task.title}`);
  }
  console.log('');

  // 헤드리스 모드에서 경고와 함께 자동 리셋
  if (headless) {
    console.log('헤드리스 모드: 작업을 자동으로 open으로 리셋 중...');
    for (const taskId of activeTaskIds) {
      try {
        await tracker.updateTaskStatus(taskId, 'open');
        result.resetCount++;
      } catch {
        // 개별 실패 시 계속 진행
      }
    }
    result.tasksReset = result.resetCount > 0;

    // 활성 작업을 지우기 위해 지속 상태 업데이트
    if (result.tasksReset) {
      const updatedState = clearActiveTasks(persistedState);
      await savePersistedSession(updatedState);
    }

    console.log(`${result.resetCount}개 작업을 open으로 리셋했습니다.`);
    console.log('');
    return result;
  }

  // 대화형 모드: 사용자에게 묻기
  const { promptBoolean } = await import('../setup/prompts.js');
  const shouldReset = await promptBoolean(
    '이 작업들을 "open" 상태로 되돌리시겠습니까?',
    { default: true }
  );

  if (!shouldReset) {
    console.log('작업을 그대로 두었습니다. 수동 정리가 필요할 수 있습니다.');
    console.log('');
    return result;
  }

  // 작업 리셋
  console.log('작업 리셋 중...');
  for (const taskId of activeTaskIds) {
    try {
      await tracker.updateTaskStatus(taskId, 'open');
      result.resetCount++;
    } catch {
      console.log(`  경고: ${taskId} 리셋 실패`);
    }
  }
  result.tasksReset = result.resetCount > 0;

  // 활성 작업을 지우기 위해 지속 상태 업데이트
  if (result.tasksReset) {
    const updatedState = clearActiveTasks(persistedState);
    await savePersistedSession(updatedState);
  }

  console.log(`${result.resetCount}개 작업을 open으로 리셋했습니다.`);
  console.log('');

  return result;
}

/**
 * Handle session resume prompt
 * Checks for persisted session state and prompts user
 */
async function promptResumeOrNew(cwd: string): Promise<'resume' | 'new' | 'abort'> {
  // Check for persisted session file first
  const hasPersistedSessionFile = await hasPersistedSession(cwd);

  if (!hasPersistedSessionFile) {
    return 'new';
  }

  const persistedState = await loadPersistedSession(cwd);
  if (!persistedState) {
    return 'new';
  }

  const summary = getSessionSummary(persistedState);
  const resumable = isSessionResumable(persistedState);

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('                    기존 세션 발견                               ');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log(`  상태:        ${summary.status.toUpperCase()}`);
  console.log(`  시작 시간:   ${new Date(summary.startedAt).toLocaleString()}`);
  console.log(`  진행률:      ${summary.tasksCompleted}/${summary.totalTasks} 작업 완료`);
  console.log(`  반복:        ${summary.currentIteration}${summary.maxIterations > 0 ? `/${summary.maxIterations}` : ''}`);
  console.log(`  에이전트:    ${summary.agentPlugin}`);
  console.log(`  트래커:      ${summary.trackerPlugin}`);
  if (summary.epicId) {
    console.log(`  에픽:        ${summary.epicId}`);
  }
  console.log('');

  // 잠금 충돌 확인
  const sessionCheck = await checkSession(cwd);
  if (sessionCheck.isLocked && !sessionCheck.isStale) {
    console.log('  경고: 세션이 현재 다른 프로세스에 의해 잠겨 있습니다.');
    console.log(`        PID: ${sessionCheck.lock?.pid}`);
    console.log('');
    console.log('다른 인스턴스가 실행 중일 때는 시작할 수 없습니다.');
    return 'abort';
  }

  if (resumable) {
    console.log('이 세션은 재개할 수 있습니다.');
    console.log('');
    console.log('  재개하려면:     ralph-tui resume');
    console.log('  새로 시작하려면: ralph-tui run --force');
    console.log('');
    console.log('새 세션을 시작합니다...');
    console.log('(계속하려면 --resume 플래그 또는 "ralph-tui resume" 명령어 사용)');
    return 'new';
  } else {
    console.log('이 세션은 완료되어 재개할 수 없습니다.');
    console.log('새 세션을 시작합니다...');
    return 'new';
  }
}

/**
 * Show epic selection TUI and wait for user to select an epic.
 * Returns the selected epic, or undefined if user quits.
 */
async function showEpicSelectionTui(
  tracker: TrackerPlugin
): Promise<TrackerTask | undefined> {
  return new Promise(async (resolve) => {
    const renderer = await createCliRenderer({
      exitOnCtrlC: false,
    });

    const root = createRoot(renderer);

    const cleanup = () => {
      renderer.destroy();
    };

    const handleEpicSelected = (epic: TrackerTask) => {
      cleanup();
      resolve(epic);
    };

    const handleQuit = () => {
      cleanup();
      resolve(undefined);
    };

    // Handle Ctrl+C during epic selection
    const handleSigint = () => {
      cleanup();
      resolve(undefined);
    };

    process.on('SIGINT', handleSigint);

    root.render(
      <EpicSelectionApp
        tracker={tracker}
        onEpicSelected={handleEpicSelected}
        onQuit={handleQuit}
      />
    );
  });
}

/**
 * Props for the RunAppWrapper component
 */
interface RunAppWrapperProps {
  engine: ExecutionEngine;
  interruptHandler: InterruptHandler;
  onQuit: () => Promise<void>;
  onInterruptConfirmed: () => Promise<void>;
  /** Initial tasks to display before engine starts */
  initialTasks?: TrackerTask[];
  /** Callback when user wants to start the engine (Enter/s in ready state) */
  onStart?: () => Promise<void>;
  /** Current stored configuration (for settings view) */
  storedConfig?: StoredConfig;
  /** Working directory for saving settings */
  cwd?: string;
  /** Tracker type for epic loader mode */
  trackerType?: string;
  /** Agent plugin name (from resolved config, includes CLI override) */
  agentPlugin?: string;
  /** Current epic ID for highlighting */
  currentEpicId?: string;
  /** Initial subagent panel visibility (from persisted session) */
  initialSubagentPanelVisible?: boolean;
  /** Callback to update persisted session state */
  onUpdatePersistedState?: (updater: (state: PersistedSessionState) => PersistedSessionState) => void;
  /** Current model being used (provider/model format, e.g., "anthropic/claude-3-5-sonnet") */
  currentModel?: string;
  /** Sandbox configuration for display in header */
  sandboxConfig?: SandboxConfig;
  /** Resolved sandbox mode (when mode is 'auto', this shows what it resolved to) */
  resolvedSandboxMode?: Exclude<SandboxMode, 'auto'>;
  /** Whether to show the epic loader immediately on startup (for json tracker without PRD path) */
  initialShowEpicLoader?: boolean;
}

/**
 * Wrapper component that manages interrupt dialog state and passes it to RunApp.
 * This is needed because we need React state management for the dialog visibility.
 */
function RunAppWrapper({
  engine,
  interruptHandler,
  onQuit,
  onInterruptConfirmed,
  initialTasks,
  onStart,
  storedConfig: initialStoredConfig,
  cwd = process.cwd(),
  trackerType,
  agentPlugin,
  currentEpicId: initialEpicId,
  initialSubagentPanelVisible = false,
  onUpdatePersistedState,
  currentModel,
  sandboxConfig,
  resolvedSandboxMode,
  initialShowEpicLoader = false,
}: RunAppWrapperProps) {
  const [showInterruptDialog, setShowInterruptDialog] = useState(false);
  const [storedConfig, setStoredConfig] = useState<StoredConfig | undefined>(initialStoredConfig);
  const [tasks, setTasks] = useState<TrackerTask[]>(initialTasks ?? []);
  const [currentEpicId, setCurrentEpicId] = useState<string | undefined>(initialEpicId);

  // Local git info (computed once on mount, static for the session)
  const localGitInfo = useMemo(() => getGitInfo(cwd), [cwd]);

  // Remote instance management
  const [instanceManager] = useState(() => new InstanceManager());
  const [instanceTabs, setInstanceTabs] = useState<InstanceTab[]>([]);
  const [selectedTabIndex, setSelectedTabIndex] = useState(0);
  const [connectionToast, setConnectionToast] = useState<ConnectionToastMessage | null>(null);

  // Initialize instance manager on mount
  useEffect(() => {
    instanceManager.onStateChange((tabs, selectedIndex) => {
      setInstanceTabs(tabs);
      setSelectedTabIndex(selectedIndex);
    });
    instanceManager.onToast((toast) => {
      setConnectionToast(toast as ConnectionToastMessage);
      // Auto-clear toast after 3 seconds
      setTimeout(() => setConnectionToast(null), 3000);
    });
    instanceManager.initialize().then(() => {
      setInstanceTabs(instanceManager.getTabs());
      setSelectedTabIndex(instanceManager.getSelectedIndex());
    });

    // Cleanup on unmount
    return () => {
      instanceManager.disconnectAll();
    };
  }, []);

  // Handle tab selection
  const handleSelectTab = async (index: number): Promise<void> => {
    await instanceManager.selectTab(index);
  };

  // Get available plugins from registries
  const agentRegistry = getAgentRegistry();
  const trackerRegistry = getTrackerRegistry();
  const availableAgents = agentRegistry.getRegisteredPlugins();
  const availableTrackers = trackerRegistry.getRegisteredPlugins();

  // Handle settings save
  const handleSaveSettings = async (newConfig: StoredConfig): Promise<void> => {
    await saveProjectConfig(newConfig, cwd);
    setStoredConfig(newConfig);
  };

  // Handle loading available epics
  const handleLoadEpics = async (): Promise<TrackerTask[]> => {
    const tracker = engine.getTracker();
    if (!tracker) {
      throw new Error('Tracker not available');
    }
    return tracker.getEpics();
  };

  // Handle epic switch
  const handleEpicSwitch = async (epic: TrackerTask): Promise<void> => {
    const tracker = engine.getTracker();
    if (!tracker) {
      throw new Error('Tracker not available');
    }

    // Stop engine if running
    const state = engine.getState();
    if (state.status === 'running') {
      engine.stop();
    }

    // Set new epic ID
    if (tracker.setEpicId) {
      tracker.setEpicId(epic.id);
    }

    // Update current epic ID
    setCurrentEpicId(epic.id);

    // Refresh tasks from tracker (including completed for display)
    const newTasks = await tracker.getTasks({ status: ['open', 'in_progress', 'completed'] });
    setTasks(newTasks);

    // Trigger task refresh in engine
    engine.refreshTasks();
  };

  // Handle file path switch (for json tracker)
  const handleFilePathSwitch = async (path: string): Promise<boolean> => {
    const tracker = engine.getTracker();
    if (!tracker) {
      return false;
    }

    // Check if tracker has setFilePath method (JsonTrackerPlugin)
    const jsonTracker = tracker as { setFilePath?: (path: string) => Promise<boolean> };
    if (jsonTracker.setFilePath) {
      const success = await jsonTracker.setFilePath(path);
      if (success) {
        // Refresh tasks from tracker (including completed for display)
        const newTasks = await tracker.getTasks({ status: ['open', 'in_progress', 'completed'] });
        setTasks(newTasks);
        engine.refreshTasks();
      }
      return success;
    }

    return false;
  };

  // Handle subagent panel visibility change - persists to session state
  const handleSubagentPanelVisibilityChange = (visible: boolean): void => {
    if (onUpdatePersistedState) {
      onUpdatePersistedState((state) => setSubagentPanelVisible(state, visible));
    }
  };

  // These callbacks are passed to the interrupt handler
  const handleShowDialog = () => setShowInterruptDialog(true);
  const handleHideDialog = () => setShowInterruptDialog(false);
  const handleCancelled = () => setShowInterruptDialog(false);

  // Set up the interrupt handler callbacks
  // Note: We use a ref-like pattern here since these need to be stable references
  // that the handler can call, but the handler was created before this component mounted
  (interruptHandler as { _showDialog?: () => void })._showDialog = handleShowDialog;
  (interruptHandler as { _hideDialog?: () => void })._hideDialog = handleHideDialog;
  (interruptHandler as { _cancelled?: () => void })._cancelled = handleCancelled;

  return (
    <RunApp
      engine={engine}
      cwd={cwd}
      onQuit={onQuit}
      showInterruptDialog={showInterruptDialog}
      onInterruptConfirm={async () => {
        setShowInterruptDialog(false);
        await onInterruptConfirmed();
      }}
      onInterruptCancel={() => {
        setShowInterruptDialog(false);
        interruptHandler.reset();
      }}
      initialTasks={tasks}
      onStart={onStart}
      storedConfig={storedConfig}
      availableAgents={availableAgents}
      availableTrackers={availableTrackers}
      onSaveSettings={handleSaveSettings}
      onLoadEpics={handleLoadEpics}
      onEpicSwitch={handleEpicSwitch}
      onFilePathSwitch={handleFilePathSwitch}
      trackerType={trackerType}
      agentPlugin={agentPlugin}
      currentEpicId={currentEpicId}
      initialSubagentPanelVisible={initialSubagentPanelVisible}
      onSubagentPanelVisibilityChange={handleSubagentPanelVisibilityChange}
      currentModel={currentModel}
      sandboxConfig={sandboxConfig}
      resolvedSandboxMode={resolvedSandboxMode}
      instanceTabs={instanceTabs}
      selectedTabIndex={selectedTabIndex}
      onSelectTab={handleSelectTab}
      connectionToast={connectionToast}
      instanceManager={instanceManager}
      initialShowEpicLoader={initialShowEpicLoader}
      localGitInfo={localGitInfo}
    />
  );
}

/**
 * Run the execution engine with TUI
 *
 * IMPORTANT: The TUI now launches in a "ready" state by default (interactive mode).
 * The engine does NOT auto-start. Users must press Enter or 's' to start execution.
 * This allows users to review available tasks before committing to a run.
 *
 * The TUI stays open until the user explicitly quits (q key or Ctrl+C).
 * The engine may stop for various reasons (all tasks done, max iterations, no tasks, error)
 * but the TUI remains visible so the user can review results before exiting.
 */
/**
 * Notification options for run command
 */
interface NotificationRunOptions {
  /** Whether notifications are enabled (resolved from config + CLI) */
  notificationsEnabled: boolean;
  /** Sound mode for notifications */
  soundMode: NotificationSoundMode;
}

async function runWithTui(
  engine: ExecutionEngine,
  persistedState: PersistedSessionState,
  config: RalphConfig,
  initialTasks: TrackerTask[],
  storedConfig?: StoredConfig,
  notificationOptions?: NotificationRunOptions
): Promise<PersistedSessionState> {
  let currentState = persistedState;
  // Track when engine starts for duration calculation
  let engineStartTime: Date | null = null;
  // Track last error for error notification
  let lastError: string | null = null;
  let showDialogCallback: (() => void) | null = null;
  let hideDialogCallback: (() => void) | null = null;
  let cancelledCallback: (() => void) | null = null;
  let resolveQuitPromise: (() => void) | null = null;
  let engineStarted = false;

  const renderer = await createCliRenderer({
    exitOnCtrlC: false, // We handle this ourselves
  });

  const root = createRoot(renderer);

  // Subscribe to engine events to save state and track active tasks
  engine.on((event) => {
    if (event.type === 'iteration:completed') {
      currentState = updateSessionAfterIteration(currentState, event.result);
      // If task was completed, remove it from active tasks
      if (event.result.taskCompleted) {
        currentState = removeActiveTask(currentState, event.result.task.id);
      }
      savePersistedSession(currentState).catch(() => {
        // Log but don't fail on save errors
      });
    } else if (event.type === 'task:activated') {
      // Track task as active when set to in_progress
      currentState = addActiveTask(currentState, event.task.id);
      savePersistedSession(currentState).catch(() => {
        // Log but don't fail on save errors
      });
    } else if (event.type === 'task:completed') {
      // Task completed - remove from active tasks
      currentState = removeActiveTask(currentState, event.task.id);
      savePersistedSession(currentState).catch(() => {
        // Log but don't fail on save errors
      });
    } else if (event.type === 'engine:paused') {
      // Save paused state to session file
      currentState = pauseSession(currentState);
      savePersistedSession(currentState).catch(() => {
        // Log but don't fail on save errors
      });
    } else if (event.type === 'engine:resumed') {
      // Clear paused state when resuming
      currentState = { ...currentState, status: 'running', isPaused: false, pausedAt: undefined };
      savePersistedSession(currentState).catch(() => {
        // Log but don't fail on save errors
      });
    } else if (event.type === 'engine:started') {
      // Track when engine started for duration calculation
      engineStartTime = new Date();
    } else if (event.type === 'engine:warning') {
      // Log configuration warnings to stderr (visible after TUI exits)
      console.error(`\n⚠️  ${event.message}\n`);
    } else if (event.type === 'all:complete') {
      // Send completion notification if enabled
      if (notificationOptions?.notificationsEnabled && engineStartTime) {
        const durationMs = Date.now() - engineStartTime.getTime();
        sendCompletionNotification({
          durationMs,
          taskCount: event.totalCompleted,
          sound: notificationOptions.soundMode,
        });
      }
    } else if (event.type === 'engine:stopped' && event.reason === 'max_iterations') {
      // Send max iterations notification if enabled
      if (notificationOptions?.notificationsEnabled && engineStartTime) {
        const durationMs = Date.now() - engineStartTime.getTime();
        const engineState = engine.getState();
        const tasksRemaining = engineState.totalTasks - event.tasksCompleted;
        sendMaxIterationsNotification({
          iterationsRun: event.totalIterations,
          tasksCompleted: event.tasksCompleted,
          tasksRemaining,
          durationMs,
          sound: notificationOptions.soundMode,
        });
      }
    } else if (event.type === 'iteration:failed' && event.action === 'abort') {
      // Track the error for notification when engine stops
      lastError = event.error;
    } else if (event.type === 'engine:stopped' && event.reason === 'error') {
      // Send error notification if enabled
      if (notificationOptions?.notificationsEnabled && engineStartTime) {
        const durationMs = Date.now() - engineStartTime.getTime();
        sendErrorNotification({
          errorSummary: lastError ?? 'Unknown error',
          tasksCompleted: event.tasksCompleted,
          durationMs,
          sound: notificationOptions.soundMode,
        });
      }
    }
  });

  // Create cleanup function
  const cleanup = async (): Promise<void> => {
    interruptHandler.dispose();
    // Note: don't dispose engine here - it may already be stopped
    renderer.destroy();
  };

  // Graceful shutdown: reset active tasks, save state, clean up, and resolve the quit promise
  // This is called when the user explicitly quits (q key or Ctrl+C confirmation)
  const gracefulShutdown = async (): Promise<void> => {
    // Reset any active (in_progress) tasks back to open
    // This prevents tasks from being stuck in_progress after shutdown
    const activeTasks = getActiveTasks(currentState);
    if (activeTasks.length > 0) {
      const resetCount = await engine.resetTasksToOpen(activeTasks);
      if (resetCount > 0) {
        // Clear active tasks from state now that they've been reset
        currentState = clearActiveTasks(currentState);
      }
    }

    // Save current state (may be completed, interrupted, etc.)
    await savePersistedSession(currentState);
    await cleanup();
    // Resolve the quit promise to let the main function continue
    resolveQuitPromise?.();
  };

  // Force quit: immediate exit
  const forceQuit = (): void => {
    // Synchronous cleanup - just exit immediately
    process.exit(1);
  };

  // Create interrupt handler with callbacks
  const interruptHandler = createInterruptHandler({
    doublePressWindowMs: 1000,
    onConfirmed: gracefulShutdown,
    onCancelled: () => {
      cancelledCallback?.();
    },
    onShowDialog: () => {
      showDialogCallback?.();
    },
    onHideDialog: () => {
      hideDialogCallback?.();
    },
    onForceQuit: forceQuit,
  });

  // Handle SIGTERM separately (always graceful)
  process.on('SIGTERM', gracefulShutdown);

  // onStart callback - called when user presses Enter or 's' to start execution
  const handleStart = async (): Promise<void> => {
    if (engineStarted) return; // Prevent double-start
    engineStarted = true;
    // Start the engine (this runs the loop in the background)
    // The TUI will show running status via engine events
    await engine.start();
  };

  // Handler to update persisted state and save it
  // Used by subagent panel visibility toggle to persist state changes
  const handleUpdatePersistedState = (
    updater: (state: PersistedSessionState) => PersistedSessionState
  ): void => {
    currentState = updater(currentState);
    savePersistedSession(currentState).catch(() => {
      // Log but don't fail on save errors
    });
  };

  // Detect actual sandbox mode at startup (resolve 'auto' to concrete mode)
  const resolvedSandboxMode = config.sandbox?.enabled
    ? await detectSandboxMode()
    : undefined;

  // Render the TUI with wrapper that manages dialog state
  // Pass initialTasks for display in "ready" state and onStart callback
  root.render(
    <RunAppWrapper
      engine={engine}
      interruptHandler={interruptHandler}
      onQuit={gracefulShutdown}
      onInterruptConfirmed={gracefulShutdown}
      initialTasks={initialTasks}
      onStart={handleStart}
      storedConfig={storedConfig}
      cwd={config.cwd}
      trackerType={config.tracker.plugin}
      agentPlugin={config.agent.plugin}
      currentEpicId={config.epicId}
      initialSubagentPanelVisible={persistedState.subagentPanelVisible ?? false}
      onUpdatePersistedState={handleUpdatePersistedState}
      currentModel={config.model}
      sandboxConfig={config.sandbox}
      resolvedSandboxMode={resolvedSandboxMode}
      initialShowEpicLoader={config.tracker.plugin === 'json' && !config.prdPath}
    />
  );

  // Extract callback setters from the wrapper component
  // The wrapper will set these when it mounts
  const checkCallbacks = setInterval(() => {
    const handler = interruptHandler as {
      _showDialog?: () => void;
      _hideDialog?: () => void;
      _cancelled?: () => void;
    };
    if (handler._showDialog) {
      showDialogCallback = handler._showDialog;
    }
    if (handler._hideDialog) {
      hideDialogCallback = handler._hideDialog;
    }
    if (handler._cancelled) {
      cancelledCallback = handler._cancelled;
    }
  }, 10);

  // NOTE: We do NOT auto-start the engine here anymore.
  // The engine starts when user presses Enter or 's' (via handleStart callback).
  // This allows users to review tasks before starting.

  // Wait for user to explicitly quit (q key or Ctrl+C)
  // This promise resolves when gracefulShutdown is called
  await new Promise<void>((resolve) => {
    resolveQuitPromise = resolve;
  });

  clearInterval(checkCallbacks);

  return currentState;
}

/**
 * Run in headless mode (no TUI) with structured log output.
 * In headless mode, Ctrl+C immediately triggers graceful shutdown (no confirmation dialog).
 * Double Ctrl+C within 1 second forces immediate exit.
 *
 * Log output format: [timestamp] [level] [component] message
 * This is designed for CI/scripts that need machine-parseable output.
 */
interface HeadlessOptions {
  notificationOptions?: NotificationRunOptions;
  /** If true, keep process alive after engine completes (for remote listener) */
  listenMode?: boolean;
  /** Remote server instance to stop on shutdown */
  remoteServer?: RemoteServer | null;
}

async function runHeadless(
  engine: ExecutionEngine,
  persistedState: PersistedSessionState,
  config: RalphConfig,
  headlessOptions?: HeadlessOptions
): Promise<PersistedSessionState> {
  const notificationOptions = headlessOptions?.notificationOptions;
  const listenMode = headlessOptions?.listenMode ?? false;
  const remoteServer = headlessOptions?.remoteServer;
  let currentState = persistedState;
  let lastSigintTime = 0;
  const DOUBLE_PRESS_WINDOW_MS = 1000;
  // Track when engine starts for duration calculation
  let engineStartTime: Date | null = null;
  // Track last error for error notification
  let lastError: string | null = null;

  // Create structured logger for headless output
  const logger = createStructuredLogger();

  // Subscribe to events for structured log output and state persistence
  engine.on((event) => {
    switch (event.type) {
      case 'engine:started':
        logger.engineStarted(event.totalTasks);
        // Track when engine started for duration calculation
        engineStartTime = new Date();
        break;

      case 'engine:warning':
        logger.warn('engine', event.message);
        break;

      case 'iteration:started':
        // Progress update in required format
        logger.progress(
          event.iteration,
          config.maxIterations,
          event.task.id,
          event.task.title
        );
        break;

      case 'iteration:completed':
        // Log iteration completion
        logger.iterationComplete(
          event.result.iteration,
          event.result.task.id,
          event.result.taskCompleted,
          event.result.durationMs
        );

        // Log task completion if applicable
        if (event.result.taskCompleted) {
          logger.taskCompleted(event.result.task.id, event.result.iteration);
          // Remove from active tasks
          currentState = removeActiveTask(currentState, event.result.task.id);
        }

        // Save state after each iteration
        currentState = updateSessionAfterIteration(currentState, event.result);
        savePersistedSession(currentState).catch(() => {
          // Silently continue on save errors
        });
        break;

      case 'task:activated':
        // Track task as active when set to in_progress
        currentState = addActiveTask(currentState, event.task.id);
        savePersistedSession(currentState).catch(() => {
          // Silently continue on save errors
        });
        break;

      case 'iteration:failed':
        logger.iterationFailed(
          event.iteration,
          event.task.id,
          event.error,
          event.action
        );
        // Track error for notification if this will abort
        if (event.action === 'abort') {
          lastError = event.error;
        }
        break;

      case 'iteration:retrying':
        logger.iterationRetrying(
          event.iteration,
          event.task.id,
          event.retryAttempt,
          event.maxRetries,
          event.delayMs
        );
        break;

      case 'iteration:skipped':
        logger.iterationSkipped(event.iteration, event.task.id, event.reason);
        break;

      case 'agent:output':
        // Stream agent output with [AGENT] prefix
        if (event.stream === 'stdout') {
          logger.agentOutput(event.data);
        } else {
          logger.agentError(event.data);
        }
        break;

      case 'task:selected':
        logger.taskSelected(event.task.id, event.task.title, event.iteration);
        break;

      case 'engine:paused':
        logger.enginePaused(event.currentIteration);
        currentState = pauseSession(currentState);
        savePersistedSession(currentState).catch(() => {
          // Silently continue on save errors
        });
        break;

      case 'engine:resumed':
        logger.engineResumed(event.fromIteration);
        currentState = { ...currentState, status: 'running', isPaused: false, pausedAt: undefined };
        savePersistedSession(currentState).catch(() => {
          // Silently continue on save errors
        });
        break;

      case 'engine:stopped':
        logger.engineStopped(event.reason, event.totalIterations, event.tasksCompleted);
        // Send max iterations notification if enabled
        if (event.reason === 'max_iterations' && notificationOptions?.notificationsEnabled && engineStartTime) {
          const durationMs = Date.now() - engineStartTime.getTime();
          const engineState = engine.getState();
          const tasksRemaining = engineState.totalTasks - event.tasksCompleted;
          sendMaxIterationsNotification({
            iterationsRun: event.totalIterations,
            tasksCompleted: event.tasksCompleted,
            tasksRemaining,
            durationMs,
            sound: notificationOptions.soundMode,
          });
        }
        // Send error notification if enabled
        if (event.reason === 'error' && notificationOptions?.notificationsEnabled && engineStartTime) {
          const durationMs = Date.now() - engineStartTime.getTime();
          sendErrorNotification({
            errorSummary: lastError ?? 'Unknown error',
            tasksCompleted: event.tasksCompleted,
            durationMs,
            sound: notificationOptions.soundMode,
          });
        }
        break;

      case 'all:complete':
        logger.allComplete(event.totalCompleted, event.totalIterations);
        // Send completion notification if enabled
        if (notificationOptions?.notificationsEnabled && engineStartTime) {
          const durationMs = Date.now() - engineStartTime.getTime();
          sendCompletionNotification({
            durationMs,
            taskCount: event.totalCompleted,
            sound: notificationOptions.soundMode,
          });
        }
        break;

      case 'task:completed':
        // Already logged in iteration:completed handler
        // Remove from active tasks (redundant with iteration:completed but safe)
        currentState = removeActiveTask(currentState, event.task.id);
        savePersistedSession(currentState).catch(() => {
          // Silently continue on save errors
        });
        break;
    }
  });

  // 정상 종료 핸들러
  const gracefulShutdown = async (): Promise<void> => {
    logger.info('system', '중단됨, 정상 종료 중...');
    logger.info('system', '(1초 이내에 Ctrl+C를 다시 누르면 강제 종료)');

    // 활성 (in_progress) 작업들을 open으로 되돌림
    const activeTasks = getActiveTasks(currentState);
    if (activeTasks.length > 0) {
      logger.info('system', `${activeTasks.length}개 in_progress 작업을 open으로 리셋 중...`);
      const resetCount = await engine.resetTasksToOpen(activeTasks);
      if (resetCount > 0) {
        currentState = clearActiveTasks(currentState);
      }
    }

    // Save interrupted state
    currentState = { ...currentState, status: 'interrupted' };
    await savePersistedSession(currentState);

    // Stop remote server if running
    if (remoteServer) {
      await remoteServer.stop();
    }

    await engine.dispose();
    process.exit(0);
  };

  // Handle SIGINT with double-press detection
  const handleSigint = async (): Promise<void> => {
    const now = Date.now();
    const timeSinceLastSigint = now - lastSigintTime;
    lastSigintTime = now;

    // 더블 클릭 감지 - 즉시 강제 종료
    if (timeSinceLastSigint < DOUBLE_PRESS_WINDOW_MS) {
      logger.warn('system', '강제 종료!');
      process.exit(1);
    }

    // Single press - graceful shutdown
    await gracefulShutdown();
  };

  // SIGTERM 처리 (항상 정상 종료, 더블 클릭 없음)
  const handleSigterm = async (): Promise<void> => {
    logger.info('system', 'SIGTERM 수신, 정상 종료 중...');

    // 활성 (in_progress) 작업들을 open으로 되돌림
    const activeTasks = getActiveTasks(currentState);
    if (activeTasks.length > 0) {
      logger.info('system', `${activeTasks.length}개 in_progress 작업을 open으로 리셋 중...`);
      const resetCount = await engine.resetTasksToOpen(activeTasks);
      if (resetCount > 0) {
        currentState = clearActiveTasks(currentState);
      }
    }

    currentState = { ...currentState, status: 'interrupted' };
    await savePersistedSession(currentState);

    // Stop remote server if running
    if (remoteServer) {
      await remoteServer.stop();
    }

    await engine.dispose();
    process.exit(0);
  };

  process.on('SIGINT', handleSigint);
  process.on('SIGTERM', handleSigterm);

  // Log session start
  logger.sessionCreated(
    currentState.sessionId,
    config.agent.plugin,
    config.tracker.plugin
  );

  // Start the engine
  await engine.start();

  // 리슨 모드에서 원격 연결을 위해 프로세스 유지
  if (listenMode) {
    logger.info('system', '엔진 대기 중. 원격 명령 대기 중 (Ctrl+C로 중지)...');

    // Keep process alive until signal received
    await new Promise<void>((_resolve) => {
      // The existing SIGINT/SIGTERM handlers will call process.exit()
      // This promise just keeps the event loop alive indefinitely
    });
  }

  await engine.dispose();

  return currentState;
}

/**
 * 실행 명령어 실행
 */
export async function executeRunCommand(args: string[]): Promise<void> {
  // 도움말 확인
  if (args.includes('--help') || args.includes('-h')) {
    printRunHelp();
    return;
  }

  // 인자 파싱
  const options = parseRunArgs(args);
  const cwd = options.cwd ?? process.cwd();

  // 프로젝트 설정 존재 확인
  const configExists = await projectConfigExists(cwd);

  if (!configExists && !options.noSetup) {
    // 설정 없음 - 설정 실행 제안
    console.log('');
    console.log('이 프로젝트에서 .ralph-tui/config.toml 설정을 찾을 수 없습니다.');
    console.log('');

    // 설정 마법사 실행
    const result = await runSetupWizard({ cwd });

    if (!result.success) {
      if (result.cancelled) {
        console.log('나중에 설정하려면 "ralph-tui setup"을 실행하거나,');
        console.log('"ralph-tui run --no-setup"으로 설정을 건너뛰세요.');
        return;
      }
      console.error('설정 실패:', result.error);
      process.exit(1);
    }

    // 설정 완료, 실행 계속
    console.log('');
    console.log('설정 완료! Ralph를 시작합니다...');
    console.log('');
  } else if (!configExists && options.noSetup) {
    console.log('.ralph-tui/config.toml을 찾을 수 없습니다. 기본 설정을 사용합니다.');
  }

  // 설정 마이그레이션 확인 (버전 변경 시 자동 업그레이드)
  if (configExists) {
    const migrationResult = await checkAndMigrate(cwd, { quiet: false });
    if (migrationResult?.error) {
      console.warn(`경고: 설정 마이그레이션 실패: ${migrationResult.error}`);
    }
  }

  console.log('Ralph TUI 초기화 중...');

  // Initialize plugins
  await initializePlugins();

  // Build configuration
  const config = await buildConfig(options);
  if (!config) {
    process.exit(1);
  }

  // Load stored config for settings view (used when TUI is running)
  const storedConfig = await loadStoredConfig(cwd);

  // 설정 유효성 검사
  const validation = await validateConfig(config);
  if (!validation.valid) {
    console.error('\n설정 오류:');
    for (const error of validation.errors) {
      console.error(`  - ${error}`);
    }
    process.exit(1);
  }

  // 경고 표시
  for (const warning of validation.warnings) {
    console.warn(`경고: ${warning}`);
  }

  // --verify 플래그가 지정된 경우 사전 점검 실행
  if (options.verify) {
    console.log('');
    console.log('에이전트 사전 점검 실행 중...');

    const agentRegistry = getAgentRegistry();
    const agentInstance = await agentRegistry.getInstance(config.agent);

    const preflightResult = await agentInstance.preflight({ timeout: 30000 });

    if (preflightResult.success) {
      console.log('✓ 에이전트 준비 완료');
      if (preflightResult.durationMs) {
        console.log(`  응답 시간: ${preflightResult.durationMs}ms`);
      }
      console.log('');
    } else {
      console.error('');
      console.error('❌ 에이전트 사전 점검 실패');
      if (preflightResult.error) {
        console.error(`   ${preflightResult.error}`);
      }
      if (preflightResult.suggestion) {
        console.error('');
        console.error('제안:');
        for (const line of preflightResult.suggestion.split('\n')) {
          console.error(`  ${line}`);
        }
      }
      console.error('');
      console.error('자세한 진단은 "ralph-tui doctor"를 실행하세요.');
      process.exit(1);
    }
  }

  // beads 트래커 사용 시 에픽이 지정되지 않으면 에픽 선택 TUI 표시
  const isBeadsTracker = config.tracker.plugin === 'beads' || config.tracker.plugin === 'beads-bv';
  if (isBeadsTracker && !config.epicId && config.showTui) {
    console.log('에픽이 지정되지 않았습니다. 에픽 선택 화면 로딩 중...');

    // 에픽 선택을 위한 트래커 인스턴스 가져오기
    const trackerRegistry = getTrackerRegistry();
    const tracker = await trackerRegistry.getInstance(config.tracker);

    // 에픽 선택 TUI 표시
    const selectedEpic = await showEpicSelectionTui(tracker);

    if (!selectedEpic) {
      console.log('에픽 선택이 취소되었습니다.');
      process.exit(0);
    }

    // 선택한 에픽으로 설정 업데이트
    config.epicId = selectedEpic.id;
    config.tracker.options.epicId = selectedEpic.id;

    // 트래커에 setEpicId 메서드가 있으면 호출
    if (tracker instanceof BeadsTrackerPlugin) {
      tracker.setEpicId(selectedEpic.id);
    }

    console.log(`선택된 에픽: ${selectedEpic.id} - ${selectedEpic.title}`);
    console.log('');
  }

  // 지연된 세션을 프롬프트 전에 조기 감지 및 복구
  // TUI가 작업 중간에 종료되어 activeTaskIds가 남아있는 문제를 수정
  const staleRecovery = await detectAndRecoverStaleSession(config.cwd, checkLock);
  if (staleRecovery.wasStale) {
    console.log('');
    console.log('⚠️  지연된 세션 복구됨');
    if (staleRecovery.clearedTaskCount > 0) {
      console.log(`   ${staleRecovery.clearedTaskCount}개의 중단된 in_progress 작업 정리됨`);
    }
    console.log('   세션 상태가 "interrupted" (재개 가능)로 설정됨');
    console.log('');
  }

  // Check for existing persisted session file
  const sessionCheck = await checkSession(config.cwd);
  const hasPersistedSessionFile = await hasPersistedSession(config.cwd);

  // Handle existing persisted session prompt first (before lock acquisition)
  if (hasPersistedSessionFile && !options.force && !options.resume) {
    const choice = await promptResumeOrNew(config.cwd);
    if (choice === 'abort') {
      process.exit(1);
    }
    // Delete old session file if starting fresh
    if (choice === 'new') {
      await deletePersistedSession(config.cwd);
    }
  }

  // Generate session ID early for lock acquisition
  const { randomUUID } = await import('node:crypto');
  const newSessionId = randomUUID();

  // Acquire lock with proper error messages and stale lock handling
  const lockResult = await acquireLockWithPrompt(config.cwd, newSessionId, {
    force: options.force,
    nonInteractive: options.headless,
  });

  if (!lockResult.acquired) {
    console.error(`\n오류: ${lockResult.error}`);
    if (lockResult.existingPid) {
      console.error('  --force를 사용하여 강제로 시작할 수 있습니다.');
    }
    process.exit(1);
  }

  // Register cleanup handlers to release lock on exit/crash
  const cleanupLockHandlers = registerLockCleanupHandlers(config.cwd);

  // 재개 또는 새 세션 처리
  let session;
  if (options.resume && sessionCheck.hasSession) {
    console.log('이전 세션 재개 중...');
    session = await resumeSession(config.cwd);
    if (!session) {
      console.error('세션 재개 실패');
      await releaseLockNew(config.cwd);
      cleanupLockHandlers();
      process.exit(1);
    }
  } else {
    // Create new session (task count will be updated after tracker init)
    // Note: Lock already acquired above, so createSession won't re-acquire

    // Clear progress file for fresh start with new epic
    await clearProgress(config.cwd);

    session = await createSession({
      agentPlugin: config.agent.plugin,
      trackerPlugin: config.tracker.plugin,
      epicId: config.epicId,
      prdPath: config.prdPath,
      maxIterations: config.maxIterations,
      totalTasks: 0, // Will be updated
      cwd: config.cwd,
    });
  }

  // Set session ID on config for use in iteration log filenames
  config.sessionId = session.id;

  console.log(`Session: ${session.id}`);
  console.log(`Agent: ${config.agent.plugin}`);
  console.log(`Tracker: ${config.tracker.plugin}`);
  if (config.epicId) {
    console.log(`Epic: ${config.epicId}`);
  }
  if (config.prdPath) {
    console.log(`PRD: ${config.prdPath}`);
  }
  console.log(`Max iterations: ${config.maxIterations || 'unlimited'}`);
  console.log('');

  // Create and initialize engine
  const engine = new ExecutionEngine(config);

  let tasks: TrackerTask[] = [];
  let tracker: TrackerPlugin;
  try {
    await engine.initialize();
    // Get tasks for persisted state
    const trackerRegistry = getTrackerRegistry();
    tracker = await trackerRegistry.getInstance(config.tracker);

    // Detect and handle stale in_progress tasks from crashed sessions
    // This must happen before we fetch tasks, so they reflect any resets
    await detectAndHandleStaleTasks(config.cwd, tracker, options.headless ?? false);

    tasks = await tracker.getTasks({ status: ['open', 'in_progress', 'completed'] });
  } catch (error) {
    console.error(
      '엔진 초기화 실패:',
      error instanceof Error ? error.message : error
    );
    await endSession(config.cwd, 'failed');
    await releaseLockNew(config.cwd);
    cleanupLockHandlers();
    process.exit(1);
  }

  // --listen 없이 --rotate-token 사용 시 경고
  if (options.rotateToken && !options.listen) {
    console.warn('경고: --rotate-token은 --listen 없이는 효과가 없습니다');
  }

  // Start remote listener if --listen flag is set
  let remoteServer: RemoteServer | null = null;
  if (options.listen) {
    try {
      const listenPort = options.listenPort ?? DEFAULT_LISTEN_OPTIONS.port;

      // 요청 시 토큰 갱신 처리
      let token;
      let isNew = false;
      if (options.rotateToken) {
        token = await rotateServerToken();
        isNew = true; // 갱신된 토큰을 새 토큰으로 취급 (한 번만 표시)
        console.log('');
        console.log('토큰이 성공적으로 갱신되었습니다.');
      } else {
        const result = await getOrCreateServerToken();
        token = result.token;
        isNew = result.isNew;
      }

      // Get git info for remote display
      const gitInfo = getGitInfo(cwd);

      // Resolve sandbox mode for remote display
      const resolvedSandboxModeForRemote = config.sandbox?.enabled
        ? (config.sandbox.mode === 'auto' ? await detectSandboxMode() : config.sandbox.mode)
        : undefined;

      // Create and start the remote server
      remoteServer = await createRemoteServer({
        port: listenPort,
        engine,
        tracker,
        agentName: config.agent.plugin,
        trackerName: config.tracker.plugin,
        currentModel: config.model,
        autoCommit: storedConfig?.autoCommit,
        sandboxConfig: config.sandbox?.enabled ? {
          enabled: true,
          mode: config.sandbox.mode,
          network: config.sandbox.network,
        } : undefined,
        resolvedSandboxMode: resolvedSandboxModeForRemote,
        gitInfo,
        cwd,
      });
      const serverState = await remoteServer.start();
      const actualPort = serverState.port;

      // 연결 정보 표시
      console.log('');
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('                    원격 리스너 활성화됨                         ');
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('');
      if (actualPort !== listenPort) {
        console.log(`  포트: ${actualPort} (요청한 ${listenPort}는 사용 중)`);
      } else {
        console.log(`  포트: ${actualPort}`);
      }
      if (isNew) {
        // 처음 또는 갱신됨 - 전체 토큰 표시
        console.log('');
        console.log('  새 서버 토큰이 생성되었습니다:');
        console.log(`  ${token.value}`);
        console.log('');
        console.log('  ⚠️  이 토큰을 안전하게 저장하세요 - 다시 표시되지 않습니다!');
      } else {
        // 이후 실행 - 보안상 미리보기만 표시 (로그/화면 공유에 노출 방지)
        const tokenPreview = token.value.substring(0, 8) + '...';
        console.log(`  토큰: ${tokenPreview}`);
        const tokenInfo = await getServerTokenInfo();
        if (tokenInfo.daysRemaining !== undefined && tokenInfo.daysRemaining <= 7) {
          console.log(`  ⚠️  토큰이 ${tokenInfo.daysRemaining}일 후 만료됩니다!`);
        }
        console.log('');
        console.log('  힌트: --rotate-token을 사용하여 새 토큰을 생성하고 전체 값을 확인하세요.');
      }
      console.log('');
      console.log('  다른 머신에서 연결:');
      console.log(`    ralph-tui remote add <별칭> <이-호스트>:${actualPort} --token <토큰>`);
      console.log('');
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('');
    } catch (error) {
      console.error(
        '원격 리스너 시작 실패:',
        error instanceof Error ? error.message : error
      );
      await endSession(config.cwd, 'failed');
      await releaseLockNew(config.cwd);
      cleanupLockHandlers();
      process.exit(1);
    }
  }

  // Create persisted session state
  let persistedState = createPersistedSession({
    sessionId: session.id,
    agentPlugin: config.agent.plugin,
    model: config.model,
    trackerPlugin: config.tracker.plugin,
    epicId: config.epicId,
    prdPath: config.prdPath,
    maxIterations: config.maxIterations,
    tasks,
    cwd: config.cwd,
  });

  // Save initial state
  await savePersistedSession(persistedState);

  // Register session in global registry for cross-directory resume
  await registerSession({
    sessionId: session.id,
    cwd: config.cwd,
    status: 'running',
    startedAt: persistedState.startedAt,
    updatedAt: persistedState.updatedAt,
    agentPlugin: config.agent.plugin,
    trackerPlugin: config.tracker.plugin,
    epicId: config.epicId,
    prdPath: config.prdPath,
    sandbox: config.sandbox?.enabled,
  });

  // Resolve notification settings from config + CLI flags
  const notificationsEnabled = resolveNotificationsEnabled(
    storedConfig?.notifications,
    options.notify
  );
  const soundMode: NotificationSoundMode = storedConfig?.notifications?.sound ?? 'off';
  const notificationRunOptions: NotificationRunOptions = {
    notificationsEnabled,
    soundMode,
  };

  // Run with TUI or headless
  try {
    if (config.showTui) {
      // Pass tasks for initial TUI display in "ready" state
      // Also pass storedConfig for settings view
      persistedState = await runWithTui(engine, persistedState, config, tasks, storedConfig, notificationRunOptions);
    } else {
      // Headless mode still auto-starts (for CI/automation)
      persistedState = await runHeadless(engine, persistedState, config, {
        notificationOptions: notificationRunOptions,
        listenMode: options.listen,
        remoteServer,
      });
    }
  } catch (error) {
    console.error(
      '실행 오류:',
      error instanceof Error ? error.message : error
    );
    // Save failed state
    persistedState = failSession(persistedState);
    await savePersistedSession(persistedState);
    // Update registry status to failed
    await updateRegistryStatus(session.id, 'failed');
    await endSession(config.cwd, 'failed');
    await releaseLockNew(config.cwd);
    cleanupLockHandlers();
    process.exit(1);
  }

  // Check if all tasks completed successfully
  const finalState = engine.getState();
  const allComplete = finalState.tasksCompleted >= finalState.totalTasks ||
    finalState.status === 'idle';

  if (allComplete) {
    // 완료로 표시하고 세션 파일 정리
    persistedState = completeSession(persistedState);
    await savePersistedSession(persistedState);
    // 성공적인 완료 시 세션 파일 삭제
    await deletePersistedSession(config.cwd);
    // 완료 시 레지스트리에서 제거
    await unregisterSession(session.id);
    console.log('\n세션이 성공적으로 완료되었습니다. 세션 파일이 정리되었습니다.');
  } else {
    // 현재 상태 저장 (세션은 재개 가능)
    await savePersistedSession(persistedState);
    // 현재 상태로 레지스트리 업데이트
    await updateRegistryStatus(session.id, persistedState.status);
    console.log('\n세션 상태가 저장되었습니다. "ralph-tui resume"로 계속할 수 있습니다.');
  }

  // Stop remote server if running
  if (remoteServer) {
    await remoteServer.stop();
  }

  // 세션 종료 및 잠금 정리
  await endSession(config.cwd, allComplete ? 'completed' : 'interrupted');
  await releaseLockNew(config.cwd);
  cleanupLockHandlers();
  console.log('\nRalph TUI가 종료되었습니다.');

  // Explicitly exit - event listeners may keep process alive otherwise
  process.exit(0);
}
