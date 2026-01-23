/**
 * ABOUTME: Ralph TUI용 PRD 채팅 애플리케이션 컴포넌트.
 * AI 에이전트를 사용하여 PRD를 생성하는 대화형 채팅 인터페이스를 제공합니다.
 * PRD 생성 후 PRD 미리보기와 트래커 옵션이 있는 분할 뷰를 표시합니다.
 */

import type { ReactNode } from 'react';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useKeyboard, useRenderer } from '@opentui/react';
import type { KeyEvent } from '@opentui/core';
import { platform } from 'node:os';
import { writeToClipboard } from '../../utils/index.js';
import { writeFile, mkdir, access } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ChatView } from './ChatView.js';
import { ConfirmationDialog } from './ConfirmationDialog.js';
import { ChatEngine, createPrdChatEngine, createTaskChatEngine, slugify } from '../../chat/engine.js';
import type { ChatMessage, ChatEvent } from '../../chat/types.js';
import type { AgentPlugin } from '../../plugins/agents/types.js';
import { stripAnsiCodes, type FormattedSegment } from '../../plugins/agents/output-formatting.js';
import { parsePrdMarkdown } from '../../prd/parser.js';
import { colors } from '../theme.js';

/**
 * PrdChatApp 컴포넌트 Props
 */
/**
 * 트래커 선택을 포함한 PRD 생성 결과
 */
export interface PrdCreationResult {
  /** 생성된 PRD 마크다운 파일 경로 */
  prdPath: string;
  /** 기능 이름 */
  featureName: string;
  /** 선택된 트래커 형식 (있는 경우) */
  selectedTracker?: 'json' | 'beads' | null;
}

export interface PrdChatAppProps {
  /** 응답 생성에 사용할 에이전트 플러그인 */
  agent: AgentPlugin;

  /** 출력 작업 디렉토리 */
  cwd?: string;

  /** PRD 파일 출력 디렉토리 (기본값: ./tasks) */
  outputDir?: string;

  /** 에이전트 호출 타임아웃 (밀리초) */
  timeout?: number;

  prdSkill?: string;

  prdSkillSource?: string;

  /** PRD가 성공적으로 생성되었을 때 콜백 */
  onComplete: (result: PrdCreationResult) => void;

  /** 사용자가 취소할 때 콜백 */
  onCancel: () => void;

  /** 오류 발생 시 콜백 */
  onError?: (error: string) => void;
}

/**
 * 어시스턴트의 초기 환영 메시지
 */
const WELCOME_MESSAGE: ChatMessage = {
  role: 'assistant',
  content: `제품 요구사항 문서(PRD)를 작성하는 것을 도와드리겠습니다.

어떤 기능을 만들고 싶으신가요? 몇 문장으로 설명해 주시면, 요구사항을 파악하기 위해 몇 가지 질문을 드리겠습니다.`,
  timestamp: new Date(),
};

/**
 * 작업 생성을 위한 트래커 옵션
 */
interface TrackerOption {
  key: string;
  name: string;
  skillPrompt: string;
  available: boolean;
}

/**
 * 프로젝트 설정에 따라 사용 가능한 트래커 옵션 가져오기
 */
