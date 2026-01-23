/**
 * ABOUTME: Ralph TUI용 컴팩트 헤더 컴포넌트.
 * 필수 정보만 표시: 상태 표시기, 현재 작업 (실행 중일 때), 진행률 (X/Y), 경과 시간.
 * 또한 활성 에이전트 이름과 폴백 표시기 및 레이트 리밋 상태를 표시합니다.
 * 최소한의 수직 공간으로 현재 상태를 명확하게 보여주도록 설계되었습니다.
 */

import type { ReactNode } from 'react';
import { colors, statusIndicators, formatElapsedTime, layout, type RalphStatus } from '../theme.js';
import type { HeaderProps } from '../types.js';

/** 레이트 리밋 표시기 아이콘 */
const RATE_LIMIT_ICON = '⏳';

/** 샌드박스 표시기 아이콘 */
const SANDBOX_ICON = '🔒';

/** 원격 표시기 아이콘 */
const REMOTE_ICON = '🌐';

/**
 * 주어진 너비에 맞게 텍스트를 자르고 필요시 말줄임표 추가
 */
function truncateText(text: string, maxWidth: number): string {
  if (text.length <= maxWidth) return text;
  if (maxWidth <= 3) return text.slice(0, maxWidth);
  return text.slice(0, maxWidth - 1) + '…';
}

/**
 * 현재 Ralph 상태에 대한 컴팩트 상태 표시를 가져옵니다.
 * 컴팩트 헤더에 최적화된 짧고 스캔하기 쉬운 라벨을 반환합니다.
 */
function getStatusDisplay(status: RalphStatus): { indicator: string; color: string; label: string } {
  switch (status) {
    case 'ready':
      return { indicator: statusIndicators.ready, color: colors.status.info, label: '준비' };
    case 'running':
      return { indicator: statusIndicators.running, color: colors.status.success, label: '실행 중' };
    case 'selecting':
      return { indicator: statusIndicators.selecting, color: colors.status.info, label: '선택 중' };
    case 'executing':
      return { indicator: statusIndicators.executing, color: colors.status.success, label: '실행 중' };
    case 'pausing':
      return { indicator: statusIndicators.pausing, color: colors.status.warning, label: '일시정지 중' };
    case 'paused':
      return { indicator: statusIndicators.paused, color: colors.status.warning, label: '일시정지' };
    case 'stopped':
      return { indicator: statusIndicators.stopped, color: colors.fg.muted, label: '중지' };
    case 'complete':
      return { indicator: statusIndicators.complete, color: colors.status.success, label: '완료' };
    case 'idle':
      return { indicator: statusIndicators.idle, color: colors.fg.muted, label: '유휴' };
    case 'error':
      return { indicator: statusIndicators.blocked, color: colors.status.error, label: '오류' };
  }
}

/**
 * 헤더 표시용 컴팩트 미니 진행 바
 */
function MiniProgressBar({
  completed,
  total,
  width,
}: {
  completed: number;
  total: number;
  width: number;
}): ReactNode {
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  const filledWidth = Math.floor((percentage / 100) * width);
  const emptyWidth = width - filledWidth;

  const filledBar = '▓'.repeat(filledWidth);
  const emptyBar = '░'.repeat(emptyWidth);

  return (
    <text>
      <span fg={colors.status.success}>{filledBar}</span>
      <span fg={colors.fg.dim}>{emptyBar}</span>
    </text>
  );
}

/**
 * 활성 에이전트의 표시 이름과 스타일링을 가져옵니다.
 * 폴백 에이전트일 때 다른 색상으로 폴백 표시기를 보여줍니다.
 */
