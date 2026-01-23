/**
 * ABOUTME: ralph-tui의 Create-PRD 명령어.
 * AI 기반 대화를 통해 제품 요구사항 문서를 생성합니다.
 * PRD 생성 후 PRD 미리보기와 트래커 옵션이 있는 분할 화면을 표시합니다.
 */

import { createCliRenderer } from '@opentui/core';
import { createRoot } from '@opentui/react';
import { access, readFile, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, resolve } from 'node:path';
import { PrdChatApp } from '../tui/components/PrdChatApp.js';
import type { PrdCreationResult } from '../tui/components/PrdChatApp.js';
import { loadStoredConfig, requireSetup } from '../config/index.js';
import { getAgentRegistry } from '../plugins/agents/registry.js';
import { registerBuiltinAgents } from '../plugins/agents/builtin/index.js';
import type { AgentPlugin, AgentPluginConfig } from '../plugins/agents/types.js';
import { executeRunCommand } from './run.js';

/**
 * create-prd 명령어의 명령줄 인자.
 */
export interface CreatePrdArgs {
  /** 작업 디렉토리 */
  cwd?: string;

  /** PRD 파일 출력 디렉토리 */
  output?: string;

  /** 생성할 사용자 스토리 수 */
  stories?: number;

  /** 기존 파일 강제 덮어쓰기 */
  force?: boolean;

  /** 에이전트 플러그인 재정의 */
  agent?: string;

  /** 에이전트 호출 타임아웃 (밀리초) */
  timeout?: number;

  prdSkill?: string;

  prdSkillSource?: string;
}

/**
 * create-prd 명령어 인자 파싱.
 */
export function parseCreatePrdArgs(args: string[]): CreatePrdArgs {
  const result: CreatePrdArgs = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--cwd' || arg === '-C') {
      result.cwd = args[++i];
    } else if (arg === '--output' || arg === '-o') {
      result.output = args[++i];
    } else if (arg === '--stories' || arg === '-n') {
      const count = parseInt(args[++i] ?? '', 10);
      if (!isNaN(count)) {
        result.stories = count;
      }
    } else if (arg === '--force' || arg === '-f') {
      result.force = true;
    } else if (arg === '--agent' || arg === '-a') {
      result.agent = args[++i];
    } else if (arg === '--timeout' || arg === '-t') {
      const timeout = parseInt(args[++i] ?? '', 10);
      if (!isNaN(timeout)) {
        result.timeout = timeout;
      }
    } else if (arg === '--prd-skill') {
      result.prdSkill = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      printCreatePrdHelp();
      process.exit(0);
    }
  }

  return result;
}

/**
 * create-prd 명령어 도움말 출력.
 */
export function printCreatePrdHelp(): void {
  console.log(`
ralph-tui create-prd - AI 지원으로 새 PRD 생성

사용법: ralph-tui create-prd [옵션]
        ralph-tui prime [옵션]

옵션:
  --cwd, -C <path>       작업 디렉토리 (기본값: 현재 디렉토리)
  --output, -o <dir>     PRD 파일 출력 디렉토리 (기본값: ./tasks)
  --agent, -a <name>     사용할 에이전트 플러그인 (기본값: 설정에서)
  --timeout, -t <ms>     AI 에이전트 호출 타임아웃 (밀리초) (기본값: 0 = 타임아웃 없음)
  --prd-skill <name>     skills_dir 내 PRD 스킬 폴더
  --force, -f            프롬프트 없이 기존 파일 덮어쓰기
  --help, -h             이 도움말 메시지 표시

설명:
  AI 기반 대화를 통해 제품 요구사항 문서(PRD)를 생성합니다.

  AI 에이전트 (ralph-tui-prd 스킬 사용):
  1. 구현하려는 기능에 대해 질문합니다
  2. 사용자, 요구사항, 범위에 대한 후속 질문을 합니다
  3. 사용자 스토리와 인수 기준이 포함된 마크다운 PRD를 생성합니다
  4. 트래커 작업 생성을 제안합니다 (prd.json 또는 beads)

  AI 에이전트가 설정되어 있어야 합니다. 'ralph-tui setup'을 실행하여 설정하세요.

예시:
  ralph-tui create-prd                      # AI 기반 PRD 생성 시작
  ralph-tui prime                           # create-prd의 별칭
  ralph-tui create-prd --agent claude       # 특정 에이전트 사용
  ralph-tui create-prd --output ./docs      # PRD를 사용자 지정 디렉토리에 저장
`);
}

/**
 * 에이전트의 스킬 디렉토리에서 번들된 ralph-tui-prd 스킬 로드 시도.
 * 발견되면 스킬 소스를 반환하고, 그렇지 않으면 undefined를 반환합니다.
 * @internal 테스트용으로 내보냄
 */
