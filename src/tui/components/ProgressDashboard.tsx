/**
 * ABOUTME: Ralph TUI용 진행 대시보드 컴포넌트.
 * 실행 상태, 현재 작업 정보, 에이전트/트래커 설정을 표시합니다.
 * 엔진 상태를 명확하게 보여주기 위한 상세 활동 정보를 표시합니다.
 */

import type { ReactNode } from 'react';
import { colors, statusIndicators, layout, type RalphStatus } from '../theme.js';
import type { SandboxConfig, SandboxMode } from '../../config/types.js';

/**
 * ProgressDashboard 컴포넌트 Props
 */
/**
 * 표시용 Git 저장소 정보
 */
export interface GitInfo {
  repoName?: string;
  branch?: string;
  isDirty?: boolean;
  commitHash?: string;
}

export interface ProgressDashboardProps {
  /** 현재 Ralph 실행 상태 */
  status: RalphStatus;
  /** 사용 중인 에이전트 이름 */
  agentName: string;
  /** 사용 중인 모델 (provider/model 형식) */
  currentModel?: string;
  /** 사용 중인 트래커 이름 */
  trackerName: string;
  /** 에픽 또는 프로젝트 이름 */
  epicName?: string;
  /** 작업 중인 현재 작업 ID (있는 경우) */
  currentTaskId?: string;
  /** 작업 중인 현재 작업 제목 (있는 경우) */
  currentTaskTitle?: string;
  /** 샌드박스 설정 (샌드박싱이 활성화된 경우) */
  sandboxConfig?: SandboxConfig;
  /** 해석된 샌드박스 모드 (모드가 'auto'일 때 실제로 무엇으로 해석되었는지 표시) */
  resolvedSandboxMode?: Exclude<SandboxMode, 'auto'>;
  /** 원격 인스턴스 정보 (원격 보기 시) */
  remoteInfo?: {
    name: string;
    host: string;
    port: number;
  };
  /** 자동 커밋 활성화 여부 */
  autoCommit?: boolean;
  /** Git 저장소 정보 */
  gitInfo?: GitInfo;
}

/**
 * 주어진 너비에 맞게 텍스트를 자르고 필요시 말줄임표 추가
 */
function truncateText(text: string, maxWidth: number): string {
  if (text.length <= maxWidth) return text;
  if (maxWidth <= 3) return text.slice(0, maxWidth);
  return text.slice(0, maxWidth - 1) + '…';
}

/**
 * 설정에서 샌드박스 표시 정보 가져오기
 * 항상 활성화/비활성화 상태를 나타내는 아이콘과 함께 표시 값 반환
 */
function getSandboxDisplay(
  sandboxConfig?: SandboxConfig,
  resolvedSandboxMode?: Exclude<SandboxMode, 'auto'>
): { enabled: boolean; icon: string; text: string } {
  const isEnabled = sandboxConfig?.enabled && sandboxConfig.mode !== 'off';

  if (!isEnabled) {
    return { enabled: false, icon: '🔓', text: '꺼짐' };
  }

  const mode = sandboxConfig.mode ?? 'auto';
  // 모드가 'auto'일 때 해석된 모드 표시 (예: "auto (bwrap)")
  const modeDisplay = mode === 'auto' && resolvedSandboxMode
    ? `auto (${resolvedSandboxMode})`
    : mode;
  const networkSuffix = sandboxConfig.network === false ? ' (네트워크 차단)' : '';
  return { enabled: true, icon: '🔒', text: `${modeDisplay}${networkSuffix}` };
}

/**
 * 상세 활동 정보가 포함된 상태 표시 설정 가져오기
 */
function getStatusDisplay(
  status: RalphStatus,
  currentTaskId?: string
): { label: string; color: string; indicator: string } {
  switch (status) {
    case 'ready':
      return { label: '준비 완료 - Enter 또는 s를 눌러 시작', color: colors.status.info, indicator: statusIndicators.ready };
    case 'running':
      return { label: '실행 중', color: colors.status.success, indicator: statusIndicators.running };
    case 'selecting':
      return { label: '다음 작업 선택 중...', color: colors.status.info, indicator: statusIndicators.selecting };
    case 'executing': {
      const taskLabel = currentTaskId ? ` (${currentTaskId})` : '';
      return { label: `에이전트 실행 중${taskLabel}`, color: colors.status.success, indicator: statusIndicators.executing };
    }
    case 'pausing':
      return { label: '현재 반복 후 일시정지 중...', color: colors.status.warning, indicator: statusIndicators.pausing };
    case 'paused':
      return { label: '일시정지됨 - p를 눌러 재개', color: colors.status.warning, indicator: statusIndicators.paused };
    case 'stopped':
      return { label: '중지됨', color: colors.fg.muted, indicator: statusIndicators.stopped };
    case 'complete':
      return { label: '모든 작업 완료!', color: colors.status.success, indicator: statusIndicators.complete };
    case 'idle':
      return { label: '더 이상 사용 가능한 작업 없음', color: colors.fg.muted, indicator: statusIndicators.idle };
    case 'error':
      return { label: '실패 - 자세한 내용은 로그 확인', color: colors.status.error, indicator: statusIndicators.blocked };
  }
}