function getAgentDisplay(
  agentName: string | undefined,
  activeAgentState: HeaderProps['activeAgentState'],
  rateLimitState: HeaderProps['rateLimitState']
): { displayName: string; color: string; showRateLimitIcon: boolean; statusLine: string | null } {
  // 가능하면 엔진 상태의 활성 에이전트 사용, 아니면 설정으로 폴백
  const activeAgent = activeAgentState?.plugin ?? agentName;
  const isOnFallback = activeAgentState?.reason === 'fallback';
  const isPrimaryRateLimited = rateLimitState?.limitedAt !== undefined;
  const primaryAgent = rateLimitState?.primaryAgent;

  if (!activeAgent) {
    return { displayName: '', color: colors.accent.secondary, showRateLimitIcon: false, statusLine: null };
  }

  if (isOnFallback && isPrimaryRateLimited && primaryAgent) {
    // 레이트 리밋으로 인해 폴백 에이전트 사용 중 - 표시기와 상태 메시지 표시
    return {
      displayName: `${activeAgent} (폴백)`,
      color: colors.status.warning,
      showRateLimitIcon: true,
      statusLine: `주 에이전트 (${primaryAgent}) 레이트 리밋, 폴백 사용 중`,
    };
  }

  if (isOnFallback) {
    // 다른 이유로 폴백 에이전트 사용 중
    return {
      displayName: `${activeAgent} (폴백)`,
      color: colors.status.warning,
      showRateLimitIcon: false,
      statusLine: null,
    };
  }

  return {
    displayName: activeAgent,
    color: colors.accent.secondary,
    showRateLimitIcon: false,
    statusLine: null,
  };
}

/**
 * 샌드박스 표시 문자열을 가져옵니다.
 * 샌드박스가 비활성화되면 null 반환, 그렇지 않으면 모드와 선택적 (no-net) 접미사 반환.
 */
function getSandboxDisplay(
  sandboxConfig: HeaderProps['sandboxConfig']
): string | null {
  if (!sandboxConfig?.enabled) {
    return null;
  }

  const mode = sandboxConfig.mode ?? 'auto';
  if (mode === 'off') {
    return null;
  }

  const networkSuffix = sandboxConfig.network === false ? ' (네트워크 차단)' : '';
  return `${mode}${networkSuffix}`;
}

/**
 * 필수 정보를 보여주는 컴팩트 헤더 컴포넌트:
 * - 상태 표시기와 라벨
 * - 현재 작업 (실행 중일 때)
 * - 에이전트 및 트래커 플러그인 이름 (설정 가시성을 위해)
 * - 사용 중인 모델 (provider/model 형식과 로고)
 * - 샌드박스 상태 (활성화 시 모드 + 네트워크 상태)
 * - 폴백 에이전트 사용 시 폴백 표시기
 * - 주 에이전트 제한 시 레이트 리밋 아이콘
 * - 주 에이전트 레이트 리밋 시 상태 라인 (폴백 설명)
 * - 진행률 (X/Y 작업)과 미니 바
 * - 경과 시간
 */
