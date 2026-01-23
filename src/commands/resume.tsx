/**
 * ABOUTME: ralph-tui의 Resume 명령어.
 * 이전에 중단되거나 일시 정지된 세션에서 실행을 계속합니다.
 * 세션 레지스트리를 통한 디렉토리 간 재개를 지원합니다.
 */

import { createCliRenderer } from '@opentui/core';
import { createRoot } from '@opentui/react';
import {
  hasPersistedSession,
  loadPersistedSession,
  isSessionResumable,
  getSessionSummary,
  resumePersistedSession,
  savePersistedSession,
  deletePersistedSession,
  pauseSession,
  updateSessionAfterIteration,
  setSubagentPanelVisible,
  acquireLock,
  releaseLock,
  checkSession,
  cleanStaleLock,
  checkLock,
  detectAndRecoverStaleSession,
  listResumableSessions,
  getSessionById,
  getSessionByCwd,
  findSessionsByPrefix,
  updateRegistryStatus,
  unregisterSession,
  cleanupStaleRegistryEntries,
  getRegistryFilePath,
  type PersistedSessionState,
  type SessionRegistryEntry,
} from '../session/index.js';
import { buildConfig, validateConfig } from '../config/index.js';
import type { RuntimeOptions } from '../config/types.js';
import { ExecutionEngine } from '../engine/index.js';
import { registerBuiltinAgents } from '../plugins/agents/builtin/index.js';
import { registerBuiltinTrackers } from '../plugins/trackers/builtin/index.js';
import { getAgentRegistry } from '../plugins/agents/registry.js';
import { getTrackerRegistry } from '../plugins/trackers/registry.js';
import { RunApp } from '../tui/components/RunApp.js';

/**
 * 파싱된 resume 명령어 인자
 */
export interface ResumeArgs {
  /** 작업 디렉토리 (세션 레지스트리 우선) */
  cwd: string;
  /** 헤드리스 모드로 실행 */
  headless: boolean;
  /** 잠긴 경우에도 강제 재개 */
  force: boolean;
  /** 사용 가능한 세션 나열 */
  list: boolean;
  /** 오래된 레지스트리 항목 정리 */
  cleanup: boolean;
  /** 재개할 세션 ID (부분 접두사 가능) */
  sessionId?: string;
}

/**
 * resume 명령어의 CLI 인자 파싱
 */
export function parseResumeArgs(args: string[]): ResumeArgs {
  let cwd = process.cwd();
  let headless = false;
  let force = false;
  let list = false;
  let cleanup = false;
  let sessionId: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--cwd':
        if (nextArg && !nextArg.startsWith('-')) {
          cwd = nextArg;
          i++;
        }
        break;

      case '--headless':
        headless = true;
        break;

      case '--force':
        force = true;
        break;

      case '--list':
      case '-l':
        list = true;
        break;

      case '--cleanup':
        cleanup = true;
        break;

      default:
        // Positional argument: session ID
        if (!arg.startsWith('-') && !sessionId) {
          sessionId = arg;
        }
        break;
    }
  }

  return { cwd, headless, force, list, cleanup, sessionId };
}

/**
 * 플러그인 레지스트리 초기화
 */
async function initializePlugins(): Promise<void> {
  registerBuiltinAgents();
  registerBuiltinTrackers();

  const agentRegistry = getAgentRegistry();
  const trackerRegistry = getTrackerRegistry();

  await Promise.all([agentRegistry.initialize(), trackerRegistry.initialize()]);
}

/**
 * 표시용 세션 항목 포맷
 */