function getTrackerOptions(cwd: string): TrackerOption[] {
  const beadsDir = join(cwd, '.beads');
  const hasBeads = existsSync(beadsDir);

  const jsonSchemaExample = `{
  "name": "Feature Name",
  "branchName": "feature/my-feature",
  "userStories": [
    {
      "id": "US-001",
      "title": "Story title",
      "description": "As a user, I want...",
      "acceptanceCriteria": ["Criterion 1"],
      "priority": 1,
      "passes": false,
      "dependsOn": []
    }
  ]
}`;

  const wrongSchemaExample = `{
  "prd": { ... },           // WRONG - no wrapper object!
  "tasks": [ ... ],         // WRONG - use "userStories" not "tasks"
  "metadata": { ... },      // WRONG - top-level metadata not supported
  "overview": { ... },      // WRONG - not part of schema
  "migration_strategy": {}, // WRONG - not part of schema
  "phases": [ ... ]         // WRONG - use flat userStories array
}`;

  return [
    {
      key: '1',
      name: 'JSON (prd.json)',
      skillPrompt: `Convert this PRD to prd.json format using the ralph-tui-create-json skill.

## CRITICAL SCHEMA REQUIREMENTS

The output JSON file MUST be a FLAT object at the root level with this EXACT structure:

${jsonSchemaExample}

## FORBIDDEN PATTERNS - DO NOT USE THESE

The following patterns will cause validation errors and MUST NOT be used:

${wrongSchemaExample}

## FIELD REQUIREMENTS

Required root-level fields:
- "name": string (project/feature name)
- "userStories": array of story objects

Required fields for EACH userStory:
- "id": string (e.g., "US-001", "US-002")
- "title": string (short descriptive title)
- "passes": boolean (MUST be false for new tasks)
- "dependsOn": array of story IDs (can be empty array [])

Optional fields for userStory:
- "description": string
- "acceptanceCriteria": array of strings
- "priority": number (1 = highest)
- "labels": array of strings
- "notes": string

## VALIDATION RULES

1. NO wrapper objects - "name" and "userStories" must be at ROOT level
2. NO "prd" field - this is a common AI hallucination, DO NOT USE IT
3. NO "tasks" field - the array is called "userStories"
4. NO "status" field - use "passes": boolean instead
5. NO "subtasks" - not supported by the tracker
6. NO "estimated_hours" or time estimates - not supported
7. NO nested structures like "phases" or "migration_strategy"

## OUTPUT

Save the file to: tasks/prd.json

Transform any complex PRD structure (phases, milestones, etc.) into a FLAT list of userStories.`,
      available: true,
    },
    {
      key: '2',
      name: 'Beads issues',
      skillPrompt: 'Convert this PRD to beads using the ralph-tui-create-beads skill.',
      available: hasBeads,
    },
  ];
}

/**
 * 오른쪽 패널용 PRD 미리보기 컴포넌트
 */
function PrdPreview({ content, path }: { content: string; path: string }): ReactNode {
  return (
    <box
      style={{
        width: '100%',
        height: '100%',
        flexDirection: 'column',
        backgroundColor: colors.bg.secondary,
        border: true,
        borderColor: colors.border.normal,
      }}
    >
      {/* 헤더 */}
      <box
        style={{
          height: 3,
          paddingLeft: 1,
          paddingRight: 1,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: colors.bg.tertiary,
        }}
      >
        <text fg={colors.accent.primary}>PRD 미리보기</text>
        <text fg={colors.fg.muted}>{path.split('/').pop()}</text>
      </box>

      {/* 콘텐츠 - 스크롤 가능, 전체 PRD 표시 */}
      <scrollbox style={{ flexGrow: 1, padding: 1 }} stickyScroll={false}>
        <text fg={colors.fg.primary}>{content}</text>
      </scrollbox>
    </box>
  );
}

/**
 * PrdChatApp 컴포넌트 - PRD 채팅 생성을 위한 메인 애플리케이션
 */
