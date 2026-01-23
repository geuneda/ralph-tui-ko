/**
 * ABOUTME: ralph-tui의 시스템 정보 명령어.
 * 버그 리포트에 유용한 진단 정보를 출력합니다.
 * 버전 정보, 설정 경로, 환경 세부사항, 스킬을 수집합니다.
 */

import { platform, release, arch } from 'node:os';
import { dirname, join } from 'node:path';
import { access, constants, readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { loadStoredConfigWithSource, CONFIG_PATHS } from '../config/index.js';
import { getAgentRegistry } from '../plugins/agents/registry.js';
import { registerBuiltinAgents } from '../plugins/agents/builtin/index.js';
import { registerBuiltinTrackers } from '../plugins/trackers/builtin/index.js';
import { getUserConfigDir } from '../templates/engine.js';
import { listBundledSkills, resolveSkillsPath } from '../setup/skill-installer.js';

/**
 * 현재 모듈 위치를 기반으로 package.json 경로 계산.
 * 개발 환경(src/)과 번들 환경(dist/) 모두에서 작동합니다.
 *
 * @param currentDir - 코드가 실행되는 디렉토리
 * @returns 계산된 package.json 경로
 */
export function computePackageJsonPath(currentDir: string): string {
  // bun으로 번들링 시 모든 코드는 dist/cli.js에 있음 (단일 파일 번들).
  // package.json은 패키지 루트에 있음 (dist/에서 한 레벨 위).
  // 개발 환경에서 이 파일은 src/commands/info.ts에 있고,
  // package.json은 프로젝트 루트에 있음 (2레벨 위).
  if (currentDir.endsWith('dist') || currentDir.includes('/dist/') || currentDir.includes('\\dist\\')) {
    return join(currentDir, '..', 'package.json');
  }
  return join(currentDir, '..', '..', 'package.json');
}

/**
 * package.json에서 패키지 버전 가져오기.
 * ESM 번들에서 올바른 경로 해석을 위해 import.meta.url 사용.
 */
async function getPackageVersion(): Promise<string> {
  try {
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const packageJsonPath = computePackageJsonPath(currentDir);
    const pkg = await readFile(packageJsonPath, 'utf-8');
    const parsed = JSON.parse(pkg);
    if (parsed.name === 'ralph-tui' && parsed.version) {
      return parsed.version;
    }
  } catch {
    // unknown으로 폴스루
  }
  return 'unknown';
}

/**
 * 에이전트 스킬 설치 상태 정보
 */
export interface AgentSkillsInfo {
  /** 에이전트 플러그인 ID */
  id: string;
  /** 에이전트 표시 이름 */
  name: string;
  /** 에이전트 사용 가능/감지 여부 */
  available: boolean;
  /** 개인 스킬 디렉토리 경로 */
  personalDir: string;
  /** 저장소 스킬 디렉토리 패턴 */
  repoDir: string;
  /** 개인 디렉토리에 설치된 스킬 */
  personalSkills: string[];
}

/**
 * 시스템 정보 출력용 스킬 정보
 */
export interface SkillsInfo {
  /** 설치 가능한 번들 스킬 */
  bundled: string[];
  /** 커스텀 스킬 디렉토리 (설정에서) */
  customDir: string | null;
  /** 커스텀 디렉토리에서 발견된 스킬 */
  customSkills: string[];
  /** 에이전트별 스킬 정보 */
  agents: AgentSkillsInfo[];
}

/**
 * 시스템 정보 결과
 */
export interface SystemInfo {
  /** ralph-tui 버전 */
  version: string;

  /** 런타임 정보 */
  runtime: {
    /** Bun 또는 Node 버전 */
    version: string;
    /** 런타임 이름 */
    name: 'bun' | 'node';
  };

  /** 운영체제 정보 */
  os: {
    platform: string;
    release: string;
    arch: string;
  };

  /** 설정 정보 */
  config: {
    /** 전역 설정 경로 */
    globalPath: string;
    /** 전역 설정 존재 여부 */
    globalExists: boolean;
    /** 프로젝트 설정 경로 (발견된 경우) */
    projectPath: string | null;
    /** 프로젝트 설정 존재 여부 */
    projectExists: boolean;
  };

  /** 템플릿 정보 */
  templates: {
    /** 전역 템플릿 디렉토리 */
    globalDir: string;
    /** 발견된 템플릿 */
    installed: string[];
  };

  /** 에이전트 정보 */
  agent: {
    /** 설정된 에이전트 이름 */
    name: string;
    /** 에이전트 감지/사용 가능 여부 */
    available: boolean;
    /** 에이전트 버전 (사용 가능한 경우) */
    version?: string;
    /** 감지 오류 (있는 경우) */
    error?: string;
  };

  /** 트래커 정보 */
  tracker: {
    /** 설정된 트래커 이름 */
    name: string;
  };

  /** 스킬 정보 */
  skills: SkillsInfo;
}

/**
 * 주어진 경로에서 발견된 스킬 디렉토리 나열.
 * 스킬은 SKILL.md 파일이 있으면 식별됩니다.
 */
async function listSkillsInDir(skillsDir: string): Promise<string[]> {
  const skills: string[] = [];
  try {
    const entries = await readdir(skillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillMdPath = join(skillsDir, entry.name, 'SKILL.md');
        try {
          await access(skillMdPath, constants.F_OK);
          skills.push(entry.name);
        } catch {
          // 스킬 디렉토리가 아님
        }
      }
    }
  } catch {
    // 디렉토리가 존재하지 않거나 읽을 수 없음
  }
  return skills;
}

