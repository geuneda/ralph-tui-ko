/**
 * ABOUTME: 프롬프트 템플릿 조회 및 초기화 명령어.
 * ralph-tui template show와 ralph-tui template init 명령어를 제공합니다.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadStoredConfig } from '../config/index.js';
import {
  loadTemplate,
  getTemplateTypeFromPlugin,
  copyBuiltinTemplate,
  getCustomTemplatePath,
  installBuiltinTemplates,
  type BuiltinTemplateType,
} from '../templates/index.js';

// ANSI 색상 코드
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const RED = '\x1b[31m';

/**
 * template 명령어 실행
 * @param args 명령어 인자: ['show'] 또는 ['init', 옵션...]
 */
export async function executeTemplateCommand(args: string[]): Promise<void> {
  const subcommand = args[0];

  // 도움말 플래그 확인
  if (subcommand === '--help' || subcommand === '-h') {
    printTemplateHelp();
    return;
  }

  if (subcommand === 'show') {
    // 하위 명령어 인자에서 도움말 확인
    if (args.includes('--help') || args.includes('-h')) {
      printTemplateHelp();
      return;
    }
    await handleShowTemplate(args.slice(1));
    return;
  }

  if (subcommand === 'init' || subcommand === 'install') {
    // 하위 명령어 인자에서 도움말 확인
    if (args.includes('--help') || args.includes('-h')) {
      printTemplateHelp();
      return;
    }
    await handleInitTemplate(args.slice(1));
    return;
  }

  // 도움말 또는 알 수 없는 하위 명령어
  printTemplateHelp();
}

/**
 * template 명령어 도움말 출력
 * index.ts에서 사용하기 위해 내보냄
 */
export function printTemplateHelp(): void {
  showTemplateHelp();
}

/**
 * template 명령어 도움말 표시
 */
function showTemplateHelp(): void {
  console.log(`
${BOLD}ralph-tui template${RESET} - 프롬프트 템플릿 관리

${BOLD}명령어:${RESET}
  ${CYAN}show${RESET}              현재 사용 중인 템플릿 표시
  ${CYAN}init${RESET}              커스터마이징을 위해 기본 템플릿 복사
  ${CYAN}install${RESET}           init의 별칭

${BOLD}Show 옵션:${RESET}
  ${DIM}--tracker <name>${RESET}   특정 트래커의 템플릿 표시 (default, beads, beads-bv, json)
  ${DIM}--custom <path>${RESET}    커스텀 파일 경로에서 템플릿 표시

${BOLD}Init 옵션:${RESET}
  ${DIM}--tracker <name>${RESET}   특정 트래커의 템플릿 사용 (default, beads, beads-bv, json)
  ${DIM}--output <path>${RESET}    커스텀 출력 경로 (기본값: ./ralph-prompt.hbs)
  ${DIM}--global${RESET}           모든 템플릿을 ~/.config/ralph-tui/templates/에 설치
  ${DIM}--force${RESET}            기존 파일 덮어쓰기

${BOLD}예시:${RESET}
  ralph-tui template show                    # 현재 템플릿 표시
  ralph-tui template show --tracker beads    # 내장 beads 템플릿 표시
  ralph-tui template init                    # 커스터마이징을 위해 기본 템플릿 복사
  ralph-tui template init --tracker beads    # beads 템플릿 복사
  ralph-tui template init --global           # 모든 템플릿을 전역 설정에 설치

${BOLD}템플릿 해석 순서:${RESET}
  Ralph는 다음 순서로 템플릿을 검색합니다 (첫 번째 일치 사용):
  1. 명시적 --prompt <path> 또는 설정의 prompt_template
  2. 프로젝트 템플릿: .ralph-tui/templates/{tracker}.hbs
  3. 전역 템플릿: ~/.config/ralph-tui/templates/{tracker}.hbs
  4. 트래커 플러그인 번들 템플릿
  5. 내장 폴백

${BOLD}템플릿 변수:${RESET}
  ${DIM}작업:${RESET}     {{taskId}}, {{taskTitle}}, {{taskDescription}}, {{acceptanceCriteria}}
            {{type}}, {{status}}, {{priority}}, {{notes}}
  ${DIM}관계:${RESET}     {{dependsOn}}, {{blocks}}, {{labels}}, {{epicId}}, {{epicTitle}}
  ${DIM}컨텍스트:${RESET} {{trackerName}}, {{agentName}}, {{model}}, {{cwd}}, {{beadsDbPath}}
            {{currentDate}}, {{currentTimestamp}}
  ${DIM}PRD:${RESET}      {{prdName}}, {{prdDescription}}, {{prdContent}}
            {{prdCompletedCount}}, {{prdTotalCount}}
  ${DIM}진행:${RESET}     {{recentProgress}}, {{codebasePatterns}}, {{selectionReason}}
`);
}

/**
 * 'template show' 명령어 처리.
 * 현재 템플릿 또는 특정 내장 템플릿을 표시합니다.
 */
