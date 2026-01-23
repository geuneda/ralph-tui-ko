/**
 * ABOUTME: ralph-tui의 status 명령어 (헤드리스).
 * CI/스크립트용으로 기존 세션에 대한 정보를 표시합니다.
 * --json 플래그와 적절한 종료 코드를 지원합니다.
 */

import {
  hasPersistedSession,
  loadPersistedSession,
  getSessionSummary,
  isSessionResumable,
  checkLock,
} from '../session/index.js';
import type { PersistedSessionState } from '../session/persistence.js';
import type { LockCheckResult } from '../session/lock.js';

/**
 * 현재 디렉토리에서 Ralph의 전체 상태
 */
export type RalphStatus =
  | 'running'    // 실행 중인 프로세스가 활성 잠금을 보유
  | 'paused'     // 세션 일시 중지됨, 재개 가능
  | 'completed'  // 세션 성공적으로 완료
  | 'failed'     // 세션 실패
  | 'no-session'; // 세션 파일이 존재하지 않음

/**
 * CI/스크립트용 종료 코드
 * - 0: completed (성공)
 * - 1: running 또는 paused (진행 중)
 * - 2: failed 또는 no-session (오류 상태)
 */
export type StatusExitCode = 0 | 1 | 2;

/**
 * --json 플래그용 JSON 출력 구조
 */
export interface StatusJsonOutput {
  /** 전체 상태 */
  status: RalphStatus;

  /** 세션이 있는 경우 세션 상세 정보 */
  session?: {
    /** 세션 ID */
    id: string;

    /** 파일에서의 세션 상태 */
    status: string;

    /** 작업 진행률 */
    progress: {
      /** 완료된 작업 수 */
      completed: number;
      /** 총 작업 수 */
      total: number;
      /** 완료 백분율 */
      percent: number;
    };

    /** 반복 진행률 */
    iteration: {
      /** 현재 반복 번호 */
      current: number;
      /** 최대 반복 횟수 (0 = 무제한) */
      max: number;
    };

    /** 경과 시간 (초) */
    elapsedSeconds: number;

    /** 활성 트래커 플러그인 이름 */
    tracker: string;

    /** 활성 에이전트 플러그인 이름 */
    agent: string;

    /** 사용 중인 모델 (지정된 경우) */
    model?: string;

    /** 에픽 ID (beads 트래커용) */
    epicId?: string;

    /** PRD 경로 (json 트래커용) */
    prdPath?: string;

    /** 세션 시작 시간 (ISO 8601) */
    startedAt: string;

    /** 세션 마지막 업데이트 시간 (ISO 8601) */
    updatedAt: string;

    /** 세션 재개 가능 여부 */
    resumable: boolean;
  };

  /** 잠금 상태 */
  lock?: {
    /** 잠금이 보유되었는지 여부 */
    isLocked: boolean;
    /** 잠금이 오래되었는지 여부 (프로세스가 실행 중이 아님) */
    isStale: boolean;
    /** 잠금 보유자의 PID */
    pid?: number;
    /** 잠금 보유자의 호스트명 */
    hostname?: string;
  };
}

/**
 * 사람이 읽기 쉬운 형식으로 기간 포맷
 */
function formatDuration(startedAt: string, updatedAt: string): string {
  const start = new Date(startedAt).getTime();
  const end = new Date(updatedAt).getTime();
  const durationMs = end - start;

  const seconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * 세션 타임스탬프에서 경과 시간(초) 가져오기
 */
function getElapsedSeconds(startedAt: string, updatedAt: string): number {
  const start = new Date(startedAt).getTime();
  const end = new Date(updatedAt).getTime();
  return Math.floor((end - start) / 1000);
}

/**
 * 표시용 날짜 포맷
 */
function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString();
}

/**
 * 전체 Ralph 상태 결정
 */
function determineStatus(
  session: PersistedSessionState | null,
  lockCheck: LockCheckResult
): RalphStatus {
  // Ralph가 활성 상태로 실행 중인지 확인 (실행 중인 프로세스가 잠금을 보유)
  if (lockCheck.isLocked) {
    return 'running';
  }

  // 세션 파일이 없음
  if (!session) {
    return 'no-session';
  }

  // 세션이 존재함 - 상태 확인
  switch (session.status) {
    case 'running':
      // 세션은 running이라고 하지만 잠금이 없음 - 크래시되었거나 잠금이 오래됨
      // 세션이 running이라고 생각하므로 running으로 처리
      return 'running';
    case 'paused':
      return 'paused';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'interrupted':
      // interrupted는 재개 가능, paused로 처리
      return 'paused';
    default:
      return 'no-session';
  }
}

/**
 * 주어진 상태에 대한 종료 코드 가져오기
 */
function getExitCode(status: RalphStatus): StatusExitCode {
  switch (status) {
    case 'completed':
      return 0;
    case 'running':
    case 'paused':
      return 1;
    case 'failed':
    case 'no-session':
      return 2;
  }
}

