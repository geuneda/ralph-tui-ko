/**
 * ABOUTME: 플러그인 관리를 위한 CLI 명령어.
 * 트래커 및 에이전트 플러그인을 나열, 검사, 관리하는 명령어를 제공합니다.
 */

import {
  getTrackerRegistry,
  registerBuiltinTrackers,
} from '../plugins/trackers/index.js';
import {
  getAgentRegistry,
  registerBuiltinAgents,
} from '../plugins/agents/index.js';

/**
 * plugins 명령어 도움말 출력
 */
export function printPluginsHelp(): void {
  console.log(`
ralph-tui plugins - 플러그인 관리 및 검사

사용법: ralph-tui plugins <하위명령어>

하위 명령어:
  agents     사용 가능한 모든 에이전트 플러그인 나열
  trackers   사용 가능한 모든 트래커 플러그인 나열

옵션:
  --help, -h   이 도움말 표시

설명:
  Ralph TUI는 AI 에이전트와 작업 트래커 모두에 플러그인 시스템을 사용합니다.

  에이전트 플러그인은 AI 코딩 어시스턴트를 통해 프롬프트를 실행합니다:
    - claude: Claude Code CLI (claude 명령어)
    - opencode: OpenCode CLI (opencode 명령어)

  트래커 플러그인은 작업 목록과 진행 상황을 관리합니다:
    - beads: Git 기반 이슈 트래커 (.beads/ 디렉토리)
    - beads-bv: 스마트 작업 선택을 위한 bv 그래프 분석이 포함된 Beads
    - json: 간단한 prd.json 파일 기반 추적

  커스텀 플러그인 추가 위치:
    ~/.config/ralph-tui/plugins/agents/
    ~/.config/ralph-tui/plugins/trackers/

예시:
  ralph-tui plugins agents      # 에이전트 플러그인 나열
  ralph-tui plugins trackers    # 트래커 플러그인 나열
`);
}

/**
 * 트래커 플러그인 CLI 명령어의 출력 형식
 */
interface TrackerPluginInfo {
  id: string;
  name: string;
  description: string;
  version: string;
  builtin: boolean;
  features: {
    bidirectionalSync: boolean;
    hierarchy: boolean;
    dependencies: boolean;
  };
}

/**
 * 에이전트 플러그인 CLI 명령어의 출력 형식
 */
interface AgentPluginInfo {
  id: string;
  name: string;
  description: string;
  version: string;
  builtin: boolean;
  defaultCommand: string;
  features: {
    streaming: boolean;
    interrupt: boolean;
    fileContext: boolean;
  };
}

/**
 * 사용 가능한 모든 트래커 플러그인 나열.
 * 호출: ralph-tui plugins trackers
 */
export async function listTrackerPlugins(): Promise<TrackerPluginInfo[]> {
  const registry = getTrackerRegistry();

  // 아직 등록되지 않은 경우 내장 플러그인 등록
  registerBuiltinTrackers();

  // 사용자 플러그인 검색
  await registry.initialize();

  // 등록된 모든 플러그인 가져오기
  const plugins = registry.getRegisteredPlugins();

  return plugins.map((meta) => ({
    id: meta.id,
    name: meta.name,
    description: meta.description,
    version: meta.version,
    builtin: registry.isBuiltin(meta.id),
    features: {
      bidirectionalSync: meta.supportsBidirectionalSync,
      hierarchy: meta.supportsHierarchy,
      dependencies: meta.supportsDependencies,
    },
  }));
}

/**
 * 포맷된 테이블로 콘솔에 트래커 플러그인 출력
 */
export async function printTrackerPlugins(): Promise<void> {
  const plugins = await listTrackerPlugins();

  if (plugins.length === 0) {
    console.log('트래커 플러그인을 찾을 수 없습니다.');
    return;
  }

  console.log('\n사용 가능한 트래커 플러그인:\n');
  console.log('─'.repeat(80));

  for (const plugin of plugins) {
    const typeLabel = plugin.builtin ? '(내장)' : '(사용자)';
    console.log(`  ${plugin.id} ${typeLabel}`);
    console.log(`    이름:        ${plugin.name}`);
    console.log(`    설명:        ${plugin.description}`);
    console.log(`    버전:        ${plugin.version}`);

    const features: string[] = [];
    if (plugin.features.bidirectionalSync) features.push('동기화');
    if (plugin.features.hierarchy) features.push('계층구조');
    if (plugin.features.dependencies) features.push('의존성');
    console.log(`    기능:        ${features.join(', ') || '없음'}`);

    console.log('─'.repeat(80));
  }

  console.log(`\n총: ${plugins.length}개 플러그인\n`);
}

/**
 * 사용 가능한 모든 에이전트 플러그인 나열.
 * 호출: ralph-tui plugins agents
 */
export async function listAgentPlugins(): Promise<AgentPluginInfo[]> {
  const registry = getAgentRegistry();

  // 아직 등록되지 않은 경우 내장 플러그인 등록
  registerBuiltinAgents();

  // 사용자 플러그인 검색
  await registry.initialize();

  // 등록된 모든 플러그인 가져오기
  const plugins = registry.getRegisteredPlugins();

  return plugins.map((meta) => ({
    id: meta.id,
    name: meta.name,
    description: meta.description,
    version: meta.version,
    builtin: registry.isBuiltin(meta.id),
    defaultCommand: meta.defaultCommand,
    features: {
      streaming: meta.supportsStreaming,
      interrupt: meta.supportsInterrupt,
      fileContext: meta.supportsFileContext,
    },
  }));
}

/**
 * 포맷된 테이블로 콘솔에 에이전트 플러그인 출력
 */
export async function printAgentPlugins(): Promise<void> {
  const plugins = await listAgentPlugins();

  if (plugins.length === 0) {
    console.log('에이전트 플러그인을 찾을 수 없습니다.');
    return;
  }

  console.log('\n사용 가능한 에이전트 플러그인:\n');
  console.log('─'.repeat(80));

  for (const plugin of plugins) {
    const typeLabel = plugin.builtin ? '(내장)' : '(사용자)';
    console.log(`  ${plugin.id} ${typeLabel}`);
    console.log(`    이름:        ${plugin.name}`);
    console.log(`    설명:        ${plugin.description}`);
    console.log(`    버전:        ${plugin.version}`);
    console.log(`    명령어:      ${plugin.defaultCommand}`);

    const features: string[] = [];
    if (plugin.features.streaming) features.push('스트리밍');
    if (plugin.features.interrupt) features.push('인터럽트');
    if (plugin.features.fileContext) features.push('파일 컨텍스트');
    console.log(`    기능:        ${features.join(', ') || '없음'}`);

    console.log('─'.repeat(80));
  }

  console.log(`\n총: ${plugins.length}개 플러그인\n`);
}
