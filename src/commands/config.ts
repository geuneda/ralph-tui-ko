/**
 * ABOUTME: Ralph TUI의 설정 관리 명령어.
 * 병합된 설정을 소스 정보와 함께 표시하는 'config show'를 제공합니다.
 */

import {
  loadStoredConfigWithSource,
  serializeConfig,
  CONFIG_PATHS,
  type ConfigSource,
  type StoredConfig,
} from '../config/index.js';

/**
 * 박스 그리기 문자로 섹션 헤더 포맷
 */
function sectionHeader(title: string): string {
  return `\n┌─ ${title} ${'─'.repeat(Math.max(0, 50 - title.length))}\n`;
}

/**
 * 설정 소스 정보를 표시용으로 포맷
 */
function formatSourceInfo(source: ConfigSource): string {
  const lines: string[] = [];

  lines.push(sectionHeader('설정 소스'));

  lines.push('│ 전역 설정:');
  if (source.globalPath) {
    lines.push(`│   ✓ ${source.globalPath}`);
  } else {
    lines.push(`│   ○ ${CONFIG_PATHS.global} (찾을 수 없음)`);
  }

  lines.push('│ 프로젝트 설정:');
  if (source.projectPath) {
    lines.push(`│   ✓ ${source.projectPath}`);
  } else {
    lines.push(`│   ○ .ralph-tui/config.toml (프로젝트 트리에서 찾을 수 없음)`);
  }

  lines.push('└' + '─'.repeat(55));

  return lines.join('\n');
}

/**
 * 병합된 설정을 주석이 포함된 YAML로 포맷
 */
function formatMergedConfig(config: StoredConfig): string {
  const lines: string[] = [];

  lines.push(sectionHeader('병합된 설정'));

  // 설정이 비어있는지 확인
  if (Object.keys(config).length === 0) {
    lines.push('│ (설정이 없음 - 기본값 사용)');
    lines.push('│');
    lines.push('│ 기본값:');
    lines.push('│   defaultAgent = "claude"');
    lines.push('│   defaultTracker = "beads-bv"');
    lines.push('│   maxIterations = 10');
    lines.push('│   iterationDelay = 1000');
    lines.push('│   outputDir = ".ralph-output"');
  } else {
    // TOML로 직렬화하고 박스 정렬을 위해 파이프 접두사 추가
    const toml = serializeConfig(config);
    const tomlLines = toml.split('\n');
    for (const line of tomlLines) {
      if (line.trim()) {
        lines.push(`│ ${line}`);
      }
    }
  }

  lines.push('└' + '─'.repeat(55));

  return lines.join('\n');
}

/**
 * 'config show' 명령어 실행.
 * 전역 및 프로젝트 소스에서 병합된 설정을 표시합니다.
 */
export async function executeConfigShowCommand(args: string[]): Promise<void> {
  // 옵션 파싱
  const showSources = args.includes('--sources') || args.includes('-s');
  const showToml = args.includes('--toml') || args.includes('-t');
  const cwdIndex = args.indexOf('--cwd');
  const cwd = cwdIndex !== -1 && args[cwdIndex + 1] ? args[cwdIndex + 1] : process.cwd();

  // 소스 정보와 함께 설정 로드
  const { config, source } = await loadStoredConfigWithSource(cwd);

  // 표시
  console.log('Ralph TUI 설정');
  console.log('═'.repeat(56));

  // 소스 정보
  if (showSources || !showToml) {
    console.log(formatSourceInfo(source));
  }

  // 병합된 설정
  if (showToml) {
    // 원시 TOML 출력 (기계 판독 가능)
    console.log(serializeConfig(config));
  } else {
    console.log(formatMergedConfig(config));
  }

  // 도움말 텍스트
  if (!showToml) {
    console.log('\n힌트: 원시 TOML 출력은 --toml 사용');
    console.log(`      설정 파일 위치 확인은 --sources 사용`);
  }
}

/**
 * config 명령어 도움말 출력
 */
export function printConfigHelp(): void {
  console.log(`
Ralph TUI 설정 명령어

사용법: ralph-tui config <명령어> [옵션]

명령어:
  show              병합된 설정 표시
  help              이 도움말 표시

Show 옵션:
  --sources, -s     설정 소스 파일 표시
  --toml, -t        원시 TOML 출력 (기계 판독 가능)
  --cwd <path>      프로젝트 설정 조회에 지정된 디렉토리 사용

설정 파일:
  전역:    ${CONFIG_PATHS.global}
  프로젝트: .ralph-tui/config.toml (프로젝트 루트 또는 상위 디렉토리)

프로젝트 설정이 전역 설정을 재정의합니다. CLI 플래그가 둘 다 재정의합니다.

config.toml 예시:
  defaultAgent = "claude"
  defaultTracker = "beads-bv"
  maxIterations = 20
  iterationDelay = 2000
  autoCommit = true

  [[agents]]
  name = "claude"
  plugin = "claude"
  default = true
  options = { model = "opus" }

  [[trackers]]
  name = "beads"
  plugin = "beads-bv"
  default = true

  [errorHandling]
  strategy = "skip"
  maxRetries = 3
`);
}

/**
 * config 하위 명령어 실행
 * @returns 명령어가 처리되면 true
 */
export async function executeConfigCommand(args: string[]): Promise<boolean> {
  const subcommand = args[0];

  if (!subcommand || subcommand === 'help' || subcommand === '--help') {
    printConfigHelp();
    return true;
  }

  if (subcommand === 'show') {
    await executeConfigShowCommand(args.slice(1));
    return true;
  }

  console.error(`알 수 없는 config 명령어: ${subcommand}`);
  console.log('사용 가능한 명령어는 "ralph-tui config help"를 실행하세요');
  return true;
}