/**
 * 세션 및 잠금 데이터에서 JSON 출력 빌드
 */
function buildJsonOutput(
  status: RalphStatus,
  session: PersistedSessionState | null,
  lockCheck: LockCheckResult
): StatusJsonOutput {
  const output: StatusJsonOutput = {
    status,
  };

  // 가능한 경우 세션 상세 정보 추가
  if (session) {
    const summary = getSessionSummary(session);
    const progressPercent = summary.totalTasks > 0
      ? Math.round((summary.tasksCompleted / summary.totalTasks) * 100)
      : 0;

    output.session = {
      id: summary.sessionId,
      status: summary.status,
      progress: {
        completed: summary.tasksCompleted,
        total: summary.totalTasks,
        percent: progressPercent,
      },
      iteration: {
        current: summary.currentIteration,
        max: summary.maxIterations,
      },
      elapsedSeconds: getElapsedSeconds(summary.startedAt, summary.updatedAt),
      tracker: summary.trackerPlugin,
      agent: summary.agentPlugin,
      model: session.model,
      epicId: summary.epicId,
      prdPath: summary.prdPath,
      startedAt: summary.startedAt,
      updatedAt: summary.updatedAt,
      resumable: summary.isResumable,
    };
  }

  // 가능한 경우 잠금 상세 정보 추가
  if (lockCheck.lock) {
    output.lock = {
      isLocked: lockCheck.isLocked,
      isStale: lockCheck.isStale,
      pid: lockCheck.lock.pid,
      hostname: lockCheck.lock.hostname,
    };
  }

  return output;
}

/**
 * 사람이 읽기 쉬운 상태 출력
 */
function printHumanStatus(
  status: RalphStatus,
  session: PersistedSessionState | null,
  lockCheck: LockCheckResult
): void {
  // 세션 없음
  if (!session && status === 'no-session') {
    console.log('세션을 찾을 수 없습니다.');
    console.log('');
    console.log('새 세션 시작: ralph-tui run');
    return;
  }

  const summary = session ? getSessionSummary(session) : null;
  const resumable = session ? isSessionResumable(session) : false;

  // 세션 정보 표시
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('                    Ralph TUI 세션 상태                          ');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  // 아이콘과 함께 상태
  const statusIcon = getStatusIcon(status);
  console.log(`  상태:          ${statusIcon} ${status.toUpperCase()}`);

  if (summary) {
    // 세션 상세 정보
    console.log(`  세션 ID:       ${summary.sessionId.slice(0, 8)}...`);
    console.log(`  시작 시간:     ${formatDate(summary.startedAt)}`);
    console.log(`  최종 업데이트: ${formatDate(summary.updatedAt)}`);
    console.log(`  경과 시간:     ${formatDuration(summary.startedAt, summary.updatedAt)}`);
    console.log('');

    // 진행률
    const progressPercent = summary.totalTasks > 0
      ? Math.round((summary.tasksCompleted / summary.totalTasks) * 100)
      : 0;
    const progressBar = createProgressBar(progressPercent, 30);

    console.log('  진행률:');
    console.log(`    ${progressBar} ${progressPercent}%`);
    console.log(`    작업: ${summary.tasksCompleted}/${summary.totalTasks} 완료`);
    console.log(`    반복: ${summary.currentIteration}${summary.maxIterations > 0 ? `/${summary.maxIterations}` : ''}`);
    console.log('');

    // 설정
    console.log('  설정:');
    console.log(`    에이전트:    ${summary.agentPlugin}`);
    console.log(`    트래커:      ${summary.trackerPlugin}`);
    if (session?.model) {
      console.log(`    모델:        ${session.model}`);
    }
    if (summary.epicId) {
      console.log(`    에픽:        ${summary.epicId}`);
    }
    if (summary.prdPath) {
      console.log(`    PRD:         ${summary.prdPath}`);
    }
    console.log('');
  }

  // 관련 있는 경우 잠금 정보
  if (lockCheck.lock && lockCheck.isLocked) {
    console.log('  잠금:');
    console.log(`    PID:         ${lockCheck.lock.pid}`);
    console.log(`    호스트:      ${lockCheck.lock.hostname}`);
    console.log('');
  } else if (lockCheck.lock && lockCheck.isStale) {
    console.log(`  ⚠️  오래된 잠금 감지됨 (PID ${lockCheck.lock.pid}가 실행 중이 아님)`);
    console.log('');
  }

  // 반복 이력 요약
  if (session && session.iterations.length > 0) {
    console.log('  최근 반복:');
    const recentIterations = session.iterations.slice(-5);
    for (const iter of recentIterations) {
      const iterStatus = getIterationStatusIcon(iter.status);
      const duration = Math.round(iter.durationMs / 1000);
      console.log(
        `    ${iterStatus} 반복 ${iter.iteration}: ${iter.taskTitle.slice(0, 40)}${iter.taskTitle.length > 40 ? '...' : ''} (${duration}s)`
      );
    }
    if (session.iterations.length > 5) {
      console.log(`    ... 그리고 ${session.iterations.length - 5}개 더`);
    }
    console.log('');
  }

  // 건너뛴 작업
  if (session && session.skippedTaskIds.length > 0) {
    console.log(`  건너뛴 작업: ${session.skippedTaskIds.length}`);
    console.log('');
  }

  // 액션
  console.log('───────────────────────────────────────────────────────────────');
  if (resumable) {
    console.log('  이 세션은 재개할 수 있습니다.');
    console.log('');
    console.log('  재개하려면:     ralph-tui resume');
    console.log('  다시 시작하려면: ralph-tui run --force');
  } else if (status === 'completed') {
    console.log('  이 세션이 완료되었습니다.');
    console.log('');
    console.log('  새로 시작하려면: ralph-tui run');
  } else if (status === 'failed') {
    console.log('  이 세션이 실패했습니다.');
    console.log('');
    console.log('  다시 시작하려면: ralph-tui run --force');
  } else if (status === 'running') {
    console.log('  Ralph가 현재 실행 중입니다.');
    console.log('');
    console.log('  중지하려면:     실행 중인 터미널에서 Ctrl+C 사용');
  }
  console.log('───────────────────────────────────────────────────────────────');
  console.log('');
}

