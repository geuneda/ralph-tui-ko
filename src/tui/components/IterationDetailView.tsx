/**
 * ABOUTME: Ralph TUI용 IterationDetailView 컴포넌트.
 * 상태, 타이밍, 이벤트 타임라인, 서브에이전트 트리,
 * 문법 강조가 적용된 스크롤 가능한 에이전트 출력을 포함한 단일 반복의 상세 정보를 표시합니다.
 */

import type { ReactNode } from 'react';
import { useState } from 'react';
import { colors, formatElapsedTime } from '../theme.js';
import type { IterationResult, IterationStatus, EngineSubagentStatus } from '../../engine/types.js';
import type { SubagentHierarchyNode, SubagentTraceStats } from '../../logs/types.js';
import type { SandboxConfig, SandboxMode } from '../../config/types.js';

/**
 * 반복 타임라인의 이벤트
 */
interface TimelineEvent {
  /** 이벤트 타임스탬프 */
  timestamp: string;
  /** 표시용 이벤트 타입 */
  type: 'started' | 'agent_running' | 'task_completed' | 'completed' | 'failed' | 'skipped' | 'interrupted';
  /** 사람이 읽기 쉬운 설명 */
  description: string;
}

/**
 * 저장된 로그 메타데이터의 과거 실행 컨텍스트.
 * 완료된 반복을 볼 때 현재 설정이 아닌 실행 중 실제로 사용된 것을 표시하는 데 사용됩니다.
 */
export interface HistoricExecutionContext {
  /** 실행 중 사용된 에이전트 플러그인 */
  agentPlugin?: string;
  /** 실행 중 사용된 모델 */
  model?: string;
  /** 실행 중 사용된 샌드박스 모드 */
  sandboxMode?: string;
  /** 설정된 모드가 'auto'일 때 확인된 샌드박스 모드 */
  resolvedSandboxMode?: string;
  /** 샌드박스에서 네트워크 액세스 활성화 여부 */
  sandboxNetwork?: boolean;
}

/**
 * IterationDetailView 컴포넌트 Props
 */
export interface IterationDetailViewProps {
  /** 표시할 반복 결과 */
  iteration: IterationResult;
  /** 컨텍스트를 위한 전체 반복 수 (예: "반복 3 / 10") */
  totalIterations: number;
  /** 저장된 파일 링크용 출력 디렉토리 */
  outputDir?: string;
  /** 현재 작업 디렉토리 */
  cwd?: string;
  /** Esc를 눌러 목록 뷰로 돌아갈 때 콜백 */
  onBack?: () => void;
  /** 이 반복의 서브에이전트 계층 트리 (지연 로드) */
  subagentTree?: SubagentHierarchyNode[];
  /** 이 반복의 서브에이전트 통계 */
  subagentStats?: SubagentTraceStats;
  /** 서브에이전트 트레이스 데이터 로딩 상태 */
  subagentTraceLoading?: boolean;
  /** 샌드박스 설정 (샌드박싱 활성화 시) - 실행 중 반복에 사용 */
  sandboxConfig?: SandboxConfig;
  /** 확인된 샌드박스 모드 (모드가 'auto'일 때 확인된 값 표시) - 실행 중 반복에 사용 */
  resolvedSandboxMode?: Exclude<SandboxMode, 'auto'>;
  /** 저장된 로그의 과거 실행 컨텍스트 - 완료된 반복에 사용 */
  historicContext?: HistoricExecutionContext;
}

/**
 * 반복의 상태 표시기 심볼
 */
const statusIndicators: Record<IterationStatus, string> = {
  completed: '✓',
  running: '▶',
  failed: '✗',
  interrupted: '⊘',
  skipped: '⊖',
};

/**
 * 반복의 상태 색상
 */
const statusColors: Record<IterationStatus, string> = {
  completed: colors.status.success,
  running: colors.accent.primary,
  failed: colors.status.error,
  interrupted: colors.status.warning,
  skipped: colors.fg.dim,
};

