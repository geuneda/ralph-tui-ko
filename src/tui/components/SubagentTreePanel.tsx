/**
 * ABOUTME: 전용 패널에 서브에이전트 계층을 표시하는 SubagentTreePanel 컴포넌트.
 * 상태 아이콘, 설명, 지속 시간과 함께 생성된 서브에이전트의 트리 구조를 표시합니다.
 * 현재 활성 서브에이전트 강조 및 최신 활동으로 자동 스크롤을 지원합니다.
 */

import type { ReactNode } from 'react';
import { useRef, useEffect } from 'react';
import { colors } from '../theme.js';
import type { SubagentTreeNode } from '../../engine/types.js';
import type { EngineSubagentStatus } from '../../engine/types.js';

/**
 * 완료 상태에 따른 서브에이전트 상태 아이콘
 * - running: 스피너 (◐ 애니메이션 느낌)
 * - completed: 체크마크 (✓)
 * - error: X (✗)
 */
function getStatusIcon(status: EngineSubagentStatus): string {
  switch (status) {
    case 'running':
      return '◐'; // 스피너/실행 표시기
    case 'completed':
      return '✓'; // 체크마크
    case 'error':
      return '✗'; // 실패용 X
    default:
      return '○'; // 기본 원
  }
}

/**
 * 완료 상태에 따른 서브에이전트 상태 색상
 */
function getStatusColor(status: EngineSubagentStatus): string {
  switch (status) {
    case 'running':
      return colors.status.info;
    case 'completed':
      return colors.status.success;
    case 'error':
      return colors.status.error;
    default:
      return colors.fg.muted;
  }
}

/**
 * 사람이 읽기 쉬운 형식으로 지속 시간 포맷
 * 짧은 시간은 밀리초, 긴 시간은 초로 표시
 */
