/**
 * ABOUTME: 로컬 및 원격 인스턴스 간 탐색을 위한 탭 바 컴포넌트.
 * 연결 상태 표시기를 보여주고 키보드 탐색을 지원합니다.
 * US-5: 재연결 상태 표시기와 연결 메트릭 표시로 확장됨.
 * 첫 번째 탭은 항상 "로컬"이며, 원격 탭은 상태와 함께 별칭을 표시합니다.
 */

import type { ReactNode } from 'react';
import { colors } from '../theme.js';
import type { ConnectionStatus, InstanceTab } from '../../remote/client.js';

/**
 * TabBar 컴포넌트 Props
 */
export interface TabBarProps {
  /** 인스턴스 탭 목록 (로컬 먼저, 그 다음 원격) */
  tabs: InstanceTab[];

  /** 현재 선택된 탭 인덱스 */
  selectedIndex: number;
}

/**
 * 연결 상태 표시기 심볼
 * - connected: 채워진 원 (녹색)
 * - connecting: 반쯤 채워진 원 (노란색)
 * - reconnecting: 이중 화살표 (주황색, 재시도 진행 중)
 * - disconnected: 빈 원 (회색)
 */
const STATUS_INDICATORS: Record<ConnectionStatus, string> = {
  connected: '●',
  connecting: '◐',
  reconnecting: '⟳',
  disconnected: '○',
};

/**
 * 연결 상태에 따른 색상 가져오기
 */
function getStatusColor(status: ConnectionStatus): string {
  switch (status) {
    case 'connected':
      return colors.status.success;
    case 'connecting':
      return colors.status.warning;
    case 'reconnecting':
      return colors.status.warning; // 재연결 중에는 주황색/노란색
    case 'disconnected':
      return colors.fg.muted;
  }
}

/**
 * 연결 지속 시간을 컴팩트하고 사람이 읽기 쉬운 형식으로 포맷.
 */
function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes < 60) {
    return secs > 0 ? `${minutes}m${secs}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h${mins}m` : `${hours}h`;
}

/**
 * 단일 탭 컴포넌트
 */
function Tab({
  tab,
  isSelected,
  index,
}: {
  tab: InstanceTab;
  isSelected: boolean;
  index: number;
}): ReactNode {
  const statusIndicator = STATUS_INDICATORS[tab.status];
  const statusColor = getStatusColor(tab.status);

  // 빠른 탐색을 위한 숫자 키 힌트 (1-9) 표시
  const keyHint = index < 9 ? `${index + 1}` : '';

  // borderRight가 지원되지 않아 시각적 구분자 사용
  const separator = '│';

  // 선택된 탭은 강조를 위해 다른 스타일 사용
  const labelColor = isSelected ? colors.fg.primary : colors.fg.secondary;

  // 연결된 원격 탭의 메트릭 문자열 구성 (US-5)
  let metricsStr = '';
  if (!tab.isLocal && tab.status === 'connected' && tab.metrics && isSelected) {
    const parts: string[] = [];
    if (tab.metrics.latencyMs !== null) {
      parts.push(`${tab.metrics.latencyMs}ms`);
    }
    if (tab.metrics.connectionDurationSecs > 0) {
      parts.push(formatDuration(tab.metrics.connectionDurationSecs));
    }
    if (parts.length > 0) {
      metricsStr = ` (${parts.join(' ')})`;
    }
  }

  return (
    <box
      style={{
        flexDirection: 'row',
        paddingLeft: 1,
        paddingRight: 0,
        backgroundColor: isSelected ? colors.bg.tertiary : colors.bg.secondary,
      }}
    >
      <text>
        {/* 상태 표시기 (로컬은 항상 연결되어 있으므로 생략) */}
        {!tab.isLocal && (
          <span fg={statusColor}>{statusIndicator} </span>
        )}

        {/* 탭 라벨 - 선택 시 강조를 위해 대문자 사용 */}
        <span fg={labelColor}>
          {isSelected ? tab.label.toUpperCase() : tab.label}
        </span>

        {/* 선택된 연결된 원격 탭의 연결 메트릭 (US-5) */}
        {metricsStr && (
          <span fg={colors.fg.dim}>{metricsStr}</span>
        )}

        {/* 키 힌트 */}
        {keyHint && (
          <span fg={colors.fg.dim}> [{keyHint}]</span>
        )}

        {/* 구분자 */}
        <span fg={colors.border.muted}> {separator}</span>
      </text>
    </box>
  );
}

/**
 * 원격 추가 버튼 (미묘한 "+" 어포던스)
 */
function AddRemoteButton(): ReactNode {
  return (
    <box
      style={{
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      <text fg={colors.fg.dim}>+</text>
    </box>
  );
}

/**
 * 인스턴스 간 탐색을 위한 탭 바.
 * TUI 상단에 연결 상태와 함께 탭을 표시합니다.
 *
 * 참고: 탭 선택은 부모 컴포넌트에서 키보드 단축키로 처리되며,
 * 클릭 핸들러가 아닙니다 (터미널 UI 라이브러리가 포인터 이벤트를 지원하지 않음).
 *
 * 키바인딩 (부모에서 처리):
 * - 숫자 키 (1-9): 탭으로 이동
 * - Ctrl+Tab / ]: 다음 탭
 * - Ctrl+Shift+Tab / [: 이전 탭
 */
export function TabBar({
  tabs,
  selectedIndex,
}: TabBarProps): ReactNode {
  return (
    <box
      style={{
        width: '100%',
        height: 1,
        flexDirection: 'row',
        backgroundColor: colors.bg.secondary,
      }}
    >
      {/* 탭 목록 */}
      <box
        style={{
          flexDirection: 'row',
          flexGrow: 1,
        }}
      >
        {tabs.map((tab, index) => (
          <Tab
            key={tab.id}
            tab={tab}
            isSelected={index === selectedIndex}
            index={index}
          />
        ))}
      </box>

      {/* 원격 추가 버튼 */}
      <AddRemoteButton />
    </box>
  );
}
