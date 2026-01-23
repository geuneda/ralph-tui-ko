/**
 * ABOUTME: Ralph TUI용 LeftPanel 컴포넌트.
 * 상태 표시기(완료/활성/대기/차단됨)와 함께 작업 목록을 표시합니다.
 */

import type { ReactNode } from 'react';
import { memo } from 'react';
import { colors, getTaskStatusColor, getTaskStatusIndicator } from '../theme.js';
import type { LeftPanelProps, TaskItem } from '../types.js';

/**
 * 최대 너비에 맞게 텍스트 자르기
 * 텍스트가 잘리면 말줄임표 추가
 */
function truncateText(text: string, maxWidth: number): string {
  if (text.length <= maxWidth) return text;
  if (maxWidth <= 3) return text.slice(0, maxWidth);
  return text.slice(0, maxWidth - 1) + '…';
}

/**
 * 단일 작업 항목 행
 * 표시: [들여쓰기][상태 표시기] [작업 ID] [작업 제목 (잘림)]
 * 완료된 작업은 이전 작업과 구분하기 위해 회색으로 표시됩니다
 * 하위 작업(parentId가 있는 것)은 계층을 보여주기 위해 들여쓰기됩니다
 */
function TaskRow({
  task,
  isSelected,
  maxWidth,
  indentLevel = 0,
}: {
  task: TaskItem;
  isSelected: boolean;
  /** 전체 행 콘텐츠의 최대 너비 (잘림용) */
  maxWidth: number;
  /** 들여쓰기 레벨 (0 = 에픽/루트, 1 = 에픽의 하위) */
  indentLevel?: number;
}): ReactNode {
  const statusColor = getTaskStatusColor(task.status);
  const statusIndicator = getTaskStatusIndicator(task.status);
  const isClosed = task.status === 'closed';

  // 들여쓰기: 레벨당 2칸
  const indent = '  '.repeat(indentLevel);

  // 형식: "[들여쓰기]✓ task-id 제목"
  // 사용 가능한 너비 계산: maxWidth - 들여쓰기 - 표시기(1) - 공백(1) - id - 공백(1)
  const idDisplay = task.id;
  const indentWidth = indentLevel * 2;
  const titleWidth = maxWidth - indentWidth - 3 - idDisplay.length;
  const truncatedTitle = truncateText(task.title, Math.max(5, titleWidth));

  // 완료된 작업에 대한 회색 색상
  const idColor = isClosed ? colors.fg.dim : colors.fg.muted;
  const titleColor = isClosed
    ? colors.fg.dim
    : isSelected
      ? colors.fg.primary
      : colors.fg.secondary;

  return (
    <box
      style={{
        width: '100%',
        flexDirection: 'row',
        paddingLeft: 1,
        paddingRight: 1,
        backgroundColor: isSelected ? colors.bg.highlight : 'transparent',
      }}
    >
      <text>
        <span fg={colors.fg.dim}>{indent}</span>
        <span fg={statusColor}>{statusIndicator}</span>
        <span fg={idColor}> {idDisplay}</span>
        <span fg={titleColor}> {truncatedTitle}</span>
      </text>
    </box>
  );
}

/**
 * 들여쓰기 레벨을 결정하기 위한 부모 ID 맵 구축.
 * 작업 목록에 존재하는 parentId를 가진 작업은 들여쓰기됩니다.
 */
function buildIndentMap(tasks: TaskItem[]): Map<string, number> {
  // 빠른 조회를 위한 모든 작업 ID 세트 생성
  const taskIds = new Set(tasks.map((t) => t.id));
  const indentMap = new Map<string, number>();

  for (const task of tasks) {
    // 작업이 목록에 존재하는 부모를 가지면 들여쓰기됨
    if (task.parentId && taskIds.has(task.parentId)) {
      indentMap.set(task.id, 1);
    } else {
      indentMap.set(task.id, 0);
    }
  }

  return indentMap;
}

/**
 * 원격 인스턴스의 연결 상태
 */
type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'reconnecting';

/**
 * 스크롤 가능한 작업 목록을 보여주는 LeftPanel 컴포넌트
 * 부모/자식 관계에 따른 계층적 들여쓰기로 작업을 표시합니다
 * 형제 상태만 변경될 때 (예: detailsViewMode) 리렌더링 방지를 위해 React.memo로 래핑됨
 */
export const LeftPanel = memo(function LeftPanel({
  tasks,
  selectedIndex,
  width = 45,
  isFocused = true,
  isViewingRemote = false,
  remoteConnectionStatus,
  remoteAlias,
}: LeftPanelProps & {
  width?: number;
  isFocused?: boolean;
  /** 현재 원격 인스턴스를 보고 있는지 여부 */
  isViewingRemote?: boolean;
  /** 원격 보기 시 연결 상태 */
  remoteConnectionStatus?: ConnectionStatus;
  /** 보고 있는 원격의 별칭 */
  remoteAlias?: string;
}): ReactNode {
  // 작업 행 콘텐츠의 최대 너비 계산 (패널 너비에서 패딩과 테두리 제외)
  const maxRowWidth = Math.max(20, width - 4);

  // 계층적 표시를 위한 들여쓰기 맵 구축
  const indentMap = buildIndentMap(tasks);

  return (
    <box
      title="작업"
      style={{
        flexGrow: 1,
        flexShrink: 1,
        minWidth: 30,
        maxWidth: 50,
        flexDirection: 'column',
        backgroundColor: colors.bg.primary,
        border: true,
        borderColor: isFocused ? colors.accent.primary : colors.border.normal,
      }}
    >
      <scrollbox
        style={{
          flexGrow: 1,
          width: '100%',
        }}
      >
        {tasks.length === 0 ? (
          <box style={{ padding: 1, flexDirection: 'column' }}>
            {isViewingRemote && remoteConnectionStatus !== 'connected' ? (
              <>
                <text fg={colors.fg.muted}>
                  {remoteConnectionStatus === 'connecting' && '연결 중...'}
                  {remoteConnectionStatus === 'reconnecting' && '재연결 중...'}
                  {remoteConnectionStatus === 'disconnected' && '연결되지 않음'}
                </text>
                {remoteConnectionStatus === 'disconnected' && remoteAlias && (
                  <text fg={colors.fg.dim}>
                    {'\n'}원격 "{remoteAlias}"이(가) 오프라인입니다
                  </text>
                )}
              </>
            ) : (
              <text fg={colors.fg.muted}>로드된 작업 없음</text>
            )}
          </box>
        ) : (
          tasks.map((task, index) => (
            <TaskRow
              key={task.id}
              task={task}
              isSelected={index === selectedIndex}
              maxWidth={maxRowWidth}
              indentLevel={indentMap.get(task.id) ?? 0}
            />
          ))
        )}
      </scrollbox>
    </box>
  );
});