function formatDuration(durationMs?: number): string {
  if (durationMs === undefined) return '';
  if (durationMs < 1000) return `${durationMs}ms`;
  const seconds = Math.floor(durationMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * 최대 너비에 맞게 텍스트 자르기
 * 잘린 경우 생략 부호 추가
 */
function truncateText(text: string, maxWidth: number): string {
  if (text.length <= maxWidth) return text;
  if (maxWidth <= 3) return text.slice(0, maxWidth);
  return text.slice(0, maxWidth - 1) + '…';
}

/**
 * 단일 SubagentTreeRow 컴포넌트 Props
 */
interface SubagentTreeRowProps {
  /** 렌더링할 서브에이전트 트리 노드 */
  node: SubagentTreeNode;
  /** 강조용 현재 활성(실행 중) 서브에이전트 ID */
  activeSubagentId?: string;
  /** 행 콘텐츠의 최대 너비 (잘라내기용) */
  maxWidth: number;
  /** 현재 선택된 노드 ID (키보드 탐색용) */
  selectedId?: string | 'main';
  /** 패널이 키보드 포커스를 가지고 있는지 여부 (선택 스타일링에 영향) */
  isFocused?: boolean;
}

/**
 * 서브에이전트 트리의 단일 행 렌더링
 * 형식: [들여쓰기][상태 아이콘] [에이전트 타입] 설명 [지속 시간]
 * 포커스 인식 스타일링으로 선택 상태에 따라 강조
 */
function SubagentTreeRow({
  node,
  activeSubagentId,
  maxWidth,
  selectedId,
  isFocused = false,
}: SubagentTreeRowProps): ReactNode {
  const { state } = node;
  const isSelected = selectedId === state.id;
  const isActive = state.id === activeSubagentId || state.status === 'running';
  // 선택 시 선택 강조 표시, 실행 중 노드에는 활성 표시기 표시
  const showSelectionHighlight = isSelected;
  const showActiveIndicator = !isSelected && isActive;
  const statusIcon = getStatusIcon(state.status);
  const statusColor = getStatusColor(state.status);

  // 들여쓰기: 깊이 레벨당 2칸 (최상위 레벨은 깊이 1에서 시작)
  const indentLevel = Math.max(0, state.depth - 1);
  const indent = '  '.repeat(indentLevel);

  // 설명에 사용 가능한 너비 계산
  // 형식: [들여쓰기][아이콘] [타입] 설명 [지속 시간]
  // 아이콘=1, 공백=1, 타입 괄호와 내용, 공백=1, 괄호 포함 지속 시간
  const typeDisplay = `[${state.type}]`;
  const durationStr = state.durationMs !== undefined ? ` [${formatDuration(state.durationMs)}]` : '';
  const fixedWidth = indent.length + 2 + typeDisplay.length + 1 + durationStr.length;
  const descriptionWidth = Math.max(5, maxWidth - fixedWidth);
  const truncatedDescription = truncateText(state.description, descriptionWidth);

  // 선택 및 포커스 상태에 따른 배경색 결정
  // - 선택됨 + 포커스: 밝은 강조
  // - 선택됨 + 포커스 없음: 흐린 강조 (여전히 보이지만 흐릿함)
  // - 활성 (실행 중): 미묘한 강조
  // - 기본: 투명
  let bgColor = 'transparent';
  if (showSelectionHighlight) {
    bgColor = isFocused ? colors.bg.highlight : colors.bg.tertiary;
  } else if (showActiveIndicator) {
    bgColor = colors.bg.secondary;
  }

  // 텍스트 색상: 선택되고 포커스될 때 더 밝음
  const textColor = showSelectionHighlight && isFocused
    ? colors.fg.primary
    : showSelectionHighlight
      ? colors.fg.secondary
      : colors.fg.secondary;

  return (
    <box
      style={{
        width: '100%',
        flexDirection: 'row',
        paddingLeft: 1,
        paddingRight: 1,
        backgroundColor: bgColor,
      }}
    >
      <text>
        <span fg={colors.fg.dim}>{indent}</span>
        <span fg={statusColor}>{statusIcon}</span>
        <span fg={colors.accent.tertiary}> {typeDisplay}</span>
        <span fg={textColor}> {truncatedDescription}</span>
        {durationStr && <span fg={colors.fg.muted}>{durationStr}</span>}
      </text>
    </box>
  );
}

/**
 * 서브에이전트 트리 노드와 자식을 재귀적으로 렌더링
 */
function SubagentTreeNodeRows({
  node,
  activeSubagentId,
  maxWidth,
  selectedId,
  isFocused,
}: SubagentTreeRowProps): ReactNode {
  return (
    <>
      <SubagentTreeRow
        node={node}
        activeSubagentId={activeSubagentId}
        maxWidth={maxWidth}
        selectedId={selectedId}
        isFocused={isFocused}
      />
      {node.children.map((child) => (
        <SubagentTreeNodeRows
          key={child.state.id}
          node={child}
          activeSubagentId={activeSubagentId}
          maxWidth={maxWidth}
          selectedId={selectedId}
          isFocused={isFocused}
        />
      ))}
    </>
  );
}

/**
 * SubagentTreePanel 컴포넌트 Props
 */
export interface SubagentTreePanelProps {
  /** 루트 레벨 서브에이전트 트리 노드 배열 */
  tree: SubagentTreeNode[];
  /** 강조용 현재 활성(실행 중) 서브에이전트 ID */
  activeSubagentId?: string;
  /** 잘라내기 계산용 패널 너비 */
  width?: number;
  /** 현재 작업 ID (루트 노드로 표시, 병렬 실행 준비) */
  currentTaskId?: string;
  /** 현재 작업 제목 (루트 노드 라벨로 표시) */
  currentTaskTitle?: string;
  /** 표시 아이콘용 현재 작업 상태 */
  currentTaskStatus?: 'running' | 'completed' | 'error' | 'idle';
  /** 현재 선택된 노드 ID (키보드 탐색용) - 루트는 taskId, 자식은 서브에이전트 ID */
  selectedId?: string;
  /** 노드 선택 시 콜백 */
  onSelect?: (id: string) => void;
  /** 이 패널이 현재 키보드 포커스를 가지고 있는지 여부 (TAB 탐색) */
  isFocused?: boolean;
}

/**
 * 트리에서 가장 최근 활성(실행 중) 서브에이전트 ID 찾기
 * 깊이 우선 탐색으로 마지막 실행 중인 서브에이전트를 반환
 */
function findActiveSubagentId(nodes: SubagentTreeNode[]): string | undefined {
  let activeId: string | undefined;

  function traverse(node: SubagentTreeNode): void {
    if (node.state.status === 'running') {
      activeId = node.state.id;
    }
    for (const child of node.children) {
      traverse(child);
    }
  }

  for (const node of nodes) {
    traverse(node);
  }

  return activeId;
}

/**
 * 트리의 총 서브에이전트 수 계산 (표시용)
 */
function countSubagents(nodes: SubagentTreeNode[]): number {
  let count = 0;

  function traverse(node: SubagentTreeNode): void {
    count++;
    for (const child of node.children) {
      traverse(child);
    }
  }

  for (const node of nodes) {
    traverse(node);
  }

  return count;
}

/**
 * 메인 에이전트 상태 아이콘 가져오기
 */
function getMainAgentIcon(status: 'running' | 'completed' | 'error' | 'idle'): string {
  switch (status) {
    case 'running':
      return '◉'; // 메인 에이전트 실행 중 채워진 원
    case 'completed':
      return '✓';
    case 'error':
      return '✗';
    default:
      return '○';
  }
}

/**
 * 메인 에이전트 상태 색상 가져오기
 */
function getMainAgentColor(status: 'running' | 'completed' | 'error' | 'idle'): string {
  switch (status) {
    case 'running':
      return colors.accent.primary;
    case 'completed':
      return colors.status.success;
    case 'error':
      return colors.status.error;
    default:
      return colors.fg.muted;
  }
}

/**
 * 서브에이전트 계층을 보여주는 전용 패널 SubagentTreePanel 컴포넌트
 * 표시: 루트에 메인 에이전트, 타입, 설명, 상태 아이콘, 지속 시간과 함께 자식으로 서브에이전트
 * 기능: 들여쓰기된 중첩 서브에이전트, 강조된 활성/선택 노드, 자동 스크롤
 */
export function SubagentTreePanel({
  tree,
  activeSubagentId,
  width = 45,
  currentTaskId,
  currentTaskTitle,
  currentTaskStatus = 'running',
  selectedId,
  onSelect: _onSelect, // 향후 키보드 탐색용 예약
  isFocused = false,
}: SubagentTreePanelProps): ReactNode {
  // 행 콘텐츠의 최대 너비 계산 (패널 너비에서 패딩과 테두리 제외)
  const maxRowWidth = Math.max(20, width - 4);

  // 제공되지 않은 경우 활성 서브에이전트 자동 감지
  const effectiveActiveId = activeSubagentId ?? findActiveSubagentId(tree);

  // 제목용 서브에이전트 수 계산
  const totalSubagents = countSubagents(tree);
  const runningCount = tree.reduce((acc, node) => {
    let count = 0;
    function countRunning(n: SubagentTreeNode): void {
      if (n.state.status === 'running') count++;
      n.children.forEach(countRunning);
    }
    countRunning(node);
    return acc + count;
  }, 0);

  // 카운트가 포함된 제목 구성
  const title = runningCount > 0
    ? `에이전트 트리 (${runningCount}개 활성)`
    : totalSubagents > 0
      ? `에이전트 트리 (${totalSubagents})`
      : '에이전트 트리';

  // 자동 스크롤 동작용 ref 사용
  // 참고: @opentui/react에서 콘텐츠가 높이를 초과하면 scrollbox가 자동 스크롤
  // 새 서브에이전트를 감지하기 위해 이전 트리 길이 추적
  const prevTreeLengthRef = useRef(totalSubagents);

  useEffect(() => {
    // 새 서브에이전트가 추가되면 scrollbox가 자동 스크롤해야 함
    // 콘텐츠가 증가하면 scrollbox 컴포넌트가 자동으로 처리
    prevTreeLengthRef.current = totalSubagents;
  }, [totalSubagents]);

  // 작업 루트가 선택되었는지 확인 (selectedId가 currentTaskId와 일치하거나 하위 호환을 위해 'main')
  const isTaskRootSelected = selectedId === currentTaskId || selectedId === 'main';
  const taskIcon = getMainAgentIcon(currentTaskStatus);
  const taskColor = getMainAgentColor(currentTaskStatus);

  // 포커스 상태에 따른 테두리 색상 결정
  // 단순: 포커스 = 강조, 포커스 없음 = 일반
  const borderColor = isFocused ? colors.accent.primary : colors.border.normal;

  return (
    <box
      title={title}
      style={{
        flexGrow: 1,
        flexShrink: 1,
        minWidth: 30,
        maxWidth: 50,
        flexDirection: 'column',
        backgroundColor: colors.bg.primary,
        border: true,
        borderColor,
      }}
    >
      <scrollbox
        style={{
          flexGrow: 1,
          width: '100%',
        }}
      >
        {/* 작업 루트 노드 - 작업 ID와 제목 표시 */}
        <box
          style={{
            width: '100%',
            flexDirection: 'row',
            paddingLeft: 1,
            paddingRight: 1,
            backgroundColor: isTaskRootSelected
              ? (isFocused ? colors.bg.highlight : colors.bg.tertiary)
              : 'transparent',
          }}
        >
          <text>
            <span fg={taskColor}>{taskIcon}</span>
            <span fg={isTaskRootSelected && isFocused ? colors.fg.primary : colors.accent.primary}>
              {' '}{currentTaskId || '작업'}
            </span>
            {currentTaskTitle && (
              <span fg={colors.fg.secondary}> {truncateText(currentTaskTitle, Math.max(0, maxRowWidth - (currentTaskId?.length || 4) - 10))}</span>
            )}
            {tree.length > 0 && <span fg={colors.fg.muted}> ({tree.length})</span>}
          </text>
        </box>

        {/* 자식으로 서브에이전트 */}
        {tree.length === 0 ? (
          <box style={{ paddingLeft: 3 }}>
            <text fg={colors.fg.muted}>└─ 서브에이전트 없음</text>
          </box>
        ) : (
          tree.map((node) => (
            <SubagentTreeNodeRows
              key={node.state.id}
              node={{
                ...node,
                state: {
                  ...node.state,
                  // 메인 에이전트가 깊이 0이므로 깊이를 1 증가
                  depth: node.state.depth + 1,
                },
              }}
              activeSubagentId={effectiveActiveId}
              maxWidth={maxRowWidth}
              selectedId={selectedId}
              isFocused={isFocused}
            />
          ))
        )}
      </scrollbox>
    </box>
  );
}
