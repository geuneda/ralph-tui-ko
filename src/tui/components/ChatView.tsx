/**
 * ABOUTME: Ralph TUI용 재사용 가능한 채팅 인터페이스 컴포넌트.
 * 스트리밍 출력, 사용자 입력, 메시지 이력을 지원하는 AI 에이전트와의
 * 대화를 표시합니다. 주로 PRD 생성에 사용됩니다.
 */

import type { ReactNode } from 'react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useKeyboard } from '@opentui/react';
import type { TextareaRenderable, KeyEvent } from '@opentui/core';
import { colors } from '../theme.js';
import type { ChatMessage } from '../../chat/types.js';
import { FormattedText } from './FormattedText.js';
import type { FormattedSegment } from '../../plugins/agents/output-formatting.js';

/**
 * 애니메이션용 스피너 프레임
 */
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * 로딩 상태용 애니메이션 스피너 컴포넌트
 */
function AnimatedSpinner(): ReactNode {
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % SPINNER_FRAMES.length);
    }, 80);

    return () => clearInterval(interval);
  }, []);

  return <text fg={colors.status.info}>{SPINNER_FRAMES[frameIndex]}</text>;
}

/**
 * ChatView 컴포넌트 Props
 */
export interface ChatViewProps {
  /** 헤더에 표시할 제목 */
  title: string;

  /** 제목 옆에 표시되는 부제목 */
  subtitle?: string;

  /** 표시할 대화 메시지 */
  messages: ChatMessage[];

  /** 현재 사용자 입력 값 */
  inputValue: string;

  /** 어시스턴트가 현재 응답을 생성 중인지 여부 */
  isLoading: boolean;

  /** 로딩 중 표시할 상태 텍스트 */
  loadingStatus?: string;

  /** 스트리밍 출력 청크 (생성 중 표시됨) - 레거시 문자열 형식 */
  streamingChunk?: string;

  /** TUI 네이티브 색상 렌더링용 스트리밍 출력 세그먼트 */
  streamingSegments?: FormattedSegment[];

  /** 입력 필드의 플레이스홀더 텍스트 */
  inputPlaceholder?: string;

  /** 표시할 오류 메시지 */
  error?: string;

  /** 입력 활성화 여부 */
  inputEnabled?: boolean;

  /** 입력의 커서 위치 (0 = 시작, inputValue.length = 끝) */
  cursorPosition?: number;

  /** 푸터의 힌트 텍스트 */
  hint?: string;

  /** 에이전트 이름 (로딩 메시지용) */
  agentName?: string;

  /** 사용자가 제출할 때 (Enter 누를 때) 현재 입력 값과 함께 호출되는 콜백 */
  onSubmit?: (value: string) => void;
}

/**
 * 표시용 타임스탬프 포맷
 */
function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}


/**
 * 단일 채팅 메시지를 표시하는 MessageBubble 컴포넌트
 */
function MessageBubble({ message }: { message: ChatMessage }): ReactNode {
  const isUser = message.role === 'user';
  const roleLabel = isUser ? '사용자' : '어시스턴트';
  const roleColor = isUser ? colors.accent.primary : colors.accent.secondary;

  return (
    <box
      style={{
        width: '100%',
        flexDirection: 'column',
        marginBottom: 1,
      }}
    >
      {/* 역할과 타임스탬프 헤더 */}
      <box style={{ flexDirection: 'row', gap: 1 }}>
        <text fg={roleColor}>{roleLabel}</text>
        <text fg={colors.fg.dim}>{formatTime(message.timestamp)}</text>
      </box>

      {/* 메시지 내용 */}
      <box style={{ paddingLeft: 2, paddingTop: 0 }}>
        <text fg={colors.fg.primary}>
          {message.content}
        </text>
      </box>
    </box>
  );
}

/**
 * ChatView 컴포넌트 - 입력이 있는 채팅 대화를 표시
 */