export function PrdChatApp({
  agent,
  cwd = process.cwd(),
  outputDir = 'tasks',
  timeout = 0,
  prdSkill,
  prdSkillSource,
  onComplete,
  onCancel,
  onError,
}: PrdChatAppProps): ReactNode {
  const renderer = useRenderer();
  // 복사 피드백 메시지 상태 (2초 후 자동 해제)
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  // 단계: PRD 생성은 'chat', 트래커 선택은 'review'
  const [phase, setPhase] = useState<'chat' | 'review'>('chat');

  // PRD 데이터 (PRD가 감지되면 설정)
  const [prdContent, setPrdContent] = useState<string | null>(null);
  const [prdPath, setPrdPath] = useState<string | null>(null);
  const [featureName, setFeatureName] = useState<string | null>(null);

  // 채팅 상태
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [streamingChunk, setStreamingChunk] = useState('');
  const [streamingSegments, setStreamingSegments] = useState<FormattedSegment[]>([]);
  const [error, setError] = useState<string | undefined>();

  // 종료 확인 다이얼로그 상태
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);

  // 작업에 선택된 트래커 형식 추적
  const [selectedTrackerFormat, setSelectedTrackerFormat] = useState<'json' | 'beads' | null>(null);

  // Refs
  const engineRef = useRef<ChatEngine | null>(null);
  const taskEngineRef = useRef<ChatEngine | null>(null);
  const isMountedRef = useRef(true);

  // 트래커 옵션 가져오기
  const trackerOptions = getTrackerOptions(cwd);

  // 채팅 엔진 초기화
  useEffect(() => {
    isMountedRef.current = true;
    const engine = createPrdChatEngine(agent, {
      cwd,
      timeout,
      prdSkill,
      prdSkillSource,
    });
    const taskEngine = createTaskChatEngine(agent, { cwd, timeout });

    // 이벤트 구독
    const unsubscribe = engine.on((event: ChatEvent) => {
      switch (event.type) {
        case 'status:changed':
          break;

        case 'prd:detected':
          // PRD 감지됨 - 저장하고 검토 단계로 전환
          void handlePrdDetected(event.prdContent, event.featureName);
          break;

        case 'error:occurred':
          if (isMountedRef.current) {
            setError(event.error);
          }
          onError?.(event.error);
          break;
      }
    });

    engineRef.current = engine;
    taskEngineRef.current = taskEngine;

    return () => {
      isMountedRef.current = false;
      unsubscribe();
    };
  }, [agent, cwd, timeout, prdSkill, prdSkillSource, onError]);

  /**
   * PRD 감지 처리 - 파일 저장 및 검토 단계로 전환
   */
  const handlePrdDetected = async (content: string, name: string) => {
    try {
      const fullOutputDir = join(cwd, outputDir);

      // 출력 디렉토리 존재 확인
      try {
        await access(fullOutputDir);
      } catch {
        await mkdir(fullOutputDir, { recursive: true });
      }

      // 파일명 생성
      const slug = slugify(name);
      const filename = `prd-${slug}.md`;
      const filepath = join(fullOutputDir, filename);

      // 저장 전 ANSI 코드 제거 (Kiro 같은 에이전트는 색상 텍스트 출력)
      const cleanContent = stripAnsiCodes(content);

      // 파일 쓰기
      await writeFile(filepath, cleanContent, 'utf-8');

      // 검토 단계를 위한 상태 업데이트
      if (isMountedRef.current) {
        setPrdContent(cleanContent);
        setPrdPath(filepath);
        setFeatureName(name);
        setPhase('review');

        // 트래커 옵션 메시지 추가
        const availableOptions = trackerOptions.filter((t) => t.available);
        const optionsText = availableOptions
          .map((t) => `  [${t.key}] ${t.name}`)
          .join('\n');

        const reviewMessage: ChatMessage = {
          role: 'assistant',
          content: `PRD 저장됨: ${filepath}

이 PRD에서 작업을 생성할까요?

${optionsText}
  [3] 완료 - 나중에 작업 생성

숫자 키를 눌러 선택하거나 계속 대화하세요.`,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, reviewMessage]);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (isMountedRef.current) {
        setError(`PRD 저장 실패: ${errorMsg}`);
      }
      onError?.(errorMsg);
    }
  };

  /**
   * 트래커 선택 처리 - 에이전트에 스킬 프롬프트 전송
   */
  const handleTrackerSelect = useCallback(
    async (option: TrackerOption) => {
      if (!taskEngineRef.current || !prdPath || !prdContent || isLoading) return;

      const parsedPrd = parsePrdMarkdown(prdContent);
      if (parsedPrd.userStories.length === 0) {
        const errorMessage =
          'PRD에 사용자 스토리가 없습니다. "### US-001: 제목" 형식의 섹션과 인수 기준 체크리스트를 추가하세요.';
        setError(errorMessage);
        onError?.(errorMessage);
        return;
      }

      // 선택된 트래커 형식 기록
      const format = option.key === '1' ? 'json' : 'beads';
      setSelectedTrackerFormat(format as 'json' | 'beads');

      setIsLoading(true);
      setStreamingChunk('');
      setStreamingSegments([]);
      setLoadingStatus(`${option.name} 작업 생성 중...`);

      // 사용자 선택 메시지 추가
      const userMsg: ChatMessage = {
        role: 'user',
        content: `${option.name} 작업 생성`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMsg]);

      const prompt = `${option.skillPrompt}

The PRD file is at: ${prdPath}

Read the PRD and create the appropriate tasks.`;

      try {
        const result = await taskEngineRef.current.sendMessage(prompt, {
          onSegments: (segments) => {
            if (isMountedRef.current) {
              setStreamingSegments((prev) => [...prev, ...segments]);
            }
          },
          onStatus: (status) => {
            if (isMountedRef.current) {
              setLoadingStatus(status);
            }
          },
        });

        if (isMountedRef.current) {
          if (result.success && result.response) {
            setMessages((prev) => [...prev, result.response!]);
            setStreamingChunk('');
            setStreamingSegments([]);

            // 완료 메시지 추가 및 종료
            const doneMsg: ChatMessage = {
              role: 'assistant',
              content: '작업이 생성되었습니다! [3]을 눌러 종료하거나 다른 형식을 선택하세요.',
              timestamp: new Date(),
            };
            setMessages((prev) => [...prev, doneMsg]);
          } else if (!result.success) {
            setError(result.error || '작업 생성 실패');
          }
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        if (isMountedRef.current) {
          setError(errorMsg);
        }
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
          setLoadingStatus('');
        }
      }
    },
    [prdPath, prdContent, isLoading, onError]
  );

  /**
   * 에이전트에 채팅 메시지 전송
   */
  const sendMessage = useCallback(
    async (value?: string) => {
      const userMessage = value?.trim() ?? inputValue.trim();
      if (!userMessage || !engineRef.current || isLoading) {
        return;
      }

      setInputValue('');
      setIsLoading(true);
      setStreamingChunk('');
      setStreamingSegments([]);
      setLoadingStatus('에이전트에 전송 중...');
      setError(undefined);

    const userMsg: ChatMessage = {
      role: 'user',
      content: userMessage,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const result = await engineRef.current.sendMessage(userMessage, {
        onSegments: (segments) => {
          if (isMountedRef.current) {
            setStreamingSegments((prev) => [...prev, ...segments]);
          }
        },
        onStatus: (status) => {
          if (isMountedRef.current) {
            setLoadingStatus(status);
          }
        },
      });

      if (isMountedRef.current) {
        if (result.success && result.response) {
          setMessages((prev) => [...prev, result.response!]);
          setStreamingChunk('');
          setStreamingSegments([]);
        } else if (!result.success) {
          setError(result.error || '응답을 가져오지 못했습니다');
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (isMountedRef.current) {
        setError(errorMsg);
      }
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
          setLoadingStatus('');
        }
      }
    },
    [inputValue, isLoading]
  );

  /**
   * 키보드 입력 처리 (Escape 및 검토 단계 단축키와 같은 비입력 키만)
   * 텍스트 편집은 기본 OpenTUI 입력 컴포넌트에서 처리
   */
  const handleKeyboard = useCallback(
    (key: KeyEvent) => {
      // 클립보드 복사 처리:
      // - macOS: Cmd+C (meta 키)
      // - Linux: Ctrl+Shift+C 또는 Alt+C
      // - Windows: Ctrl+C
      // 참고: 다이얼로그가 열려 있어도 복사가 작동하도록 먼저 검사
      const isMac = platform() === 'darwin';
      const isWindows = platform() === 'win32';
      const selection = renderer.getSelection();
      const isCopyShortcut = isMac
        ? key.meta && key.name === 'c'
        : isWindows
          ? key.ctrl && key.name === 'c'
          : (key.ctrl && key.shift && key.name === 'c') || (key.option && key.name === 'c');

      if (isCopyShortcut && selection) {
        const selectedText = selection.getSelectedText();
        if (selectedText && selectedText.length > 0) {
          writeToClipboard(selectedText).then((result) => {
            if (result.success) {
              setCopyFeedback(`${result.charCount}자 복사됨`);
            }
          });
        }
        return;
      }

      // 종료 확인 다이얼로그 처리
      if (showQuitConfirm) {
        if (key.name === 'y' || key.sequence === 'y' || key.sequence === 'Y') {
          setShowQuitConfirm(false);
          onCancel();
        } else if (key.name === 'n' || key.name === 'escape' || key.sequence === 'n' || key.sequence === 'N') {
          setShowQuitConfirm(false);
        }
        return;
      }

      // 로딩 중에는 키 처리 안 함
      if (isLoading) {
        return;
      }

      // 검토 단계에서 트래커 선택용 숫자 키 처리
      if (phase === 'review' && key.sequence) {
        const keyNum = key.sequence;
        if (keyNum === '1' || keyNum === '2') {
          const option = trackerOptions.find((t) => t.key === keyNum && t.available);
          if (option) {
            void handleTrackerSelect(option);
            return;
          }
        }
        if (keyNum === '3') {
          // 완료 - 완료하고 종료
          if (prdPath && featureName) {
            onComplete({ prdPath, featureName, selectedTracker: selectedTrackerFormat });
          }
          return;
        }
      }

      // Escape 키 처리
      if (key.name === 'escape') {
        if (phase === 'review' && prdPath && featureName) {
          // 검토 단계에서 Escape는 완료 (PRD 이미 저장됨)
          onComplete({ prdPath, featureName, selectedTracker: selectedTrackerFormat });
        } else {
          // 채팅 단계에서 확인 다이얼로그 표시
          setShowQuitConfirm(true);
        }
      }
    },
    [showQuitConfirm, isLoading, phase, trackerOptions, handleTrackerSelect, prdPath, featureName, selectedTrackerFormat, onComplete, onCancel, renderer]
  );

  useKeyboard(handleKeyboard);

  // 2초 후 복사 피드백 자동 해제
  useEffect(() => {
    if (!copyFeedback) return;
    const timer = setTimeout(() => {
      setCopyFeedback(null);
    }, 2000);
    return () => clearTimeout(timer);
  }, [copyFeedback]);

  // 단계에 따라 힌트 텍스트 결정
  const hint =
    phase === 'review'
      ? '[1] JSON  [2] Beads  [3] 완료  [Enter] 채팅  [Esc] 종료'
      : '[Enter] 전송  [Shift+Enter/Ctrl+J] 줄바꿈  [Esc] 취소';

  // 검토 단계에서 분할 창 표시
  if (phase === 'review' && prdContent && prdPath) {
    return (
      <box
        style={{
          width: '100%',
          height: '100%',
          flexDirection: 'row',
        }}
      >
        {/* 왼쪽 창: 채팅 */}
        <box style={{ width: '60%', height: '100%' }}>
          <ChatView
            title="PRD 생성기"
            subtitle="작업 생성"
            messages={messages}
            inputValue={inputValue}
            isLoading={isLoading}
            loadingStatus={loadingStatus}
            streamingChunk={streamingChunk}
            streamingSegments={streamingSegments}
            inputPlaceholder="질문하거나 형식을 선택하세요..."
            error={error}
            inputEnabled={!isLoading}
            hint={hint}
            agentName={agent.meta.name}
            onSubmit={sendMessage}
          />
        </box>

        {/* 오른쪽 창: PRD 미리보기 */}
        <box style={{ width: '40%', height: '100%' }}>
          <PrdPreview content={prdContent} path={prdPath} />
        </box>

        {/* 복사 피드백 토스트 - 오른쪽 하단 위치 */}
        {copyFeedback && (
          <box
            style={{
              position: 'absolute',
              bottom: 2,
              right: 2,
              paddingLeft: 1,
              paddingRight: 1,
              backgroundColor: colors.bg.tertiary,
              border: true,
              borderColor: colors.status.success,
            }}
          >
            <text fg={colors.status.success}>✓ {copyFeedback}</text>
          </box>
        )}
      </box>
    );
  }

  // 채팅 단계: 종료 확인 다이얼로그가 있는 단일 창
  return (
    <box style={{ width: '100%', height: '100%', position: 'relative' }}>
      <ChatView
        title="PRD 생성기"
        subtitle={`${agent.meta.name} 사용 중`}
        messages={messages}
        inputValue={inputValue}
        isLoading={isLoading}
        loadingStatus={loadingStatus}
        streamingChunk={streamingChunk}
        streamingSegments={streamingSegments}
        inputPlaceholder="기능을 설명하세요..."
        error={error}
        inputEnabled={!isLoading && !showQuitConfirm}
        hint={hint}
        agentName={agent.meta.name}
        onSubmit={sendMessage}
      />
      <ConfirmationDialog
        visible={showQuitConfirm}
        title="PRD 생성을 취소하시겠습니까?"
        message="진행 상황이 사라집니다."
        hint="[y] 예, 취소  [n/Esc] 아니오, 계속"
      />

      {/* 복사 피드백 토스트 - 오른쪽 하단 위치 */}
      {copyFeedback && (
        <box
          style={{
            position: 'absolute',
            bottom: 2,
            right: 2,
            paddingLeft: 1,
            paddingRight: 1,
            backgroundColor: colors.bg.tertiary,
            border: true,
            borderColor: colors.status.success,
          }}
        >
          <text fg={colors.status.success}>✓ {copyFeedback}</text>
        </box>
      )}
    </box>
  );
}
