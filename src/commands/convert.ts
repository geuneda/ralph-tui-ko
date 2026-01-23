/**
 * ABOUTME: ralph-tui의 Convert 명령어.
 * PRD 마크다운 파일을 prd.json 또는 Beads 형식으로 변환합니다.
 */

import { readFile, writeFile, access, constants, mkdir } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
import { spawn } from 'node:child_process';
import {
  parsePrdMarkdown,
  parsedPrdToGeneratedPrd,
  convertToPrdJson,
} from '../prd/index.js';
import { loadStoredConfig } from '../config/index.js';
import {
  promptText,
  promptBoolean,
  printSection,
  printSuccess,
  printError,
  printInfo,
} from '../setup/prompts.js';
import {
  validatePrdJsonSchema,
  PrdJsonSchemaError,
} from '../plugins/trackers/builtin/json/index.js';

/**
 * 지원하는 변환 대상 형식.
 */
export type ConvertFormat = 'json' | 'beads';

/**
 * convert 명령어의 명령줄 인자.
 */
export interface ConvertArgs {
  /** 대상 형식 */
  to: ConvertFormat;

  /** 입력 파일 경로 */
  input: string;

  /** 출력 파일 경로 (선택, json 형식에서만 사용) */
  output?: string;

  /** 브랜치 이름 (선택, 미제공 시 프롬프트 표시) */
  branch?: string;

  /** 적용할 라벨 (선택, beads 형식용) */
  labels?: string[];

  /** 확인 프롬프트 건너뛰기 */
  force?: boolean;

  /** 상세 출력 표시 */
  verbose?: boolean;
}

/**
 * convert 명령어 인자 파싱.
 */
export function parseConvertArgs(args: string[]): ConvertArgs | null {
  let to: ConvertFormat | undefined;
  let input: string | undefined;
  let output: string | undefined;
  let branch: string | undefined;
  let labels: string[] | undefined;
  let force = false;
  let verbose = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--to' || arg === '-t') {
      const format = args[++i];
      if (format === 'json' || format === 'beads') {
        to = format;
      } else {
        console.error(`지원하지 않는 형식: ${format}`);
        console.log('지원 형식: json, beads');
        return null;
      }
    } else if (arg === '--output' || arg === '-o') {
      output = args[++i];
    } else if (arg === '--branch' || arg === '-b') {
      branch = args[++i];
    } else if (arg === '--labels' || arg === '-l') {
      const labelsStr = args[++i];
      labels = labelsStr ? labelsStr.split(',').map((l) => l.trim()).filter((l) => l.length > 0) : [];
    } else if (arg === '--force' || arg === '-f') {
      force = true;
    } else if (arg === '--verbose' || arg === '-v') {
      verbose = true;
    } else if (arg === '--help' || arg === '-h') {
      printConvertHelp();
      process.exit(0);
    } else if (!arg?.startsWith('-')) {
      // Positional argument is the input file
      input = arg;
    }
  }

  // 필수 인자 검증
  if (!to) {
    console.error('오류: --to <format>은 필수입니다');
    console.log('사용법은 --help를 참조하세요');
    return null;
  }

  if (!input) {
    console.error('오류: 입력 파일 경로는 필수입니다');
    console.log('사용법: ralph-tui convert --to json ./tasks/prd-feature.md');
    return null;
  }

  return { to, input, output, branch, labels, force, verbose };
}

/**
 * convert 명령어 도움말 출력.
 */
export function printConvertHelp(): void {
  console.log(`
ralph-tui convert - PRD 마크다운을 JSON 또는 Beads 형식으로 변환

사용법: ralph-tui convert --to <format> <input-file> [옵션]

인자:
  <input-file>           변환할 PRD 마크다운 파일 경로

옵션:
  --to, -t <format>      대상 형식 (필수): json, beads
  --output, -o <path>    출력 파일 경로 (기본값: ./prd.json, json 형식에서만 사용)
  --branch, -b <name>    Git 브랜치 이름 (미제공 시 프롬프트 표시)
  --labels, -l <labels>  적용할 라벨 (쉼표 구분, beads 형식에서만 사용)
                         기본값: config.toml의 [trackerOptions].labels 사용
                         참고: beads 형식에서 "ralph"는 항상 포함됨
  --force, -f            프롬프트 없이 기존 파일 덮어쓰기
  --verbose, -v          상세 파싱 출력 표시
  --help, -h             이 도움말 메시지 표시

설명:
  convert 명령어는 PRD 마크다운 파일을 파싱하여 다음을 추출합니다:

  - ### US-XXX: Title 섹션에서 사용자 스토리
  - 체크리스트 항목(- [ ] item)에서 인수 기준
  - **Priority:** P1-P4 줄에서 우선순위
  - **Depends on:** 줄에서 의존성

  JSON 형식 (--to json):
    \`ralph-tui run --prd ./prd.json\`에서 사용할 prd.json 파일 생성

  Beads 형식 (--to beads):
    - 기능에 대한 에픽 bead 생성
    - 각 사용자 스토리에 대한 자식 bead 생성
    - 스토리 순서 또는 명시적 deps 기반으로 의존성 설정
    - 'ralph' 라벨과 설정/CLI 라벨 적용
    - 생성 후 bd sync 실행
    - 생성된 모든 bead ID 표시

예시:
  # JSON 형식으로 변환
  ralph-tui convert --to json ./tasks/prd-feature.md
  ralph-tui convert --to json ./docs/requirements.md -o ./custom.json

  # Beads 형식으로 변환
  ralph-tui convert --to beads ./tasks/prd-feature.md
  ralph-tui convert --to beads ./prd.md --labels "frontend,sprint-1"
`);
}

