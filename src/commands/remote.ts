/**
 * ABOUTME: 원격 서버 설정 관리를 위한 remote 명령어.
 * 하위 명령어 제공: add, list, remove, test
 */

import {
  addRemote,
  removeRemote,
  listRemotes,
  getRemote,
  parseHostPort,
  updateLastConnected,
  REMOTES_CONFIG_PATHS,
} from '../remote/config.js';

/**
 * remote 명령어 옵션
 */
interface RemoteCommandOptions {
  subcommand?: string;
  alias?: string;
  hostPort?: string;
  token?: string;
  help?: boolean;
  // push-config options
  scope?: 'global' | 'project';
  preview?: boolean;
  force?: boolean;
  all?: boolean;
}

/**
 * remote 명령어 인자 파싱.
 */
export function parseRemoteArgs(args: string[]): RemoteCommandOptions {
  const options: RemoteCommandOptions = {};

  if (args.length === 0) {
    return options;
  }

  // First arg is the subcommand
  const subcommand = args[0];
  if (subcommand === '--help' || subcommand === '-h') {
    options.help = true;
    return options;
  }

  options.subcommand = subcommand;

  // Parse remaining args based on subcommand
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--token' && args[i + 1]) {
      options.token = args[i + 1];
      i++;
    } else if (arg === '--scope' && args[i + 1]) {
      const scopeValue = args[i + 1];
      if (scopeValue === 'global' || scopeValue === 'project') {
        options.scope = scopeValue;
      }
      i++;
    } else if (arg === '--preview') {
      options.preview = true;
    } else if (arg === '--force') {
      options.force = true;
    } else if (arg === '--all') {
      options.all = true;
    } else if (!arg.startsWith('-')) {
      // Positional arguments
      if (!options.alias) {
        options.alias = arg;
      } else if (!options.hostPort) {
        options.hostPort = arg;
      }
    }
  }

  return options;
}

/**
 * 원격 서버 연결 테스트.
 * 연결 상태 정보를 반환합니다.
 */
async function testRemoteConnection(
  host: string,
  port: number,
  token: string
): Promise<{ connected: boolean; error?: string; latencyMs?: number }> {
  const startTime = Date.now();

  return new Promise((resolve) => {
    let ws: WebSocket | null = null;
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    // 정리하고 한 번만 resolve하는 헬퍼
    const settleWith = (result: { connected: boolean; error?: string; latencyMs?: number }): void => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      if (ws) {
        // 추가 콜백 방지를 위해 핸들러 제거
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        try {
          ws.close();
        } catch {
          // close 오류 무시
        }
      }
      resolve(result);
    };

    // 연결 시도에 대한 타임아웃 설정
    timeout = setTimeout(() => {
      settleWith({ connected: false, error: '연결 시간 초과 (5초)' });
    }, 5000);

    try {
      ws = new WebSocket(`ws://${host}:${port}`);

      ws.onopen = () => {
        // Send auth message
        const authMsg = {
          type: 'auth',
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          token,
        };
        ws!.send(JSON.stringify(authMsg));
      };

      ws.onmessage = (event) => {
        const latencyMs = Date.now() - startTime;

        try {
          const msg = JSON.parse(event.data as string) as { type: string; success?: boolean; error?: string };

          if (msg.type === 'auth_response') {
            if (msg.success) {
              settleWith({ connected: true, latencyMs });
            } else {
              settleWith({ connected: false, error: msg.error ?? '인증 실패' });
            }
          } else {
            settleWith({ connected: false, error: `예상치 못한 응답: ${msg.type}` });
          }
        } catch {
          settleWith({ connected: false, error: '서버로부터 잘못된 응답' });
        }
      };

      ws.onerror = () => {
        settleWith({ connected: false, error: '연결 실패' });
      };

      ws.onclose = (event) => {
        if (!event.wasClean && event.code !== 1000) {
          settleWith({ connected: false, error: `연결 종료됨: ${event.reason || '알 수 없는 오류'}` });
        }
      };
    } catch (err) {
      settleWith({ connected: false, error: err instanceof Error ? err.message : '연결 실패' });
    }
  });
}

