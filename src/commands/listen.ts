/**
 * ABOUTME: ralph-tui 원격 리스너의 listen 명령어.
 * 로컬 TUI 없이 원격 제어를 위한 WebSocket 서버를 시작합니다.
 * 데몬 모드와 토큰 로테이션을 지원합니다.
 */

import { spawn } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import {
  createRemoteServer,
  getOrCreateServerToken,
  rotateServerToken,
  getServerTokenInfo,
  type RemoteServerState,
} from '../remote/index.js';
import type { ListenOptions, ServerToken } from '../remote/types.js';
import { DEFAULT_LISTEN_OPTIONS, TOKEN_LIFETIMES } from '../remote/types.js';

/**
 * 데몬 PID 파일 경로
 */
const DAEMON_PID_PATH = join(homedir(), '.config', 'ralph-tui', 'listen.pid');

/**
 * listen 명령어 인자 파싱.
 */
export function parseListenArgs(args: string[]): Partial<ListenOptions> & { help?: boolean } {
  const options: Partial<ListenOptions> & { help?: boolean } = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--port' && args[i + 1]) {
      const port = parseInt(args[i + 1], 10);
      if (!isNaN(port) && port > 0 && port < 65536) {
        options.port = port;
      } else {
        console.error(`유효하지 않은 포트: ${args[i + 1]}`);
        process.exit(1);
      }
      i++;
    } else if (arg === '--daemon' || arg === '-d') {
      options.daemon = true;
    } else if (arg === '--rotate-token') {
      options.rotateToken = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    }
  }

  return options;
}

/**
 * 표시용 날짜 포맷.
 */
function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * 토큰 정보 표시.
 * 토큰은 새로 생성되었을 때만 전체가 표시됩니다.
 */
