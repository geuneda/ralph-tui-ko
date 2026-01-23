/**
 * ABOUTME: 인터럽트 처리를 위한 확인 다이얼로그 컴포넌트.
 * 사용자에게 작업을 확인하거나 취소할 것을 묻는 모달 다이얼로그를 표시합니다.
 */

import type { ReactNode } from 'react';
import { colors } from '../theme.js';

/**
 * ConfirmationDialog 컴포넌트 Props
 */
export interface ConfirmationDialogProps {
  /** 다이얼로그 표시 여부 */
  visible: boolean;

  /** 다이얼로그 제목 */
  title: string;

  /** 다이얼로그 메시지 */
  message: string;

  /** 사용 가능한 키를 보여주는 힌트 텍스트 */
  hint?: string;
}

/**
 * TUI 위에 오버레이되는 모달 확인 다이얼로그.
 * 사용자는 키보드 (y/n/Esc)로 응답 - 처리는 부모 컴포넌트에서 수행.
 */
export function ConfirmationDialog({
  visible,
  title,
  message,
  hint = '[y] 예  [n/Esc] 아니오',
}: ConfirmationDialogProps): ReactNode {
  if (!visible) {
    return null;
  }

  // 다이얼로그를 중앙에 배치하기 위해 전체 화면 오버레이로 감싸기
  return (
    <box
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <box
        style={{
          width: 50,
          height: 9,
          backgroundColor: colors.bg.secondary,
          border: true,
          borderColor: colors.status.warning,
          flexDirection: 'column',
          padding: 1,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
      {/* 제목 */}
      <text fg={colors.status.warning}>
        {title}
      </text>

      {/* 간격 */}
      <box style={{ height: 1 }} />

      {/* 메시지 */}
      <text fg={colors.fg.primary}>
        {message}
      </text>

      {/* 간격 */}
      <box style={{ height: 1 }} />

      {/* 힌트 */}
      <text fg={colors.fg.muted}>
        {hint}
      </text>
      </box>
    </box>
  );
}