/**
 * 'remote add' 하위 명령어 실행.
 */
async function executeRemoteAdd(options: RemoteCommandOptions): Promise<void> {
  if (!options.alias || !options.hostPort) {
    console.error('사용법: ralph-tui remote add <alias> <host:port> --token <token>');
    console.error('');
    console.error('예시: ralph-tui remote add prod server.example.com:7890 --token abc123');
    process.exit(1);
  }

  if (!options.token) {
    console.error('오류: --token은 필수입니다');
    console.error('');
    console.error('사용법: ralph-tui remote add <alias> <host:port> --token <token>');
    process.exit(1);
  }

  const parsed = parseHostPort(options.hostPort);
  if (!parsed) {
    console.error(`오류: 잘못된 host:port 형식: ${options.hostPort}`);
    console.error('');
    console.error('예상 형식: hostname:port 또는 hostname (기본 포트 7890 사용)');
    process.exit(1);
  }

  const result = await addRemote(options.alias, parsed.host, parsed.port, options.token);

  if (!result.success) {
    console.error(`오류: ${result.error}`);
    process.exit(1);
  }

  console.log('');
  console.log(`✓ 원격 '${options.alias}' 추가 성공`);
  console.log('');
  console.log(`  호스트: ${parsed.host}`);
  console.log(`  포트: ${parsed.port}`);
  console.log('');
  console.log(`테스트: ralph-tui remote test ${options.alias}`);
  console.log('');
}

/**
 * 'remote list' 하위 명령어 실행.
 */
async function executeRemoteList(): Promise<void> {
  const remotes = await listRemotes();

  if (remotes.length === 0) {
    console.log('');
    console.log('설정된 원격 서버가 없습니다.');
    console.log('');
    console.log('원격 서버 추가:');
    console.log('  ralph-tui remote add <alias> <host:port> --token <token>');
    console.log('');
    return;
  }

  console.log('');
  console.log('설정된 원격 서버');
  console.log('══════════════════════════════════════════════════════════════');
  console.log('');

  // 상태 확인을 위해 연결 병렬 테스트
  const statusPromises = remotes.map(async ([alias, remote]) => {
    const status = await testRemoteConnection(remote.host, remote.port, remote.token);
    return { alias, remote, status };
  });

  const results = await Promise.all(statusPromises);

  for (const { alias, remote, status } of results) {
    const statusIcon = status.connected ? '✓' : '✗';
    const statusText = status.connected
      ? `연결됨 (${status.latencyMs}ms)`
      : status.error ?? '연결 끊김';

    console.log(`  ${statusIcon} ${alias}`);
    console.log(`    URL:    ws://${remote.host}:${remote.port}`);
    console.log(`    상태:   ${statusText}`);
    console.log(`    토큰:   ${remote.token.slice(0, 8)}...`);

    if (remote.lastConnected) {
      console.log(`    마지막: ${new Date(remote.lastConnected).toLocaleString('ko-KR')}`);
    }
    console.log('');
  }

  console.log('──────────────────────────────────────────────────────────────');
  console.log(`총: ${remotes.length}개 원격 서버`);
  console.log('');
}

/**
 * 'remote remove' 하위 명령어 실행.
 */
async function executeRemoteRemove(options: RemoteCommandOptions): Promise<void> {
  if (!options.alias) {
    console.error('사용법: ralph-tui remote remove <alias>');
    process.exit(1);
  }

  const result = await removeRemote(options.alias);

  if (!result.success) {
    console.error(`오류: ${result.error}`);
    process.exit(1);
  }

  console.log('');
  console.log(`✓ 원격 '${options.alias}' 제거됨`);
  console.log('');
}

/**
 * 'remote test' 하위 명령어 실행.
 */