export function Header({
  status,
  elapsedTime,
  currentTaskId,
  currentTaskTitle,
  completedTasks = 0,
  totalTasks = 0,
  agentName,
  trackerName,
  activeAgentState,
  rateLimitState,
  currentIteration,
  maxIterations,
  currentModel,
  sandboxConfig,
  remoteInfo,
}: HeaderProps): ReactNode {
  const statusDisplay = getStatusDisplay(status);
  const formattedTime = formatElapsedTime(elapsedTime);

  // 폴백 상태와 상태 라인 메시지를 포함한 에이전트 표시 정보 가져오기
  const agentDisplay = getAgentDisplay(agentName, activeAgentState, rateLimitState);

  // 표시용 모델 정보 파싱
  const modelDisplay = currentModel
    ? (() => {
        const [provider, model] = currentModel.includes('/') ? currentModel.split('/') : ['', currentModel];
        return { provider, model, full: currentModel, display: provider ? `${provider}/${model}` : model };
      })()
    : null;

  // 샌드박스 표시 정보 가져오기 (비활성화 시 null)
  const sandboxDisplay = getSandboxDisplay(sandboxConfig);

  // 실행 중일 때 축약된 작업 제목 표시 (최대 40자), 작업 ID로 폴백
  const isActive = status === 'executing' || status === 'running';
  const taskDisplay = isActive
    ? currentTaskTitle
      ? truncateText(currentTaskTitle, 40)
      : currentTaskId
        ? truncateText(currentTaskId, 20)
        : null
    : null;

  // 헤더 높이 계산: 일반적으로 1행, 상태 라인 있을 때 2행
  const headerHeight = agentDisplay.statusLine ? 2 : layout.header.height;

  return (
    <box
      style={{
        width: '100%',
        height: headerHeight,
        flexDirection: 'column',
        backgroundColor: colors.bg.secondary,
      }}
    >
      {/* 메인 헤더 행 */}
      <box
        style={{
          width: '100%',
          height: 1,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingLeft: 1,
          paddingRight: 1,
        }}
      >
        {/* 왼쪽 섹션: 원격 표시기 (원격 보기 시) + 상태 표시기 + 라벨 + 선택적 현재 작업 */}
        <box style={{ flexDirection: 'row', gap: 1, flexShrink: 1 }}>
          {remoteInfo && (
            <text>
              <span fg={colors.accent.primary}>{REMOTE_ICON} {remoteInfo.name}</span>
              <span fg={colors.fg.dim}> ({remoteInfo.host}:{remoteInfo.port})</span>
              <span fg={colors.fg.dim}> │ </span>
            </text>
          )}
          <text>
            <span fg={statusDisplay.color}>{statusDisplay.indicator}</span>
            <span fg={statusDisplay.color}> {statusDisplay.label}</span>
          </text>
          {taskDisplay && (
            <text>
              <span fg={colors.fg.muted}> → </span>
              <span fg={colors.accent.tertiary}>{taskDisplay}</span>
            </text>
          )}
        </box>

        {/* 오른쪽 섹션: 에이전트/트래커 + 모델 + 샌드박스 + 진행률 (X/Y)과 미니 바 + 경과 시간 */}
        <box style={{ flexDirection: 'row', gap: 2, alignItems: 'center' }}>
          {/* 에이전트, 모델, 트래커, 샌드박스 표시기 */}
          {(agentDisplay.displayName || trackerName || modelDisplay || sandboxDisplay) && (
            <text fg={colors.fg.muted}>
              {agentDisplay.showRateLimitIcon && (
                <span fg={colors.status.warning}>{RATE_LIMIT_ICON} </span>
              )}
              {agentDisplay.displayName && (
                <span fg={agentDisplay.color}>{agentDisplay.displayName}</span>
              )}
              {agentDisplay.displayName && (trackerName || modelDisplay || sandboxDisplay) && <span fg={colors.fg.dim}> | </span>}
              {modelDisplay && (
                <span fg={colors.accent.primary}>{modelDisplay.display}</span>
              )}
              {(agentDisplay.displayName || modelDisplay) && (trackerName || sandboxDisplay) && <span fg={colors.fg.dim}> | </span>}
              {trackerName && <span fg={colors.accent.tertiary}>{trackerName}</span>}
              {trackerName && sandboxDisplay && <span fg={colors.fg.dim}> | </span>}
              {sandboxDisplay && (
                <span fg={colors.status.info}>{SANDBOX_ICON} {sandboxDisplay}</span>
              )}
            </text>
          )}
          <box style={{ flexDirection: 'row', gap: 1, alignItems: 'center' }}>
            <MiniProgressBar completed={completedTasks} total={totalTasks} width={8} />
            <text fg={colors.fg.secondary}>
              {completedTasks}/{totalTasks}
            </text>
          </box>
          {/* 반복 카운터 - 현재/최대 또는 무제한은 현재/∞ 표시 */}
          {currentIteration !== undefined && maxIterations !== undefined && (
            <text fg={colors.fg.muted}>
              <span fg={colors.fg.secondary}>
                [{currentIteration}/{maxIterations === 0 ? '∞' : maxIterations}]
              </span>
            </text>
          )}
          <text fg={colors.fg.muted}>⏱</text>
          <text fg={colors.fg.secondary}>{formattedTime}</text>
        </box>
      </box>

      {/* 상태 라인 행 - 주 에이전트 레이트 리밋 시 표시 */}
      {agentDisplay.statusLine && (
        <box
          style={{
            width: '100%',
            height: 1,
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
            paddingLeft: 1,
            paddingRight: 1,
          }}
        >
          <text fg={colors.status.warning}>
            <span>{RATE_LIMIT_ICON} </span>
            <span>{agentDisplay.statusLine}</span>
          </text>
        </box>
      )}
    </box>
  );
}
