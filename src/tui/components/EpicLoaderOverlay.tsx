/**
 * ABOUTME: 세션 중 에픽 전환을 위한 에픽 로더 오버레이 컴포넌트.
 * 재시작 없이 다른 에픽을 선택할 수 있는 TUI 내 모달을 제공합니다.
 * beads 스타일 에픽 선택(목록)과 json 스타일(파일 경로 프롬프트) 모두 지원합니다.
 */

import type { ReactNode } from 'react';
import { useState, useEffect, useCallback } from 'react';
import { useKeyboard } from '@opentui/react';
import { colors, statusIndicators } from '../theme.js';
import type { TrackerTask } from '../../plugins/trackers/types.js';

/**
 * 에픽 로더 오버레이 모드
 */
export type EpicLoaderMode = 'list' | 'file-prompt';

/**
 * EpicLoaderOverlay 컴포넌트 Props
 */
export interface EpicLoaderOverlayProps {
  /** 오버레이 표시 여부 */
  visible: boolean;

  /** 모드: beads 스타일 선택은 'list', json 스타일은 'file-prompt' */
  mode: EpicLoaderMode;

  /** 사용 가능한 에픽 (목록 모드용) */
  epics: TrackerTask[];

  /** 에픽 로딩 중 여부 */
  loading: boolean;

  /** 로딩 실패 시 오류 메시지 */
  error?: string;

  /** 표시용 트래커 이름 */
  trackerName: string;

  /** 현재 에픽 ID (하이라이트용) */
  currentEpicId?: string;

  /** 에픽 선택 시 콜백 */
  onSelect: (epic: TrackerTask) => void;

  /** 사용자가 취소할 때 (Escape) 콜백 */
  onCancel: () => void;

  /** 파일 경로 제출 시 콜백 (file-prompt 모드) */
  onFilePath?: (path: string) => void;
}

/**
 * 주어진 너비에 맞게 텍스트 자르기
 */
function truncateText(text: string, maxWidth: number): string {
  if (text.length <= maxWidth) {
    return text;
  }
  return text.slice(0, maxWidth - 1) + '…';
}

/**
 * 완료 상태에 따른 에픽의 상태 색상 가져오기
 */
function getEpicStatusColor(epic: TrackerTask): string {
  const meta = epic.metadata as Record<string, unknown> | undefined;
  if (meta) {
    const storyCount = meta.storyCount as number | undefined;
    const completedCount = meta.completedCount as number | undefined;
    if (storyCount !== undefined && completedCount !== undefined) {
      if (completedCount >= storyCount) {
        return colors.status.success;
      }
      if (completedCount > 0) {
        return colors.status.warning;
      }
    }
  }

  switch (epic.status) {
    case 'completed':
      return colors.status.success;
    case 'in_progress':
      return colors.status.info;
    default:
      return colors.fg.primary;
  }
}

/**
 * TUI 세션 중 에픽 로드/전환을 위한 모달 오버레이.
 * 두 가지 모드 지원:
 * - 'list': 선택 가능한 에픽 목록 표시 (beads/beads-bv)
 * - 'file-prompt': 파일 경로 입력 프롬프트 (json 트래커)
 */
