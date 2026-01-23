#!/usr/bin/env bun
/**
 * ABOUTME: Ralph TUI 애플리케이션의 CLI 진입점.
 * 하위 명령어(plugins, run 등)를 처리하고 하위 명령어가 없으면 'run'을 기본값으로 사용합니다.
 */

import {
  printTrackerPlugins,
  printAgentPlugins,
  printPluginsHelp,
  executeRunCommand,
  executeStatusCommand,
  executeResumeCommand,
  executeConfigCommand,
  executeSetupCommand,
  executeLogsCommand,
  executeTemplateCommand,
  executeCreatePrdCommand,
  executeConvertCommand,
  executeDocsCommand,
  executeDoctorCommand,
  executeInfoCommand,
  executeSkillsCommand,
  executeRemoteCommand,
} from './commands/index.js';

/**
 * CLI 도움말 메시지 표시.
 */
function showHelp(): void {
  console.log(`
Ralph TUI - AI 에이전트 루프 오케스트레이터

사용법: ralph-tui [명령어] [옵션]

명령어:
  (없음)              Ralph 실행 시작 ('run'과 동일)
  create-prd [옵션]   대화형으로 새 PRD 생성 (별칭: prime)
  convert [옵션]      PRD 마크다운을 JSON 형식으로 변환
  run [옵션]          Ralph 실행 시작
  resume [옵션]       중단된 세션 재개
  status [옵션]       세션 상태 확인 (headless, CI/스크립트용)
  remote [하위명령]   원격 서버 설정 관리
  logs [옵션]         반복 출력 로그 보기/관리
  setup [옵션]        대화형 프로젝트 설정 실행 (별칭: init)
  doctor [옵션]       에이전트 설정 문제 진단
  config show         병합된 설정 표시
  template show       현재 프롬프트 템플릿 표시
  template init       커스터마이징을 위해 기본 템플릿 복사
  template install    template init의 별칭
  skills list         번들 스킬 목록
  skills install      ~/.claude/skills/에 스킬 설치
  plugins agents      사용 가능한 에이전트 플러그인 목록
  plugins trackers    사용 가능한 트래커 플러그인 목록
  docs [섹션]         브라우저에서 문서 열기
  info [옵션]         버그 리포트용 시스템 정보 표시
  help, --help, -h    이 도움말 메시지 표시
  version, --version, -v  버전 번호 표시

Run 옵션:
  --epic <id>         Beads 트래커용 Epic ID
  --prd <path>        PRD 파일 경로 (자동으로 json 트래커로 전환)
  --agent <name>      에이전트 플러그인 재정의 (예: claude, opencode)
  --model <name>      모델 재정의 (예: opus, sonnet)
  --tracker <name>    트래커 플러그인 재정의 (예: beads, beads-bv, json)
  --iterations <n>    최대 반복 횟수 (0 = 무제한)
  --resume            기존 세션 재개 (사용 중단, 'resume' 명령어 사용)
  --headless          TUI 없이 실행 (별칭: --no-tui)
  --no-tui            TUI 없이 실행, 구조화된 로그를 stdout으로 출력
  --no-setup          설정이 없어도 대화형 설정 건너뛰기
  --verify            시작 전 에이전트 사전 검사 실행
  --notify            데스크톱 알림 강제 활성화
  --no-notify         데스크톱 알림 강제 비활성화
  --sandbox           샌드박싱 활성화 (자동 모드)
  --sandbox=bwrap     Bubblewrap 샌드박싱 강제 (Linux)
  --sandbox=sandbox-exec  sandbox-exec 강제 (macOS)
  --no-sandbox        샌드박싱 비활성화
  --no-network        샌드박스에서 네트워크 접근 비활성화
  --listen            원격 리스너 활성화 (WebSocket 서버)
  --listen-port <n>   원격 리스너 포트 (기본값: 7890)
  --rotate-token      리스너 시작 전 서버 토큰 교체

Resume 옵션:
  --cwd <path>        작업 디렉토리
  --headless          TUI 없이 실행
  --force             오래된 잠금 무시

Status 옵션:
  --json              CI/스크립트용 JSON 형식으로 출력
  --cwd <path>        작업 디렉토리

Convert 옵션:
  --to <format>       대상 형식: json
  --output, -o <path> 출력 파일 경로 (기본값: ./prd.json)
  --branch, -b <name> Git 브랜치 이름 (미지정시 프롬프트)
  --force, -f         기존 파일 덮어쓰기

예시:
  ralph-tui                              # 실행 시작 ('run'과 동일)
  ralph-tui create-prd                   # 대화형으로 새 PRD 생성
  ralph-tui create-prd --chat            # AI 채팅 모드로 PRD 생성
  ralph-tui convert --to json ./prd.md   # PRD를 JSON으로 변환
  ralph-tui run                          # 기본값으로 실행 시작
  ralph-tui run --epic myproject-epic    # 특정 epic으로 실행
  ralph-tui run --prd ./prd.json         # PRD 파일로 실행
  ralph-tui resume                       # 중단된 세션 재개
  ralph-tui status                       # 세션 상태 확인
  ralph-tui status --json                # CI/스크립트용 JSON 출력
  ralph-tui logs                         # 반복 로그 목록
  ralph-tui logs --iteration 5           # 특정 반복 보기
  ralph-tui logs --task US-005           # 작업의 로그 보기
  ralph-tui logs --clean --keep 10       # 오래된 로그 정리
  ralph-tui plugins agents               # 에이전트 플러그인 목록
  ralph-tui plugins trackers             # 트래커 플러그인 목록
  ralph-tui template show                # 현재 프롬프트 템플릿 표시
  ralph-tui template init                # 커스텀 템플릿 생성
  ralph-tui doctor                       # 에이전트 설정 확인
  ralph-tui doctor --json                # 스크립트용 JSON 출력
  ralph-tui docs                         # 브라우저에서 문서 열기
  ralph-tui docs quickstart              # 빠른 시작 가이드 열기
  ralph-tui info                         # 버그 리포트용 시스템 정보 표시
  ralph-tui info -c                      # GitHub 이슈용 복사 가능 형식
  ralph-tui skills list                  # 번들 스킬 목록
  ralph-tui skills install --force       # 모든 스킬 강제 재설치
  ralph-tui run --listen                 # 원격 리스너 활성화하여 실행
  ralph-tui run --listen --rotate-token  # 토큰 교체 후 리스너 시작
  ralph-tui remote add prod server:7890 --token abc  # 원격 추가
  ralph-tui remote list                  # 상태와 함께 원격 목록
  ralph-tui remote test prod             # 연결 테스트
`);
}