/**
 * 상태 아이콘 가져오기
 */
function getStatusIcon(status: RalphStatus): string {
  switch (status) {
    case 'running':
      return '▶';
    case 'paused':
      return '⏸';
    case 'completed':
      return '✓';
    case 'failed':
      return '✗';
    case 'no-session':
      return '○';
  }
}

/**
 * 반복 상태 아이콘 가져오기
 */
function getIterationStatusIcon(status: string): string {
  switch (status) {
    case 'completed':
      return '✓';
    case 'failed':
      return '✗';
    case 'interrupted':
      return '⊘';
    case 'skipped':
      return '⊖';
    default:
      return '○';
  }
}

/**
 * 진행 막대 문자열 생성
 */
function createProgressBar(percent: number, width: number): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
}

/**
 * status 명령어 실행
 */
export async function executeStatusCommand(args: string[]): Promise<void> {
  // 인자 파싱
  let cwd = process.cwd();
  let outputJson = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cwd' && args[i + 1]) {
      cwd = args[i + 1];
      i++; // 다음 인자 건너뛰기
    } else if (args[i] === '--json') {
      outputJson = true;
    } else if (args[i] === '--help' || args[i] === '-h') {
      printStatusHelp();
      return;
    }
  }

  // 잠금 상태 확인
  const lockCheck = await checkLock(cwd);

  // 세션 확인
  const hasSession = await hasPersistedSession(cwd);

  // 세션이 있으면 로드
  const session = hasSession ? await loadPersistedSession(cwd) : null;

  // 전체 상태 결정
  const status = determineStatus(session, lockCheck);

  // 종료 코드 가져오기
  const exitCode = getExitCode(status);

  // 형식에 따라 출력
  if (outputJson) {
    const jsonOutput = buildJsonOutput(status, session, lockCheck);
    console.log(JSON.stringify(jsonOutput, null, 2));
  } else {
    printHumanStatus(status, session, lockCheck);
  }

  // 적절한 코드로 종료
  process.exit(exitCode);
}

/**
 * status 명령어 도움말 출력
 */
export function printStatusHelp(): void {
  console.log(`
ralph-tui status - 세션 상태 확인 (헤드리스)

사용법: ralph-tui status [옵션]

옵션:
  --json            JSON 형식으로 출력 (기계 판독 가능)
  --cwd <path>      작업 디렉토리 (기본값: 현재 디렉토리)
  -h, --help        이 도움말 표시

종료 코드:
  0    세션 성공적으로 완료
  1    세션 실행 중 또는 일시 중지 (진행 중)
  2    세션 실패 또는 세션 없음

설명:
  기존 Ralph 세션에 대한 정보를 표시합니다:
  - 현재 상태 (running, paused, completed, failed, no-session)
  - 진행률 (완료된 작업, 현재 반복)
  - 경과 시간
  - 활성 트래커 및 에이전트
  - 설정 (에픽/prd)
  - 세션 재개 가능 여부

  --json 사용 시, CI 파이프라인 및 스크립트에 적합한
  구조화된 데이터의 JSON 객체를 출력합니다.

예시:
  ralph-tui status              # 사람이 읽기 쉬운 출력
  ralph-tui status --json       # 스크립트용 JSON 출력
  ralph-tui status --cwd /path  # 특정 디렉토리에서 세션 확인

CI/스크립트 사용:
  # Ralph가 완료되었는지 확인
  if ralph-tui status --json | jq -e '.status == "completed"' > /dev/null; then
    echo "Ralph가 성공적으로 완료됨"
  fi

  # 작업 진행률 가져오기
  ralph-tui status --json | jq '.session.progress.percent'
`);
}
