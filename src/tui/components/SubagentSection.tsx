/**
 * ABOUTME: 접을 수 있는 서브에이전트 출력 섹션 렌더링을 위한 SubagentSection 컴포넌트.
 * 접을 수 있는 섹션으로 출력 패널에 서브에이전트 활동을 인라인으로 표시하여
 * 사용자가 서브에이전트 세부 정보를 확장/축소할 수 있습니다.
 */

import type { ReactNode } from 'react';
import { colors } from '../theme.js';
import type { EngineSubagentState, SubagentTreeNode } from '../../engine/types.js';
import type { SubagentDetailLevel } from '../../config/types.js';

/**
 * 완료 상태에 따른 서브에이전트의 상태 색상
 */
function getSubagentStatusColor(status: EngineSubagentState['status']): string {
  switch (status) {
    case 'completed':
      return colors.status.success;
    case 'error':
      return colors.status.error;
    case 'running':
      return colors.status.info;
    default:
      return colors.fg.muted;
  }
}

/**
 * 서브에이전트의 상태 표시기 심볼
 */
function getSubagentStatusIndicator(status: EngineSubagentState['status']): string {
  switch (status) {
    case 'completed':
      return '✓';
    case 'error':
      return '✗';
    case 'running':
      return '▶';
    default:
      return '○';
  }
}

/**
 * 사람이 읽기 쉬운 형식으로 지속 시간 포맷
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
 * SubagentSectionHeader 컴포넌트 Props
 */
interface SubagentSectionHeaderProps {
  /** 표시할 서브에이전트 상태 */
  subagent: EngineSubagentState;
  /** 이 섹션이 접혀 있는지 여부 */
  isCollapsed: boolean;
  /** 이 섹션이 현재 포커스/선택되어 있는지 여부 */
  isFocused: boolean;
  /** 섹션 토글 시 콜백 */
  onToggle?: () => void;
}

/**
 * 서브에이전트 섹션의 헤더 라인을 렌더링합니다.
 * 형식: [▼/▶] [상태] [서브에이전트: 타입] 설명 [지속 시간]
 */
function SubagentSectionHeader({
  subagent,
  isCollapsed,
  isFocused,
}: SubagentSectionHeaderProps): ReactNode {
  const statusColor = getSubagentStatusColor(subagent.status);
  const statusIndicator = getSubagentStatusIndicator(subagent.status);
  const collapseIndicator = isCollapsed ? '▶' : '▼';
  const durationStr = subagent.durationMs !== undefined ? ` [${formatDuration(subagent.durationMs)}]` : '';

  // 깊이에 따른 들여쓰기 (각 레벨당 2칸 추가)
  const indent = '  '.repeat(Math.max(0, subagent.depth - 1));

  return (
    <box
      style={{
        width: '100%',
        backgroundColor: isFocused ? colors.bg.highlight : 'transparent',
      }}
    >
      <text>
        <span fg={colors.fg.dim}>{indent}</span>
        <span fg={colors.accent.secondary}>{collapseIndicator} </span>
        <span fg={statusColor}>{statusIndicator} </span>
        <span fg={colors.accent.tertiary}>[서브에이전트: {subagent.type}]</span>
        <span fg={colors.fg.secondary}> {subagent.description}</span>
        <span fg={colors.fg.muted}>{durationStr}</span>
      </text>
    </box>
  );
}

/**
 * CollapsedSummary 컴포넌트 Props
 */
interface CollapsedSummaryProps {
  /** 서브에이전트 상태 */
  subagent: EngineSubagentState;
  /** 하위 서브에이전트 수 */
  childCount: number;
}

/**
 * 섹션이 접혀 있을 때 한 줄 요약을 렌더링합니다.
 */
function CollapsedSummary({ subagent, childCount }: CollapsedSummaryProps): ReactNode {
  const indent = '  '.repeat(Math.max(0, subagent.depth));
  const statusColor = getSubagentStatusColor(subagent.status);
  const statusText = subagent.status === 'running' ? '실행 중...' : subagent.status;
  const childText = childCount > 0 ? ` (${childCount}개 중첩)` : '';

  return (
    <box style={{ paddingLeft: 1 }}>
      <text>
        <span fg={colors.fg.dim}>{indent}</span>
        <span fg={statusColor}>{statusText}</span>
        <span fg={colors.fg.muted}>{childText}</span>
      </text>
    </box>
  );
}

/**
 * 단일 SubagentSection Props
 */