/**
 * 모든 소스에서 스킬 정보 수집
 */
async function collectSkillsInfo(
  agentRegistry: ReturnType<typeof getAgentRegistry>,
  customSkillsDir: string | null,
  cwd: string
): Promise<SkillsInfo> {
  // 번들 스킬 가져오기
  const bundledSkills = await listBundledSkills();
  const bundledNames = bundledSkills.map((s) => s.name);

  // 커스텀 스킬 디렉토리 확인
  let customSkills: string[] = [];
  let resolvedCustomDir: string | null = null;
  if (customSkillsDir) {
    resolvedCustomDir = resolveSkillsPath(customSkillsDir, cwd);
    customSkills = await listSkillsInDir(resolvedCustomDir);
  }

  // 에이전트별 스킬 정보 가져오기
  const agents: AgentSkillsInfo[] = [];
  const plugins = agentRegistry.getRegisteredPlugins();

  for (const meta of plugins) {
    // skillsPaths가 정의되지 않은 에이전트 건너뛰기
    if (!meta.skillsPaths) {
      continue;
    }

    // 에이전트 사용 가능 여부 확인
    const instance = agentRegistry.createInstance(meta.id);
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

    // 개인 디렉토리에 설치된 스킬 가져오기
    const personalDir = resolveSkillsPath(meta.skillsPaths.personal);
    const personalSkills = await listSkillsInDir(personalDir);

    agents.push({
      id: meta.id,
      name: meta.name,
      available,
      personalDir,
      repoDir: meta.skillsPaths.repo,
      personalSkills,
    });
  }

  return {
    bundled: bundledNames,
    customDir: resolvedCustomDir,
    customSkills,
    agents,
  };
}

/**
 * 버그 리포트용 시스템 정보 수집
 */
