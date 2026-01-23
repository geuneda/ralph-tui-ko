/**
 * ABOUTME: Ralph TUI의 설정 명령어.
 * .ralph-tui/config.toml 생성을 위한 대화형 설정 마법사를 실행합니다.
 */

import { runSetupWizard, printError } from '../setup/index.js';

/**
 * setup 명령어 인자 파싱
 */
export function parseSetupArgs(args: string[]): {
  force: boolean;
  cwd: string;
  help: boolean;
} {
  const result = {
    force: false,
    cwd: process.cwd(),
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--force' || arg === '-f') {
      result.force = true;
    } else if (arg === '--cwd' && args[i + 1]) {
      result.cwd = args[++i]!;
    } else if (arg === '--help' || arg === '-h') {
      result.help = true;
    }
  }

  return result;
}

/**
 * setup 명령어 도움말 출력
 */
export function printSetupHelp(): void {
  console.log(`
Ralph TUI 설정 - 대화형 설정 마법사

사용법: ralph-tui setup [옵션]

옵션:
  --force, -f     기존 설정 덮어쓰기
  --cwd <path>    작업 디렉토리 (기본값: 현재 디렉토리)
  --help, -h      이 도움말 표시

설명:
  설정 마법사가 프로젝트용 Ralph TUI 설정을 안내합니다.
  다음 사항들을 설정하게 됩니다:

  1. 이슈 트래커 선택 (beads, json 등)
  2. 트래커별 옵션 설정 (예: 에픽 ID)
  3. AI 에이전트 CLI 선택 (claude, opencode 등)
  4. 반복 제한 및 자동 커밋 환경설정

  설정은 프로젝트 루트의 .ralph-tui/config.toml에 저장됩니다.

예시:
  ralph-tui setup              # 대화형 설정 실행
  ralph-tui setup --force      # 기존 설정 덮어쓰기
`);
}

/**
 * setup 명령어 실행
 */
export async function executeSetupCommand(args: string[]): Promise<void> {
  const parsed = parseSetupArgs(args);

  if (parsed.help) {
    printSetupHelp();
    return;
  }

  const result = await runSetupWizard({
    cwd: parsed.cwd,
    force: parsed.force,
  });

  if (!result.success) {
    if (result.cancelled) {
      // 사용자가 취소함, 메시지는 이미 출력됨
      return;
    }

    printError(result.error ?? '설정 실패');
    process.exit(1);
  }

  // 성공 - 마법사가 이미 완료 메시지 출력함
}