/**
 * TUI 실행 전 하위 명령어 처리.
 * @returns 하위 명령어가 처리되어 종료해야 하면 true
 */
async function handleSubcommand(args: string[]): Promise<boolean> {
  const command = args[0];

  // Version command
  if (command === 'version' || command === '--version' || command === '-v') {
    // Dynamic import to get version from package.json
    const pkg = await import('../package.json', { with: { type: 'json' } });
    console.log(`ralph-tui ${pkg.default.version}`);
    return true;
  }

  // Help command
  if (command === 'help' || command === '--help' || command === '-h') {
    showHelp();
    return true;
  }

  // Create-PRD command (with alias: prime)
  if (command === 'create-prd' || command === 'prime') {
    await executeCreatePrdCommand(args.slice(1));
    return true;
  }

  // Init command (alias for setup)
  if (command === 'init') {
    await executeSetupCommand(args.slice(1));
    return true;
  }

  // Convert command
  if (command === 'convert') {
    await executeConvertCommand(args.slice(1));
    return true;
  }

  // Run command
  if (command === 'run') {
    await executeRunCommand(args.slice(1));
    return true;
  }

  // Resume command
  if (command === 'resume') {
    await executeResumeCommand(args.slice(1));
    return true;
  }

  // Status command
  if (command === 'status') {
    await executeStatusCommand(args.slice(1));
    return true;
  }

  // Logs command
  if (command === 'logs') {
    await executeLogsCommand(args.slice(1));
    return true;
  }

  // Config command
  if (command === 'config') {
    await executeConfigCommand(args.slice(1));
    return true;
  }

  // Setup command
  if (command === 'setup') {
    await executeSetupCommand(args.slice(1));
    return true;
  }

  // Template command
  if (command === 'template') {
    await executeTemplateCommand(args.slice(1));
    return true;
  }

  // Docs command
  if (command === 'docs') {
    await executeDocsCommand(args.slice(1));
    return true;
  }

  // Doctor command
  if (command === 'doctor') {
    await executeDoctorCommand(args.slice(1));
    return true;
  }

  // Info command
  if (command === 'info') {
    await executeInfoCommand(args.slice(1));
    return true;
  }

  // Skills command
  if (command === 'skills') {
    await executeSkillsCommand(args.slice(1));
    return true;
  }

  // Remote command (manage remote configurations)
  if (command === 'remote') {
    await executeRemoteCommand(args.slice(1));
    return true;
  }

  // Plugins commands
  if (command === 'plugins') {
    const subcommand = args[1];

    if (subcommand === '--help' || subcommand === '-h') {
      printPluginsHelp();
      return true;
    }

    if (subcommand === 'agents') {
      await printAgentPlugins();
      return true;
    }

    if (subcommand === 'trackers') {
      await printTrackerPlugins();
      return true;
    }

    // 알 수 없거나 누락된 plugins 하위 명령어
    if (subcommand) {
      console.error(`알 수 없는 plugins 하위 명령어: ${subcommand}`);
    }
    printPluginsHelp();
    return true;
  }

  // 알 수 없는 명령어
  if (command && !command.startsWith('-')) {
    console.error(`알 수 없는 명령어: ${command}`);
    showHelp();
    process.exit(1);
  }

  return false;
}

/**
 * 메인 진입점
 */
async function main(): Promise<void> {
  // 명령줄 인자 가져오기 (node와 스크립트 경로 건너뛰기)
  const args = process.argv.slice(2);

  // 하위 명령어 처리
  const handled = await handleSubcommand(args);
  if (handled) {
    return;
  }

  // 하위 명령어 없음 - 'run' 명령어를 기본값으로
  await executeRunCommand(args);
}

// 메인 함수 실행
main().catch((error: unknown) => {
  console.error('Ralph TUI 시작 실패:', error);
  process.exit(1);
});