export interface SubagentSectionProps {
  /** 렌더링할 서브에이전트 트리 노드 */
  node: SubagentTreeNode;
  /** 접힌 서브에이전트 ID 집합 */
  collapsedSet: Set<string>;
  /** 현재 포커스된 서브에이전트 섹션 ID (키보드 탐색용) */
  focusedId?: string;
  /** 렌더링 상세 레벨 */
  detailLevel: SubagentDetailLevel;
  /** 섹션 토글이 필요할 때 콜백 */
  onToggle?: (id: string) => void;
}

/**
 * 하위 항목과 함께 단일 서브에이전트 섹션을 재귀적으로 렌더링합니다.
 */
export function SubagentSection({
  node,
  collapsedSet,
  focusedId,
  detailLevel,
  onToggle,
}: SubagentSectionProps): ReactNode {
  const { state: subagent, children } = node;
  const isCollapsed = collapsedSet.has(subagent.id);
  const isFocused = focusedId === subagent.id;

  // 'minimal' 레벨의 경우, 시작/완료 이벤트만 단일 라인으로 표시
  if (detailLevel === 'minimal') {
    return (
      <SubagentSectionHeader
        subagent={subagent}
        isCollapsed={true}
        isFocused={isFocused}
        onToggle={() => onToggle?.(subagent.id)}
      />
    );
  }

  // 'moderate'와 'full' 레벨의 경우, 접을 수 있는 섹션 표시
  return (
    <box style={{ flexDirection: 'column', width: '100%' }}>
      <SubagentSectionHeader
        subagent={subagent}
        isCollapsed={isCollapsed}
        isFocused={isFocused}
        onToggle={() => onToggle?.(subagent.id)}
      />

      {isCollapsed ? (
        <CollapsedSummary subagent={subagent} childCount={children.length} />
      ) : (
        <>
          {/* 확장 시 하위 항목 표시 */}
          {children.map((child) => (
            <SubagentSection
              key={child.state.id}
              node={child}
              collapsedSet={collapsedSet}
              focusedId={focusedId}
              detailLevel={detailLevel}
              onToggle={onToggle}
            />
          ))}
        </>
      )}
    </box>
  );
}

/**
 * SubagentSections 컨테이너 Props
 */
export interface SubagentSectionsProps {
  /** 루트 레벨 서브에이전트 트리 노드 배열 */
  tree: SubagentTreeNode[];
  /** 접힌 서브에이전트 ID 집합 */
  collapsedSet: Set<string>;
  /** 현재 포커스된 서브에이전트 섹션 ID */
  focusedId?: string;
  /** 렌더링 상세 레벨 */
  detailLevel: SubagentDetailLevel;
  /** 섹션 토글 시 콜백 */
  onToggle?: (id: string) => void;
}

/**
 * 트리에서 모든 서브에이전트 섹션을 렌더링합니다.
 * 서브에이전트 출력 렌더링의 메인 진입점입니다.
 */
export function SubagentSections({
  tree,
  collapsedSet,
  focusedId,
  detailLevel,
  onToggle,
}: SubagentSectionsProps): ReactNode {
  if (tree.length === 0) {
    return null;
  }

  return (
    <box style={{ flexDirection: 'column', width: '100%' }}>
      {tree.map((node) => (
        <SubagentSection
          key={node.state.id}
          node={node}
          collapsedSet={collapsedSet}
          focusedId={focusedId}
          detailLevel={detailLevel}
          onToggle={onToggle}
        />
      ))}
    </box>
  );
}

/**
 * 완료/오류 서브에이전트의 끝 마커 컴포넌트.
 * 표시: [들여쓰기][상태] 서브에이전트 완료 [지속 시간]
 */
export function SubagentEndMarker({
  subagent,
}: {
  subagent: EngineSubagentState;
}): ReactNode {
  if (subagent.status === 'running') {
    return null;
  }

  const statusColor = getSubagentStatusColor(subagent.status);
  const statusText = subagent.status === 'completed' ? '완료' : '실패';
  const durationStr = formatDuration(subagent.durationMs);
  const indent = '  '.repeat(Math.max(0, subagent.depth - 1));

  return (
    <box style={{ width: '100%' }}>
      <text>
        <span fg={colors.fg.dim}>{indent}</span>
        <span fg={colors.accent.secondary}>└─</span>
        <span fg={statusColor}> {statusText}</span>
        {durationStr && <span fg={colors.fg.muted}> ({durationStr})</span>}
      </text>
    </box>
  );
}