export function formatSessionEntry(entry: SessionRegistryEntry, index?: number): string {
  const prefix = index !== undefined ? `${index + 1}. ` : '';
  const shortId = entry.sessionId.slice(0, 8);
  const statusIcon = entry.status === 'paused' ? '⏸' :
                     entry.status === 'running' ? '▶' :
                     entry.status === 'interrupted' ? '⚠' : '•';
  const sandboxTag = entry.sandbox ? ' [sandbox]' : '';
  const trackerInfo = entry.epicId ? `epic:${entry.epicId}` :
                      entry.prdPath ? `prd:${entry.prdPath}` : entry.trackerPlugin;

  return `${prefix}${statusIcon} ${shortId}  ${entry.status.padEnd(11)}  ${entry.agentPlugin.padEnd(10)}  ${trackerInfo}${sandboxTag}\n   ${entry.cwd}`;
}

/**
 * 사용 가능한 재개 가능 세션 나열
 */
export async function listSessions(): Promise<void> {
  const sessions = await listResumableSessions();

  if (sessions.length === 0) {
    console.log('재개 가능한 세션을 찾을 수 없습니다.');
    console.log('');
    console.log('새 세션 시작: ralph-tui run');
    return;
  }

  console.log('재개 가능한 세션:');
  console.log('');
  console.log('   ID        상태         에이전트    트래커');
  console.log('   ─────────────────────────────────────────────────');

  for (let i = 0; i < sessions.length; i++) {
    console.log(formatSessionEntry(sessions[i], i));
    console.log('');
  }

  console.log('세션 재개:');
  console.log('  ralph-tui resume <session-id>    # ID로 재개 (처음 8자면 충분)');
  console.log('  ralph-tui resume                 # 현재 디렉토리의 세션 재개');
}

/**
 * 오래된 레지스트리 항목 정리
 */
export async function cleanupRegistry(): Promise<void> {
  console.log('오래된 세션 레지스트리 항목 정리 중...');

  const cleaned = await cleanupStaleRegistryEntries(hasPersistedSession);

  if (cleaned === 0) {
    console.log('오래된 항목을 찾을 수 없습니다.');
  } else {
    console.log(`레지스트리에서 ${cleaned}개의 오래된 세션 제거됨.`);
  }

  console.log(`레지스트리 파일: ${getRegistryFilePath()}`);
}

/**
 * 재개할 세션 해석 - 세션 ID, 현재 디렉토리 또는 레지스트리에서
 */
