/**
 * ABOUTME: 임시 피드백 메시지를 위한 토스트 알림 컴포넌트.
 * 화면 하단에 자동 사라지는 알림을 표시합니다.
 * US-5: 연결 복원 피드백에 사용 (재연결 중, 재연결됨, 실패).
 */

import type { ReactNode } from 'react';
import { colors } from '../theme.js';

/**
 * 스타일링을 결정하는 토스트 변형 타입.
 */
export type ToastVariant = 'success' | 'warning' | 'error' | 'info';

/**
 * Toast 컴포넌트 Props
 */
export interface ToastProps {
  /** 토스트 표시 여부 */
  visible: boolean;

  /** 표시할 메시지 */
  message: string;

  /** 메시지 앞에 표시할 선택적 아이콘 */
  icon?: string;

  /** 스타일링을 위한 토스트 변형 (기본값: 'info') */
  variant?: ToastVariant;

  /** 오른쪽 가장자리로부터의 위치 (기본값: 2) */
  right?: number;

  /** 아래쪽 가장자리로부터의 위치 (기본값: 2) */
  bottom?: number;
}

/**
 * 토스트 변형에 대한 테두리 및 텍스트 색상 가져오기.
 */
function getVariantColors(variant: ToastVariant): { border: string; text: string } {
  switch (variant) {
    case 'success':
      return { border: colors.status.success, text: colors.status.success };
    case 'warning':
      return { border: colors.status.warning, text: colors.status.warning };
    case 'error':
      return { border: colors.status.error, text: colors.status.error };
    case 'info':
      return { border: colors.status.info, text: colors.status.info };
  }
}

/**
 * 토스트 변형의 기본 아이콘.
 */
const DEFAULT_ICONS: Record<ToastVariant, string> = {
  success: '✓',
  warning: '⚠',
  error: '✗',
  info: 'ℹ',
};

/**
 * 임시 알림을 표시하는 토스트 컴포넌트.
 * 화면 우측 하단에 절대 위치로 배치됩니다.
 */
export function Toast({
  visible,
  message,
  icon,
  variant = 'info',
  right = 2,
  bottom = 2,
}: ToastProps): ReactNode {
  if (!visible) {
    return null;
  }

  const variantColors = getVariantColors(variant);
  const displayIcon = icon ?? DEFAULT_ICONS[variant];

  return (
    <box
      style={{
        position: 'absolute',
        bottom,
        right,
        paddingLeft: 1,
        paddingRight: 1,
        backgroundColor: colors.bg.tertiary,
        border: true,
        borderColor: variantColors.border,
      }}
    >
      <text fg={variantColors.text}>
        {displayIcon} {message}
      </text>
    </box>
  );
}

/**
 * 연결 관련 토스트 메시지 타입 (InstanceManager에서 사용).
 */
export type ConnectionToastMessage =
  | { type: 'reconnecting'; alias: string; attempt: number; maxRetries: number }
  | { type: 'reconnected'; alias: string; totalAttempts: number }
  | { type: 'reconnect_failed'; alias: string; attempts: number; error: string }
  | { type: 'connection_error'; alias: string; error: string };

/**
 * 연결 토스트 메시지를 표시용으로 포맷.
 */
export function formatConnectionToast(toast: ConnectionToastMessage): {
  message: string;
  variant: ToastVariant;
  icon: string;
} {
  switch (toast.type) {
    case 'reconnecting':
      return {
        message: `${toast.alias}: 재연결 중 (${toast.attempt}/${toast.maxRetries})...`,
        variant: 'warning',
        icon: '⟳',
      };
    case 'reconnected':
      return {
        message: `${toast.alias}: ${toast.totalAttempts}번 시도 후 재연결됨`,
        variant: 'success',
        icon: '●',
      };
    case 'reconnect_failed':
      return {
        message: `${toast.alias}: ${toast.attempts}번 시도 후 연결 실패`,
        variant: 'error',
        icon: '○',
      };
    case 'connection_error':
      return {
        message: `${toast.alias}: ${toast.error}`,
        variant: 'error',
        icon: '✗',
      };
  }
}
