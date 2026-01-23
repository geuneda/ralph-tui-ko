/**
 * ABOUTME: ralph-tui의 doctor 명령어.
 * 설정된 에이전트가 완전히 작동하는지 확인하기 위해 진단을 실행합니다.
 * 사용자가 작업을 시작하기 전에 설정 문제를 식별하고 수정할 수 있도록 돕습니다.
 */

import { loadStoredConfig } from '../config/index.js';
import { getAgentRegistry } from '../plugins/agents/registry.js';
import { registerBuiltinAgents } from '../plugins/agents/builtin/index.js';
import type { AgentPlugin, AgentPreflightResult, AgentDetectResult } from '../plugins/agents/types.js';

/**
 * doctor 명령어 진단 결과
 */
export interface DoctorResult {
  /** 전반적인 상태 */
  healthy: boolean;

  /** 검사 중인 에이전트 */
  agent: {
    name: string;
    plugin: string;
  };

  /** 감지 결과 */
  detection: AgentDetectResult;

  /** 사전 점검 결과 (감지를 통과한 경우만) */
  preflight?: AgentPreflightResult;

  /** 요약 메시지 */
  message: string;
}

/**
 * 설정된 에이전트에 대해 진단 실행
 */
async function runDiagnostics(
  cwd: string,
  agentOverride?: string,
  quiet = false
): Promise<DoctorResult> {
  const log = quiet ? () => {} : console.log.bind(console);
  // 설정 로드
  const storedConfig = await loadStoredConfig(cwd);

  // 내장 에이전트 등록
  registerBuiltinAgents();

  // 에이전트 레지스트리 가져오기
  const registry = getAgentRegistry();

  // 검사할 에이전트 결정
  const agentName = agentOverride ?? storedConfig.agent ?? 'claude';

  // 에이전트 플러그인 존재 확인
  if (!registry.hasPlugin(agentName)) {
    return {
      healthy: false,
      agent: { name: agentName, plugin: agentName },
      detection: { available: false, error: `알 수 없는 에이전트 플러그인: ${agentName}` },
      message: `에이전트 플러그인 '${agentName}'이(가) 등록되지 않았습니다`,
    };
  }

  // 에이전트 인스턴스 가져오기
  let agent: AgentPlugin;
  try {
    agent = await registry.getInstance({
      name: agentName,
      plugin: agentName,
      options: storedConfig.agentOptions ?? {},
      command: storedConfig.command,
      envExclude: storedConfig.envExclude,
    });
  } catch (error) {
    return {
      healthy: false,
      agent: { name: agentName, plugin: agentName },
      detection: { available: false, error: error instanceof Error ? error.message : String(error) },
      message: `에이전트 '${agentName}' 초기화 실패`,
    };
  }

  // 감지 실행
  log(`\n🔍 ${agent.meta.name} 확인 중...\n`);
  log('  1단계: 감지 (CLI 사용 가능 여부 확인)...');

  const detection = await agent.detect();

  if (!detection.available) {
    return {
      healthy: false,
      agent: { name: agent.meta.name, plugin: agent.meta.id },
      detection,
      message: detection.error ?? '에이전트 CLI를 사용할 수 없음',
    };
  }

  log(`    ✓ 위치: ${detection.executablePath}`);
  if (detection.version) {
    log(`    ✓ 버전: ${detection.version}`);
  }

  // 사전 점검 실행
  log('\n  2단계: 사전 점검 (에이전트 응답 가능 여부 테스트)...');
  log('    테스트 프롬프트 실행 중...');

  const preflight = await agent.preflight({ timeout: 30000 });

  if (!preflight.success) {
    return {
      healthy: false,
      agent: { name: agent.meta.name, plugin: agent.meta.id },
      detection,
      preflight,
      message: preflight.error ?? '에이전트 사전 점검 실패',
    };
  }

  log(`    ✓ 에이전트가 성공적으로 응답함 (${preflight.durationMs}ms)`);

  return {
    healthy: true,
    agent: { name: agent.meta.name, plugin: agent.meta.id },
    detection,
    preflight,
    message: '에이전트가 정상이며 사용할 준비가 되었습니다',
  };
}

/**
 * 사람이 읽기 쉬운 형식으로 doctor 결과 출력
 */
