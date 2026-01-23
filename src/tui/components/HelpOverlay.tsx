/**
 * ABOUTME: 키보드 단축키를 보여주는 도움말 오버레이 컴포넌트.
 * 카테고리별로 그룹화된 모든 사용 가능한 키보드 단축키가 있는 모달 오버레이를 표시합니다.
 */

import type { ReactNode } from 'react';
import { colors, fullKeyboardShortcuts } from '../theme.js';

/**
 * HelpOverlay 컴포넌트 Props
 */
export interface HelpOverlayProps {
  /** 오버레이 표시 여부 */
  visible: boolean;
}

/**
 * 표시를 위해 카테고리별로 단축키 그룹화
 */
function groupShortcutsByCategory(): Map<string, Array<{ key: string; description: string }>> {
  const groups = new Map<string, Array<{ key: string; description: string }>>();

  for (const shortcut of fullKeyboardShortcuts) {
    const existing = groups.get(shortcut.category) || [];
    existing.push({ key: shortcut.key, description: shortcut.description });
    groups.set(shortcut.category, existing);
  }

  return groups;
}

/**
 * 도움말 오버레이 컴포넌트
 */
export function HelpOverlay({ visible }: HelpOverlayProps): ReactNode {
  if (!visible) {
    return null;
  }

  const groups = groupShortcutsByCategory();

  // 정렬을 위한 최대 키 너비 계산
  let maxKeyWidth = 0;
  for (const shortcut of fullKeyboardShortcuts) {
    if (shortcut.key.length > maxKeyWidth) {
      maxKeyWidth = shortcut.key.length;
    }
  }

  return (
    <box
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#000000B3', // 70% 불투명 검정 (OpenTUI는 rgba 문법 미지원)
      }}
    >
      <box
        style={{
          flexDirection: 'column',
          padding: 2,
          backgroundColor: colors.bg.secondary,
          borderColor: colors.accent.primary,
          minWidth: 50,
          maxWidth: 60,
        }}
        border
      >
        {/* 헤더 */}
        <box style={{ marginBottom: 1, justifyContent: 'center' }}>
          <text fg={colors.accent.primary}>⌨ 키보드 단축키</text>
        </box>

        {/* 단축키 그룹 */}
        {Array.from(groups.entries()).map(([category, shortcuts]) => (
          <box key={category} style={{ flexDirection: 'column', marginBottom: 1 }}>
            {/* 카테고리 헤더 */}
            <text fg={colors.fg.muted}>{category}</text>

            {/* 이 카테고리의 단축키 */}
            {shortcuts.map((shortcut) => (
              <box key={shortcut.key} style={{ flexDirection: 'row' }}>
                <text fg={colors.accent.tertiary}>
                  {shortcut.key.padEnd(maxKeyWidth + 2)}
                </text>
                <text fg={colors.fg.primary}>{shortcut.description}</text>
              </box>
            ))}
          </box>
        ))}

        {/* 푸터 */}
        <box style={{ marginTop: 1, justifyContent: 'center' }}>
          <text fg={colors.fg.muted}>? 또는 Esc를 눌러 닫기</text>
        </box>
      </box>
    </box>
  );
}
