/**
 * ABOUTME: Ralph TUI용 푸터 컴포넌트.
 * 사용자 참조용 키보드 단축키를 표시합니다.
 */

import type { ReactNode } from 'react';
import { colors, keyboardShortcuts, layout } from '../theme.js';

/**
 * 키보드 단축키를 보여주는 푸터 컴포넌트
 */
export function Footer(): ReactNode {
  // 키보드 단축키를 단일 문자열로 포맷
  const shortcutText = keyboardShortcuts
    .map(({ key, description }) => `${key}:${description}`)
    .join('  ');

  return (
    <box
      style={{
        width: '100%',
        height: layout.footer.height,
        flexDirection: 'row',
        justifyContent: 'flex-start',
        alignItems: 'center',
        backgroundColor: colors.bg.secondary,
        paddingLeft: 1,
        paddingRight: 1,
        border: true,
        borderColor: colors.border.normal,
      }}
    >
      {/* 키보드 단축키 */}
      <box style={{ flexShrink: 1, overflow: 'hidden' }}>
        <text fg={colors.fg.muted}>{shortcutText}</text>
      </box>
    </box>
  );
}