export async function collectSystemInfo(cwd: string = process.cwd()): Promise<SystemInfo> {
  // 먼저 버전 가져오기 (비동기)
  const version = await getPackageVersion();

  // 소스 정보와 함께 설정 로드
  const { config, source } = await loadStoredConfigWithSource(cwd);

  // 전역 설정 존재 여부 확인
  let globalExists = false;
  try {
    await access(CONFIG_PATHS.global, constants.R_OK);
    globalExists = true;
  } catch {
    // 존재하지 않음
  }

  // 템플릿 디렉토리 확인
  const templatesDir = join(getUserConfigDir(), 'templates');
  const installedTemplates: string[] = [];
  try {
    const files = await readdir(templatesDir);
    installedTemplates.push(...files.filter((f) => f.endsWith('.hbs')));
  } catch {
    // 디렉토리가 존재하지 않거나 읽을 수 없음
  }

  // 에이전트 정보 가져오기
  registerBuiltinAgents();
  const agentRegistry = getAgentRegistry();
  const agentName = config.agent ?? 'claude';
  let agentAvailable = false;
  let agentVersion: string | undefined;
  let agentError: string | undefined;

  try {
    if (agentRegistry.hasPlugin(agentName)) {
      const agent = await agentRegistry.getInstance({
        name: agentName,
        plugin: agentName,
        options: config.agentOptions ?? {},
      });
      const detection = await agent.detect();
      agentAvailable = detection.available;
      agentVersion = detection.version;
      agentError = detection.error;
    } else {
      agentError = `알 수 없는 에이전트 플러그인: ${agentName}`;
    }
  } catch (error) {
    agentError = error instanceof Error ? error.message : String(error);
  }

  // 트래커 정보 가져오기
  registerBuiltinTrackers();
  const trackerName = config.tracker ?? 'beads';

  // 스킬 정보 수집
  const skills = await collectSkillsInfo(agentRegistry, config.skills_dir ?? null, cwd);

  // 런타임 결정
  const isBun = typeof Bun !== 'undefined';
  const runtimeVersion = isBun ? Bun.version : process.version;

  return {
    version,
    runtime: {
      name: isBun ? 'bun' : 'node',
      version: runtimeVersion,
    },
    os: {
      platform: platform(),
      release: release(),
      arch: arch(),
    },
    config: {
      globalPath: CONFIG_PATHS.global,
      globalExists,
      projectPath: source.projectPath,
      projectExists: source.projectLoaded,
    },
    templates: {
      globalDir: templatesDir,
      installed: installedTemplates,
    },
    agent: {
      name: agentName,
      available: agentAvailable,
      version: agentVersion,
      error: agentError,
    },
    tracker: {
      name: trackerName,
    },
    skills,
  };
}

/**
 * 표시용 시스템 정보 포맷
 */
export function formatSystemInfo(info: SystemInfo): string {
  const lines: string[] = [];

  lines.push('ralph-tui 시스템 정보');
  lines.push('====================');
  lines.push('');

  // 버전 정보
  lines.push(`ralph-tui 버전: ${info.version}`);
  lines.push(`런타임: ${info.runtime.name} ${info.runtime.version}`);
  lines.push(`OS: ${info.os.platform} ${info.os.release} (${info.os.arch})`);
  lines.push('');

  // 설정 정보
  lines.push('설정:');
  lines.push(`  전역 설정: ${info.config.globalPath}`);
  lines.push(`    존재: ${info.config.globalExists ? '예' : '아니오'}`);
  if (info.config.projectPath) {
    lines.push(`  프로젝트 설정: ${info.config.projectPath}`);
    lines.push(`    존재: ${info.config.projectExists ? '예' : '아니오'}`);
  } else {
    lines.push('  프로젝트 설정: (찾을 수 없음)');
  }
  lines.push('');

  // 템플릿 정보
  lines.push('템플릿:');
  lines.push(`  디렉토리: ${info.templates.globalDir}`);
  if (info.templates.installed.length > 0) {
    lines.push(`  설치됨: ${info.templates.installed.join(', ')}`);
  } else {
    lines.push('  설치됨: (없음)');
  }
  lines.push('');

  // 에이전트 정보
  lines.push('에이전트:');
  lines.push(`  설정됨: ${info.agent.name}`);
  lines.push(`  사용 가능: ${info.agent.available ? '예' : '아니오'}`);
  if (info.agent.version) {
    lines.push(`  버전: ${info.agent.version}`);
  }
  if (info.agent.error) {
    lines.push(`  오류: ${info.agent.error}`);
  }
  lines.push('');

  // 트래커 정보
  lines.push('트래커:');
  lines.push(`  설정됨: ${info.tracker.name}`);
  lines.push('');

  // 스킬 정보
  lines.push('스킬:');
  lines.push(`  번들: ${info.skills.bundled.length > 0 ? info.skills.bundled.join(', ') : '(없음)'}`);

  if (info.skills.customDir) {
    lines.push(`  커스텀 디렉토리: ${info.skills.customDir}`);
    lines.push(`    설치됨: ${info.skills.customSkills.length > 0 ? info.skills.customSkills.join(', ') : '(없음)'}`);
  }

  for (const agent of info.skills.agents) {
    const status = agent.available ? '' : ' (감지되지 않음)';
    lines.push(`  ${agent.name}${status}:`);
    lines.push(`    경로: ${agent.personalDir}`);
    lines.push(`    설치됨: ${agent.personalSkills.length > 0 ? agent.personalSkills.join(', ') : '(없음)'}`);
  }

  return lines.join('\n');
}

