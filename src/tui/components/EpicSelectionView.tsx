/**
 * ABOUTME: Ralph TUI용 에픽 선택 뷰 컴포넌트.
 * 사용자가 선택하여 Ralph 실행을 시작할 수 있는 에픽 목록을 표시합니다.
 * --epic 플래그 없이 ralph-tui를 실행할 때 사용됩니다.
 */

import type { ReactNode } from 'react';
import { colors, statusIndicators } from '../theme.js';
import type { TrackerTask } from '../../plugins/trackers/types.js';

/**
 * EpicSelectionView 컴포넌트 Props
 */
export interface EpicSelectionViewProps {
  /** 사용 가능한 에픽 목록 */
  epics: TrackerTask[];
  /** 현재 선택된 에픽 인덱스 */
  selectedIndex: number;
  /** 사용 중인 트래커 이름 */
  trackerName: string;
  /** 에픽 로딩 중 여부 */
  loading?: boolean;
  /** 에픽 로딩 실패 시 오류 메시지 */
  error?: string;
  /** 필터링용 구성된 라벨 (빈 상태 안내에 사용) */
  configuredLabels?: string[];
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
  // 가능한 경우 메타데이터에서 완료 정보 확인
  const meta = epic.metadata as Record<string, unknown> | undefined;
  if (meta) {
    const storyCount = meta.storyCount as number | undefined;
    const completedCount = meta.completedCount as number | undefined;
    if (storyCount !== undefined && completedCount !== undefined) {
      if (completedCount >= storyCount) {
        return colors.status.success; // 모두 완료
      }
      if (completedCount > 0) {
        return colors.status.warning; // 진행 중
      }
    }
  }

  // 상태에 따른 기본값
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
 * EpicSelectionView 컴포넌트
 * 선택 하이라이트가 있는 사용 가능한 에픽 목록을 표시
 */
export function EpicSelectionView({
  epics,
  selectedIndex,
  trackerName,
  loading = false,
  error,
  configuredLabels = [],
}: EpicSelectionViewProps): ReactNode {
  // 로딩 상태
  if (loading) {
    return (
      <box
        style={{
          width: '100%',
          height: '100%',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.bg.primary,
        }}
      >
        <text fg={colors.fg.secondary}>에픽 로딩 중...</text>
      </box>
    );
  }

  // 오류 상태
  if (error) {
    return (
      <box
        style={{
          width: '100%',
          height: '100%',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.bg.primary,
        }}
      >
        <text fg={colors.status.error}>오류: {error}</text>
        <text fg={colors.fg.muted}>'q'를 눌러 종료</text>
      </box>
    );
  }

  // 에픽을 찾을 수 없음 - 유용한 안내 표시
  if (epics.length === 0) {
    const hasLabels = configuredLabels.length > 0;
    const labelsDisplay = configuredLabels.join(', ');

    return (
      <box
        style={{
          width: '100%',
          height: '100%',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.bg.primary,
          gap: 1,
        }}
      >
        <text fg={colors.status.warning}>에픽을 찾을 수 없음</text>
        <text fg={colors.fg.secondary}> </text>
        <text fg={colors.fg.secondary}>다음 사항을 확인하세요:</text>
        <text fg={colors.fg.muted}>* 에픽 beads가 정의되어 있어야 합니다 (bd create --type epic)</text>
        {hasLabels && (
          <text fg={colors.fg.muted}>* 해당 에픽에 라벨이 있어야 합니다: {labelsDisplay}</text>
        )}
        <text fg={colors.fg.muted}>* 에픽에 하위 항목이 정의되어 있어야 합니다 (하위 작업/스토리)</text>
        <text fg={colors.fg.muted}>* 하위 작업에 의존성이 정의되어 있어야 합니다 (선택사항, 의존성 인식 선택용)</text>
        <text fg={colors.fg.secondary}> </text>
        <text fg={colors.fg.muted}>또는 --epic 플래그로 에픽을 직접 지정하세요</text>
        <text fg={colors.fg.muted}>'q'를 눌러 종료</text>
      </box>
    );
  }

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
          <text fg={colors.accent.primary}>에픽 선택</text>
          <text fg={colors.fg.muted}>({epics.length}개 사용 가능)</text>
        </box>
        <text fg={colors.fg.muted}>[{trackerName}]</text>
      </box>

      {/* 에픽 목록 */}
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
            const statusColor = getEpicStatusColor(epic);
            const meta = epic.metadata as Record<string, unknown> | undefined;
            const storyCount = (meta?.storyCount as number | undefined) ?? 0;
            const completedCount = (meta?.completedCount as number | undefined) ?? 0;
            const childCount = (meta?.childCount as number | undefined) ?? storyCount;

            // 진행 상황 텍스트 구성
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

                {/* 상태 표시기 */}
                <text fg={statusColor}>
                  {epic.status === 'in_progress' ? statusIndicators.active : statusIndicators.pending}{' '}
                </text>

                {/* 에픽 ID */}
                <text fg={colors.fg.muted}>{epic.id} </text>

                {/* 에픽 제목 */}
                <text fg={isSelected ? colors.fg.primary : colors.fg.secondary}>
                  {truncateText(epic.title, 50)}
                </text>

                {/* 진행 상황 */}
                <text fg={colors.fg.muted}>{progressText}</text>
              </box>
            );
          })}
        </scrollbox>
      </box>

      {/* 안내가 있는 푸터 */}
      <box
        style={{
          width: '100%',
          height: 3,
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: colors.bg.secondary,
          paddingLeft: 1,
          paddingRight: 1,
          border: true,
          borderColor: colors.border.normal,
          gap: 3,
        }}
      >
        <text fg={colors.fg.muted}>
          <span fg={colors.accent.primary}>Enter/r</span> 실행 시작
        </text>
        <text fg={colors.fg.muted}>
          <span fg={colors.accent.primary}>↑↓/jk</span> 탐색
        </text>
        <text fg={colors.fg.muted}>
          <span fg={colors.accent.primary}>q</span> 종료
        </text>
      </box>
    </box>
  );
}
