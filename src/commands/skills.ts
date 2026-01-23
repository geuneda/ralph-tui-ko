/**
 * ABOUTME: 에이전트 스킬 관리 명령어.
 * ralph-tui skills list와 ralph-tui skills install 명령어를 제공합니다.
 * 플러그인 정의 경로를 통해 여러 에이전트(Claude Code, OpenCode, Factory Droid)를 지원합니다.
 */

import {
  listBundledSkills,
  resolveSkillsPath,
  installSkillsForAgent,
  getSkillStatusForAgent,
} from '../setup/skill-installer.js';
import { getAgentRegistry } from '../plugins/agents/registry.js';
import { registerBuiltinAgents } from '../plugins/agents/builtin/index.js';
import type { AgentPluginMeta, AgentSkillsPaths } from '../plugins/agents/types.js';

// ANSI color codes
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';

/**
 * 스킬을 지원하는 에이전트 정보.
 */
interface SkillCapableAgent {
  meta: AgentPluginMeta;
  available: boolean;
  skillsPaths: AgentSkillsPaths;
}

/**
 * 스킬을 지원하는 모든 에이전트와 가용성 상태를 가져옵니다.
 */
async function getSkillCapableAgents(): Promise<SkillCapableAgent[]> {
  // 내장 에이전트가 등록되어 있는지 확인
  registerBuiltinAgents();

  const registry = getAgentRegistry();
  const plugins = registry.getRegisteredPlugins();
  const agents: SkillCapableAgent[] = [];

  for (const meta of plugins) {
    // skillsPaths가 정의되지 않은 에이전트 건너뛰기
    if (!meta.skillsPaths) {
      continue;
    }

    // 에이전트 가용성 확인
    const instance = registry.createInstance(meta.id);
    let available = false;
    if (instance) {
      try {
        const detectResult = await instance.detect();
        available = detectResult.available;
      } catch {
        available = false;
      } finally {
        await instance.dispose();
      }
    }

    agents.push({
      meta,
      available,
      skillsPaths: meta.skillsPaths,
    });
  }

  return agents;
}

/**
 * skills 명령어 실행.
 * @param args 명령어 인자: ['list'] 또는 ['install', 옵션...]
 */
export async function executeSkillsCommand(args: string[]): Promise<void> {
  const subcommand = args[0];

  // 도움말 플래그 확인
  if (subcommand === '--help' || subcommand === '-h' || !subcommand) {
    printSkillsHelp();
    return;
  }

  if (subcommand === 'list') {
    if (args.includes('--help') || args.includes('-h')) {
      printSkillsHelp();
      return;
    }
    await handleListSkills();
    return;
  }

  if (subcommand === 'install') {
    if (args.includes('--help') || args.includes('-h')) {
      printSkillsHelp();
      return;
    }
    await handleInstallSkills(args.slice(1));
    return;
  }

  // 알 수 없는 하위 명령어
  console.error(`${RED}알 수 없는 하위 명령어:${RESET} ${subcommand}`);
  printSkillsHelp();
  process.exit(1);
}

/**
 * skills 명령어 도움말 출력.
 */
export function printSkillsHelp(): void {
  console.log(`
${BOLD}ralph-tui skills${RESET} - 에이전트 스킬 관리

${BOLD}명령어:${RESET}
  ${CYAN}list${RESET}              번들 스킬 및 에이전트별 설치 상태 나열
  ${CYAN}install${RESET}           감지된 에이전트에 스킬 설치

${BOLD}Install 옵션:${RESET}
  ${DIM}<name>${RESET}             이름으로 특정 스킬 설치
  ${DIM}--all${RESET}              모든 번들 스킬 설치 (이름 미지정 시 기본값)
  ${DIM}--force${RESET}            기존 스킬 덮어쓰기
  ${DIM}--agent <id>${RESET}       특정 에이전트에만 설치 (claude, opencode, droid)
  ${DIM}--local${RESET}            프로젝트 로컬 디렉토리에 설치 (우선순위 높음)
  ${DIM}--global${RESET}           개인/전역 디렉토리에 설치 (기본값)

${BOLD}예시:${RESET}
  ralph-tui skills list                    # 에이전트별 모든 스킬 나열
  ralph-tui skills install                 # 전역 디렉토리에 모든 스킬 설치
  ralph-tui skills install --local         # 로컬 프로젝트에 모든 스킬 설치
  ralph-tui skills install --force         # 모든 스킬 강제 재설치
  ralph-tui skills install ralph-tui-prd   # 특정 스킬 설치
  ralph-tui skills install --agent claude  # Claude Code에만 설치
  ralph-tui skills install --agent claude --local  # .claude/skills/에 설치

${BOLD}스킬 위치:${RESET}

  ${CYAN}전역 (개인)${RESET} - 모든 프로젝트에서 사용 가능:
    Claude Code     ~/.claude/skills/
    OpenCode        ~/.config/opencode/skills/
    Factory Droid   ~/.factory/skills/

  ${CYAN}로컬 (프로젝트)${RESET} - 우선순위 높음, 버전 관리 가능:
    Claude Code     .claude/skills/
    OpenCode        .opencode/skills/
    Factory Droid   .factory/skills/

${BOLD}우선순위:${RESET}
  로컬 (프로젝트) 스킬이 전역 (개인) 스킬보다 우선합니다.
  이를 통해 프로젝트별 커스터마이징이 가능합니다.
`);
}

