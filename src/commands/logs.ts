/**
 * ABOUTME: ralph-tui의 logs 명령어.
 * 반복 실행 출력 로그를 나열, 조회, 필터링, 정리합니다.
 */

import {
  listIterationLogs,
  getIterationLogByNumber,
  getIterationLogsByTask,
  cleanupIterationLogs,
  hasIterationLogs,
  getIterationLogCount,
  getIterationLogsDiskUsage,
  getIterationsDir,
} from '../logs/index.js';
import type { IterationLogSummary, IterationLog } from '../logs/index.js';

/**
 * 사람이 읽기 쉬운 형식으로 시간 포맷
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * 표시용 날짜 포맷
 */
function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString();
}

/**
 * 사람이 읽기 쉬운 형식으로 파일 크기 포맷
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * 반복 상태에 대한 상태 아이콘 가져오기
 */
function getStatusIcon(status: string): string {
  switch (status) {
    case 'completed':
      return '✓';
    case 'failed':
      return '✗';
    case 'interrupted':
      return '⊘';
    case 'skipped':
      return '⊖';
    case 'running':
      return '▶';
    default:
      return '○';
  }
}

/**
 * 말줄임표로 텍스트 자르기
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * logs 명령어의 명령줄 인자 파싱
 */
export interface LogsArgs {
  /** 번호로 특정 반복 조회 */
  iteration?: number;

  /** 특정 작업의 반복 조회 */
  taskId?: string;

  /** 오래된 로그 정리 */
  clean: boolean;

  /** 정리 시 유지할 로그 수 */
  keep: number;

  /** 정리 작업의 드라이 런 */
  dryRun: boolean;

  /** 작업 디렉토리 */
  cwd: string;

  /** 상세 출력 표시 */
  verbose: boolean;
}

/**
 * logs 명령어 인자 파싱
 */
export function parseLogsArgs(args: string[]): LogsArgs {
  const result: LogsArgs = {
    clean: false,
    keep: 10,
    dryRun: false,
    cwd: process.cwd(),
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--iteration' || arg === '-i') {
      const value = args[i + 1];
      if (value && !value.startsWith('-')) {
        result.iteration = parseInt(value, 10);
        i++;
      }
    } else if (arg === '--task' || arg === '-t') {
      const value = args[i + 1];
      if (value && !value.startsWith('-')) {
        result.taskId = value;
        i++;
      }
    } else if (arg === '--clean') {
      result.clean = true;
    } else if (arg === '--keep') {
      const value = args[i + 1];
      if (value && !value.startsWith('-')) {
        result.keep = parseInt(value, 10);
        i++;
      }
    } else if (arg === '--dry-run') {
      result.dryRun = true;
    } else if (arg === '--cwd') {
      const value = args[i + 1];
      if (value && !value.startsWith('-')) {
        result.cwd = value;
        i++;
      }
    } else if (arg === '--verbose' || arg === '-v') {
      result.verbose = true;
    }
  }

  return result;
}

/**
 * 단일 반복 로그를 상세히 표시
 */