async function displayToken(token: ServerToken, isNew: boolean): Promise<void> {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('                   서버 인증 토큰                               ');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  if (isNew) {
    console.log('  새 서버 토큰이 생성되었습니다:');
    console.log('');
    console.log(`  ${token.value}`);
    console.log('');
    console.log('  ⚠️  중요: 이 토큰은 한 번만 표시됩니다. 안전하게 저장하세요.');
    console.log('     원격 클라이언트를 이 인스턴스에 연결하는 데 필요합니다.');
  } else {
    console.log('  기존 서버 토큰 사용 중 (새로 생성하려면 --rotate-token 사용)');
    console.log('');
    console.log(`  미리보기: ${token.value.slice(0, 8)}...`);
  }

  console.log('');
  console.log('  토큰 상세:');
  console.log(`    버전:     ${token.version}`);
  console.log(`    생성일:   ${formatDate(token.createdAt)}`);
  console.log(`    만료일:   ${formatDate(token.expiresAt)}`);

  const expiresAt = new Date(token.expiresAt);
  const daysRemaining = Math.ceil((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (daysRemaining <= 7) {
    console.log(`    ⚠️  ${daysRemaining}일 후 만료됩니다!`);
  } else {
    console.log(`    수명:     ${TOKEN_LIFETIMES.SERVER_TOKEN_DAYS}일`);
  }

  console.log('');

  if (isNew) {
    console.log('  나중에 이 토큰을 교체하려면 다음을 실행하세요:');
    console.log('    ralph-tui listen --rotate-token');
    console.log('');
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
}

/**
 * 서버 상태 정보 표시.
 */
function displayServerStatus(state: RemoteServerState): void {
  console.log('');
  console.log('───────────────────────────────────────────────────────────────');
  console.log('                     원격 리스너 시작됨                         ');
  console.log('───────────────────────────────────────────────────────────────');
  console.log('');
  console.log(`  상태:       실행 중`);
  console.log(`  포트:       ${state.port}`);
  console.log(`  호스트:     ${state.host}`);
  console.log(`  PID:        ${state.pid ?? process.pid}`);
  console.log('');

  if (state.host === '127.0.0.1') {
    console.log('  ⚠️  localhost에만 바인딩됨 (토큰 미설정)');
    console.log('     원격 연결이 허용되지 않습니다.');
    console.log('');
  } else {
    console.log('  ✓  모든 인터페이스에서 연결 허용');
    console.log('');
  }

  console.log('  연결 URL:');
  console.log(`    ws://${state.host === '0.0.0.0' ? '<hostname>' : state.host}:${state.port}`);
  console.log('');
  console.log('  서버를 중지하려면 Ctrl+C를 누르세요');
  console.log('───────────────────────────────────────────────────────────────');
  console.log('');
}

/**
 * 현재 프로세스를 데몬으로 포크.
 */
async function forkAsDaemon(port: number): Promise<void> {
  // 전달할 인자 작성
  const scriptPath = process.argv[1];
  const args = ['listen', '--port', port.toString()];

  const child = spawn(process.execPath, [scriptPath, ...args], {
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      RALPH_DAEMON: '1',
    },
  });

  // 부모가 종료할 수 있도록 자식 참조 해제
  child.unref();

  // PID 파일 작성
  await mkdir(dirname(DAEMON_PID_PATH), { recursive: true });
  await writeFile(DAEMON_PID_PATH, child.pid?.toString() ?? '', 'utf-8');

  console.log('');
  console.log(`Ralph 원격 리스너가 데몬으로 시작됨 (PID: ${child.pid})`);
  console.log(`포트: ${port}`);
  console.log('');
  console.log('토큰 정보 확인: ralph-tui listen --help');
  console.log('중지: kill $(cat ~/.config/ralph-tui/listen.pid)');
  console.log('');
}

/**
 * listen 명령어 실행.
 */
export async function executeListenCommand(args: string[]): Promise<void> {
  const options = parseListenArgs(args);

  // 도움말 처리
  if (options.help) {
    printListenHelp();
    return;
  }

  // 토큰 교체 처리
  if (options.rotateToken) {
    const newToken = await rotateServerToken();
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('                      토큰 교체 완료                            ');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    console.log('  새 서버 토큰 (안전하게 저장하세요):');
    console.log('');
    console.log(`  ${newToken.value}`);
    console.log('');
    console.log('  토큰 상세:');
    console.log(`    버전:     ${newToken.version}`);
    console.log(`    생성일:   ${formatDate(newToken.createdAt)}`);
    console.log(`    만료일:   ${formatDate(newToken.expiresAt)}`);
    console.log('');
    console.log('  ⚠️  이전 토큰을 사용하는 모든 기존 연결이 거부됩니다.');
    console.log('     이 토큰은 한 번만 표시됩니다. 지금 저장하세요.');
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    return;
  }

  // 기본값과 병합
  const listenOptions: ListenOptions = {
    ...DEFAULT_LISTEN_OPTIONS,
    ...options,
  };

  // 이미 데몬 모드인지 확인 (포크됨)
  const isDaemon = process.env.RALPH_DAEMON === '1';

  // 데몬 모드가 요청되었지만 아직 포크되지 않은 경우, 포크하고 종료
  if (listenOptions.daemon && !isDaemon) {
    await forkAsDaemon(listenOptions.port);
    return;
  }

  // 토큰 가져오기 또는 생성
  const { token, isNew } = await getOrCreateServerToken();

  // 첫 실행 시 토큰 표시 (데몬 모드 아닌 경우)
  if (isNew && !isDaemon) {
    await displayToken(token, true);
  } else if (!isDaemon) {
    // 만료 정보와 함께 토큰 미리보기 표시
    const tokenInfo = await getServerTokenInfo();
    if (tokenInfo.exists) {
      console.log('');
      console.log(`토큰 사용 중: ${tokenInfo.preview} (v${tokenInfo.version})`);
      if (tokenInfo.daysRemaining !== undefined && tokenInfo.daysRemaining <= 7) {
        console.log(`  ⚠️  토큰이 ${tokenInfo.daysRemaining}일 후 만료됩니다!`);
      }
    }
  }

  // 서버 생성 및 시작
  const server = await createRemoteServer({
    port: listenOptions.port,
    onConnect: (clientId) => {
      if (!isDaemon) {
        console.log(`[연결] 클라이언트 ${clientId} 연결됨`);
      }
    },
    onDisconnect: (clientId) => {
      if (!isDaemon) {
        console.log(`[연결 해제] 클라이언트 ${clientId} 연결 해제됨`);
      }
    },
  });

  const state = await server.start();

  // 상태 표시 (데몬 모드 아닌 경우)
  if (!isDaemon) {
    displayServerStatus(state);
  }

  // 종료 시그널 처리
  const shutdown = async () => {
    if (!isDaemon) {
      console.log('');
      console.log('종료 중...');
    }
    await server.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // 프로세스 계속 실행
  await new Promise(() => {
    // 이 Promise는 절대 해결되지 않아 이벤트 루프를 유지함
  });
}

/**
 * listen 명령어 도움말 출력.
 */
export function printListenHelp(): void {
  console.log(`
ralph-tui listen - 원격 리스너 시작

사용법: ralph-tui listen [옵션]

옵션:
  --port <port>     바인딩할 포트 (기본값: 7890)
  --daemon, -d      백그라운드 데몬으로 실행
  --rotate-token    새 토큰 생성 및 이전 토큰 무효화
  -h, --help        이 도움말 메시지 표시

설명:
  ralph-tui 인스턴스를 원격 제어하기 위한 WebSocket 서버를 시작합니다.
  이를 통해 원격 클라이언트에서 ralph-tui를 모니터링하고 제어할 수 있습니다.

  첫 실행 시 보안 인증 토큰이 생성되어 표시됩니다.
  이 토큰을 안전하게 저장하세요 - 원격 클라이언트를 연결하는 데 필요합니다.

보안:
  - 토큰이 설정되지 않은 경우 서버는 localhost (127.0.0.1)에만 바인딩됨
  - 토큰이 설정된 경우 서버는 모든 인터페이스 (0.0.0.0)에 바인딩됨
  - 모든 연결은 토큰으로 인증해야 함
  - 모든 작업은 ~/.config/ralph-tui/audit.log에 기록됨

토큰 관리:
  - 토큰은 ~/.config/ralph-tui/remote.json에 저장됨
  - --rotate-token을 사용하여 새 토큰 생성
  - 교체 시 이전 토큰은 즉시 무효화됨

예시:
  ralph-tui listen                    # 기본 포트 7890에서 시작
  ralph-tui listen --port 8080        # 사용자 지정 포트에서 시작
  ralph-tui listen --daemon           # 백그라운드 데몬으로 시작
  ralph-tui listen --rotate-token     # 인증 토큰 교체

데몬 관리:
  # 데몬 시작
  ralph-tui listen --daemon

  # 데몬 중지
  kill $(cat ~/.config/ralph-tui/listen.pid)

  # 실행 중인지 확인
  ps -p $(cat ~/.config/ralph-tui/listen.pid) 2>/dev/null && echo "실행 중"
`);
}
