/**
 * ABOUTME: Ralph TUI용 RightPanel 컴포넌트.
 * 현재 반복 상세 또는 선택된 작업 상세를 표시합니다.
 * 'o' 키로 상세 뷰와 출력 뷰 간 전환을 지원합니다.
 * 서브에이전트 추적이 활성화된 경우 접을 수 있는 서브에이전트 섹션을 포함합니다.
 */

import type { ReactNode } from 'react';
import { useMemo, useState, useEffect } from 'react';
import { colors, getTaskStatusColor, getTaskStatusIndicator } from '../theme.js';
import type { RightPanelProps, DetailsViewMode, IterationTimingInfo, TaskPriority } from '../types.js';
import { stripAnsiCodes, type FormattedSegment } from '../../plugins/agents/output-formatting.js';
import { formatElapsedTime } from '../theme.js';
import { parseAgentOutput } from '../output-parser.js';

/**
 * 표시용 우선순위 라벨 매핑
 */
const priorityLabels: Record<TaskPriority, string> = {
  0: 'P0 - 긴급',
  1: 'P1 - 높음',
  2: 'P2 - 중간',
  3: 'P3 - 낮음',
  4: 'P4 - 백로그',
};

/**
 * 우선순위 표시용 색상 가져오기
 */
function getPriorityColor(priority: TaskPriority): string {
  switch (priority) {
    case 0:
      return colors.status.error;
    case 1:
      return colors.status.warning;
    case 2:
      return colors.fg.primary;
    case 3:
      return colors.fg.secondary;
    case 4:
      return colors.fg.muted;
  }
}

/**
 * 설명, 전용 필드, 또는 메타데이터 배열에서 완료 조건 파싱.
 * 마크다운 체크리스트 항목 (- [ ] 또는 - [x]) 찾기
 * JSON 트래커는 criteria를 metadata.acceptanceCriteria에 문자열 배열로 저장.
 */
function parseAcceptanceCriteria(
  description?: string,
  acceptanceCriteria?: string,
  metadataCriteria?: unknown
): Array<{ text: string; checked: boolean }> {
  // 메타데이터에 criteria 배열이 있으면 (JSON 트래커에서) 사용
  if (Array.isArray(metadataCriteria) && metadataCriteria.length > 0) {
    return metadataCriteria
      .filter((c): c is string => typeof c === 'string')
      .map((text) => ({ text, checked: false }));
  }

  const content = acceptanceCriteria || description || '';
  const lines = content.split('\n');
  const criteria: Array<{ text: string; checked: boolean }> = [];

  // 완료 조건 섹션 찾기
  let inCriteriaSection = false;

  for (const line of lines) {
    // 섹션 헤더 확인
    if (line.toLowerCase().includes('acceptance criteria')) {
      inCriteriaSection = true;
      continue;
    }

    // 체크리스트 항목 파싱 (섹션이 없으면 콘텐츠 어디서든, 있으면 섹션 내에서만)
    const checkboxMatch = line.match(/^\s*-\s*\[([ xX])\]\s*(.+)$/);
    if (checkboxMatch) {
      criteria.push({
        checked: checkboxMatch[1].toLowerCase() === 'x',
        text: checkboxMatch[2].trim(),
      });
    }

    // criteria 섹션 내의 글머리 기호도 허용
    if (inCriteriaSection) {
      const bulletMatch = line.match(/^\s*[-*]\s+(.+)$/);
      if (bulletMatch && !checkboxMatch) {
        criteria.push({
          checked: false,
          text: bulletMatch[1].trim(),
        });
      }
    }
  }

  return criteria;
}

/**
 * 완료 조건 섹션 없이 설명 추출
 */