export async function resolveSession(args: ResumeArgs): Promise<{
  cwd: string;
  registryEntry?: SessionRegistryEntry;
} | null> {
  // 세션 ID가 제공된 경우 레지스트리에서 조회
  if (args.sessionId) {
    // 먼저 정확한 일치 시도
    let entry = await getSessionById(args.sessionId);

    // 정확한 일치가 실패하면 접두사 일치 시도
    if (!entry) {
      const matches = await findSessionsByPrefix(args.sessionId);
      if (matches.length === 1) {
        entry = matches[0];
      } else if (matches.length > 1) {
        console.error(`접두사 '${args.sessionId}'와 일치하는 세션이 여러 개 있습니다:`);
        console.error('');
        for (const match of matches) {
          console.error(`  ${match.sessionId.slice(0, 8)}  ${match.cwd}`);
        }
        console.error('');
        console.error('더 구체적인 세션 ID를 제공하세요.');
        return null;
      }
    }

    if (!entry) {
      console.error(`세션 '${args.sessionId}'을(를) 레지스트리에서 찾을 수 없습니다.`);
      console.error('');
      console.error('사용 가능한 세션을 보려면 "ralph-tui resume --list"를 사용하세요.');
      return null;
    }

    // 세션 파일이 entry의 cwd에 여전히 존재하는지 확인
    const sessionFileExists = await hasPersistedSession(entry.cwd);
    if (!sessionFileExists) {
      console.error(`세션 '${args.sessionId}'이(가) 레지스트리에서 발견되었지만 세션 파일이 없습니다.`);
      console.error(`예상 세션 파일 위치: ${entry.cwd}/.ralph-tui/session.json`);
      console.error('');
      console.error('세션 파일이 삭제되었을 수 있습니다. 레지스트리를 업데이트하려면 --cleanup을 실행하세요.');
      return null;
    }

    return { cwd: entry.cwd, registryEntry: entry };
  }

  // 현재 디렉토리에서 세션 확인
  const hasSession = await hasPersistedSession(args.cwd);
  if (hasSession) {
    // 이 cwd에 대한 레지스트리 항목도 가져오기 시도
    const registryEntry = await getSessionByCwd(args.cwd) ?? undefined;
    return { cwd: args.cwd, registryEntry };
  }

  // 현재 디렉토리에 세션 없음 - 도움이 될 제안을 위해 레지스트리 확인
  const registryEntry = await getSessionByCwd(args.cwd);
  if (registryEntry) {
    // 레지스트리에 항목이 있지만 세션 파일이 없음
    console.error('세션 파일을 찾을 수 없지만 레지스트리 항목이 존재합니다.');
    console.error(`예상 세션 파일 위치: ${args.cwd}/.ralph-tui/session.json`);
    console.error('');
    console.error('세션 파일이 삭제되었을 수 있습니다. 레지스트리를 업데이트하려면 --cleanup을 실행하세요.');
    return null;
  }

  // 사용 가능한 세션이 있는지 확인
  const sessions = await listResumableSessions();

  console.error('현재 디렉토리에서 재개할 세션이 없습니다.');
  console.error(`세션 검색 위치: ${args.cwd}/.ralph-tui/session.json`);
  console.error('');

  if (sessions.length > 0) {
    console.error('다른 디렉토리의 사용 가능한 세션:');
    console.error('');
    for (const session of sessions.slice(0, 3)) {
      console.error(`  ${session.sessionId.slice(0, 8)}  ${session.cwd}`);
    }
    if (sessions.length > 3) {
      console.error(`  ... 그리고 ${sessions.length - 3}개 더`);
    }
    console.error('');
    console.error('특정 세션을 재개하려면 "ralph-tui resume <session-id>"를 사용하세요.');
    console.error('모든 세션을 보려면 "ralph-tui resume --list"를 사용하세요.');
  } else {
    console.error('새 세션 시작: ralph-tui run');
  }

  return null;
}

/**
 * TUI로 실행 엔진 실행 (재개 모드)
 */
async function runWithTui(
  engine: ExecutionEngine,
  cwd: string,
  initialState: PersistedSessionState,
  trackerType?: string,
  currentModel?: string
): Promise<PersistedSessionState> {
  let currentState = initialState;

  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
  });

  const root = createRoot(renderer);

  // 상태 저장을 위해 엔진 이벤트 구독
  engine.on((event) => {
    if (event.type === 'iteration:completed') {
      currentState = updateSessionAfterIteration(currentState, event.result);
      savePersistedSession(currentState).catch(() => {
        // 저장 오류 시 로그만 남기고 실패하지 않음
      });
    } else if (event.type === 'engine:paused') {
      // 일시 정지 상태를 세션 파일에 저장
      currentState = pauseSession(currentState);
      savePersistedSession(currentState).catch(() => {
        // 저장 오류 시 로그만 남기고 실패하지 않음
      });
    } else if (event.type === 'engine:resumed') {
      // 재개 시 일시 정지 상태 해제
      currentState = { ...currentState, status: 'running', isPaused: false, pausedAt: undefined };
      savePersistedSession(currentState).catch(() => {
        // 저장 오류 시 로그만 남기고 실패하지 않음
      });
    }
  });

  const cleanup = async (): Promise<void> => {
    await engine.dispose();
    renderer.destroy();
    await releaseLock(cwd);
  };

  const handleSignal = async (): Promise<void> => {
    // 중단 상태 저장
    currentState = { ...currentState, status: 'interrupted' };
    await savePersistedSession(currentState);
    await cleanup();
    process.exit(0);
  };

  process.on('SIGINT', handleSignal);
  process.on('SIGTERM', handleSignal);

  // 지속 상태를 업데이트하고 저장하는 핸들러
  const handleSubagentPanelVisibilityChange = (visible: boolean): void => {
    currentState = setSubagentPanelVisible(currentState, visible);
    savePersistedSession(currentState).catch(() => {
      // 저장 오류 시 로그만 남기고 실패하지 않음
    });
  };

  root.render(
    <RunApp
      engine={engine}
      cwd={cwd}
      onQuit={async () => {
        // 중단 상태 저장
        currentState = { ...currentState, status: 'interrupted' };
        await savePersistedSession(currentState);
        await cleanup();
        process.exit(0);
      }}
      trackerType={trackerType}
      initialSubagentPanelVisible={initialState.subagentPanelVisible ?? false}
      onSubagentPanelVisibilityChange={handleSubagentPanelVisibilityChange}
      currentModel={currentModel}
    />
  );

  await engine.start();
  await cleanup();
  return currentState;
}

