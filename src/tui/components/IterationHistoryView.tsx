/**
 * ABOUTME: Ralph TUI용 IterationHistoryView 컴포넌트.
 * 상태, 작업, 소요 시간, 결과, 서브에이전트 요약이 포함된 모든 반복 목록을 표시합니다.
 * Enter 키로 상세 정보로 드릴다운하는 키보드 탐색을 지원합니다.
 */

import type { ReactNode } from 'react';
import { colors, formatElapsedTime } from '../theme.js';
import type { IterationResult, IterationStatus } from '../../engine/types.js';
import type { SubagentTraceStats } from '../../logs/types.js';

/**
 * 표시 목적으로 'pending'을 포함하는 확장된 상태 타입
 * (대기 중인 반복은 아직 IterationResult가 없음)
 */
type DisplayIterationStatus = IterationStatus | 'pending';

/**
 * 반복에 대한 상태 표시기 심볼
 */
const iterationStatusIndicators: Record<DisplayIterationStatus, string> = {
  completed: '✓',
  running: '▶',
  pending: '○',
  failed: '✗',
  interrupted: '⊘',
  skipped: '⊖',
};

/**
 * 반복에 대한 상태 색상
 */
const iterationStatusColors: Record<DisplayIterationStatus, string> = {
  completed: colors.status.success,
  running: colors.accent.primary,
  pending: colors.fg.muted,
  failed: colors.status.error,
  interrupted: colors.status.warning,
  skipped: colors.fg.dim,
};

/**
 * 반복 결과의 표시 텍스트 가져오기
 */
function getOutcomeText(result: IterationResult, isRunning: boolean): string {
  if (isRunning) return '실행 중...';
  if (result.status === 'skipped') return '건너뜀';
  if (result.status === 'interrupted') return '중단됨';
  if (result.status === 'failed') return result.error || '실패';
  // 완료 - 작업 완료인지 반복 완료인지 표시
  if (result.promiseComplete) return '작업 완료';
  if (result.taskCompleted) return '성공';
  return '완료';
}

/**
 * 반복 행에 표시할 서브에이전트 요약 포맷.
 * 서브에이전트가 실패한 경우 개수와 실패 표시기를 보여줍니다.
 * 예: "3 서브에이전트", "5 서브에이전트 ✗1"
 */
function formatSubagentSummary(stats: SubagentTraceStats | undefined): string {
  if (!stats || stats.totalSubagents === 0) return '';

  const count = stats.totalSubagents;

  if (stats.failureCount > 0) {
    return `${count} 서브에이전트 ✗${stats.failureCount}`;
  }

  return `${count} 서브에이전트`;
}

/**
 * 밀리초 단위 소요 시간을 사람이 읽기 쉬운 형식으로 포맷
 */
function formatDuration(durationMs: number): string {
  const seconds = Math.floor(durationMs / 1000);
  return formatElapsedTime(seconds);
}

/**
 * 최대 너비에 맞게 텍스트 자르기
 */
function truncateText(text: string, maxWidth: number): string {
  if (text.length <= maxWidth) return text;
  if (maxWidth <= 3) return text.slice(0, maxWidth);
  return text.slice(0, maxWidth - 1) + '…';
}

/**
 * IterationHistoryView 컴포넌트 Props
 */
export interface IterationHistoryViewProps {
  /** 표시할 반복 결과 목록 */
  iterations: IterationResult[];
  /** 총 반복 수 ("1/10" 같은 표시용) */
  totalIterations: number;
  /** 현재 선택된 반복 인덱스 */
  selectedIndex: number;
  /** 현재 실행 중인 반복 번호 (실행 중이 아니면 0) */
  runningIteration: number;
  /** Enter를 눌러 반복 상세로 드릴다운할 때 콜백 */
  onIterationDrillDown?: (iteration: IterationResult) => void;
  /** 컴포넌트 너비 (자름 계산용) */
  width?: number;
  /** 요약 표시용 반복당 서브에이전트 추적 통계 (반복 번호로 키 지정) */
  subagentStats?: Map<number, SubagentTraceStats>;
}

/**
 * 단일 반복 행 컴포넌트
 */