export function ChatView({
  title,
  subtitle,
  messages,
  inputValue,
  isLoading,
  loadingStatus = '생각 중...',
  streamingChunk,
  streamingSegments,
  inputPlaceholder = '메시지를 입력하세요...',
  error,
  inputEnabled = true,
  cursorPosition: _cursorPosition, // 네이티브 입력에서는 사용되지 않음
  hint = '[Enter] 전송  [Shift+Enter] 줄바꿈  [Esc] 취소',
  agentName,
  onSubmit,
}: ChatViewProps): ReactNode {
  // 동적 로딩 텍스트 생성
  const loadingText = agentName
    ? `${agentName} 응답 대기 중...`
    : loadingStatus;

  // 제출 처리 및 값 접근을 위한 Textarea ref
  const textareaRef = useRef<TextareaRenderable>(null);

  // 외부에서 inputValue가 변경될 때 (예: 클리어 후) textarea 내용 동기화
  useEffect(() => {
    if (textareaRef.current && inputValue !== textareaRef.current.plainText) {
      textareaRef.current.editBuffer.setText(inputValue);
    }
  }, [inputValue]);

  // 제출 처리 - textarea ref에서 값을 가져와 직접 전달한 후 클리어
  const handleSubmit = useCallback(() => {
    const currentValue = textareaRef.current?.plainText ?? '';
    // onSubmit 호출 전 textarea를 즉시 클리어
    // 지연이 있어도 입력이 클리어되도록 보장
    if (textareaRef.current) {
      textareaRef.current.editBuffer.setText('');
    }
    onSubmit?.(currentValue);
  }, [onSubmit]);

  // 텍스트 편집 단축키용 키보드 처리 (macOS 스타일)
  const handleKeyboard = useCallback(
    (key: KeyEvent) => {
      // textarea가 포커스되고 입력이 활성화된 경우에만 처리
      if (!textareaRef.current || !inputEnabled || isLoading) {
        return;
      }

      const textarea = textareaRef.current;

      // Enter = 제출 (수정자 없이)
      if (key.name === 'return' && !key.meta && !key.ctrl && !key.shift) {
        key.preventDefault?.();
        handleSubmit();
        return;
      }

      // Shift+Enter 또는 Ctrl+J = 줄바꿈 삽입
      if ((key.shift && key.name === 'return') || (key.ctrl && key.name === 'j')) {
        key.preventDefault?.();
        textarea.newLine();
        return;
      }

      // === Option + 화살표 키 (단어 탐색) ===
      if (key.option && !key.shift && !key.meta && !key.ctrl) {
        if (key.name === 'left') {
          key.preventDefault?.();
          textarea.moveWordBackward();
          return;
        }
        if (key.name === 'right') {
          key.preventDefault?.();
          textarea.moveWordForward();
          return;
        }
        if (key.name === 'up') {
          key.preventDefault?.();
          textarea.gotoBufferHome();
          return;
        }
        if (key.name === 'down') {
          key.preventDefault?.();
          textarea.gotoBufferEnd();
          return;
        }
      }

      // === Option + Delete (단어 삭제) ===
      if (key.option && key.name === 'backspace') {
        key.preventDefault?.();
        textarea.deleteWordBackward();
        return;
      }
      // Option + Fn + Delete (일부 키보드에서 전방 삭제)
      if (key.option && key.name === 'delete') {
        key.preventDefault?.();
        textarea.deleteWordForward();
        return;
      }

      // === Shift + Option + 화살표 키 (단어/문단 단위 선택) ===
      if (key.shift && key.option && !key.meta && !key.ctrl) {
        if (key.name === 'left') {
          key.preventDefault?.();
          textarea.moveWordBackward({ select: true });
          return;
        }
        if (key.name === 'right') {
          key.preventDefault?.();
          textarea.moveWordForward({ select: true });
          return;
        }
        if (key.name === 'up') {
          key.preventDefault?.();
          textarea.gotoBufferHome({ select: true });
          return;
        }
        if (key.name === 'down') {
          key.preventDefault?.();
          textarea.gotoBufferEnd({ select: true });
          return;
        }
      }

      // === Shift + 화살표 키 (문자/줄 단위 선택) ===
      if (key.shift && !key.meta && !key.option && !key.ctrl) {
        if (key.name === 'left') {
          key.preventDefault?.();
          textarea.moveCursorLeft({ select: true });
          return;
        }
        if (key.name === 'right') {
          key.preventDefault?.();
          textarea.moveCursorRight({ select: true });
          return;
        }
        if (key.name === 'up') {
          key.preventDefault?.();
          textarea.moveCursorUp({ select: true });
          return;
        }
        if (key.name === 'down') {
          key.preventDefault?.();
          textarea.moveCursorDown({ select: true });
          return;
        }
      }

      // === Shift + Cmd + 화살표 키 (줄 시작/끝까지 선택) ===
      if (key.shift && key.meta && !key.option && !key.ctrl) {
        if (key.name === 'left') {
          key.preventDefault?.();
          textarea.gotoLineHome({ select: true });
          return;
        }
        if (key.name === 'right') {
          key.preventDefault?.();
          textarea.gotoLineEnd({ select: true });
          return;
        }
        if (key.name === 'up') {
          key.preventDefault?.();
          textarea.gotoBufferHome({ select: true });
          return;
        }
        if (key.name === 'down') {
          key.preventDefault?.();
          textarea.gotoBufferEnd({ select: true });
          return;
        }
      }
    },
    [inputEnabled, isLoading, handleSubmit]
  );

  useKeyboard(handleKeyboard);

  return (
    <box
      style={{
        width: '100%',
        height: '100%',
        flexDirection: 'column',
        backgroundColor: colors.bg.primary,
      }}
    >
      {/* 헤더 */}
      <box
        style={{
          width: '100%',
          height: 3,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: colors.bg.secondary,
          paddingLeft: 1,
          paddingRight: 1,
          border: true,
          borderColor: colors.border.normal,
        }}
      >
        <box style={{ flexDirection: 'row', gap: 2 }}>
          <text fg={colors.accent.primary}>{title}</text>
          {subtitle && <text fg={colors.fg.muted}>{subtitle}</text>}
        </box>
        <text fg={colors.fg.muted}>
          {messages.length}개 메시지
        </text>
      </box>

      {/* 메시지 영역 */}
      <box
        style={{
          flexGrow: 1,
          flexDirection: 'column',
          paddingLeft: 1,
          paddingRight: 1,
          paddingTop: 1,
        }}
      >
        <scrollbox style={{ flexGrow: 1 }} stickyScroll={true} stickyStart="bottom">
          {/* 메시지가 없을 때 환영 메시지 */}
          {messages.length === 0 && !isLoading && (
            <box style={{ marginBottom: 1 }}>
              <text fg={colors.fg.secondary}>
                아래에 메시지를 입력하여 대화를 시작하세요.
              </text>
            </box>
          )}

          {/* 메시지 이력 */}
          {messages.map((msg, index) => (
            <MessageBubble key={index} message={msg} />
          ))}

          {/* 생성 중 스트리밍 출력 - TUI 네이티브 색상을 위해 세그먼트 선호 */}
          {isLoading && (streamingSegments?.length || streamingChunk) && (
            <box style={{ flexDirection: 'column', marginBottom: 1 }}>
              <box style={{ flexDirection: 'row', gap: 1 }}>
                <text fg={colors.accent.secondary}>어시스턴트</text>
                <AnimatedSpinner />
              </box>
              <box style={{ paddingLeft: 2, flexDirection: 'row', flexWrap: 'wrap' }}>
                {streamingSegments?.length ? (
                  <FormattedText segments={streamingSegments} />
                ) : (
                  <text fg={colors.fg.primary}>
                    {streamingChunk}
                  </text>
                )}
              </box>
            </box>
          )}

          {/* 로딩 표시기 */}
          {isLoading && !streamingChunk && !streamingSegments?.length && (
            <box style={{ flexDirection: 'row', gap: 1, marginBottom: 1 }}>
              <text fg={colors.accent.secondary}>어시스턴트</text>
              <AnimatedSpinner />
              <text fg={colors.fg.muted}>{loadingText}</text>
            </box>
          )}

          {/* 오류 메시지 */}
          {error && (
            <box
              style={{
                marginTop: 1,
                padding: 1,
                backgroundColor: colors.bg.tertiary,
                border: true,
                borderColor: colors.status.error,
              }}
            >
              <text fg={colors.status.error}>오류: {error}</text>
            </box>
          )}
        </scrollbox>
      </box>

      {/* 입력 영역 */}
      <box
        style={{
          width: '100%',
          height: 8,
          flexDirection: 'column',
          backgroundColor: colors.bg.secondary,
          border: true,
          borderColor: inputEnabled && !isLoading ? colors.border.active : colors.border.normal,
          paddingLeft: 1,
          paddingRight: 1,
        }}
      >
        {/* 단어 줄바꿈이 있는 여러 줄 입력용 Textarea */}
        <box
          style={{
            flexGrow: 1,
            flexDirection: 'row',
            alignItems: 'flex-start',
          }}
        >
          <text fg={colors.accent.primary} style={{ paddingTop: 0 }}>{'>'} </text>
          <textarea
            ref={textareaRef}
            initialValue={inputValue}
            style={{
              flexGrow: 1,
              height: 6,
              backgroundColor: 'transparent',
              textColor: colors.fg.primary,
              focusedBackgroundColor: 'transparent',
              focusedTextColor: colors.fg.primary,
              cursorColor: colors.accent.primary,
            }}
            placeholder={inputPlaceholder}
            focused={inputEnabled && !isLoading}
            onSubmit={handleSubmit}
          />
        </box>

        {/* 힌트 바 - 하단 테두리에 위치 */}
        <box
          style={{
            position: 'absolute',
            bottom: 0,
            left: 2,
            right: 2,
            height: 1,
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 1,
            backgroundColor: colors.bg.secondary,
          }}
        >
          {isLoading ? (
            <>
              <AnimatedSpinner />
              <text fg={colors.status.info}>{loadingText}</text>
            </>
          ) : (
            <text fg={colors.fg.muted}>{hint}</text>
          )}
        </box>
      </box>
    </box>
  );
}