/**
 * 헤드리스 모드로 실행 (재개)
 */
async function runHeadless(
  engine: ExecutionEngine,
  cwd: string,
  initialState: PersistedSessionState
): Promise<PersistedSessionState> {
  let currentState = initialState;

  engine.on((event) => {
    switch (event.type) {
      case 'engine:started':
        console.log(`\nRalph 재개됨. 총 작업: ${event.totalTasks}개`);
        break;

      case 'iteration:started':
        console.log(`\n--- 반복 ${event.iteration}: ${event.task.title} ---`);
        break;

      case 'iteration:completed':
        console.log(
          `반복 ${event.result.iteration} 완료. ` +
            `작업 ${event.result.taskCompleted ? '완료' : '진행 중'}. ` +
            `소요 시간: ${Math.round(event.result.durationMs / 1000)}초`
        );
        // 각 반복 후 상태 저장
        currentState = updateSessionAfterIteration(currentState, event.result);
        savePersistedSession(currentState).catch(() => {
          // 저장 오류 시 로그만 남기고 실패하지 않음
        });
        break;

      case 'iteration:failed':
        console.error(`반복 ${event.iteration} 실패: ${event.error}`);
        break;

      case 'engine:paused':
        console.log('\n일시 정지됨. 계속하려면 "ralph-tui resume"을 사용하세요.');
        currentState = pauseSession(currentState);
        savePersistedSession(currentState).catch(() => {
          // 저장 오류 시 로그만 남기고 실패하지 않음
        });
        break;

      case 'engine:resumed':
        console.log('\n재개됨...');
        currentState = { ...currentState, status: 'running', isPaused: false, pausedAt: undefined };
        savePersistedSession(currentState).catch(() => {
          // 저장 오류 시 로그만 남기고 실패하지 않음
        });
        break;

      case 'engine:stopped':
        console.log(`\nRalph 중지됨. 사유: ${event.reason}`);
        console.log(`총 반복: ${event.totalIterations}회`);
        console.log(`완료된 작업: ${event.tasksCompleted}개`);
        break;

      case 'all:complete':
        console.log('\n모든 작업 완료!');
        break;
    }
  });

  const handleSignal = async (): Promise<void> => {
    console.log('\n중단됨, 중지 중...');
    // 중단 상태 저장
    currentState = { ...currentState, status: 'interrupted' };
    await savePersistedSession(currentState);
    await engine.dispose();
    await releaseLock(cwd);
    process.exit(0);
  };

  process.on('SIGINT', handleSignal);
  process.on('SIGTERM', handleSignal);

  await engine.start();
  await engine.dispose();
  await releaseLock(cwd);
  return currentState;
}

/**
 * resume 명령어 실행
 */