function IterationRow({
  result,
  totalIterations,
  isSelected,
  isRunning,
  maxWidth,
  subagentStats,
}: {
  result: IterationResult;
  totalIterations: number;
  isSelected: boolean;
  isRunning: boolean;
  maxWidth: number;
  subagentStats?: SubagentTraceStats;
}): ReactNode {
  // 유효 표시 상태 결정 (현재 반복이면 'running'으로 오버라이드)
  const effectiveStatus: DisplayIterationStatus = isRunning ? 'running' : result.status;
  const statusIndicator = iterationStatusIndicators[effectiveStatus];
  const statusColor = iterationStatusColors[effectiveStatus];

  // 형식: "✓ 반복 1/10  task-id  3 서브에이전트  2분 30초  성공"
  const iterationLabel = `반복 ${result.iteration}/${totalIterations}`;
  const taskId = result.task.id;
  const duration = isRunning ? '...' : formatDuration(result.durationMs);
  const outcome = getOutcomeText(result, isRunning);
  const subagentSummary = formatSubagentSummary(subagentStats);
  const hasSubagentFailure = subagentStats && subagentStats.failureCount > 0;

  // 각 섹션의 너비 계산
  // 형식: [표시기(1)] [반복 라벨] [작업-id] [서브에이전트 요약] [소요 시간] [결과]
  // 일부 열은 고정 너비를 사용하고 작업 ID는 유연하게 설정
  const durationWidth = 8;
  const outcomeWidth = 14;
  const subagentWidth = subagentSummary ? Math.max(12, subagentSummary.length + 2) : 0;
  const iterationLabelWidth = iterationLabel.length;
  const fixedWidth = 1 + 1 + iterationLabelWidth + 2 + subagentWidth + durationWidth + 2 + outcomeWidth;
  const taskIdWidth = Math.max(8, maxWidth - fixedWidth);
  const truncatedTaskId = truncateText(taskId, taskIdWidth);

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
        <span fg={statusColor}>{statusIndicator}</span>
        <span fg={isSelected ? colors.fg.primary : colors.fg.secondary}> {iterationLabel}</span>
        <span fg={colors.fg.muted}>  {truncatedTaskId.padEnd(taskIdWidth)}</span>
        {subagentSummary && (
          <span fg={hasSubagentFailure ? colors.status.error : colors.fg.dim}>
            {'  '}{subagentSummary}
          </span>
        )}
        <span fg={colors.fg.dim}>  {duration.padStart(durationWidth)}</span>
        <span fg={statusColor}>  {truncateText(outcome, outcomeWidth)}</span>
      </text>
    </box>
  );
}

/**
 * 모든 반복과 상태를 보여주는 IterationHistoryView 컴포넌트
 */
export function IterationHistoryView({
  iterations,
  totalIterations,
  selectedIndex,
  runningIteration,
  width = 80,
  subagentStats,
}: IterationHistoryViewProps): ReactNode {
  // 행 콘텐츠의 최대 너비 계산 (너비에서 패딩과 테두리 제외)
  const maxRowWidth = Math.max(40, width - 4);

  // 표시 목록 구성: 완료된 반복 + 대기 중인 플레이스홀더
  const displayItems: Array<{ type: 'result'; result: IterationResult } | { type: 'pending'; iteration: number }> = [];

  // 완료/실행 중인 반복 추가
  for (const result of iterations) {
    displayItems.push({ type: 'result', result });
  }

  // 남은 반복에 대한 대기 중 플레이스홀더 추가
  const completedCount = iterations.length;
  for (let i = completedCount + 1; i <= totalIterations; i++) {
    displayItems.push({ type: 'pending', iteration: i });
  }

  return (
    <box
      title="반복"
      style={{
        flexGrow: 1,
        flexShrink: 1,
        minWidth: 40,
        maxWidth: 80,
        flexDirection: 'column',
        backgroundColor: colors.bg.primary,
        border: true,
        borderColor: colors.border.normal,
      }}
    >
      <scrollbox
        style={{
          flexGrow: 1,
          width: '100%',
        }}
      >
        {displayItems.length === 0 ? (
          <box style={{ padding: 1 }}>
            <text fg={colors.fg.muted}>아직 반복 없음</text>
          </box>
        ) : (
          displayItems.map((item, index) => {
            if (item.type === 'result') {
              return (
                <IterationRow
                  key={`iteration-${item.result.iteration}`}
                  result={item.result}
                  totalIterations={totalIterations}
                  isSelected={index === selectedIndex}
                  isRunning={item.result.iteration === runningIteration}
                  maxWidth={maxRowWidth}
                  subagentStats={subagentStats?.get(item.result.iteration)}
                />
              );
            } else {
              // 대기 중 플레이스홀더
              const statusIndicator = iterationStatusIndicators.pending;
              const iterationLabel = `반복 ${item.iteration}/${totalIterations}`;

              return (
                <box
                  key={`pending-${item.iteration}`}
                  style={{
                    width: '100%',
                    flexDirection: 'row',
                    paddingLeft: 1,
                    paddingRight: 1,
                    backgroundColor: index === selectedIndex ? colors.bg.highlight : 'transparent',
                  }}
                >
                  <text>
                    <span fg={colors.fg.muted}>{statusIndicator}</span>
                    <span fg={colors.fg.dim}> {iterationLabel}</span>
                    <span fg={colors.fg.dim}>  (대기 중)</span>
                  </text>
                </box>
              );
            }
          })
        )}
      </scrollbox>
    </box>
  );
}