/**
 * 표시용 상태 라벨
 */
const statusLabels: Record<IterationStatus, string> = {
  completed: '완료',
  running: '실행 중',
  failed: '실패',
  interrupted: '중단됨',
  skipped: '건너뜀',
};

/**
 * 표시용 ISO 타임스탬프 포맷
 */
function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/**
 * 반복 결과에서 타임라인 이벤트 구성
 */
function buildTimeline(result: IterationResult): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  // 시작 이벤트
  events.push({
    timestamp: result.startedAt,
    type: 'started',
    description: `${result.task.id} 작업 시작`,
  });

  // 에이전트 실행 이벤트 (합성 - 에이전트 실행 단계 표현)
  if (result.agentResult) {
    events.push({
      timestamp: result.startedAt,
      type: 'agent_running',
      description: '에이전트 프롬프트 실행 중',
    });
  }

  // 작업 완료 이벤트 (해당하는 경우)
  if (result.taskCompleted) {
    events.push({
      timestamp: result.endedAt,
      type: 'task_completed',
      description: result.promiseComplete
        ? '작업 완료 표시 (<promise>COMPLETE</promise> 감지)'
        : '작업 완료 표시',
    });
  }

  // 상태에 따른 종료 이벤트
  if (result.status === 'completed') {
    events.push({
      timestamp: result.endedAt,
      type: 'completed',
      description: '반복 성공적으로 완료',
    });
  } else if (result.status === 'failed') {
    events.push({
      timestamp: result.endedAt,
      type: 'failed',
      description: result.error ?? '반복 실패',
    });
  } else if (result.status === 'interrupted') {
    events.push({
      timestamp: result.endedAt,
      type: 'interrupted',
      description: '사용자에 의해 반복 중단',
    });
  } else if (result.status === 'skipped') {
    events.push({
      timestamp: result.endedAt,
      type: 'skipped',
      description: '반복 건너뜀',
    });
  }

  return events;
}

/**
 * 타임라인 이벤트 타입에 따른 색상 가져오기
 */
function getEventColor(type: TimelineEvent['type']): string {
  switch (type) {
    case 'started':
      return colors.accent.primary;
    case 'agent_running':
      return colors.accent.tertiary;
    case 'task_completed':
      return colors.status.success;
    case 'completed':
      return colors.status.success;
    case 'failed':
      return colors.status.error;
    case 'interrupted':
      return colors.status.warning;
    case 'skipped':
      return colors.fg.muted;
    default:
      return colors.fg.secondary;
  }
}

/**
 * 타임라인 이벤트 타입에 따른 심볼 가져오기
 */
function getEventSymbol(type: TimelineEvent['type']): string {
  switch (type) {
    case 'started':
      return '▶';
    case 'agent_running':
      return '⚙';
    case 'task_completed':
      return '✓';
    case 'completed':
      return '✓';
    case 'failed':
      return '✗';
    case 'interrupted':
      return '⊘';
    case 'skipped':
      return '⊖';
    default:
      return '•';
  }
}

/**
 * 일관된 스타일링을 위한 섹션 헤더 컴포넌트
 */
function SectionHeader({ title }: { title: string }): ReactNode {
  return (
    <box style={{ marginBottom: 1 }}>
      <text fg={colors.accent.primary}>{title}</text>
    </box>
  );
}

/**
 * 라벨/값 쌍을 위한 메타데이터 행 컴포넌트
 */
function MetadataRow({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string | ReactNode;
  valueColor?: string;
}): ReactNode {
  return (
    <box style={{ flexDirection: 'row', marginBottom: 0 }}>
      <text fg={colors.fg.muted}>{label}: </text>
      {typeof value === 'string' ? (
        <text fg={valueColor ?? colors.fg.secondary}>{value}</text>
      ) : (
        value
      )}
    </box>
  );
}

