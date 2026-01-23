/**
 * ABOUTME: TUI 네이티브 포맷된 텍스트 렌더링 컴포넌트.
 * ANSI 이스케이프 코드 대신 OpenTUI의 네이티브 색상 지원을 사용하여
 * FormattedSegment 배열을 적절한 테마 색상으로 렌더링합니다.
 */

import type { ReactNode } from 'react';
import { colors } from '../theme.js';
import type { FormattedSegment, SegmentColor } from '../../plugins/agents/output-formatting.js';

// 편의를 위해 타입 재내보내기
export type { FormattedSegment, SegmentColor };

/**
 * 의미적 색상 이름을 TUI 테마 16진수 색상에 매핑.
 */
const COLOR_MAP: Record<SegmentColor, string> = {
  blue: colors.accent.primary,      // #7aa2f7 - 도구 이름
  purple: colors.accent.secondary,  // #bb9af7 - 파일 경로
  cyan: colors.accent.tertiary,     // #7dcfff - 패턴/URL
  green: colors.status.success,     // #9ece6a - 성공
  yellow: colors.status.warning,    // #e0af68 - 쿼리/경고
  pink: colors.status.error,        // #f7768e - 오류
  muted: colors.fg.muted,           // #565f89 - 부가 정보
  default: colors.fg.primary,       // #c0caf5 - 일반 텍스트
};

/**
 * FormattedText 컴포넌트 Props.
 */
export interface FormattedTextProps {
  /** 렌더링할 포맷된 세그먼트 배열 */
  segments: FormattedSegment[];
}

/**
 * TUI 네이티브 색상으로 포맷된 세그먼트 배열을 렌더링합니다.
 * 인라인 색상 지정을 위해 단일 <text>와 <span> 요소를 사용합니다.
 * 참고: OpenTUI가 투명 span 배경을 제대로 지원하지 않아서
 * "transparent" 대신 패널 배경색(bg.secondary)을 사용합니다.
 */
export function FormattedText({ segments }: FormattedTextProps): ReactNode {
  if (segments.length === 0) {
    return null;
  }

  // 검은색 배경 아티팩트를 피하기 위해 패널 배경 사용
  const panelBg = colors.bg.secondary;

  return (
    <text fg={COLOR_MAP.default}>
      {segments.map((segment, index) => {
        const color = segment.color;
        if (!color || color === 'default') {
          return segment.text;
        }

        return (
          <span key={index} fg={COLOR_MAP[color]} bg={panelBg}>
            {segment.text}
          </span>
        );
      })}
    </text>
  );
}