/**
 * 파일 존재 여부 확인.
 */
async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * bd 명령어 실행 및 출력 반환.
 */
async function execBd(
  args: string[],
  cwd?: string
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const proc = spawn('bd', args, {
      cwd,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });

    proc.on('error', (err) => {
      stderr += err.message;
      resolve({ stdout, stderr, exitCode: 1 });
    });
  });
}

/**
 * Beads 변환 결과.
 */
interface BeadsConversionResult {
  success: boolean;
  epicId?: string;
  storyIds: string[];
  error?: string;
}

/**
 * PRD를 Beads 형식으로 변환.
 * 에픽 bead와 각 사용자 스토리에 대한 자식 bead를 생성합니다.
 */
async function convertToBeads(
  parsed: import('../prd/parser.js').ParsedPrd,
  labels: string[],
  verbose: boolean,
  prdPath?: string
): Promise<BeadsConversionResult> {
  const storyIds: string[] = [];

  // 'ralph' 라벨이 항상 포함되도록 보장
  const allLabels = ['ralph', ...labels.filter((l) => l !== 'ralph')];
  const labelsStr = allLabels.join(',');

  // 1단계: 에픽 bead 생성
  printInfo('에픽 bead 생성 중...');
  const epicArgs = [
    'create',
    '--type', 'epic',
    '--title', parsed.name,
    '--description', parsed.description,
    '--labels', labelsStr,
    '--priority', '1',
    '--silent',
  ];

  // PRD 링크 포함 (가능한 경우)
  if (prdPath) {
    epicArgs.splice(-1, 0, '--external-ref', `prd:${prdPath}`);
  }

  if (verbose) {
    console.log(`  bd ${epicArgs.join(' ')}`);
  }

  const epicResult = await execBd(epicArgs);

  if (epicResult.exitCode !== 0) {
    return {
      success: false,
      storyIds: [],
      error: `에픽 생성 실패: ${epicResult.stderr || epicResult.stdout}`,
    };
  }

  const epicId = epicResult.stdout.trim();
  printSuccess(`에픽 생성됨: ${epicId}`);

  // 2단계: 각 사용자 스토리에 대한 자식 bead 생성
  // 의존성 매핑을 위해 이전 스토리 ID를 새 bead ID로 매핑
  const storyIdMap: Map<string, string> = new Map();

  printInfo(`${parsed.userStories.length}개 스토리 bead 생성 중...`);

  for (const story of parsed.userStories) {
    // 인수 기준을 포함한 설명 구성
    let description = story.description || story.title;
    if (story.acceptanceCriteria.length > 0) {
      description += '\n\n## 인수 기준\n';
      for (const criterion of story.acceptanceCriteria) {
        description += `- [ ] ${criterion}\n`;
      }
    }

    const storyArgs = [
      'create',
      '--type', 'task',
      '--title', `${story.id}: ${story.title}`,
      '--description', description,
      '--labels', labelsStr,
      '--priority', String(story.priority),
      '--parent', epicId,
      '--silent',
    ];

    // PRD 링크 포함 (가능한 경우)
    if (prdPath) {
      storyArgs.splice(-1, 0, '--external-ref', `prd:${prdPath}`);
    }

    if (verbose) {
      console.log(`  bd ${storyArgs.join(' ')}`);
    }

    const storyResult = await execBd(storyArgs);

    if (storyResult.exitCode !== 0) {
      printError(`스토리 ${story.id} 생성 실패: ${storyResult.stderr || storyResult.stdout}`);
      continue;
    }

    const newBeadId = storyResult.stdout.trim();
    storyIds.push(newBeadId);
    storyIdMap.set(story.id, newBeadId);

    if (verbose) {
      printSuccess(`  생성됨: ${newBeadId} (${story.id}: ${story.title})`);
    }
  }

  // 3단계: 의존성 설정
  printInfo('의존성 설정 중...');
  let depsCreated = 0;

  for (const story of parsed.userStories) {
    const currentBeadId = storyIdMap.get(story.id);
    if (!currentBeadId) continue;

    // PRD의 명시적 의존성 처리
    if (story.dependsOn && story.dependsOn.length > 0) {
      for (const depId of story.dependsOn) {
        const depBeadId = storyIdMap.get(depId);
        if (depBeadId) {
          // bd dep add <blocked-id> <blocker-id>
          // currentBead가 depBead에 의존 (depBead가 currentBead를 차단)
          const depArgs = ['dep', 'add', currentBeadId, depBeadId];

          if (verbose) {
            console.log(`  bd ${depArgs.join(' ')}`);
          }

          const depResult = await execBd(depArgs);

          if (depResult.exitCode !== 0) {
            if (verbose) {
              printError(`  의존성 생성 실패: ${depResult.stderr || depResult.stdout}`);
            }
          } else {
            depsCreated++;
          }
        }
      }
    }
  }

  if (depsCreated > 0) {
    printSuccess(`${depsCreated}개 의존성 생성됨`);
  } else if (parsed.userStories.some((s) => s.dependsOn && s.dependsOn.length > 0)) {
    printInfo('의존성이 생성되지 않음 (지정되었으나 찾을 수 없음)');
  }

  // 4단계: bd sync 실행
  printInfo('bd sync 실행 중...');
  const syncResult = await execBd(['sync']);

  if (syncResult.exitCode !== 0) {
    printError(`bd sync 실패: ${syncResult.stderr || syncResult.stdout}`);
    // sync 실패로 전체 작업을 실패시키지 않음
  } else {
    printSuccess('beads가 git과 동기화됨');
  }

  return {
    success: true,
    epicId,
    storyIds,
  };
}