async function executeRemoteTest(options: RemoteCommandOptions): Promise<void> {
  if (!options.alias) {
    console.error('사용법: ralph-tui remote test <alias>');
    process.exit(1);
  }

  const remote = await getRemote(options.alias);
  if (!remote) {
    console.error(`오류: 원격 '${options.alias}'을(를) 찾을 수 없습니다`);
    console.error('');
    console.error('사용 가능한 원격 서버:');
    const remotes = await listRemotes();
    if (remotes.length === 0) {
      console.error('  (설정된 서버 없음)');
    } else {
      for (const [alias] of remotes) {
        console.error(`  - ${alias}`);
      }
    }
    process.exit(1);
  }

  console.log('');
  console.log(`'${options.alias}'에 연결 테스트 중...`);
  console.log(`  URL: ws://${remote.host}:${remote.port}`);
  console.log('');

  const status = await testRemoteConnection(remote.host, remote.port, remote.token);

  if (status.connected) {
    // 마지막 연결 타임스탬프 업데이트
    await updateLastConnected(options.alias);

    console.log('✓ 연결 성공');
    console.log(`  지연 시간: ${status.latencyMs}ms`);
    console.log('');
  } else {
    console.log('✗ 연결 실패');
    console.log(`  오류: ${status.error}`);
    console.log('');
    process.exit(1);
  }
}

/**
 * 'remote push-config' 하위 명령어 실행.
 * 로컬 설정을 원격 인스턴스에 푸시합니다.
 */