/**
 * 라인이 코드 블록의 시작인지 확인
 */
function isCodeBlockStart(line: string): { language: string } | null {
  const match = line.match(/^```(\w*)$/);
  if (match) {
    return { language: match[1] || 'text' };
  }
  return null;
}

/**
 * 라인이 코드 블록의 끝인지 확인
 */
function isCodeBlockEnd(line: string): boolean {
  return line === '```';
}

/**
 * 코드 블록에 문법 강조를 적용하여 에이전트 출력 렌더링
 * 코드와 산문 콘텐츠를 시각적으로 구분합니다
 */
function renderOutputWithHighlighting(output: string): ReactNode[] {
  const lines = output.split('\n');
  const elements: ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockLanguage = '';
  let codeBlockLines: string[] = [];
  let blockIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!inCodeBlock) {
      const codeStart = isCodeBlockStart(line);
      if (codeStart) {
        inCodeBlock = true;
        codeBlockLanguage = codeStart.language;
        codeBlockLines = [];
        continue;
      }

      // 일반 텍스트 라인
      elements.push(
        <text key={`line-${i}`} fg={colors.fg.secondary}>
          {line}
          {'\n'}
        </text>
      );
    } else {
      // 코드 블록 내부
      if (isCodeBlockEnd(line)) {
        // 누적된 코드 블록 렌더링
        const codeContent = codeBlockLines.join('\n');
        elements.push(
          <box
            key={`code-${blockIndex}`}
            style={{
              backgroundColor: colors.bg.tertiary,
              border: true,
              borderColor: colors.border.muted,
              marginTop: 1,
              marginBottom: 1,
              padding: 1,
            }}
          >
            {codeBlockLanguage && (
              <text fg={colors.fg.dim}>{`[${codeBlockLanguage}]`}{'\n'}</text>
            )}
            <text fg={colors.accent.tertiary}>{codeContent}</text>
          </box>
        );
        blockIndex++;
        inCodeBlock = false;
        codeBlockLanguage = '';
        codeBlockLines = [];
      } else {
        codeBlockLines.push(line);
      }
    }
  }

  // 출력 끝에 닫히지 않은 코드 블록 처리
  if (inCodeBlock && codeBlockLines.length > 0) {
    const codeContent = codeBlockLines.join('\n');
    elements.push(
      <box
        key={`code-${blockIndex}`}
        style={{
          backgroundColor: colors.bg.tertiary,
          border: true,
          borderColor: colors.border.muted,
          marginTop: 1,
          marginBottom: 1,
          padding: 1,
        }}
      >
        {codeBlockLanguage && (
          <text fg={colors.fg.dim}>{`[${codeBlockLanguage}]`}{'\n'}</text>
        )}
        <text fg={colors.accent.tertiary}>{codeContent}</text>
      </box>
    );
  }

  return elements;
}

/**
 * 반복의 출력 파일 경로 생성
 */
function getOutputFilePath(
  iteration: number,
  taskId: string,
  outputDir: string
): string {
  const filename = `iteration-${String(iteration).padStart(3, '0')}-${taskId}.md`;
  // 깔끔한 표시를 위해 상대 경로 표시
  return `${outputDir}/${filename}`;
}

/**
 * 완료 상태에 따른 서브에이전트 상태 아이콘 가져오기
 */
function getSubagentStatusIcon(status: EngineSubagentStatus): string {
  switch (status) {
    case 'running':
      return '◐';
    case 'completed':
      return '✓';
    case 'error':
      return '✗';
    default:
      return '○';
  }
}

/**
 * 완료 상태에 따른 서브에이전트 상태 색상 가져오기
 */