/**
 * convert 명령어 실행.
 */
export async function executeConvertCommand(args: string[]): Promise<void> {
  const parsedArgs = parseConvertArgs(args);

  if (!parsedArgs) {
    process.exit(1);
  }

  const { to, input, output, branch, labels, force, verbose } = parsedArgs;

  // 입력 경로 해석
  const inputPath = resolve(input);

  // 입력 파일 존재 확인
  if (!(await fileExists(inputPath))) {
    printError(`입력 파일을 찾을 수 없음: ${inputPath}`);
    process.exit(1);
  }

  const formatLabel = to === 'beads' ? 'Beads' : 'JSON';
  printSection(`PRD를 ${formatLabel}로 변환`);

  // 입력 파일 읽기
  printInfo(`읽는 중: ${inputPath}`);
  let markdown: string;
  try {
    markdown = await readFile(inputPath, 'utf-8');
  } catch (err) {
    printError(`입력 파일 읽기 실패: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  // 마크다운 파싱
  printInfo('마크다운에서 사용자 스토리 파싱 중...');
  const parsed = parsePrdMarkdown(markdown);

  // 경고 표시
  if (parsed.warnings.length > 0 && verbose) {
    console.log();
    console.log('파싱 경고:');
    for (const warning of parsed.warnings) {
      console.log(`  - ${warning}`);
    }
  }

  // 파싱된 정보 표시
  console.log();
  printSuccess(`${parsed.userStories.length}개 사용자 스토리 발견`);

  if (verbose) {
    console.log();
    console.log('사용자 스토리:');
    for (const story of parsed.userStories) {
      console.log(`  ${story.id}: ${story.title} (P${story.priority})`);
      if (story.acceptanceCriteria.length > 0) {
        console.log(`    - ${story.acceptanceCriteria.length}개 인수 기준`);
      }
      if (story.dependsOn && story.dependsOn.length > 0) {
        console.log(`    - 의존: ${story.dependsOn.join(', ')}`);
      }
    }
  }

  if (parsed.userStories.length === 0) {
    printError('PRD에서 사용자 스토리를 찾을 수 없습니다');
    printInfo('PRD에 ### US-001: Title 형식의 섹션이 있는지 확인하세요');
    process.exit(1);
  }

  // Branch to format-specific handling
  if (to === 'beads') {
    await executeBeadsConversion(parsed, labels || [], verbose ?? false, input);
  } else {
    await executeJsonConversion(parsed, output, branch, force ?? false, inputPath);
  }
}

/**
 * JSON 형식 변환 실행.
 */
async function executeJsonConversion(
  parsed: import('../prd/parser.js').ParsedPrd,
  output: string | undefined,
  branch: string | undefined,
  force: boolean,
  inputPath: string
): Promise<void> {
  // 브랜치 이름이 제공되지 않은 경우 프롬프트
  let branchName = branch || parsed.branchName;

  if (!branchName) {
    console.log();
    const featureSlug = parsed.name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    const defaultBranch = `feature/${featureSlug}`;

    branchName = await promptText('이 작업의 Git 브랜치 이름:', {
      default: defaultBranch,
      required: true,
      help: 'ralph-tui 실행 시 사용될 git 브랜치',
    });
  }

  // 출력 경로 결정
  const outputPath = output ? resolve(output) : resolve('./prd.json');

  // 출력 파일 존재 확인
  if (await fileExists(outputPath)) {
    if (!force) {
      console.log();
      const overwrite = await promptBoolean(`출력 파일 존재: ${outputPath}. 덮어쓰시겠습니까?`, {
        default: false,
      });

      if (!overwrite) {
        printInfo('변환 취소됨');
        process.exit(0);
      }
    }
  }

  const generatedPrd = parsedPrdToGeneratedPrd(parsed, branchName);

  // 출력 디렉토리에서 입력 PRD까지의 상대 경로 계산
  const outputDir = dirname(outputPath);
  const sourcePrdPath = relative(outputDir, inputPath);

  const prdJson = convertToPrdJson(generatedPrd, sourcePrdPath);

  try {
    validatePrdJsonSchema(prdJson, outputPath);
  } catch (err) {
    if (err instanceof PrdJsonSchemaError) {
      printError('내부 오류: 생성된 prd.json이 스키마 검증에 실패했습니다.');
      printError('이는 PRD 파서의 버그를 나타냅니다. 이 문제를 보고해 주세요.');
      for (const detail of err.details) {
        console.error(`  - ${detail}`);
      }
      process.exit(1);
    }
    throw err;
  }

  try {
    await mkdir(outputDir, { recursive: true });
  } catch {
    // 디렉토리가 이미 존재할 수 있음
  }

  // 출력 파일 작성
  console.log();
  printInfo(`쓰는 중: ${outputPath}`);
  try {
    await writeFile(outputPath, JSON.stringify(prdJson, null, 2), 'utf-8');
  } catch (err) {
    printError(`출력 파일 쓰기 실패: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  // 요약
  console.log();
  printSuccess('변환 완료!');
  console.log();
  console.log('요약:');
  console.log(`  PRD: ${parsed.name}`);
  console.log(`  스토리: ${parsed.userStories.length}개`);
  console.log(`  브랜치: ${branchName}`);
  console.log(`  출력: ${outputPath}`);
  console.log();
  printInfo(`실행: ralph-tui run --prd ${outputPath}`);
}

/**
 * Beads 형식 변환 실행.
 */
async function executeBeadsConversion(
  parsed: import('../prd/parser.js').ParsedPrd,
  cliLabels: string[],
  verbose: boolean,
  prdPath?: string
): Promise<void> {
  // beads 사용 가능 여부 확인
  const { exitCode, stderr } = await execBd(['--version']);
  if (exitCode !== 0) {
    printError(`bd 명령어를 사용할 수 없음: ${stderr}`);
    printInfo('beads가 설치되어 있고 bd 명령어가 PATH에 있는지 확인하세요');
    process.exit(1);
  }

  // 라벨 결정: CLI가 우선, 그 다음 config, 없으면 라벨 없음
  let labels = cliLabels;
  if (labels.length === 0) {
    // CLI로 제공되지 않은 경우 config에서 라벨 로드
    const storedConfig = await loadStoredConfig();
    const configLabels = storedConfig.trackerOptions?.labels;
    if (typeof configLabels === 'string') {
      labels = configLabels.split(',').map((l) => l.trim()).filter(Boolean);
    } else if (Array.isArray(configLabels)) {
      labels = configLabels
        .filter((l): l is string => typeof l === 'string')
        .map((l) => l.trim())
        .filter(Boolean);
    }
  }

  // 변환 수행
  console.log();
  const result = await convertToBeads(parsed, labels, verbose, prdPath);

  if (!result.success) {
    printError(result.error || '변환 실패');
    process.exit(1);
  }

  // 요약
  console.log();
  printSuccess('변환 완료!');
  console.log();
  console.log('요약:');
  console.log(`  PRD: ${parsed.name}`);
  console.log(`  에픽: ${result.epicId}`);
  console.log(`  스토리: ${result.storyIds.length}개`);
  console.log();
  console.log('생성된 bead ID:');
  console.log(`  에픽: ${result.epicId}`);
  for (const storyId of result.storyIds) {
    console.log(`  작업: ${storyId}`);
  }
  console.log();
  printInfo(`실행: ralph-tui run --epic ${result.epicId}`);
}