async function executeRemotePushConfig(options: RemoteCommandOptions): Promise<void> {
  const { homedir } = await import('node:os');
  const { join } = await import('node:path');
  const { readFile, access, constants } = await import('node:fs/promises');
  const { RemoteClient } = await import('../remote/client.js');
  const readline = await import('node:readline');

  // 사용자 프롬프트 헬퍼
  const prompt = (question: string): Promise<string> => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    return new Promise((resolve) => {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer);
      });
    });
  };

  // 푸시할 원격 서버 목록 가져오기
  const remotes = await listRemotes();
  if (remotes.length === 0) {
    console.error('');
    console.error('설정된 원격 서버가 없습니다.');
    console.error('');
    console.error('원격 서버 추가:');
    console.error('  ralph-tui remote add <alias> <host:port> --token <token>');
    console.error('');
    process.exit(1);
  }

  // 푸시할 원격 서버 결정
  let targetRemotes: [string, typeof remotes[0][1]][] = [];
  if (options.all) {
    targetRemotes = remotes;
  } else if (options.alias) {
    const remote = await getRemote(options.alias);
    if (!remote) {
      console.error(`오류: 원격 '${options.alias}'을(를) 찾을 수 없습니다`);
      console.error('');
      console.error('사용 가능한 원격 서버:');
      for (const [alias] of remotes) {
        console.error(`  - ${alias}`);
      }
      process.exit(1);
    }
    targetRemotes = [[options.alias, remote]];
  } else {
    console.error('사용법: ralph-tui remote push-config <alias> [옵션]');
    console.error('       ralph-tui remote push-config --all [옵션]');
    console.error('');
    console.error('alias를 지정하거나 --all을 사용하여 모든 원격 서버에 푸시하세요.');
    process.exit(1);
  }

  // 로컬 설정 로드
  const globalConfigPath = join(homedir(), '.config', 'ralph-tui', 'config.toml');
  const projectConfigPath = join(process.cwd(), '.ralph-tui', 'config.toml');

  let globalContent: string | null = null;
  let projectContent: string | null = null;

  try {
    await access(globalConfigPath, constants.R_OK);
    globalContent = await readFile(globalConfigPath, 'utf-8');
  } catch {
    // 전역 설정 없음
  }

  try {
    await access(projectConfigPath, constants.R_OK);
    projectContent = await readFile(projectConfigPath, 'utf-8');
  } catch {
    // 프로젝트 설정 없음
  }

  if (!globalContent && !projectContent) {
    console.error('');
    console.error('푸시할 로컬 설정을 찾을 수 없습니다.');
    console.error('');
    console.error('예상 설정 위치:');
    console.error(`  전역: ${globalConfigPath}`);
    console.error(`  프로젝트: ${projectConfigPath}`);
    console.error('');
    console.error('설정을 생성하려면 "ralph-tui setup"을 실행하세요.');
    process.exit(1);
  }

  console.log('');
  console.log('📤 원격으로 설정 푸시');
  console.log('════════════════════════════════════════════════════════════════');

  // 각 원격 서버 처리
  for (const [alias, remote] of targetRemotes) {
    console.log('');
    console.log(`원격: ${alias} (${remote.host}:${remote.port})`);
    console.log('──────────────────────────────────────────────────────────────────');

    // 원격 서버에 연결
    let client: InstanceType<typeof RemoteClient>;
    try {
      client = new RemoteClient(remote.host, remote.port, remote.token, () => {});
      await client.connect();
    } catch (error) {
      console.error(`  ✗ 연결 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
      continue;
    }

    // 원격 서버에 어떤 설정이 있는지 확인
    let remoteConfig: Awaited<ReturnType<typeof client.checkConfig>>;
    try {
      remoteConfig = await client.checkConfig();
    } catch (error) {
      console.error(`  ✗ 원격 설정 확인 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
      client.disconnect();
      continue;
    }

    console.log('  원격 설정 상태:');
    console.log(`    전역:     ${remoteConfig.globalExists ? '✓ 존재' : '○ 없음'}`);
    console.log(`    프로젝트: ${remoteConfig.projectExists ? '✓ 존재' : '○ 없음'}`);
    if (remoteConfig.remoteCwd) {
      console.log(`    원격 CWD: ${remoteConfig.remoteCwd}`);
    }

    // 범위 결정
    let scope: 'global' | 'project' = options.scope ?? 'global';
    if (!options.scope) {
      // 자동 감지: 프로젝트 설정이 있고 원격에 없으면 프로젝트 우선
      if (projectContent && !remoteConfig.projectExists) {
        scope = 'project';
      } else if (globalContent) {
        scope = 'global';
      } else if (projectContent) {
        scope = 'project';
      }
      console.log(`  자동 선택된 범위: ${scope === 'global' ? '전역' : '프로젝트'}`);
    }

    const configContent = scope === 'global' ? globalContent : projectContent;
    if (!configContent) {
      console.error(`  ✗ 푸시할 로컬 ${scope === 'global' ? '전역' : '프로젝트'} 설정이 없습니다`);
      client.disconnect();
      continue;
    }

    // 미리보기 모드: diff 표시
    if (options.preview) {
      console.log('');
      console.log(`  미리보기 (${scope === 'global' ? '전역' : '프로젝트'} 설정):`);
      console.log('  ───────────────────────────────────────────────────────────');

      const remoteContent = scope === 'global' ? remoteConfig.globalContent : remoteConfig.projectContent;
      if (remoteContent) {
        console.log('  원격 (기존):');
        for (const line of remoteContent.split('\n').slice(0, 10)) {
          console.log(`    ${line}`);
        }
        if (remoteContent.split('\n').length > 10) {
          console.log('    ... (생략됨)');
        }
        console.log('');
      }
      console.log('  로컬 (푸시할 내용):');
      for (const line of configContent.split('\n').slice(0, 10)) {
        console.log(`    ${line}`);
      }
      if (configContent.split('\n').length > 10) {
        console.log('    ... (생략됨)');
      }
      console.log('');
      client.disconnect();
      continue;
    }

    // 덮어쓰기 필요 여부 확인
    const configExists = scope === 'global' ? remoteConfig.globalExists : remoteConfig.projectExists;
    let overwrite = options.force ?? false;

    if (configExists && !overwrite) {
      // 확인 요청
      if (process.stdin.isTTY) {
        const answer = await prompt(`  설정이 존재합니다. 덮어쓰시겠습니까? (y/N): `);
        overwrite = answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
      }
      if (!overwrite) {
        console.log('  건너뜀 (설정 존재, 덮어쓰려면 --force 사용)');
        client.disconnect();
        continue;
      }
    }

    // 설정 푸시
    console.log(`  ${scope === 'global' ? '전역' : '프로젝트'} 설정 푸시 중...`);
    try {
      const result = await client.pushConfig(scope, configContent, overwrite);
      if (result.success) {
        console.log(`  ✓ 설정 푸시 성공`);
        if (result.configPath) {
          console.log(`    경로: ${result.configPath}`);
        }
        if (result.backupPath) {
          console.log(`    백업: ${result.backupPath}`);
        }
        if (result.migrationTriggered) {
          console.log('    마이그레이션 트리거됨 (스킬/템플릿이 설치됩니다)');
        }
        if (result.requiresRestart) {
          console.log('    참고: 변경사항은 다음 실행 시 적용됩니다');
        }
        await updateLastConnected(alias);
      } else {
        console.error(`  ✗ 푸시 실패: ${result.error}`);
      }
    } catch (error) {
      console.error(`  ✗ 푸시 오류: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    }

    client.disconnect();
  }

  console.log('');
  console.log('════════════════════════════════════════════════════════════════');
  console.log('');
}

/**
 * remote 명령어 실행.
 */
export async function executeRemoteCommand(args: string[]): Promise<void> {
  const options = parseRemoteArgs(args);

  if (options.help || !options.subcommand) {
    printRemoteHelp();
    return;
  }

  switch (options.subcommand) {
    case 'add':
      await executeRemoteAdd(options);
      break;
    case 'list':
    case 'ls':
      await executeRemoteList();
      break;
    case 'remove':
    case 'rm':
      await executeRemoteRemove(options);
      break;
    case 'test':
      await executeRemoteTest(options);
      break;
    case 'push-config':
      await executeRemotePushConfig(options);
      break;
    default:
      console.error(`알 수 없는 하위 명령어: ${options.subcommand}`);
      console.error('');
      printRemoteHelp();
      process.exit(1);
  }
}

/**
 * remote 명령어 도움말 출력.
 */
export function printRemoteHelp(): void {
  console.log(`
ralph-tui remote - 원격 서버 설정 관리

사용법: ralph-tui remote <subcommand> [옵션]

하위 명령어:
  add <alias> <host:port> --token <token>   원격 서버 추가
  list, ls                                   설정된 원격 서버와 상태 나열
  remove, rm <alias>                         원격 서버 제거
  test <alias>                               원격 서버 연결 테스트
  push-config <alias>                        로컬 설정을 원격으로 푸시
  push-config --all                          모든 원격 서버에 설정 푸시

Add 옵션:
  --token <token>       인증 토큰 (필수)

Push-Config 옵션:
  --scope global|project  푸시할 설정 (기본값: 자동 감지)
  --preview               변경사항 적용 없이 diff 표시
  --force                 확인 없이 기존 설정 덮어쓰기

예시:
  # 원격 서버 추가
  ralph-tui remote add prod server.example.com:7890 --token abc123

  # 기본 포트(7890)로 추가
  ralph-tui remote add staging staging.local --token xyz789

  # 연결 상태와 함께 모든 원격 서버 나열
  ralph-tui remote list

  # 연결 테스트
  ralph-tui remote test prod

  # 원격 서버 제거
  ralph-tui remote remove prod

  # 원격 서버에 설정 푸시
  ralph-tui remote push-config prod

  # 푸시될 내용 미리보기
  ralph-tui remote push-config prod --preview

  # 강제 덮어쓰기로 전역 설정 푸시
  ralph-tui remote push-config prod --scope global --force

  # 모든 원격 서버에 푸시
  ralph-tui remote push-config --all --force

설정:
  원격 서버는 다음 위치에 저장됨: ${REMOTES_CONFIG_PATHS.file}

  파일을 직접 편집할 수 있습니다 (TOML 형식):
    [remotes.prod]
    host = "server.example.com"
    port = 7890
    token = "your-token-here"
    addedAt = "2026-01-19T00:00:00.000Z"

TUI 통합:
  TUI 설정 패널은 그래픽 인터페이스로 원격 서버를
  관리하는 동등한 기능을 제공합니다.
`);
}