async function handleShowTemplate(args: string[]): Promise<void> {
  const cwd = process.cwd();

  // 옵션 파싱
  let trackerType: BuiltinTemplateType = 'default';
  let customPath: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--tracker' && args[i + 1]) {
      trackerType = args[++i] as BuiltinTemplateType;
    } else if (arg === '--custom' && args[i + 1]) {
      customPath = args[++i];
    }
  }

  // 명시적 옵션이 없으면 설정에서 커스텀 템플릿 확인
  if (!customPath) {
    const storedConfig = await loadStoredConfig(cwd);
    if (storedConfig.prompt_template) {
      customPath = storedConfig.prompt_template;
    }

    // 지정되지 않은 경우 설정에서 트래커 타입도 가져오기
    if (trackerType === 'default' && storedConfig.tracker) {
      trackerType = getTemplateTypeFromPlugin(storedConfig.tracker);
    }
  }

  // 템플릿 로드
  const result = loadTemplate(customPath, trackerType, cwd);

  if (!result.success) {
    console.error(`${RED}오류:${RESET} ${result.error}`);
    process.exit(1);
  }

  // 템플릿 정보 표시
  console.log(`${BOLD}템플릿 소스:${RESET} ${CYAN}${result.source}${RESET}`);
  console.log(`${DIM}${'─'.repeat(60)}${RESET}`);
  console.log(result.content);
  console.log(`${DIM}${'─'.repeat(60)}${RESET}`);

  // 사용 가능한 변수 알림 표시
  console.log(`\n${DIM}팁: 템플릿 변수에는 {{variableName}} 사용${RESET}`);
}

/**
 * 'template init' 명령어 처리.
 * 커스터마이징을 위해 내장 템플릿을 커스텀 위치로 복사합니다.
 * --global 플래그 사용 시 모든 템플릿을 ~/.config/ralph-tui/templates/에 설치합니다.
 */
async function handleInitTemplate(args: string[]): Promise<void> {
  const cwd = process.cwd();

  // 옵션 파싱
  let trackerType: BuiltinTemplateType = 'default';
  let outputPath = getCustomTemplatePath(cwd);
  let force = false;
  let global = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--tracker' && args[i + 1]) {
      trackerType = args[++i] as BuiltinTemplateType;
    } else if (arg === '--output' && args[i + 1]) {
      outputPath = path.isAbsolute(args[i + 1])
        ? args[++i]
        : path.resolve(cwd, args[++i]);
    } else if (arg === '--force') {
      force = true;
    } else if (arg === '--global') {
      global = true;
    }
  }

  // --global 플래그 처리: 모든 템플릿을 전역 설정에 설치
  if (global) {
    console.log(`${BOLD}전역 설정에 템플릿 설치 중...${RESET}`);
    const result = installBuiltinTemplates(force);

    console.log(`${DIM}템플릿 디렉토리: ${result.templatesDir}${RESET}\n`);

    for (const r of result.results) {
      if (r.created) {
        console.log(`${GREEN}✓${RESET} 생성됨: ${CYAN}${r.file}${RESET}`);
      } else if (r.skipped) {
        console.log(`${DIM}⊘${RESET} 건너뜀: ${r.file} ${DIM}(이미 존재함, 덮어쓰려면 --force 사용)${RESET}`);
      } else if (r.error) {
        console.log(`${RED}✗${RESET} 실패: ${r.file} - ${r.error}`);
      }
    }

    if (result.success) {
      console.log(`\n${GREEN}완료!${RESET}`);
      console.log(`\n${BOLD}템플릿은 모든 프로젝트의 폴백으로 사용됩니다.${RESET}`);
      console.log(`${DIM}프로젝트별 재정의는 .ralph-tui/templates/에서${RESET}`);
    } else {
      console.log(`\n${RED}일부 템플릿을 생성할 수 없습니다.${RESET}`);
      process.exit(1);
    }
    return;
  }

  // 지정되지 않은 경우 설정에서 트래커 타입 자동 감지
  if (trackerType === 'default') {
    const storedConfig = await loadStoredConfig(cwd);
    if (storedConfig.tracker) {
      trackerType = getTemplateTypeFromPlugin(storedConfig.tracker);
      console.log(`${DIM}감지된 트래커: ${trackerType}${RESET}`);
    }
  }

  // 파일 존재 여부 확인
  if (fs.existsSync(outputPath) && !force) {
    console.error(
      `${RED}오류:${RESET} 파일이 이미 존재함: ${outputPath}`
    );
    console.log(`${DIM}덮어쓰려면 --force 사용${RESET}`);
    process.exit(1);
  }

  // 템플릿 복사
  const result = copyBuiltinTemplate(trackerType, outputPath);

  if (!result.success) {
    console.error(`${RED}오류:${RESET} ${result.error}`);
    process.exit(1);
  }

  console.log(`${GREEN}✓${RESET} 템플릿 생성됨: ${CYAN}${outputPath}${RESET}`);
  console.log(`${DIM}템플릿 타입: ${trackerType}${RESET}`);
  console.log(`\n${BOLD}다음 단계:${RESET}`);
  console.log(`  1. ${path.basename(outputPath)}를 편집하여 프롬프트 커스터마이징`);
  console.log(`  2. ${CYAN}.ralph-tui/config.toml${RESET}에 추가:`);
  console.log(`     ${DIM}prompt_template: ${path.relative(cwd, outputPath)}${RESET}`);
  console.log(`\n${DIM}사용 가능한 변수는 'ralph-tui template show' 참조${RESET}`);
}