export async function loadBundledPrdSkill(agent: AgentPlugin): Promise<string | undefined> {
  const skillsPaths = agent.meta.skillsPaths;
  if (!skillsPaths) return undefined;

  // 개인 스킬 디렉토리를 먼저 시도 (예: ~/.kiro/skills/)
  if (skillsPaths.personal) {
    const personalPath = skillsPaths.personal.replace(/^~/, process.env.HOME || '');
    const skillFile = join(personalPath, 'ralph-tui-prd', 'SKILL.md');
    try {
      await access(skillFile, constants.R_OK);
      const content = await readFile(skillFile, 'utf-8');
      if (content.trim()) {
        return content;
      }
    } catch {
      // 개인 디렉토리에 없음, repo 시도
    }
  }

  // repo 스킬 디렉토리 시도 (예: .kiro/skills/)
  if (skillsPaths.repo) {
    const skillFile = join(process.cwd(), skillsPaths.repo, 'ralph-tui-prd', 'SKILL.md');
    try {
      await access(skillFile, constants.R_OK);
      const content = await readFile(skillFile, 'utf-8');
      if (content.trim()) {
        return content;
      }
    } catch {
      // 찾을 수 없음
    }
  }

  return undefined;
}

async function loadPrdSkillSource(
  prdSkill: string,
  skillsDir: string,
  cwd: string
): Promise<string> {
  const resolvedSkillsDir = resolve(cwd, skillsDir);

  try {
    const stats = await stat(resolvedSkillsDir);
    if (!stats.isDirectory()) {
      console.error(
        `오류: skills_dir '${skillsDir}'이(가) ${resolvedSkillsDir}에서 디렉토리가 아닙니다.`
      );
      process.exit(1);
    }
  } catch {
    console.error(
      `오류: skills_dir '${skillsDir}'을(를) ${resolvedSkillsDir}에서 찾을 수 없거나 읽을 수 없습니다.`
    );
    process.exit(1);
  }

  const skillPath = join(resolvedSkillsDir, prdSkill);

  try {
    const stats = await stat(skillPath);
    if (!stats.isDirectory()) {
      console.error(`오류: PRD 스킬 '${prdSkill}'이(가) ${resolvedSkillsDir}에서 디렉토리가 아닙니다.`);
      process.exit(1);
    }
  } catch {
    console.error(`오류: PRD 스킬 '${prdSkill}'을(를) ${resolvedSkillsDir}에서 찾을 수 없습니다.`);
    process.exit(1);
  }

  const skillFile = join(skillPath, 'SKILL.md');

  try {
    await access(skillFile, constants.R_OK);
  } catch {
    console.error(`오류: PRD 스킬 '${prdSkill}'에 ${skillPath}에 SKILL.md가 없습니다.`);
    process.exit(1);
  }

  try {
    const skillSource = await readFile(skillFile, 'utf-8');
    if (!skillSource.trim()) {
      console.error(`오류: PRD 스킬 '${prdSkill}'의 SKILL.md가 ${skillPath}에서 비어 있습니다.`);
      process.exit(1);
    }
    return skillSource;
  } catch (error) {
    console.error(
      `오류: ${skillFile}에서 PRD 스킬 '${prdSkill}'을(를) 읽지 못했습니다: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    process.exit(1);
  }
}

/**
 * 설정된 에이전트 플러그인 가져오기.
 */
async function getAgent(agentName?: string): Promise<AgentPlugin | null> {
  try {
    const cwd = process.cwd();
    const storedConfig = await loadStoredConfig(cwd);

    // 내장 에이전트 등록
    registerBuiltinAgents();
    const registry = getAgentRegistry();
    await registry.initialize();

    // 대상 에이전트 결정
    const targetAgent = agentName || storedConfig.agent || storedConfig.defaultAgent || 'claude';

    // 에이전트 설정 구성
    const agentConfig: AgentPluginConfig = {
      name: targetAgent,
      plugin: targetAgent,
      options: storedConfig.agentOptions || {},
      command: storedConfig.command,
      envExclude: storedConfig.envExclude,
    };

    // 에이전트 인스턴스 가져오기
    const agent = await registry.getInstance(agentConfig);

    // 에이전트 준비 상태 확인
    const isReady = await agent.isReady();
    if (!isReady) {
      const detection = await agent.detect();
      if (!detection.available) {
        console.error(`에이전트 '${targetAgent}'을(를) 사용할 수 없습니다: ${detection.error || '감지되지 않음'}`);
        return null;
      }
    }

    return agent;
  } catch (error) {
    console.error('에이전트 로드 실패:', error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * PRD 생성을 위한 AI 기반 채팅 모드 실행.
 * 성공하면 생성 결과를 반환하고, 취소되면 null을 반환합니다.
 */
async function runChatMode(parsedArgs: CreatePrdArgs): Promise<PrdCreationResult | null> {
  // 에이전트 가져오기
  const agent = await getAgent(parsedArgs.agent);
  if (!agent) {
    console.error('');
    console.error('채팅 모드에는 AI 에이전트가 필요합니다. 옵션:');
    console.error('  1. "ralph-tui setup"을 실행하여 에이전트 설정');
    console.error('  2. "--agent claude" 또는 "--agent opencode"로 지정');
    process.exit(1);
  }

  const cwd = parsedArgs.cwd || process.cwd();
  const outputDir = parsedArgs.output || 'tasks';
  const timeout = parsedArgs.timeout ?? 0;

  console.log(`에이전트 사용: ${agent.meta.name}`);

  // 대화 시작 전 에이전트가 응답할 수 있는지 사전 점검 실행
  console.log('에이전트 설정 확인 중...');
  const preflightResult = await agent.preflight({ timeout: 30000 });

  if (!preflightResult.success) {
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
    console.error('에이전트 문제를 진단하려면 "ralph-tui doctor"를 실행하세요.');
    process.exit(1);
  }

  console.log('✓ 에이전트 준비 완료');

  // 사용자 지정 스킬이 지정되지 않은 경우 번들 스킬 자동 로드
  if (!parsedArgs.prdSkillSource) {
    const bundledSkill = await loadBundledPrdSkill(agent);
    if (bundledSkill) {
      parsedArgs.prdSkillSource = bundledSkill;
      console.log('✓ ralph-tui-prd 스킬 로드됨');
    }
  }

  console.log('');

  // 렌더러 생성 및 채팅 앱 렌더링
  const renderer = await createCliRenderer({
    exitOnCtrlC: false, // 앱에서 Ctrl+C 처리
  });

  const root = createRoot(renderer);

  return new Promise<PrdCreationResult | null>((resolve) => {
    const handleComplete = (result: PrdCreationResult) => {
      root.unmount();
      renderer.destroy();
      console.log('');
      console.log(`PRD 워크플로우 완료: ${result.prdPath}`);
      resolve(result);
    };

    const handleCancel = () => {
      root.unmount();
      renderer.destroy();
      console.log('');
      console.log('PRD 생성이 취소되었습니다.');
      resolve(null);
    };

    const handleError = (error: string) => {
      console.error('오류:', error);
    };

    root.render(
      <PrdChatApp
        agent={agent}
        cwd={cwd}
        outputDir={outputDir}
        timeout={timeout}
        prdSkill={parsedArgs.prdSkill}
        prdSkillSource={parsedArgs.prdSkillSource}
        onComplete={handleComplete}
        onCancel={handleCancel}
        onError={handleError}
      />
    );
  });
}

/**
 * create-prd 명령어 실행.
 * 대화형 PRD 생성을 위해 항상 AI 기반 채팅 모드를 사용합니다.
 * 트래커 형식이 선택되면 작업이 로드된 상태로 ralph-tui run을 시작합니다.
 */
export async function executeCreatePrdCommand(args: string[]): Promise<void> {
  const parsedArgs = parseCreatePrdArgs(args);
  const cwd = parsedArgs.cwd || process.cwd();

  // 실행 전 설정 완료 여부 확인
  await requireSetup(cwd, 'ralph-tui prime');

  const storedConfig = await loadStoredConfig(cwd);

  if (parsedArgs.prdSkill) {
    if (!storedConfig.skills_dir?.trim()) {
      console.error('오류: --prd-skill은 설정에서 skills_dir가 설정되어 있어야 합니다.');
      console.error('~/.config/ralph-tui/config.toml 또는 .ralph-tui/config.toml에서 skills_dir를 설정하세요.');
      process.exit(1);
    }

    parsedArgs.prdSkillSource = await loadPrdSkillSource(
      parsedArgs.prdSkill,
      storedConfig.skills_dir,
      cwd
    );
  }

  const result = await runChatMode(parsedArgs);

  // 취소되었거나 결과가 없으면 종료
  if (!result) {
    process.exit(0);
  }

  // 트래커 형식이 선택된 경우 작업이 로드된 상태로 ralph-tui 시작
  if (result.selectedTracker) {
    console.log('');
    console.log('새 작업으로 Ralph TUI를 시작합니다...');
    console.log('');

    const runArgs: string[] = [];

    if (result.selectedTracker === 'json') {
      // JSON 트래커: prd.json 경로 전달 (스킬이 tasks/에 PRD 마크다운과 함께 생성)
      runArgs.push('--prd', './tasks/prd.json');
    }
    // beads의 경우: 인자 불필요, 에픽 선택이 표시됨

    // run 명령어 실행 (TUI가 표시됨)
    await executeRunCommand(runArgs);
    // 참고: executeRunCommand가 process.exit를 내부적으로 처리
  }

  process.exit(0);
}