function getSubagentStatusColor(status: EngineSubagentStatus): string {
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
 * 서브에이전트용 사람이 읽기 쉬운 형식으로 지속 시간 포맷
 */
function formatSubagentDuration(durationMs?: number): string {
  if (durationMs === undefined) return '';
  if (durationMs < 1000) return `${durationMs}ms`;
  const seconds = Math.floor(durationMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * 확장 가능한 서브에이전트 행 Props
 */
interface SubagentTreeRowProps {
  node: SubagentHierarchyNode;
  depth: number;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
}

/**
 * 트리의 단일 확장 가능한 서브에이전트 행
 */
function SubagentTreeRowExpandable({
  node,
  depth,
  expandedIds,
  onToggle,
}: SubagentTreeRowProps): ReactNode {
  const { state } = node;
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedIds.has(state.id);
  const statusIcon = getSubagentStatusIcon(state.status);
  const statusColor = getSubagentStatusColor(state.status);

  // 깊이에 따른 들여쓰기
  const indent = '  '.repeat(depth);

  // 확장/축소 표시기
  const expandIcon = hasChildren ? (isExpanded ? '▼' : '▶') : ' ';

  // 에이전트 타입과 설명 포맷
  const agentType = `[${state.agentType}]`;
  const duration = state.durationMs !== undefined ? ` [${formatSubagentDuration(state.durationMs)}]` : '';

  return (
    <>
      <box
        style={{
          flexDirection: 'row',
          paddingLeft: 1,
          paddingRight: 1,
          marginBottom: 0,
        }}
      >
        <text>
          <span fg={colors.fg.dim}>{indent}</span>
          <span fg={hasChildren ? colors.fg.muted : colors.fg.dim}>{expandIcon}</span>
          <span fg={statusColor}> {statusIcon}</span>
          <span fg={colors.accent.tertiary}> {agentType}</span>
          <span fg={colors.fg.secondary}> {state.description}</span>
          {duration && <span fg={colors.fg.dim}>{duration}</span>}
        </text>
      </box>
      {/* 확장 시 자식 렌더링 */}
      {isExpanded &&
        node.children.map((child) => (
          <SubagentTreeRowExpandable
            key={child.state.id}
            node={child}
            depth={depth + 1}
            expandedIds={expandedIds}
            onToggle={onToggle}
          />
        ))}
    </>
  );
}

/**
 * 확장 가능한 서브에이전트 트리 섹션 컴포넌트
 */
function SubagentTreeSection({
  tree,
  stats,
  loading,
}: {
  tree?: SubagentHierarchyNode[];
  stats?: SubagentTraceStats;
  loading?: boolean;
}): ReactNode {
  // 확장된 서브에이전트 ID 추적 (시작 시 모두 확장)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    const ids = new Set<string>();
    // 가시성을 위해 처음에 모든 노드 확장
    function collectIds(nodes: SubagentHierarchyNode[]) {
      for (const node of nodes) {
        ids.add(node.state.id);
        collectIds(node.children);
      }
    }
    if (tree) collectIds(tree);
    return ids;
  });

  const handleToggle = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // 요약 라인 구성
  const summaryParts: string[] = [];
  if (stats) {
    summaryParts.push(`${stats.totalSubagents}개 서브에이전트`);
    if (stats.failureCount > 0) {
      summaryParts.push(`${stats.failureCount}개 실패`);
    }
    if (stats.maxDepth > 1) {
      summaryParts.push(`최대 깊이 ${stats.maxDepth}`);
    }
  }
  const summaryText = summaryParts.join(' · ');

  // 실패 표시기가 있는 제목 결정
  const hasFailures = stats && stats.failureCount > 0;
  const title = hasFailures ? '서브에이전트 활동 ✗' : '서브에이전트 활동';

  return (
    <box style={{ marginBottom: 2 }}>
      <SectionHeader title={title} />
      <box
        style={{
          padding: 1,
          backgroundColor: colors.bg.secondary,
          border: true,
          borderColor: hasFailures ? colors.status.error : colors.border.muted,
          flexDirection: 'column',
        }}
      >
        {loading ? (
          <text fg={colors.fg.dim}>서브에이전트 트레이스 로딩 중...</text>
        ) : !tree || tree.length === 0 ? (
          <text fg={colors.fg.muted}>이 반복 중 서브에이전트가 생성되지 않았습니다</text>
        ) : (
          <>
            {/* 요약 라인 */}
            {summaryText && (
              <box style={{ marginBottom: 1 }}>
                <text fg={hasFailures ? colors.status.error : colors.fg.muted}>
                  {summaryText}
                </text>
              </box>
            )}
            {/* 트리 뷰 */}
            {tree.map((node) => (
              <SubagentTreeRowExpandable
                key={node.state.id}
                node={node}
                depth={0}
                expandedIds={expandedIds}
                onToggle={handleToggle}
              />
            ))}
          </>
        )}
      </box>
    </box>
  );
}

/**
 * 포괄적인 반복 상세 정보를 표시하는 IterationDetailView 컴포넌트.
 * 참고: onBack은 API 완전성을 위해 제공되지만 탐색은 부모 컴포넌트에서
 * 키보드(Esc 키)로 처리됩니다.
 */
export function IterationDetailView({
  iteration,
  totalIterations,
  outputDir = '.ralph-output',
  cwd: _cwd = '.',
  onBack: _onBack,
  subagentTree,
  subagentStats,
  subagentTraceLoading,
  sandboxConfig,
  resolvedSandboxMode,
  historicContext,
}: IterationDetailViewProps): ReactNode {
  const statusColor = statusColors[iteration.status];
  const statusIndicator = statusIndicators[iteration.status];
  const timeline = buildTimeline(iteration);
  const durationSeconds = Math.floor(iteration.durationMs / 1000);

  // 에이전트 출력 가져오기
  const agentOutput = iteration.agentResult?.stdout ?? '';

  // 출력 파일 경로 생성
  const outputFilePath = getOutputFilePath(
    iteration.iteration,
    iteration.task.id,
    outputDir
  );

  return (
    <box
      title={`반복 상세 [Esc로 돌아가기]`}
      style={{
        width: '100%',
        height: '100%',
        flexDirection: 'column',
        backgroundColor: colors.bg.primary,
        border: true,
        borderColor: colors.border.active,
      }}
    >
      <scrollbox style={{ flexGrow: 1, padding: 1 }}>
        {/* 반복 헤더 */}
        <box style={{ marginBottom: 1 }}>
          <text>
            <span fg={statusColor}>{statusIndicator}</span>
            <span fg={colors.fg.primary}>
              {' '}반복 {iteration.iteration} / {totalIterations}
            </span>
          </text>
        </box>

        {/* 작업 정보 */}
        <box style={{ marginBottom: 2 }}>
          <text fg={colors.fg.muted}>작업: </text>
          <text fg={colors.accent.primary}>{iteration.task.id}</text>
          <text fg={colors.fg.secondary}> - {iteration.task.title}</text>
        </box>

        {/* 의존성 섹션 - 차단 관계 표시 */}
        {((iteration.task.dependsOn && iteration.task.dependsOn.length > 0) ||
          (iteration.task.blocks && iteration.task.blocks.length > 0)) && (
          <box style={{ marginBottom: 2 }}>
            <SectionHeader title="의존성" />
            <box
              style={{
                padding: 1,
                backgroundColor: colors.bg.secondary,
                border: true,
                borderColor: colors.border.muted,
                flexDirection: 'column',
              }}
            >
              {/* 이 작업을 차단하는 작업 (이 작업이 그들에게 의존함) */}
              {iteration.task.dependsOn && iteration.task.dependsOn.length > 0 && (
                <box style={{ marginBottom: iteration.task.blocks && iteration.task.blocks.length > 0 ? 1 : 0 }}>
                  <text fg={colors.status.warning}>차단 대상: </text>
                  <text fg={colors.fg.secondary}>{iteration.task.dependsOn.join(' · ')}</text>
                </box>
              )}

              {/* 이 작업이 차단하는 작업 (그들이 이 작업에 의존함) */}
              {iteration.task.blocks && iteration.task.blocks.length > 0 && (
                <box>
                  <text fg={colors.accent.tertiary}>차단함: </text>
                  <text fg={colors.fg.secondary}>{iteration.task.blocks.join(' · ')}</text>
                </box>
              )}
            </box>
          </box>
        )}

        {/* 메타데이터 섹션 */}
        <box style={{ marginBottom: 2 }}>
          <SectionHeader title="상세" />
          <box
            style={{
              padding: 1,
              backgroundColor: colors.bg.secondary,
              border: true,
              borderColor: colors.border.muted,
            }}
          >
            <MetadataRow
              label="상태"
              value={statusLabels[iteration.status]}
              valueColor={statusColor}
            />
            <MetadataRow
              label="시작 시간"
              value={formatTimestamp(iteration.startedAt)}
              valueColor={colors.fg.secondary}
            />
            <MetadataRow
              label="종료 시간"
              value={formatTimestamp(iteration.endedAt)}
              valueColor={colors.fg.secondary}
            />
            <MetadataRow
              label="소요 시간"
              value={formatElapsedTime(durationSeconds)}
              valueColor={colors.accent.primary}
            />
            {iteration.taskCompleted && (
              <MetadataRow
                label="작업 완료"
                value="예"
                valueColor={colors.status.success}
              />
            )}
            {iteration.promiseComplete && (
              <MetadataRow
                label="Promise 감지"
                value="예"
                valueColor={colors.status.success}
              />
            )}
            {iteration.error && (
              <MetadataRow
                label="오류"
                value={iteration.error}
                valueColor={colors.status.error}
              />
            )}
          </box>
        </box>

        {/* 실행 컨텍스트 섹션 - 사용된 에이전트와 모델 표시 */}
        {(historicContext?.agentPlugin || historicContext?.model) && (
          <box style={{ marginBottom: 2 }}>
            <SectionHeader title="실행 컨텍스트" />
            <box
              style={{
                padding: 1,
                backgroundColor: colors.bg.secondary,
                border: true,
                borderColor: colors.border.muted,
              }}
            >
              {historicContext.agentPlugin && (
                <MetadataRow
                  label="에이전트"
                  value={historicContext.agentPlugin}
                  valueColor={colors.accent.tertiary}
                />
              )}
              {historicContext.model && (
                <MetadataRow
                  label="모델"
                  value={historicContext.model}
                  valueColor={colors.accent.primary}
                />
              )}
            </box>
          </box>
        )}

        {/* 샌드박스 설정 섹션 - 샌드박싱 활성화 여부 표시 */}
        {/* 완료된 반복에는 과거 컨텍스트, 실행 중 반복에는 현재 설정 사용 */}
        {(historicContext?.sandboxMode && historicContext.sandboxMode !== 'off') ? (
          <box style={{ marginBottom: 2 }}>
            <SectionHeader title="샌드박스 설정" />
            <box
              style={{
                padding: 1,
                backgroundColor: colors.bg.secondary,
                border: true,
                borderColor: colors.status.info,
              }}
            >
              <MetadataRow
                label="모드"
                value={
                  historicContext.sandboxMode === 'auto' && historicContext.resolvedSandboxMode
                    ? `auto (${historicContext.resolvedSandboxMode})`
                    : historicContext.sandboxMode
                }
                valueColor={colors.status.info}
              />
              {historicContext.sandboxNetwork !== undefined && (
                <MetadataRow
                  label="네트워크 액세스"
                  value={historicContext.sandboxNetwork ? '활성화' : '비활성화'}
                  valueColor={historicContext.sandboxNetwork ? colors.status.success : colors.status.warning}
                />
              )}
            </box>
          </box>
        ) : (sandboxConfig?.enabled && sandboxConfig.mode !== 'off' && !historicContext) && (
          <box style={{ marginBottom: 2 }}>
            <SectionHeader title="샌드박스 설정" />
            <box
              style={{
                padding: 1,
                backgroundColor: colors.bg.secondary,
                border: true,
                borderColor: colors.status.info,
              }}
            >
              <MetadataRow
                label="모드"
                value={
                  (sandboxConfig.mode ?? 'auto') === 'auto' && resolvedSandboxMode
                    ? `auto (${resolvedSandboxMode})`
                    : sandboxConfig.mode ?? 'auto'
                }
                valueColor={colors.status.info}
              />
              <MetadataRow
                label="네트워크 액세스"
                value={sandboxConfig.network === false ? '비활성화' : '활성화'}
                valueColor={sandboxConfig.network === false ? colors.status.warning : colors.status.success}
              />
              {sandboxConfig.allowPaths && sandboxConfig.allowPaths.length > 0 && (
                <MetadataRow
                  label="쓰기 가능 경로"
                  value={sandboxConfig.allowPaths.join(', ')}
                  valueColor={colors.fg.secondary}
                />
              )}
              {sandboxConfig.readOnlyPaths && sandboxConfig.readOnlyPaths.length > 0 && (
                <MetadataRow
                  label="읽기 전용 경로"
                  value={sandboxConfig.readOnlyPaths.join(', ')}
                  valueColor={colors.fg.secondary}
                />
              )}
            </box>
          </box>
        )}

        {/* 타임라인 섹션 */}
        <box style={{ marginBottom: 2 }}>
          <SectionHeader title="이벤트 타임라인" />
          <box
            style={{
              padding: 1,
              backgroundColor: colors.bg.secondary,
              border: true,
              borderColor: colors.border.muted,
              flexDirection: 'column',
            }}
          >
            {timeline.map((event, index) => (
              <box key={index} style={{ flexDirection: 'row', marginBottom: index < timeline.length - 1 ? 1 : 0 }}>
                <text>
                  <span fg={colors.fg.dim}>{formatTimestamp(event.timestamp)}</span>
                  <span fg={getEventColor(event.type)}> {getEventSymbol(event.type)} </span>
                  <span fg={colors.fg.secondary}>{event.description}</span>
                </text>
              </box>
            ))}
          </box>
        </box>

        {/* 서브에이전트 활동 섹션 - 서브에이전트 생성 또는 로딩 시 표시 */}
        {(subagentTraceLoading || (subagentTree && subagentTree.length > 0) || subagentStats) && (
          <SubagentTreeSection
            tree={subagentTree}
            stats={subagentStats}
            loading={subagentTraceLoading}
          />
        )}

        {/* 출력 파일 링크 */}
        <box style={{ marginBottom: 2 }}>
          <SectionHeader title="저장된 출력" />
          <box
            style={{
              padding: 1,
              backgroundColor: colors.bg.tertiary,
              border: true,
              borderColor: colors.border.muted,
            }}
          >
            <text fg={colors.accent.tertiary}>{outputFilePath}</text>
          </box>
        </box>

        {/* 에이전트 출력 섹션 */}
        {agentOutput && (
          <box style={{ marginBottom: 2 }}>
            <SectionHeader title="에이전트 출력" />
            <box
              style={{
                padding: 1,
                backgroundColor: colors.bg.tertiary,
                border: true,
                borderColor: colors.border.muted,
                flexDirection: 'column',
              }}
            >
              {renderOutputWithHighlighting(agentOutput)}
            </box>
          </box>
        )}

        {/* 돌아가기 힌트 */}
        <box style={{ marginTop: 1 }}>
          <text fg={colors.fg.dim}>Esc를 눌러 반복 목록으로, 또는 't'를 눌러 작업 목록으로 돌아가기</text>
        </box>
      </scrollbox>
    </box>
  );
}