/**
 * 'skills list' 명령어 처리.
 * 모든 번들 스킬과 에이전트별 설치 상태를 나열합니다.
 */
async function handleListSkills(): Promise<void> {
  const skills = await listBundledSkills();
  const cwd = process.cwd();

  if (skills.length === 0) {
    console.log(`${YELLOW}번들 스킬을 찾을 수 없습니다.${RESET}`);
    return;
  }

  const agents = await getSkillCapableAgents();

  console.log(`${BOLD}번들 스킬${RESET}`);
  console.log(`${DIM}${'─'.repeat(70)}${RESET}\n`);

  // 스킬 표시
  for (const skill of skills) {
    console.log(`${CYAN}${skill.name}${RESET}`);
    console.log(`  ${DIM}${skill.description}${RESET}`);
    console.log();
  }

  console.log(`${DIM}${'─'.repeat(70)}${RESET}`);
  console.log(`${BOLD}에이전트별 설치 상태${RESET}\n`);

  // 각 에이전트의 상태 표시
  for (const agent of agents) {
    const statusIcon = agent.available ? `${GREEN}✓${RESET}` : `${DIM}○${RESET}`;
    const availableText = agent.available ? '' : ` ${DIM}(설치되지 않음)${RESET}`;
    console.log(`${statusIcon} ${BOLD}${agent.meta.name}${RESET}${availableText}`);
    console.log(`  ${DIM}Global: ${resolveSkillsPath(agent.skillsPaths.personal)}${RESET}`);
    console.log(`  ${DIM}Local:  ${resolveSkillsPath(agent.skillsPaths.repo, cwd)}${RESET}`);

    if (agent.available) {
      const status = await getSkillStatusForAgent(agent.skillsPaths, cwd);
      for (const skill of skills) {
        const skillStatus = status.get(skill.name);
        const globalInstalled = skillStatus?.personal ?? false;
        const localInstalled = skillStatus?.repo ?? false;

        let statusText: string;
        if (localInstalled && globalInstalled) {
          statusText = `${GREEN}✓ 로컬${RESET} ${DIM}+${RESET} ${GREEN}전역${RESET}`;
        } else if (localInstalled) {
          statusText = `${GREEN}✓ 로컬${RESET}`;
        } else if (globalInstalled) {
          statusText = `${GREEN}✓ 전역${RESET}`;
        } else {
          statusText = `${DIM}설치되지 않음${RESET}`;
        }
        console.log(`    ${skill.name}: ${statusText}`);
      }
    }
    console.log();
  }

  console.log(`${DIM}${'─'.repeat(70)}${RESET}`);
  console.log(`${DIM}전역 설치는 'ralph-tui skills install', 프로젝트 로컬 설치는 '--local' 사용${RESET}`);
}

/**
 * install 명령어의 인자 파싱.
 */
function parseInstallArgs(args: string[]): {
  skillName: string | null;
  all: boolean;
  force: boolean;
  agentId: string | null;
  local: boolean;
  global: boolean;
} {
  let skillName: string | null = null;
  let all = false;
  let force = false;
  let agentId: string | null = null;
  let local = false;
  let global = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--force' || arg === '-f') {
      force = true;
    } else if (arg === '--all' || arg === '-a') {
      all = true;
    } else if (arg === '--local' || arg === '-l') {
      local = true;
    } else if (arg === '--global' || arg === '-g') {
      global = true;
    } else if (arg === '--agent') {
      // 다음 인자가 에이전트 ID
      if (i + 1 < args.length) {
        agentId = args[++i];
      }
    } else if (arg.startsWith('--agent=')) {
      agentId = arg.substring('--agent='.length);
    } else if (!arg.startsWith('-')) {
      // 위치 인자 = 스킬 이름
      skillName = arg;
    }
  }

  // 스킬 이름과 --all 플래그가 없으면 --all 기본값
  if (!skillName && !all) {
    all = true;
  }

  // --local과 --global 모두 지정되지 않으면 전역 기본값
  if (!local && !global) {
    global = true;
  }

  return { skillName, all, force, agentId, local, global };
}