function displayIterationLog(log: IterationLog, verbose: boolean): void {
  const { metadata, stdout, stderr } = log;

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  반복 ${metadata.iteration}: ${metadata.taskTitle}`);
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  // 메타데이터 섹션
  console.log('  메타데이터');
  console.log('  ────────');
  console.log(`  작업 ID:        ${metadata.taskId}`);
  console.log(`  상태:           ${getStatusIcon(metadata.status)} ${metadata.status}`);
  console.log(`  작업 완료:      ${metadata.taskCompleted ? '예' : '아니오'}`);
  console.log(`  약속 발견:      ${metadata.promiseComplete ? '예' : '아니오'}`);
  console.log(`  시작:           ${formatDate(metadata.startedAt)}`);
  console.log(`  종료:           ${formatDate(metadata.endedAt)}`);
  console.log(`  소요 시간:      ${formatDuration(metadata.durationMs)}`);

  if (metadata.error) {
    console.log(`  오류:           ${metadata.error}`);
  }

  if (metadata.agentPlugin) {
    console.log(`  에이전트:       ${metadata.agentPlugin}`);
  }
  if (metadata.model) {
    console.log(`  모델:           ${metadata.model}`);
  }
  if (metadata.epicId) {
    console.log(`  에픽:           ${metadata.epicId}`);
  }

  console.log('');
  console.log(`  로그 파일: ${log.filePath}`);
  console.log('');

  // 출력 섹션
  console.log('  에이전트 출력');
  console.log('  ────────────');
  console.log('');

  if (stdout && stdout.trim()) {
    if (verbose) {
      console.log(stdout);
    } else {
      // 상세 모드가 아닌 경우 처음 50줄만 표시
      const lines = stdout.split('\n');
      const preview = lines.slice(0, 50).join('\n');
      console.log(preview);
      if (lines.length > 50) {
        console.log('');
        console.log(`  ... (${lines.length - 50}줄 더 있음, 전체 보기는 --verbose 사용)`);
      }
    }
  } else {
    console.log('  (stdout 출력 없음)');
  }

  if (stderr && stderr.trim()) {
    console.log('');
    console.log('  stderr');
    console.log('  ──────');
    console.log('');
    if (verbose) {
      console.log(stderr);
    } else {
      const lines = stderr.split('\n');
      const preview = lines.slice(0, 20).join('\n');
      console.log(preview);
      if (lines.length > 20) {
        console.log('');
        console.log(`  ... (${lines.length - 20}줄 더 있음)`);
      }
    }
  }

  console.log('');
  console.log('───────────────────────────────────────────────────────────────');
  console.log('');
}

/**
 * 반복 로그 요약 목록 표시
 */
function displayLogList(summaries: IterationLogSummary[]): void {
  if (summaries.length === 0) {
    console.log('반복 로그를 찾을 수 없습니다.');
    return;
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('                       반복 로그                                ');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  // 테이블 헤더
  console.log('  #    상태    작업 ID              제목                         소요시간');
  console.log('  ─────────────────────────────────────────────────────────────────────────');

  for (const summary of summaries) {
    const icon = getStatusIcon(summary.status);
    const iter = String(summary.iteration).padStart(3, ' ');
    const status = `${icon} ${summary.status.padEnd(10)}`;
    const taskId = truncate(summary.taskId, 18).padEnd(18);
    const title = truncate(summary.taskTitle, 28).padEnd(28);
    const duration = formatDuration(summary.durationMs);

    console.log(`  ${iter}  ${status} ${taskId} ${title} ${duration}`);
  }

  console.log('');
  console.log(`  총: ${summaries.length}개 반복`);
  console.log('');
}

/**
 * logs 명령어 실행
 */
export async function executeLogsCommand(args: string[]): Promise<void> {
  const parsedArgs = parseLogsArgs(args);
  const { cwd, iteration, taskId, clean, keep, dryRun, verbose } = parsedArgs;

  // --clean 작업 처리
  if (clean) {
    await executeCleanLogs(cwd, keep, dryRun);
    return;
  }

  // 로그 존재 여부 확인
  const hasLogs = await hasIterationLogs(cwd);
  if (!hasLogs) {
    console.log('');
    console.log('반복 로그를 찾을 수 없습니다.');
    console.log('');
    console.log(`로그 저장 위치: ${getIterationsDir(cwd)}`);
    console.log('ralph-tui를 실행하여 로그를 생성하세요.');
    console.log('');
    return;
  }

  // 특정 반복 조회
  if (iteration !== undefined) {
    const log = await getIterationLogByNumber(cwd, iteration);
    if (!log) {
      console.error(`반복 ${iteration}을(를) 찾을 수 없습니다.`);
      process.exit(1);
    }
    displayIterationLog(log, verbose);
    return;
  }

  // 특정 작업의 반복 조회
  if (taskId !== undefined) {
    const logs = await getIterationLogsByTask(cwd, taskId);
    if (logs.length === 0) {
      console.log(`작업에 대한 반복을 찾을 수 없음: ${taskId}`);
      return;
    }

    console.log('');
    console.log(`작업 ${taskId}에 대해 ${logs.length}개 반복 발견`);
    console.log('');

    for (const log of logs) {
      displayIterationLog(log, verbose);
    }
    return;
  }

  // 기본: 모든 로그 나열
  const summaries = await listIterationLogs(cwd);
  displayLogList(summaries);

  // 디스크 사용량 표시
  const diskUsage = await getIterationLogsDiskUsage(cwd);
  const count = await getIterationLogCount(cwd);
  console.log(`  디스크 사용량: ${formatSize(diskUsage)} (${count}개 로그 파일)`);
  console.log('');
  console.log('  명령어:');
  console.log('    ralph-tui logs --iteration 5        반복 5 조회');
  console.log('    ralph-tui logs --task US-005        작업의 로그 조회');
  console.log('    ralph-tui logs --clean --keep 10    오래된 로그 정리');
  console.log('');
}

/**
 * logs 정리 작업 실행
 */
async function executeCleanLogs(cwd: string, keep: number, dryRun: boolean): Promise<void> {
  const count = await getIterationLogCount(cwd);

  if (count === 0) {
    console.log('정리할 반복 로그가 없습니다.');
    return;
  }

  if (count <= keep) {
    console.log(`${count}개 로그만 발견됨, 모두 유지 (임계값: ${keep}).`);
    return;
  }

  const result = await cleanupIterationLogs(cwd, { keep, dryRun });

  if (dryRun) {
    console.log('');
    console.log('드라이 런 - 파일이 삭제되지 않았습니다.');
    console.log('');
    console.log(`삭제 예정: ${result.deletedCount}개 로그`);
    console.log(`유지 예정: ${result.keptCount}개 로그`);
    console.log('');
    if (result.deletedFiles.length > 0) {
      console.log('삭제될 파일:');
      for (const file of result.deletedFiles) {
        console.log(`  - ${file}`);
      }
    }
  } else {
    console.log('');
    console.log(`삭제됨: ${result.deletedCount}개 로그`);
    console.log(`유지됨: ${result.keptCount}개 로그`);
    console.log('');
  }
}

/**
 * logs 명령어 도움말 출력
 */
export function printLogsHelp(): void {
  console.log(`
ralph-tui logs - 반복 실행 출력 로그 조회 및 관리

사용법: ralph-tui logs [옵션]

옵션:
  --iteration, -i <n>   번호로 특정 반복 조회
  --task, -t <id>       작업 ID의 모든 반복 조회
  --clean               오래된 로그 정리
  --keep <n>            정리 시 유지할 로그 수 (기본값: 10)
  --dry-run             삭제하지 않고 삭제될 항목 표시
  --verbose, -v         전체 출력 표시 (잘리지 않음)
  --cwd <path>          작업 디렉토리 (기본값: 현재 디렉토리)

설명:
  ralph-tui 실행 중 저장된 반복 실행 출력 로그를 나열합니다.
  로그는 .ralph-tui/iterations/에 저장되며 다음을 포함합니다:
  - 타임스탬프 및 소요 시간
  - 작업 ID 및 제목
  - 전체 에이전트 stdout/stderr
  - 완료 상태 및 결과

예시:
  ralph-tui logs                        # 모든 반복 로그 나열
  ralph-tui logs --iteration 5          # 반복 5 상세 조회
  ralph-tui logs -i 5                   # 위의 축약형
  ralph-tui logs --task US-005          # US-005의 모든 반복 조회
  ralph-tui logs -t US-005              # 위의 축약형
  ralph-tui logs --clean --keep 10      # 최근 10개를 제외한 모든 로그 삭제
  ralph-tui logs --clean --dry-run      # 삭제하지 않고 정리 미리보기
`);
}