/**
 * 시스템 정보를 복사 가능한 버그 리포트 스니펫으로 포맷
 */
export function formatForBugReport(info: SystemInfo): string {
  const lines: string[] = [];

  lines.push('```');
  lines.push(`ralph-tui: ${info.version}`);
  lines.push(`runtime: ${info.runtime.name} ${info.runtime.version}`);
  lines.push(`os: ${info.os.platform} ${info.os.release} (${info.os.arch})`);
  lines.push(`agent: ${info.agent.name}${info.agent.version ? ` v${info.agent.version}` : ''}${info.agent.available ? '' : ' (unavailable)'}`);
  lines.push(`tracker: ${info.tracker.name}`);
  lines.push(`global-config: ${info.config.globalExists ? 'yes' : 'no'}`);
  lines.push(`project-config: ${info.config.projectExists ? 'yes' : 'no'}`);
  lines.push(`templates: ${info.templates.installed.length > 0 ? info.templates.installed.join(', ') : 'none'}`);
  lines.push(`bundled-skills: ${info.skills.bundled.length}`);

  // Summarize installed skills per agent
  const skillsSummary = info.skills.agents
    .map((a) => `${a.id}:${a.personalSkills.length}`)
    .join(', ');
  lines.push(`skills-installed: ${skillsSummary || 'none'}`);

  lines.push('```');

  return lines.join('\n');
}

// ANSI 색상
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';

/**
 * args 배열에서 --cwd 인자 파싱.
 * '--cwd path'와 '--cwd=path' 형식 모두 처리.
 * '=' 문자가 포함된 경로 잘림을 방지하기 위해 indexOf 사용.
 */
export function parseCwdArg(args: string[]): string {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // Handle --cwd=path form (use indexOf to preserve '=' in path)
    if (arg.startsWith('--cwd=')) {
      return arg.substring('--cwd='.length);
    }

    // Handle --cwd path form
    if (arg === '--cwd' && i + 1 < args.length) {
      return args[i + 1];
    }
  }

  return process.cwd();
}

/**
 * info 명령어 실행
 */
export async function executeInfoCommand(args: string[]): Promise<void> {
  const jsonOutput = args.includes('--json');
  const copyable = args.includes('--copyable') || args.includes('-c');
  const cwd = parseCwdArg(args);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
${BOLD}ralph-tui info${RESET} - 버그 리포트용 시스템 정보 표시

${BOLD}사용법:${RESET} ralph-tui info [옵션]

${BOLD}옵션:${RESET}
  ${DIM}--json${RESET}            JSON 형식으로 출력
  ${DIM}--copyable, -c${RESET}    버그 리포트용 복사 가능한 형식으로 출력
  ${DIM}--cwd <path>${RESET}      작업 디렉토리 (기본값: 현재 디렉토리)
  ${DIM}-h, --help${RESET}        이 도움말 표시

${BOLD}설명:${RESET}
  ralph-tui 설치에 대한 진단 정보를 수집하고 표시합니다.
  버그 리포트에 포함하기 유용합니다.

  수집되는 정보:
  - ralph-tui 버전
  - 런타임 (Bun/Node) 버전
  - 운영체제 세부사항
  - 설정 파일 위치 및 상태
  - 설치된 템플릿
  - 에이전트 감지 상태
  - 트래커 설정
  - 설치된 스킬 (에이전트별 및 커스텀 디렉토리)

${BOLD}예시:${RESET}
  ${CYAN}ralph-tui info${RESET}              # 시스템 정보 표시
  ${CYAN}ralph-tui info --json${RESET}       # 스크립트용 JSON 출력
  ${CYAN}ralph-tui info -c${RESET}           # 버그 리포트용 복사 가능한 형식
`);
    return;
  }

  try {
    const info = await collectSystemInfo(cwd);

    if (jsonOutput) {
      console.log(JSON.stringify(info, null, 2));
    } else if (copyable) {
      console.log(formatForBugReport(info));
    } else {
      console.log();
      console.log(formatSystemInfo(info));
      console.log();
      console.log(`${DIM}팁: 복사 가능한 버그 리포트 형식은 ${CYAN}ralph-tui info -c${RESET}${DIM} 사용${RESET}`);
      console.log();
    }
  } catch (error) {
    console.error(`${YELLOW}시스템 정보 수집 오류:${RESET}`, error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