function printHumanResult(result: DoctorResult): void {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('                    Ralph TUI 진단 보고서                        ');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // 상태
  const statusIcon = result.healthy ? '✓' : '✗';
  const statusText = result.healthy ? '정상' : '비정상';
  console.log(`  상태:      ${statusIcon} ${statusText}`);
  console.log(`  에이전트:  ${result.agent.name} (${result.agent.plugin})`);
  console.log('');

  // 감지 세부사항
  console.log('  감지:');
  if (result.detection.available) {
    console.log(`    ✓ CLI 사용 가능`);
    if (result.detection.executablePath) {
      console.log(`    ✓ 경로: ${result.detection.executablePath}`);
    }
    if (result.detection.version) {
      console.log(`    ✓ 버전: ${result.detection.version}`);
    }
  } else {
    console.log(`    ✗ CLI 사용 불가`);
    if (result.detection.error) {
      console.log(`    ✗ 오류: ${result.detection.error}`);
    }
  }
  console.log('');

  // 사전 점검 세부사항
  if (result.preflight) {
    console.log('  사전 점검:');
    if (result.preflight.success) {
      console.log(`    ✓ 에이전트가 테스트 프롬프트에 응답함`);
      if (result.preflight.durationMs) {
        console.log(`    ✓ 응답 시간: ${result.preflight.durationMs}ms`);
      }
    } else {
      console.log(`    ✗ 에이전트 응답 실패`);
      if (result.preflight.error) {
        console.log(`    ✗ 오류: ${result.preflight.error}`);
      }
      if (result.preflight.suggestion) {
        console.log('');
        console.log('  제안:');
        // 제안을 줄바꿈으로 분리하고 각 줄 들여쓰기
        const lines = result.preflight.suggestion.split('\n');
        for (const line of lines) {
          console.log(`    ${line}`);
        }
      }
    }
    console.log('');
  }

  // 요약
  console.log('───────────────────────────────────────────────────────────────');
  if (result.healthy) {
    console.log('  ✓ 에이전트가 올바르게 설정되어 사용할 준비가 되었습니다.');
    console.log('');
    console.log('  작업 시작: ralph-tui run');
  } else {
    console.log(`  ✗ ${result.message}`);
    console.log('');
    console.log('  위 문제를 해결한 후 다시 실행하세요: ralph-tui doctor');
  }
  console.log('───────────────────────────────────────────────────────────────');
  console.log('');
}

/**
 * doctor 명령어 실행
 */
export async function executeDoctorCommand(args: string[]): Promise<void> {
  let cwd = process.cwd();
  let outputJson = false;
  let agentOverride: string | undefined;

  // 인자 파싱
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cwd' && args[i + 1]) {
      cwd = args[i + 1]!;
      i++;
    } else if (args[i] === '--json') {
      outputJson = true;
    } else if (args[i] === '--agent' && args[i + 1]) {
      agentOverride = args[i + 1];
      i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
      printDoctorHelp();
      return;
    }
  }

  try {
    const result = await runDiagnostics(cwd, agentOverride, outputJson);

    if (outputJson) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printHumanResult(result);
    }

    // 적절한 코드로 종료
    process.exit(result.healthy ? 0 : 1);
  } catch (error) {
    if (outputJson) {
      console.log(JSON.stringify({
        healthy: false,
        error: error instanceof Error ? error.message : String(error),
      }, null, 2));
    } else {
      console.error('');
      console.error(`✗ 진단 실패: ${error instanceof Error ? error.message : error}`);
      console.error('');
    }
    process.exit(1);
  }
}

/**
 * doctor 명령어 도움말 출력
 */
export function printDoctorHelp(): void {
  console.log(`
ralph-tui doctor - 에이전트 설정 진단

사용법: ralph-tui doctor [옵션]

옵션:
  --agent <name>    특정 에이전트 확인 (기본값: 설정된 에이전트)
  --json            JSON 형식으로 출력
  --cwd <path>      작업 디렉토리 (기본값: 현재 디렉토리)
  -h, --help        이 도움말 표시

설명:
  작업을 시작하기 전에 설정된 AI 에이전트가 완전히
  작동하는지 확인하기 위해 진단을 실행합니다.
  다음과 같은 일반적인 설정 문제를 식별하는 데 도움이 됩니다:

  - CLI 도구 누락
  - 설정되지 않은 API 키
  - 기본 모델 설정 누락
  - 네트워크 연결 문제

  doctor 명령어는 두 가지 검사를 실행합니다:

  1. 감지: 에이전트 CLI가 설치되어 접근 가능한지 확인
  2. 사전 점검: 에이전트가 응답할 수 있는지 테스트 프롬프트 전송

종료 코드:
  0    에이전트가 정상이며 사용할 준비가 됨
  1    에이전트에 설정 문제가 있음

예시:
  ralph-tui doctor                # 설정된 에이전트 확인
  ralph-tui doctor --agent claude # 특정 에이전트 확인
  ralph-tui doctor --json         # 스크립트용 JSON 출력

일반적인 문제:
  OpenCode: ~/.config/opencode/opencode.json에서 기본 모델 설정
  Claude:   ANTHROPIC_API_KEY 환경 변수 설정
  Droid:    Factory 플랫폼 자격 증명이 설정되었는지 확인
`);
}
