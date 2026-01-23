/**
 * ABOUTME: ralph-tui의 docs 명령어.
 * 기본 브라우저에서 문서를 열거나 URL을 표시합니다.
 * 정확한 문서 링크를 위해 git remote origin에서 저장소 URL을 감지합니다.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

/** 기본 저장소 기본 URL (git remote 감지 실패 시 사용) */
const DEFAULT_REPO_URL = 'https://github.com/subsy/ralph-tui';

/** 저장소 기준 상대 문서 섹션 경로 */
const DOC_PATHS = {
  main: '#readme',
  quickstart: '#quick-start',
  cli: '#cli-reference',
  plugins: '#plugins',
  templates: '#prompt-templates',
  contributing: '/blob/main/CONTRIBUTING.md',
} as const;

type DocSection = keyof typeof DOC_PATHS;

/** 반복 git 호출을 피하기 위한 캐시된 저장소 URL */
let cachedRepoUrl: string | null = null;

/**
 * git remote origin에서 GitHub 저장소 URL 감지.
 * SSH URL (git@github.com:user/repo.git)을 HTTPS URL로 변환.
 * 감지 실패 시 DEFAULT_REPO_URL로 폴백.
 */
async function getRepoUrl(): Promise<string> {
  if (cachedRepoUrl !== null) {
    return cachedRepoUrl;
  }

  try {
    const { stdout } = await execAsync('git remote get-url origin');
    const remoteUrl = stdout.trim();

    // SSH URL을 HTTPS URL로 변환
    // git@github.com:user/repo.git -> https://github.com/user/repo
    const sshMatch = remoteUrl.match(/^git@github\.com:(.+?)(?:\.git)?$/);
    if (sshMatch) {
      cachedRepoUrl = `https://github.com/${sshMatch[1]}`;
      return cachedRepoUrl;
    }

    // HTTPS URL 처리
    // https://github.com/user/repo.git -> https://github.com/user/repo
    const httpsMatch = remoteUrl.match(/^https:\/\/github\.com\/(.+?)(?:\.git)?$/);
    if (httpsMatch) {
      cachedRepoUrl = `https://github.com/${httpsMatch[1]}`;
      return cachedRepoUrl;
    }

    // URL 형식을 인식할 수 없는 경우 기본값으로 폴백
    cachedRepoUrl = DEFAULT_REPO_URL;
    return cachedRepoUrl;
  } catch {
    // git 저장소가 아니거나 git을 사용할 수 없음
    cachedRepoUrl = DEFAULT_REPO_URL;
    return cachedRepoUrl;
  }
}

/**
 * 섹션의 전체 문서 URL 가져오기
 */
async function getDocUrl(section: DocSection): Promise<string> {
  const baseUrl = await getRepoUrl();
  return baseUrl + DOC_PATHS[section];
}

/**
 * docs 명령어 도움말 출력
 */
export function printDocsHelp(): void {
  console.log(`
ralph-tui docs - 브라우저에서 문서 열기

사용법: ralph-tui docs [섹션] [옵션]

섹션:
  (없음)        메인 문서 열기
  quickstart    빠른 시작 가이드
  cli           CLI 참조
  plugins       플러그인 개발
  templates     프롬프트 템플릿
  contributing  기여 가이드

옵션:
  --url, -u    URL만 출력 (브라우저 열지 않음)
  --help, -h   이 도움말 표시

설명:
  기본 웹 브라우저에서 Ralph TUI 문서를 엽니다.
  수동으로 열고 싶으면 --url을 사용하여 URL만 출력하세요.

예시:
  ralph-tui docs              # 메인 문서 열기
  ralph-tui docs quickstart   # 빠른 시작 가이드 열기
  ralph-tui docs --url        # 메인 문서 URL 출력
  ralph-tui docs cli --url    # CLI 참조 URL 출력
`);
}

/**
 * docs 명령어 인자 파싱
 */
export function parseDocsArgs(args: string[]): { section: DocSection; urlOnly: boolean } {
  let section: DocSection = 'main';
  let urlOnly = false;

  for (const arg of args) {
    if (arg === '--url' || arg === '-u') {
      urlOnly = true;
    } else if (arg === '--help' || arg === '-h') {
      printDocsHelp();
      process.exit(0);
    } else if (!arg.startsWith('-')) {
      // 유효한 섹션인지 확인
      if (arg in DOC_PATHS) {
        section = arg as DocSection;
      } else {
        console.error(`알 수 없는 섹션: ${arg}`);
        console.log('사용 가능한 섹션: quickstart, cli, plugins, templates, contributing');
        process.exit(1);
      }
    }
  }

  return { section, urlOnly };
}

/**
 * 기본 브라우저에서 URL 열기.
 * Linux에서는 xdg-open, macOS에서는 open, Windows에서는 start 사용.
 */
async function openInBrowser(url: string): Promise<boolean> {
  const platform = process.platform;

  try {
    if (platform === 'darwin') {
      await execAsync(`open "${url}"`);
    } else if (platform === 'win32') {
      await execAsync(`start "" "${url}"`);
    } else {
      // Linux 및 기타 - xdg-open 먼저 시도, 그 다음 일반 브라우저
      try {
        await execAsync(`xdg-open "${url}"`);
      } catch {
        // 일반 브라우저로 폴백
        const browsers = ['firefox', 'google-chrome', 'chromium', 'brave'];
        let opened = false;
        for (const browser of browsers) {
          try {
            await execAsync(`which ${browser}`);
            await execAsync(`${browser} "${url}"`);
            opened = true;
            break;
          } catch {
            // 브라우저를 찾을 수 없음, 다음 시도
          }
        }
        if (!opened) {
          return false;
        }
      }
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * docs 명령어 실행
 */
export async function executeDocsCommand(args: string[]): Promise<void> {
  const { section, urlOnly } = parseDocsArgs(args);
  const url = await getDocUrl(section);

  if (urlOnly) {
    console.log(url);
    return;
  }

  console.log(`${section === 'main' ? '문서' : section + ' 문서'} 여는 중...`);
  console.log(`URL: ${url}`);
  console.log('');

  const success = await openInBrowser(url);

  if (!success) {
    console.log('브라우저를 자동으로 열 수 없습니다.');
    console.log('위 URL을 수동으로 열어주세요.');
  } else {
    console.log('기본 브라우저에서 문서가 열렸습니다.');
  }
}