export function EpicLoaderOverlay({
  visible,
  mode,
  epics,
  loading,
  error,
  trackerName,
  currentEpicId,
  onSelect,
  onCancel,
  onFilePath,
}: EpicLoaderOverlayProps): ReactNode {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [filePath, setFilePath] = useState('');

  // 오버레이가 표시될 때 상태 초기화
  useEffect(() => {
    if (visible) {
      // 목록에서 현재 선택된 에픽 찾기
      const currentIndex = epics.findIndex((e) => e.id === currentEpicId);
      setSelectedIndex(currentIndex >= 0 ? currentIndex : 0);
      setFilePath('');
    }
  }, [visible, epics, currentEpicId]);

  // 키보드 입력 처리
  const handleKeyboard = useCallback(
    (key: { name: string; sequence?: string }) => {
      if (!visible) return;

      if (mode === 'list') {
        switch (key.name) {
          case 'escape':
            onCancel();
            break;

          case 'up':
          case 'k':
            setSelectedIndex((prev) => Math.max(0, prev - 1));
            break;

          case 'down':
          case 'j':
            setSelectedIndex((prev) => Math.min(epics.length - 1, prev + 1));
            break;

          case 'return':
          case 'enter':
            if (epics.length > 0 && epics[selectedIndex]) {
              onSelect(epics[selectedIndex]);
            }
            break;
        }
      } else if (mode === 'file-prompt') {
        switch (key.name) {
          case 'escape':
            onCancel();
            break;

          case 'return':
          case 'enter':
            if (filePath.trim() && onFilePath) {
              onFilePath(filePath.trim());
            }
            break;

          case 'backspace':
            setFilePath((prev) => prev.slice(0, -1));
            break;

          default:
            // 문자 입력 처리 (여러 문자일 수 있는 붙여넣기 텍스트 포함)
            if (key.sequence && key.name !== 'backspace') {
              setFilePath((prev) => prev + key.sequence);
            }
            break;
        }
      }
    },
    [visible, mode, epics, selectedIndex, filePath, onSelect, onCancel, onFilePath]
  );

  useKeyboard(handleKeyboard);

  if (!visible) {
    return null;
  }

  // 중앙 모달이 있는 전체 화면 오버레이
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
        backgroundColor: '#00000080', // 50% 불투명 검정 (OpenTUI는 rgba 문법을 지원하지 않음)
      }}
    >
      <box
        style={{
          width: 70,
          height: mode === 'file-prompt' ? 12 : 20,
          backgroundColor: colors.bg.secondary,
          border: true,
          borderColor: colors.accent.primary,
          flexDirection: 'column',
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
            backgroundColor: colors.bg.tertiary,
            paddingLeft: 1,
            paddingRight: 1,
          }}
        >
          <text fg={colors.accent.primary}>
            {mode === 'list' ? '에픽 로드' : 'PRD 파일 경로 입력'}
          </text>
          <text fg={colors.fg.muted}>[{trackerName}]</text>
        </box>

        {/* 콘텐츠 */}
        {mode === 'file-prompt' ? (
          <box
            style={{
              flexGrow: 1,
              flexDirection: 'column',
              padding: 1,
              justifyContent: 'center',
            }}
          >
            <text fg={colors.fg.secondary}>
              prd.json 파일 경로를 입력하세요:
            </text>
            <box style={{ height: 1 }} />
            <box
              style={{
                width: '100%',
                height: 1,
                backgroundColor: colors.bg.primary,
                paddingLeft: 1,
              }}
            >
              <text fg={colors.fg.primary}>{filePath}</text>
              <text fg={colors.accent.primary}>_</text>
            </box>
            <box style={{ height: 1 }} />
            <text fg={colors.fg.muted}>
              Enter로 로드, Escape로 취소
            </text>
          </box>
        ) : loading ? (
          <box
            style={{
              flexGrow: 1,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <text fg={colors.fg.secondary}>에픽 로딩 중...</text>
          </box>
        ) : error ? (
          <box
            style={{
              flexGrow: 1,
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <text fg={colors.status.error}>오류: {error}</text>
            <box style={{ height: 1 }} />
            <text fg={colors.fg.muted}>Escape를 눌러 닫기</text>
          </box>
        ) : epics.length === 0 ? (
          <box
            style={{
              flexGrow: 1,
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <text fg={colors.fg.secondary}>에픽을 찾을 수 없음</text>
            <box style={{ height: 1 }} />
            <text fg={colors.fg.muted}>Escape를 눌러 닫기</text>
          </box>
        ) : (
          <box
            style={{
              flexGrow: 1,
              flexDirection: 'column',
              paddingTop: 1,
              paddingLeft: 1,
              paddingRight: 1,
            }}
          >
            <scrollbox style={{ flexGrow: 1 }}>
              {epics.map((epic, index) => {
                const isSelected = index === selectedIndex;
                const isCurrent = epic.id === currentEpicId;
                const statusColor = getEpicStatusColor(epic);
                const meta = epic.metadata as Record<string, unknown> | undefined;
                const storyCount = (meta?.storyCount as number | undefined) ?? 0;
                const completedCount = (meta?.completedCount as number | undefined) ?? 0;
                const childCount = (meta?.childCount as number | undefined) ?? storyCount;

                let progressText = '';
                if (childCount > 0) {
                  progressText = ` (${completedCount}/${childCount})`;
                }

                return (
                  <box
                    key={epic.id}
                    style={{
                      width: '100%',
                      height: 1,
                      flexDirection: 'row',
                      backgroundColor: isSelected ? colors.bg.highlight : 'transparent',
                    }}
                  >
                    {/* 선택 표시기 */}
                    <text fg={isSelected ? colors.accent.primary : 'transparent'}>
                      {isSelected ? '▸ ' : '  '}
                    </text>

                    {/* 현재 에픽 마커 */}
                    <text fg={isCurrent ? colors.status.success : 'transparent'}>
                      {isCurrent ? '● ' : '  '}
                    </text>

                    {/* 상태 표시기 */}
                    <text fg={statusColor}>
                      {epic.status === 'in_progress'
                        ? statusIndicators.active
                        : statusIndicators.pending}{' '}
                    </text>

                    {/* 에픽 ID */}
                    <text fg={colors.fg.muted}>{truncateText(epic.id, 20)} </text>

                    {/* 에픽 제목 */}
                    <text fg={isSelected ? colors.fg.primary : colors.fg.secondary}>
                      {truncateText(epic.title, 30)}
                    </text>

                    {/* 진행 상황 */}
                    <text fg={colors.fg.muted}>{progressText}</text>
                  </box>
                );
              })}
            </scrollbox>
          </box>
        )}

        {/* 푸터 */}
        <box
          style={{
            width: '100%',
            height: 2,
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: colors.bg.tertiary,
            gap: 3,
          }}
        >
          {mode === 'list' && (
            <>
              <text fg={colors.fg.muted}>
                <span fg={colors.accent.primary}>Enter</span> 선택
              </text>
              <text fg={colors.fg.muted}>
                <span fg={colors.accent.primary}>↑↓/jk</span> 탐색
              </text>
            </>
          )}
          <text fg={colors.fg.muted}>
            <span fg={colors.accent.primary}>Esc</span> 취소
          </text>
        </box>
      </box>
    </box>
  );
}