function extractDescription(description?: string): string {
  if (!description) return '';

  const lines = description.split('\n');
  const result: string[] = [];
  let inCriteriaSection = false;

  for (const line of lines) {
    if (line.toLowerCase().includes('acceptance criteria')) {
      inCriteriaSection = true;
      continue;
    }

    // 완료 조건 섹션에 도달하면 라인 포함 중지
    // 다른 섹션 헤더를 만나면 다시 포함
    if (inCriteriaSection && line.match(/^#+\s/)) {
      inCriteriaSection = false;
    }

    if (!inCriteriaSection) {
      result.push(line);
    }
  }

  return result.join('\n').trim();
}

/**
 * ISO 8601 타임스탬프를 사람이 읽을 수 있는 시간 문자열로 포맷.
 * HH:MM:SS 형식으로 시간 반환.
 */
function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/**
 * 작업이 선택되지 않았을 때 표시.
 * 원격 인스턴스의 연결 상태 또는 로컬의 설정 안내를 표시합니다.
 */
function NoSelection({
  isViewingRemote = false,
  remoteConnectionStatus,
  remoteAlias,
}: {
  isViewingRemote?: boolean;
  remoteConnectionStatus?: 'connected' | 'connecting' | 'disconnected' | 'reconnecting';
  remoteAlias?: string;
}): ReactNode {
  // 원격 인스턴스에 대한 연결별 도움말 표시
  if (isViewingRemote && remoteConnectionStatus !== 'connected') {
    return (
      <box
        style={{
          flexGrow: 1,
          flexDirection: 'column',
          padding: 2,
        }}
      >
        <box style={{ marginBottom: 1 }}>
          <text fg={colors.status.warning}>
            {remoteConnectionStatus === 'connecting' && '◐ 연결 중...'}
            {remoteConnectionStatus === 'reconnecting' && '⟳ 재연결 중...'}
            {remoteConnectionStatus === 'disconnected' && '○ 연결되지 않음'}
          </text>
        </box>

        {remoteConnectionStatus === 'disconnected' && (
          <>
            <box style={{ marginBottom: 2 }}>
              <text fg={colors.fg.secondary}>
                원격 "{remoteAlias}"이(가) 연결되지 않았습니다.
              </text>
            </box>
            <box style={{ flexDirection: 'column', gap: 1 }}>
              <text fg={colors.fg.muted}>가능한 원인:</text>
              <text fg={colors.fg.muted}>
                <span fg={colors.accent.primary}>•</span> 원격 서버가 실행 중이 아님
              </text>
              <text fg={colors.fg.muted}>
                <span fg={colors.accent.primary}>•</span> 네트워크 연결 문제
              </text>
              <text fg={colors.fg.muted}>
                <span fg={colors.accent.primary}>•</span> 잘못된 호스트/포트 설정
              </text>
              <text fg={colors.fg.muted}>
                <span fg={colors.accent.primary}>•</span> 인증 토큰 불일치
              </text>
            </box>
            <box style={{ marginTop: 2, flexDirection: 'column', gap: 1 }}>
              <text fg={colors.fg.muted}>시도해 보세요:</text>
              <text fg={colors.fg.muted}>
                <span fg={colors.accent.primary}>•</span>{' '}
                <span fg={colors.fg.secondary}>[</span> 또는{' '}
                <span fg={colors.fg.secondary}>]</span> 키로 탭 전환
              </text>
              <text fg={colors.fg.muted}>
                <span fg={colors.accent.primary}>•</span>{' '}
                <span fg={colors.fg.secondary}>e</span> 키로 원격 설정 편집
              </text>
              <text fg={colors.fg.muted}>
                <span fg={colors.accent.primary}>•</span>{' '}
                <span fg={colors.fg.secondary}>x</span> 키로 이 원격 삭제
              </text>
            </box>
          </>
        )}

        {(remoteConnectionStatus === 'connecting' || remoteConnectionStatus === 'reconnecting') && (
          <box style={{ marginTop: 1 }}>
            <text fg={colors.fg.muted}>
              {remoteAlias}에 연결 시도 중...
            </text>
          </box>
        )}
      </box>
    );
  }

  // 기본값: 로컬 인스턴스에 대한 설정 안내 표시
  return (
    <box
      style={{
        flexGrow: 1,
        flexDirection: 'column',
        padding: 2,
      }}
    >
      <box style={{ marginBottom: 1 }}>
        <text fg={colors.fg.primary}>시작하기</text>
      </box>
      <box style={{ marginBottom: 2 }}>
        <text fg={colors.fg.secondary}>
          사용 가능한 작업이 없습니다. Ralph로 작업을 시작하려면:
        </text>
      </box>
      <box style={{ flexDirection: 'column', gap: 1 }}>
        <text fg={colors.fg.muted}>
          <span fg={colors.accent.primary}>1.</span>{' '}
          <span fg={colors.fg.secondary}>ralph-tui setup</span> 실행하여 프로젝트 설정
        </text>
        <text fg={colors.fg.muted}>
          <span fg={colors.accent.primary}>2.</span>{' '}
          <span fg={colors.fg.secondary}>ralph-tui run</span> 실행하여 시작
        </text>
        <text fg={colors.fg.muted}>
          <span fg={colors.accent.primary}>3.</span> 또는{' '}
          <span fg={colors.fg.secondary}>ralph-tui --help</span>로 더 많은 옵션 확인
        </text>
      </box>
      <box style={{ marginTop: 2 }}>
        <text fg={colors.fg.dim}>'q' 또는 Esc를 눌러 종료</text>
      </box>
    </box>
  );
}

/**
 * 전체 작업 상세 뷰 - 메타데이터, 설명, 완료 조건, 의존성, 타임스탬프를 포함한
 * 포괄적인 작업 정보를 표시합니다.
 * 이전의 최소 TaskMetadataView를 대체합니다.
 */
function TaskMetadataView({
  task,
}: {
  task: NonNullable<RightPanelProps['selectedTask']>;
}): ReactNode {
  const statusColor = getTaskStatusColor(task.status);
  const statusIndicator = getTaskStatusIndicator(task.status);
  // 메타데이터에서 완료 조건 확인 (JSON 트래커는 여기에 저장)
  const metadataCriteria = task.metadata?.acceptanceCriteria;
  const criteria = parseAcceptanceCriteria(task.description, undefined, metadataCriteria);
  const cleanDescription = extractDescription(task.description);

  return (
    <box style={{ flexDirection: 'column', padding: 1, flexGrow: 1 }}>
      <scrollbox style={{ flexGrow: 1 }}>
        {/* 작업 제목과 상태 */}
        <box style={{ marginBottom: 1 }}>
          <text>
            <span fg={statusColor}>{statusIndicator}</span>
            <span fg={colors.fg.primary}> {task.title}</span>
          </text>
        </box>

        {/* 작업 ID */}
        <box style={{ marginBottom: 1 }}>
          <text fg={colors.fg.muted}>ID: {task.id}</text>
        </box>

        {/* 메타데이터 섹션 - 핵심 정보의 압축된 행 */}
        <box
          style={{
            marginBottom: 1,
            padding: 1,
            backgroundColor: colors.bg.secondary,
            border: true,
            borderColor: colors.border.muted,
            flexDirection: 'column',
          }}
        >
          {/* 상태 행 */}
          <box style={{ flexDirection: 'row', marginBottom: 0 }}>
            <text fg={colors.fg.muted}>상태: </text>
            <text fg={statusColor}>{task.status}</text>
          </box>

          {/* 우선순위 행 */}
          {task.priority !== undefined && (
            <box style={{ flexDirection: 'row', marginBottom: 0 }}>
              <text fg={colors.fg.muted}>우선순위: </text>
              <text fg={getPriorityColor(task.priority)}>{priorityLabels[task.priority]}</text>
            </box>
          )}

          {/* 유형 행 */}
          {task.type && (
            <box style={{ flexDirection: 'row', marginBottom: 0 }}>
              <text fg={colors.fg.muted}>유형: </text>
              <text fg={colors.fg.secondary}>{task.type}</text>
            </box>
          )}

          {/* 담당자 행 */}
          {task.assignee && (
            <box style={{ flexDirection: 'row', marginBottom: 0 }}>
              <text fg={colors.fg.muted}>담당자: </text>
              <text fg={colors.fg.secondary}>{task.assignee}</text>
            </box>
          )}

          {/* 라벨 행 */}
          {task.labels && task.labels.length > 0 && (
            <box style={{ flexDirection: 'row', marginBottom: 0 }}>
              <text fg={colors.fg.muted}>라벨: </text>
              <text>
                {task.labels.map((label, i) => (
                  <span key={label}>
                    <span fg={colors.accent.secondary}>{label}</span>
                    {i < task.labels!.length - 1 ? ', ' : ''}
                  </span>
                ))}
              </text>
            </box>
          )}

          {/* 반복 행 */}
          {task.iteration !== undefined && (
            <box style={{ flexDirection: 'row', marginBottom: 0 }}>
              <text fg={colors.fg.muted}>반복: </text>
              <text fg={colors.accent.primary}>{task.iteration}</text>
            </box>
          )}
        </box>

        {/* 설명 섹션 */}
        {cleanDescription && (
          <box style={{ marginBottom: 1 }}>
            <box style={{ marginBottom: 0 }}>
              <text fg={colors.accent.primary}>설명</text>
            </box>
            <box
              style={{
                padding: 1,
                backgroundColor: colors.bg.tertiary,
                border: true,
                borderColor: colors.border.muted,
              }}
            >
              <text fg={colors.fg.secondary}>{cleanDescription}</text>
            </box>
          </box>
        )}

        {/* 완료 조건 섹션 */}
        {criteria.length > 0 && (
          <box style={{ marginBottom: 1 }}>
            <box style={{ marginBottom: 0 }}>
              <text fg={colors.accent.primary}>완료 조건</text>
            </box>
            <box
              style={{
                padding: 1,
                backgroundColor: colors.bg.secondary,
                border: true,
                borderColor: colors.border.muted,
                flexDirection: 'column',
              }}
            >
              {criteria.map((item, index) => (
                <box key={index} style={{ flexDirection: 'row', marginBottom: 0 }}>
                  <text>
                    <span fg={item.checked ? colors.status.success : colors.fg.muted}>
                      {item.checked ? '[x]' : '[ ]'}
                    </span>
                    <span fg={item.checked ? colors.fg.muted : colors.fg.secondary}>
                      {' '}
                      {item.text}
                    </span>
                  </text>
                </box>
              ))}
            </box>
          </box>
        )}

        {/* 의존성 섹션 */}
        {((task.dependsOn && task.dependsOn.length > 0) ||
          (task.blocks && task.blocks.length > 0) ||
          (task.blockedByTasks && task.blockedByTasks.length > 0)) && (
          <box style={{ marginBottom: 1 }}>
            <box style={{ marginBottom: 0 }}>
              <text fg={colors.accent.primary}>의존성</text>
            </box>
            <box
              style={{
                padding: 1,
                backgroundColor: colors.bg.secondary,
                border: true,
                borderColor: colors.border.muted,
                flexDirection: 'column',
              }}
            >
              {/* 상세 차단 정보 표시 (가능한 경우 제목과 상태 포함) */}
              {task.blockedByTasks && task.blockedByTasks.length > 0 && (
                <box style={{ marginBottom: 1 }}>
                  <text fg={colors.status.error}>⊘ 차단됨 (미해결):</text>
                  {task.blockedByTasks.map((blocker) => (
                    <text key={blocker.id} fg={colors.fg.secondary}>
                      {'  '}- {blocker.id}: {blocker.title}
                      <span fg={colors.fg.muted}> [{blocker.status}]</span>
                    </text>
                  ))}
                </box>
              )}

              {/* blockedByTasks 없으면 dependsOn ID로 폴백 */}
              {(!task.blockedByTasks || task.blockedByTasks.length === 0) &&
                task.dependsOn && task.dependsOn.length > 0 && (
                <box style={{ marginBottom: 1 }}>
                  <text fg={colors.status.warning}>선행 작업:</text>
                  {task.dependsOn.map((dep) => (
                    <text key={dep} fg={colors.fg.secondary}>
                      {'  '}- {dep}
                    </text>
                  ))}
                </box>
              )}

              {task.blocks && task.blocks.length > 0 && (
                <box>
                  <text fg={colors.accent.tertiary}>차단하는 작업:</text>
                  {task.blocks.map((dep) => (
                    <text key={dep} fg={colors.fg.secondary}>
                      {'  '}- {dep}
                    </text>
                  ))}
                </box>
              )}
            </box>
          </box>
        )}

        {/* 완료 노트 섹션 */}
        {task.closeReason && (
          <box style={{ marginBottom: 1 }}>
            <box style={{ marginBottom: 0 }}>
              <text fg={colors.accent.primary}>완료 노트</text>
            </box>
            <box
              style={{
                padding: 1,
                backgroundColor: colors.bg.tertiary,
                border: true,
                borderColor: colors.status.success,
              }}
            >
              <text fg={colors.fg.secondary}>{task.closeReason}</text>
            </box>
          </box>
        )}

        {/* 타임스탬프 */}
        {(task.createdAt || task.updatedAt) && (
          <box style={{ marginTop: 1 }}>
            {task.createdAt && (
              <text fg={colors.fg.dim}>
                생성: {new Date(task.createdAt).toLocaleString()}
              </text>
            )}
            {task.updatedAt && (
              <text fg={colors.fg.dim}>
                {' '}| 수정: {new Date(task.updatedAt).toLocaleString()}
              </text>
            )}
          </box>
        )}
      </scrollbox>
    </box>
  );
}

/**
 * 출력 뷰용 타이밍 요약 컴포넌트
 * 시작 시간을 즉시 표시하고, 실행 중에는 매초 업데이트되는 소요 시간을 표시하며,
 * 완료 시 종료 시간을 표시합니다. 가능한 경우 모델 정보도 표시합니다.
 */
function TimingSummary({ timing }: { timing?: IterationTimingInfo }): ReactNode {
  // 실행 중인 반복에 대한 경과 시간 추적
  const [elapsedMs, setElapsedMs] = useState<number>(0);

  useEffect(() => {
    if (!timing?.isRunning || !timing?.startedAt) {
      return;
    }

    // 초기 경과 시간 계산
    const startTime = new Date(timing.startedAt).getTime();
    const updateElapsed = () => {
      setElapsedMs(Date.now() - startTime);
    };

    // Update immediately
    updateElapsed();

    // Update every second
    const interval = setInterval(updateElapsed, 1000);

    return () => clearInterval(interval);
  }, [timing?.isRunning, timing?.startedAt]);

  if (!timing || (!timing.startedAt && !timing.isRunning)) {
    return null;
  }

  // 표시용 소요 시간 계산
  let durationDisplay: string;
  if (timing.isRunning && timing.startedAt) {
    // 실시간 경과 시간 표시
    const durationSeconds = Math.floor(elapsedMs / 1000);
    durationDisplay = formatElapsedTime(durationSeconds);
  } else if (timing.durationMs !== undefined) {
    const durationSeconds = Math.floor(timing.durationMs / 1000);
    durationDisplay = formatElapsedTime(durationSeconds);
  } else {
    durationDisplay = '—';
  }

  // Parse model info for display
  const modelDisplay = timing.model
    ? (() => {
        const [provider, model] = timing.model!.includes('/') ? timing.model!.split('/') : ['', timing.model!];
        return { provider, model, full: timing.model!, display: provider ? `${provider}/${model}` : model };
      })()
    : null;

  return (
    <box
      style={{
        marginBottom: 1,
        padding: 1,
        border: true,
        borderColor: colors.border.muted,
        backgroundColor: colors.bg.tertiary,
      }}
    >
      {/* 모델 정보 행 - 모델이 있을 때 표시 */}
      {modelDisplay && (
        <box style={{ flexDirection: 'row', marginBottom: 1 }}>
          <text fg={colors.fg.muted}>모델: </text>
          <text fg={colors.accent.primary}>{modelDisplay.display}</text>
        </box>
      )}
      {/* 타이밍 정보 행 */}
      <box style={{ flexDirection: 'row', gap: 3 }}>
        <text fg={colors.fg.muted}>
          시작:{' '}
          <span fg={colors.fg.secondary}>
            {timing.startedAt ? formatTimestamp(timing.startedAt) : '—'}
          </span>
        </text>
        <text fg={colors.fg.muted}>
          종료:{' '}
          <span fg={colors.fg.secondary}>
            {timing.endedAt ? formatTimestamp(timing.endedAt) : '—'}
          </span>
        </text>
        <text fg={colors.fg.muted}>
          소요:{' '}
          <span fg={timing.isRunning ? colors.status.info : colors.accent.primary}>
            {durationDisplay}
          </span>
        </text>
      </box>
    </box>
  );
}

/**
 * 프롬프트 미리보기 뷰 - 에이전트에 전송될 완전히 렌더링된 프롬프트를 표시합니다.
 * 템플릿 소스 표시기와 스크롤 가능한 프롬프트 내용을 표시합니다.
 *
 * 참고: 이것은 "시점" 미리보기입니다 - progress.md와 같은 동적 콘텐츠는
 * 실행 중 실제 프롬프트가 전송되기 전에 변경될 수 있습니다.
 */
function PromptPreviewView({
  task,
  promptPreview,
  templateSource,
}: {
  task: NonNullable<RightPanelProps['selectedTask']>;
  promptPreview?: string;
  templateSource?: string;
}): ReactNode {
  const statusColor = getTaskStatusColor(task.status);
  const statusIndicator = getTaskStatusIndicator(task.status);

  return (
    <box style={{ flexDirection: 'column', padding: 1, flexGrow: 1 }}>
      {/* 템플릿 소스가 포함된 압축된 작업 헤더 */}
      <box style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 1 }}>
        <box>
          <text>
            <span fg={statusColor}>{statusIndicator}</span>
            <span fg={colors.fg.primary}> {task.title}</span>
            <span fg={colors.fg.muted}> ({task.id})</span>
          </text>
        </box>
        {templateSource && (
          <box>
            <text fg={colors.accent.secondary}>[{templateSource}]</text>
          </box>
        )}
      </box>

      {/* 동적 콘텐츠 알림 */}
      <box
        style={{
          marginBottom: 1,
          padding: 1,
          border: true,
          borderColor: colors.status.warning,
          backgroundColor: colors.bg.tertiary,
        }}
      >
        <text fg={colors.status.warning}>
          ⚠ 미리보기만 - 실행 전에 동적 콘텐츠가 변경될 수 있습니다
        </text>
      </box>

      {/* 전체 높이 프롬프트 미리보기 */}
      <box
        title="프롬프트 미리보기"
        style={{
          flexGrow: 1,
          border: true,
          borderColor: colors.accent.primary,
          backgroundColor: colors.bg.secondary,
        }}
      >
        <scrollbox style={{ flexGrow: 1, padding: 1 }}>
          {promptPreview ? (
            <box style={{ flexDirection: 'column' }}>
              {promptPreview.split('\n').map((line, i) => {
                // 마크다운 헤더 강조
                if (line.match(/^#+\s/)) {
                  return (
                    <text key={i} fg={colors.accent.primary}>
                      {line}
                    </text>
                  );
                }
                // 글머리 기호 강조
                if (line.match(/^\s*[-*]\s/)) {
                  return (
                    <text key={i} fg={colors.fg.secondary}>
                      {line}
                    </text>
                  );
                }
                // 코드 펜스 강조
                if (line.match(/^```/)) {
                  return (
                    <text key={i} fg={colors.accent.tertiary}>
                      {line}
                    </text>
                  );
                }
                // 일반 텍스트
                return (
                  <text key={i} fg={colors.fg.secondary}>
                    {line}
                  </text>
                );
              })}
            </box>
          ) : (
            <text fg={colors.fg.muted}>
              'o'로 뷰 전환 또는 Shift+O로 프롬프트 미리보기
            </text>
          )}
        </scrollbox>
      </box>
    </box>
  );
}

/**
 * 작업 출력 뷰 - 선택적으로 접을 수 있는 서브에이전트 섹션이 포함된
 * 전체 높이 스크롤 가능한 반복 출력을 표시합니다
 */
function TaskOutputView({
  task,
  currentIteration,
  iterationOutput,
  iterationSegments,
  iterationTiming,
  agentName,
  currentModel,
}: {
  task: NonNullable<RightPanelProps['selectedTask']>;
  currentIteration: number;
  iterationOutput?: string;
  iterationSegments?: FormattedSegment[];
  iterationTiming?: IterationTimingInfo;
  agentName?: string;
  currentModel?: string;
}): ReactNode {
  const statusColor = getTaskStatusColor(task.status);
  const statusIndicator = getTaskStatusIndicator(task.status);

  // 실시간 스트리밍 중인지 확인
  const isLiveStreaming = iterationTiming?.isRunning === true;

  // 실시간 스트리밍의 경우 TUI 네이티브 색상을 위해 세그먼트 선호
  // 이전/완료된 출력의 경우 읽기 가능한 콘텐츠를 추출하기 위해 문자열 파싱
  // 항상 ANSI 코드 제거 - OpenTUI에서 검은 배경 아티팩트 발생
  const displayOutput = useMemo(() => {
    if (!iterationOutput) return undefined;
    // 실행 중 실시간 출력의 경우 ANSI 제거하되 원본 콘텐츠 유지
    if (isLiveStreaming) {
      return stripAnsiCodes(iterationOutput);
    }
    // 완료된 출력(이전 또는 현재 세션에서)의 경우 읽기 가능한 콘텐츠 추출을 위해 파싱
    // parseAgentOutput은 이미 ANSI 코드를 제거함
    return parseAgentOutput(iterationOutput, agentName);
  }, [iterationOutput, isLiveStreaming, agentName]);

  // 참고: 전체 세그먼트 기반 색상(FormattedText)은 OpenTUI의
  // span 렌더링 문제로 검은 배경과 문자 손실이 발생하여 비활성화됨.
  // 대신 도구 호출에 간단한 라인 기반 색상 사용.
  void iterationSegments;

  // Parse model info for display
  const modelDisplay = currentModel
    ? (() => {
        const [provider, model] = currentModel.includes('/') ? currentModel.split('/') : ['', currentModel];
        return { provider, model, full: currentModel, display: provider ? `${provider}/${model}` : model };
      })()
    : null;

  return (
    <box style={{ flexDirection: 'column', padding: 1, flexGrow: 1 }}>
      {/* 에이전트/모델 정보가 포함된 압축된 작업 헤더 */}
      <box style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 1 }}>
        <box>
          <text>
            <span fg={statusColor}>{statusIndicator}</span>
            <span fg={colors.fg.primary}> {task.title}</span>
            <span fg={colors.fg.muted}> ({task.id})</span>
          </text>
        </box>
        {(agentName || modelDisplay) && (
          <box style={{ flexDirection: 'row', gap: 1 }}>
            {agentName && <text fg={colors.accent.secondary}>{agentName}</text>}
            {agentName && modelDisplay && <text fg={colors.fg.muted}>|</text>}
            {modelDisplay && (
              <text fg={colors.accent.primary}>{modelDisplay.display}</text>
            )}
          </box>
        )}
      </box>

      {/* 타이밍 요약 - 시작/종료/소요 시간 표시 */}
      <TimingSummary timing={iterationTiming} />

      {/* 전체 높이 반복 출력 */}
      <box
        title={
          currentIteration === -1
            ? '이전 출력'
            : currentIteration > 0
              ? `반복 ${currentIteration}`
              : '출력'
        }
        style={{
          flexGrow: 1,
          border: true,
          borderColor: colors.border.normal,
          backgroundColor: colors.bg.secondary,
        }}
      >
        <scrollbox style={{ flexGrow: 1, padding: 1 }} stickyScroll={true} stickyStart="bottom">
          {/* 녹색 도구 이름이 포함된 라인 기반 색상 */}
          {displayOutput !== undefined && displayOutput.length > 0 ? (
            <box style={{ flexDirection: 'column' }}>
              {displayOutput.split('\n').map((line, i) => {
                // 라인이 [toolname] 패턴으로 시작하는지 확인
                const toolMatch = line.match(/^(\[[\w-]+\])(.*)/);
                if (toolMatch) {
                  const [, toolName, rest] = toolMatch;
                  return (
                    <box key={i} style={{ flexDirection: 'row' }}>
                      <text fg={colors.status.success}>{toolName}</text>
                      <text fg={colors.fg.secondary}>{rest}</text>
                    </box>
                  );
                }
                return (
                  <text key={i} fg={colors.fg.secondary}>
                    {line}
                  </text>
                );
              })}
            </box>
          ) : displayOutput === '' ? (
            <text fg={colors.fg.muted}>캡처된 출력 없음</text>
          ) : currentIteration === 0 ? (
            <text fg={colors.fg.muted}>작업이 아직 실행되지 않음</text>
          ) : (
            <text fg={colors.fg.muted}>출력 대기 중...</text>
          )}
        </scrollbox>
      </box>
    </box>
  );
}

/**
 * 작업 상세 뷰 - 메타데이터, 출력, 프롬프트 뷰 간 전환
 */
function TaskDetails({
  task,
  currentIteration,
  iterationOutput,
  iterationSegments,
  viewMode = 'details',
  iterationTiming,
  agentName,
  currentModel,
  promptPreview,
  templateSource,
}: {
  task: NonNullable<RightPanelProps['selectedTask']>;
  currentIteration: number;
  iterationOutput?: string;
  iterationSegments?: FormattedSegment[];
  viewMode?: DetailsViewMode;
  iterationTiming?: IterationTimingInfo;
  agentName?: string;
  currentModel?: string;
  promptPreview?: string;
  templateSource?: string;
}): ReactNode {
  if (viewMode === 'output') {
    return (
      <TaskOutputView
        task={task}
        currentIteration={currentIteration}
        iterationOutput={iterationOutput}
        iterationSegments={iterationSegments}
        iterationTiming={iterationTiming}
        agentName={agentName}
        currentModel={currentModel}
      />
    );
  }

  if (viewMode === 'prompt') {
    return (
      <PromptPreviewView
        task={task}
        promptPreview={promptPreview}
        templateSource={templateSource}
      />
    );
  }

  return <TaskMetadataView task={task} />;
}

/**
 * 작업 상세, 반복 출력, 또는 프롬프트 미리보기를 보여주는 RightPanel 컴포넌트
 */
export function RightPanel({
  selectedTask,
  currentIteration,
  iterationOutput,
  iterationSegments,
  viewMode = 'details',
  iterationTiming,
  agentName,
  currentModel,
  promptPreview,
  templateSource,
  isViewingRemote = false,
  remoteConnectionStatus,
  remoteAlias,
}: RightPanelProps): ReactNode {
  // 뷰 모드 표시기가 포함된 제목 구성
  const modeIndicators: Record<typeof viewMode, string> = {
    details: '[상세]',
    output: '[출력]',
    prompt: '[프롬프트]',
  };
  const modeIndicator = modeIndicators[viewMode];
  const title = `상세 ${modeIndicator}`;

  return (
    <box
      title={title}
      style={{
        flexGrow: 2,
        flexShrink: 1,
        minWidth: 40,
        flexDirection: 'column',
        backgroundColor: colors.bg.primary,
        border: true,
        borderColor: colors.border.normal,
      }}
    >
      {selectedTask ? (
        <TaskDetails
          task={selectedTask}
          currentIteration={currentIteration}
          iterationOutput={iterationOutput}
          iterationSegments={iterationSegments}
          viewMode={viewMode}
          iterationTiming={iterationTiming}
          agentName={agentName}
          currentModel={currentModel}
          promptPreview={promptPreview}
          templateSource={templateSource}
        />
      ) : (
        <NoSelection
          isViewingRemote={isViewingRemote}
          remoteConnectionStatus={remoteConnectionStatus}
          remoteAlias={remoteAlias}
        />
      )}
    </box>
  );
}