/**
 * 'skills install' 명령어 처리.
 * 감지된 모든 에이전트 (또는 특정 에이전트)에 스킬을 설치합니다.
 */
async function handleInstallSkills(args: string[]): Promise<void> {
  const { skillName, force, agentId, local, global } = parseInstallArgs(args);
  const cwd = process.cwd();

  const skills = await listBundledSkills();

  if (skills.length === 0) {
    console.log(`${YELLOW}번들 스킬을 찾을 수 없습니다.${RESET}`);
    return;
  }

  // 제공된 경우 스킬 이름 검증
  if (skillName) {
    const skill = skills.find((s) => s.name === skillName);
    if (!skill) {
      console.error(`${RED}오류:${RESET} 스킬 '${skillName}'을(를) 찾을 수 없습니다.`);
      console.log(`${DIM}사용 가능한 스킬: ${skills.map((s) => s.name).join(', ')}${RESET}`);
      process.exit(1);
    }
  }

  // 설치할 에이전트 가져오기
  let agents = await getSkillCapableAgents();

  // 지정된 경우 에이전트 ID로 필터링
  if (agentId) {
    const matchingAgent = agents.find((a) => a.meta.id === agentId);
    if (!matchingAgent) {
      console.error(`${RED}오류:${RESET} 알 수 없는 에이전트 '${agentId}'.`);
      console.log(`${DIM}사용 가능한 에이전트: ${agents.map((a) => a.meta.id).join(', ')}${RESET}`);
      process.exit(1);
    }
    agents = [matchingAgent];
  }

  // 사용 가능한 에이전트만 필터링 (특정 에이전트 요청 시 제외)
  const availableAgents = agentId
    ? agents // If specific agent requested, include it even if not available
    : agents.filter((a) => a.available);

  if (availableAgents.length === 0) {
    console.log(`${YELLOW}지원되는 에이전트가 감지되지 않았습니다.${RESET}`);
    console.log(`${DIM}스킬을 사용하려면 Claude Code, OpenCode 또는 Factory Droid를 설치하세요.${RESET}`);
    return;
  }

  // 위치 설명 구성
  const locationText = local && global
    ? '전역 + 로컬'
    : local
      ? '로컬 (프로젝트)'
      : '전역';

  // 설치 내용 표시
  const skillText = skillName ? `스킬: ${CYAN}${skillName}${RESET}` : '모든 스킬';
  const agentText = agentId
    ? `${CYAN}${agentId}${RESET}에`
    : `${availableAgents.length}개 에이전트에`;
  console.log(`${BOLD}${skillText}을(를) ${agentText} 설치 중 [${locationText}]...${RESET}\n`);

  let totalInstalled = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  // 각 에이전트에 설치
  for (const agent of availableAgents) {
    console.log(`${BOLD}${agent.meta.name}${RESET}`);

    const result = await installSkillsForAgent(
      agent.meta.id,
      agent.meta.name,
      agent.skillsPaths,
      {
        force,
        personal: global,
        repo: local,
        cwd,
        skillName: skillName ?? undefined,
      }
    );

    // 각 스킬의 결과 표시
    for (const [name, targetResults] of result.skills) {
      for (const { target, result: skillResult } of targetResults) {
        const targetLabel = target === 'personal' ? '전역' : '로컬';
        if (skillResult.success) {
          if (skillResult.skipped) {
            console.log(`  ${DIM}⊘${RESET} 건너뜀 [${targetLabel}]: ${name} ${DIM}(이미 존재함)${RESET}`);
            totalSkipped++;
          } else {
            console.log(`  ${GREEN}✓${RESET} 설치됨 [${targetLabel}]: ${CYAN}${name}${RESET}`);
            console.log(`    ${DIM}${skillResult.path}${RESET}`);
            totalInstalled++;
          }
        } else {
          console.log(`  ${RED}✗${RESET} 실패 [${targetLabel}]: ${name} - ${skillResult.error}`);
          totalFailed++;
        }
      }
    }
    console.log();
  }

  // 요약
  console.log(`${DIM}${'─'.repeat(50)}${RESET}`);
  console.log(`${GREEN}설치됨:${RESET} ${totalInstalled}  ${DIM}건너뜀:${RESET} ${totalSkipped}  ${RED}실패:${RESET} ${totalFailed}`);

  if (totalSkipped > 0 && !force) {
    console.log(`\n${DIM}팁: 기존 스킬을 덮어쓰려면 --force 사용${RESET}`);
  }

  if (local) {
    console.log(`\n${DIM}참고: 로컬 스킬이 전역 스킬보다 우선합니다.${RESET}`);
  }

  if (totalFailed > 0) {
    process.exit(1);
  }
}