/**
 * 포괄적인 실행 상태를 보여주는 진행 대시보드 컴포넌트.
 * 엔진이 현재 무엇을 하고 있는지 명확하게 보여줍니다.
 */
export function ProgressDashboard({
  status,
  agentName,
  currentModel,
  trackerName,
  epicName,
  currentTaskId,
  currentTaskTitle,
  sandboxConfig,
  resolvedSandboxMode,
  remoteInfo,
  autoCommit,
  gitInfo,
}: ProgressDashboardProps): ReactNode {
  const statusDisplay = getStatusDisplay(status, currentTaskId);
  const sandboxDisplay = getSandboxDisplay(sandboxConfig, resolvedSandboxMode);

  // 표시용 git 정보 포맷
  const gitDisplay = gitInfo?.branch
    ? `${gitInfo.repoName ?? 'repo'}:${gitInfo.branch}${gitInfo.isDirty ? '*' : ''}`
    : null;

  // 실행 중일 때 현재 작업 제목 표시
  const taskDisplay = currentTaskTitle && (status === 'executing' || status === 'running')
    ? truncateText(currentTaskTitle, 50)
    : null;

  // 표시용 모델 정보 파싱
  const modelDisplay = currentModel
    ? (() => {
        const [provider, model] = currentModel.includes('/') ? currentModel.split('/') : ['', currentModel];
        return { provider, model, full: currentModel, display: provider ? `${provider}/${model}` : model };
      })()
    : null;

  return (
    <box
      style={{
        width: '100%',
        height: layout.progressDashboard.height,
        flexDirection: 'row',
        backgroundColor: colors.bg.secondary,
        padding: 1,
        border: true,
        borderColor: colors.border.normal,
        overflow: 'hidden',
      }}
    >
      {/* 왼쪽 열: 상태, 원격, 현재 작업 */}
      <box style={{ flexDirection: 'column', flexGrow: 1, flexShrink: 1, paddingRight: 2 }}>
        {/* 상태 라인 */}
        <box style={{ flexDirection: 'row', gap: 1 }}>
          <text>
            <span fg={statusDisplay.color}>{statusDisplay.indicator}</span>
            <span fg={statusDisplay.color}> {statusDisplay.label}</span>
          </text>
        </box>

        {/* 원격 정보 (원격 보기 시) */}
        {remoteInfo && (
          <box style={{ flexDirection: 'row' }}>
            <text fg={colors.accent.primary}>🌐 원격: </text>
            <text fg={colors.fg.primary}>{remoteInfo.name}</text>
            <text fg={colors.fg.dim}> ({remoteInfo.host}:{remoteInfo.port})</text>
          </box>
        )}

        {/* 에픽 이름 (있는 경우) */}
        {epicName && (
          <box style={{ flexDirection: 'row' }}>
            <text fg={colors.fg.muted}>에픽: </text>
            <text fg={colors.accent.primary}>{epicName}</text>
          </box>
        )}

        {/* 현재 작업 정보 - 실행 중일 때 표시 */}
        {taskDisplay && (
          <box style={{ flexDirection: 'row', gap: 1 }}>
            <text fg={colors.fg.muted}>작업:</text>
            <text fg={colors.accent.tertiary}>{currentTaskId}</text>
            <text fg={colors.fg.dim}>-</text>
            <text fg={colors.fg.primary}>{taskDisplay}</text>
          </box>
        )}
      </box>

      {/* 오른쪽 열: 설정 항목 스택 */}
      <box style={{ flexDirection: 'column', width: 45, flexShrink: 0 }}>
        {/* 1행: 에이전트와 모델 */}
        <box style={{ flexDirection: 'row' }}>
          <text fg={colors.fg.secondary}>에이전트: </text>
          <text fg={colors.accent.secondary}>{agentName}</text>
          {modelDisplay && (
            <>
              <text fg={colors.fg.muted}> · </text>
              <text fg={colors.accent.primary}>{modelDisplay.display}</text>
            </>
          )}
        </box>

        {/* 2행: 트래커 */}
        <box style={{ flexDirection: 'row' }}>
          <text fg={colors.fg.secondary}>트래커: </text>
          <text fg={colors.accent.tertiary}>{trackerName}</text>
        </box>

        {/* 3행: Git 브랜치 (별도 줄) */}
        <box style={{ flexDirection: 'row' }}>
          <text fg={colors.fg.secondary}>Git: </text>
          <text fg={gitInfo?.isDirty ? colors.status.warning : colors.accent.primary}>
            {gitDisplay ?? '저장소 아님'}
          </text>
        </box>

        {/* 4행: 샌드박스와 자동 커밋 */}
        <box style={{ flexDirection: 'row' }}>
          <text fg={sandboxDisplay.enabled ? colors.status.success : colors.status.warning}>
            {sandboxDisplay.icon}
          </text>
          <text fg={sandboxDisplay.enabled ? colors.status.info : colors.fg.muted}>
            {' '}{sandboxDisplay.text}
          </text>
          <text fg={colors.fg.muted}> · </text>
          <text fg={colors.fg.secondary}>커밋: </text>
          <text fg={autoCommit ? colors.status.success : colors.fg.muted}>
            {autoCommit ? '✓ 자동' : '✗ 수동'}
          </text>
        </box>
      </box>
    </box>
  );
}