export async function executeResumeCommand(args: string[]): Promise<void> {
  // 도움말 확인
  if (args.includes('--help') || args.includes('-h')) {
    printResumeHelp();
    return;
  }

  const parsedArgs = parseResumeArgs(args);

  // --list 처리
  if (parsedArgs.list) {
    await listSessions();
    return;
  }

  // --cleanup 처리
  if (parsedArgs.cleanup) {
    await cleanupRegistry();
    return;
  }

  // 재개할 세션 해석
  const resolved = await resolveSession(parsedArgs);
  if (!resolved) {
    process.exit(1);
  }

  const { cwd, registryEntry } = resolved;
  const { headless, force } = parsedArgs;

  // 오래된 세션 조기 감지 및 복구
  // TUI 중간에 종료하면 activeTaskIds가 채워진 상태로 남는 문제 수정
  const staleRecovery = await detectAndRecoverStaleSession(cwd, checkLock);
  if (staleRecovery.wasStale) {
    console.log('');
    console.log('⚠️  오래된 세션 복구됨');
    if (staleRecovery.clearedTaskCount > 0) {
      console.log(`   ${staleRecovery.clearedTaskCount}개의 멈춘 진행 중 작업 정리됨`);
    }
    console.log('   세션 상태가 "interrupted" (재개 가능)로 설정됨');
    console.log('');
  }

  // 세션 로드
  const persistedState = await loadPersistedSession(cwd);
  if (!persistedState) {
    console.error('세션 데이터를 로드하지 못했습니다.');
    process.exit(1);
  }

  // 재개 가능 여부 확인
  if (!isSessionResumable(persistedState)) {
    const summary = getSessionSummary(persistedState);
    console.error(`'${summary.status}' 상태의 세션은 재개할 수 없습니다.`);
    console.error('');
    if (summary.status === 'completed') {
      console.error('세션이 이미 완료되었습니다. 새 세션 시작: ralph-tui run');
    } else {
      console.error('세션을 재개할 수 없습니다. 새 세션 시작: ralph-tui run --force');
    }
    process.exit(1);
  }

  // 잠금 충돌 확인
  const sessionCheck = await checkSession(cwd);
  if (sessionCheck.isLocked && !sessionCheck.isStale && !force) {
    console.error('다른 Ralph 인스턴스가 이미 실행 중입니다.');
    console.error(`  PID: ${sessionCheck.lock?.pid}`);
    console.error('재정의하려면 --force를 사용하세요.');
    process.exit(1);
  }

  // 필요한 경우 오래된 잠금 정리
  if (sessionCheck.isStale) {
    await cleanStaleLock(cwd);
  }

  console.log('Ralph TUI 세션 재개 중...');
  console.log('');

  // 플러그인 초기화
  await initializePlugins();

  // 지속 상태에서 설정 빌드
  const options: RuntimeOptions = {
    agent: persistedState.agentPlugin,
    tracker: persistedState.trackerState.plugin,
    epicId: persistedState.trackerState.epicId,
    prdPath: persistedState.trackerState.prdPath,
    iterations: persistedState.maxIterations,
    cwd,
    headless,
    resume: true,
  };

  const config = await buildConfig(options);
  if (!config) {
    process.exit(1);
  }

  // 설정 검증
  const validation = await validateConfig(config);
  if (!validation.valid) {
    console.error('설정 오류:');
    for (const error of validation.errors) {
      console.error(`  - ${error}`);
    }
    process.exit(1);
  }

  // 잠금 획득
  const lockAcquired = await acquireLock(cwd, persistedState.sessionId);
  if (!lockAcquired && !force) {
    console.error('세션 잠금을 획득하지 못했습니다.');
    process.exit(1);
  }

  // 지속 상태를 실행 중으로 업데이트
  const resumedState = resumePersistedSession(persistedState);
  await savePersistedSession(resumedState);

  const summary = getSessionSummary(resumedState);

  // 반복 로그 파일명에 사용할 세션 ID를 설정에 지정
  config.sessionId = summary.sessionId;

  console.log(`세션:       ${summary.sessionId.slice(0, 8)}...`);
  console.log(`에이전트:   ${summary.agentPlugin}`);
  console.log(`트래커:     ${summary.trackerPlugin}`);
  console.log(`진행:       ${summary.tasksCompleted}/${summary.totalTasks}개 작업 완료`);
  console.log(`반복:       ${summary.currentIteration}${summary.maxIterations > 0 ? `/${summary.maxIterations}` : ''}`);
  console.log('');

  // 엔진 생성 및 초기화
  const engine = new ExecutionEngine(config);

  try {
    await engine.initialize();
  } catch (error) {
    console.error(
      '엔진 초기화 실패:',
      error instanceof Error ? error.message : error
    );
    await releaseLock(cwd);
    process.exit(1);
  }

  // 지속 세션에서 엔진 상태 복원
  // 엔진은 새로 시작하지만 세션이 이미 수행된 작업을 추적
  // 작업 상태는 동기화되어야 하는 트래커에서 읽음

  // TUI 또는 헤드리스로 실행
  let finalState: PersistedSessionState;
  try {
    if (!headless && config.showTui) {
      finalState = await runWithTui(engine, cwd, resumedState, config.tracker.plugin, config.model);
    } else {
      finalState = await runHeadless(engine, cwd, resumedState);
    }
  } catch (error) {
    console.error(
      '실행 오류:',
      error instanceof Error ? error.message : error
    );
    await releaseLock(cwd);
    process.exit(1);
  }

  // 성공적 완료 시 세션 파일 정리
  if (finalState.status === 'completed') {
    await deletePersistedSession(cwd);
    // 완료 시 레지스트리에서 제거
    if (registryEntry) {
      await unregisterSession(registryEntry.sessionId);
    }
    console.log('세션 완료 및 정리됨.');
  } else if (finalState.status === 'paused') {
    // 레지스트리 상태 업데이트
    if (registryEntry) {
      await updateRegistryStatus(registryEntry.sessionId, 'paused');
    }
    console.log('\n세션 일시 정지됨. 계속하려면 "ralph-tui resume"을 사용하세요.');
  } else {
    // 현재 상태로 레지스트리 업데이트
    if (registryEntry) {
      await updateRegistryStatus(registryEntry.sessionId, finalState.status);
    }
    console.log('\n세션 상태 저장됨. 계속하려면 "ralph-tui resume"을 사용하세요.');
  }

  console.log('\nRalph TUI 종료됨.');
}

/**
 * resume 명령어 도움말 출력
 */
export function printResumeHelp(): void {
  console.log(`
ralph-tui resume - 이전 세션에서 계속

사용법: ralph-tui resume [session-id] [옵션]

인자:
  session-id        재개할 세션 ID (처음 8자면 충분)
                    미제공 시 현재 디렉토리의 세션 재개

옵션:
  --list, -l        모든 재개 가능한 세션 나열
  --cleanup         세션 레지스트리에서 오래된 항목 제거
  --cwd <path>      작업 디렉토리 (기본값: 현재 디렉토리)
  --headless        TUI 없이 실행
  --force           다른 인스턴스가 실행 중인 것처럼 보여도 강제 재개

설명:
  이전에 중단되거나 일시 정지된 세션에서 실행을 재개합니다.
  세션 상태는 .ralph-tui/session.json에 저장됩니다.

  다음 상태 중 하나인 세션을 재개할 수 있습니다:
  - paused: 사용자가 수동으로 일시 정지
  - running: 예기치 않게 충돌 또는 중단됨
  - interrupted: 시그널(Ctrl+C)로 중지됨

  디렉토리 간 재개:
  세션은 전역 레지스트리(~/.config/ralph-tui/sessions.json)에 등록되어
  세션 ID를 사용하여 모든 디렉토리에서 세션을 재개할 수 있습니다.

  완료되거나 실패한 세션은 재개할 수 없습니다. 새 세션을 시작하려면
  'ralph-tui run --force'를 사용하세요.

예시:
  ralph-tui resume              # 현재 디렉토리의 세션 재개
  ralph-tui resume --list       # 모든 재개 가능한 세션 나열
  ralph-tui resume a1b2c3d4     # ID로 세션 재개 (모든 디렉토리에서)
  ralph-tui resume --headless   # TUI 없이 재개
  ralph-tui resume --force      # 강제 재개 (오래된 잠금 재정의)
  ralph-tui resume --cleanup    # 오래된 레지스트리 항목 정리
`);
}
