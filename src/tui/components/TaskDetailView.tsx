/**
 * ABOUTME: Ralph TUI용 TaskDetailView 컴포넌트.
 * 설명, 완료 조건, 의존성, 메타데이터를 포함한 전체 작업 상세를 표시합니다.
 * 긴 콘텐츠에 대한 스크롤을 지원합니다.
 */

import type { ReactNode } from 'react';
import { colors, getTaskStatusColor, getTaskStatusIndicator } from '../theme.js';
import type { TaskDetailViewProps, TaskPriority } from '../types.js';

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
 * JSON 트래커는 metadata.acceptanceCriteria에 문자열 배열로 저장.
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
 * 일관된 스타일링을 위한 섹션 헤더 컴포넌트
 */
function SectionHeader({ title }: { title: string }): ReactNode {
  return (
    <box style={{ marginBottom: 1 }}>
      <text fg={colors.accent.primary}>
        {title}
      </text>
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
        <text fg={valueColor || colors.fg.secondary}>{value}</text>
      ) : (
        value
      )}
    </box>
  );
}

/**
 * 포괄적인 작업 상세를 보여주는 TaskDetailView 컴포넌트.
 * 참고: onBack은 API 완전성을 위해 제공되지만 탐색은
 * 부모 컴포넌트에서 키보드 (Esc 키)로 처리됩니다.
 */
export function TaskDetailView({ task, onBack: _onBack }: TaskDetailViewProps): ReactNode {
  const statusColor = getTaskStatusColor(task.status);
  const statusIndicator = getTaskStatusIndicator(task.status);
  // 메타데이터에서 완료 조건 확인 (JSON 트래커는 여기에 저장)
  const metadataCriteria = task.metadata?.acceptanceCriteria;
  const criteria = parseAcceptanceCriteria(task.description, undefined, metadataCriteria);
  const cleanDescription = extractDescription(task.description);

  return (
    <box
      title={`작업 상세 [Esc로 뒤로가기]`}
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
        {/* 작업 제목과 ID */}
        <box style={{ marginBottom: 1 }}>
          <text>
            <span fg={statusColor}>{statusIndicator}</span>
            <span fg={colors.fg.primary}>
              {' '}
              {task.title}
            </span>
          </text>
        </box>

        <box style={{ marginBottom: 2 }}>
          <text fg={colors.fg.muted}>ID: {task.id}</text>
        </box>

        {/* 메타데이터 섹션 */}
        <box style={{ marginBottom: 2 }}>
          <SectionHeader title="메타데이터" />
          <box
            style={{
              padding: 1,
              backgroundColor: colors.bg.secondary,
              border: true,
              borderColor: colors.border.muted,
            }}
          >
            <MetadataRow label="상태" value={task.status} valueColor={statusColor} />

            {task.priority !== undefined && (
              <MetadataRow
                label="우선순위"
                value={priorityLabels[task.priority]}
                valueColor={getPriorityColor(task.priority)}
              />
            )}

            {task.type && <MetadataRow label="유형" value={task.type} />}

            {task.assignee && <MetadataRow label="담당자" value={task.assignee} />}

            {task.labels && task.labels.length > 0 && (
              <MetadataRow
                label="라벨"
                value={
                  <text>
                    {task.labels.map((label, i) => (
                      <span key={label}>
                        <span fg={colors.accent.secondary}>{label}</span>
                        {i < task.labels!.length - 1 ? ', ' : ''}
                      </span>
                    ))}
                  </text>
                }
              />
            )}

            {task.iteration !== undefined && (
              <MetadataRow
                label="반복"
                value={task.iteration.toString()}
                valueColor={colors.accent.primary}
              />
            )}
          </box>
        </box>

        {/* 설명 섹션 */}
        {cleanDescription && (
          <box style={{ marginBottom: 2 }}>
            <SectionHeader title="설명" />
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
          <box style={{ marginBottom: 2 }}>
            <SectionHeader title="완료 조건" />
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
          <box style={{ marginBottom: 2 }}>
            <SectionHeader title="완료 노트" />
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
                {' '}
                | 수정: {new Date(task.updatedAt).toLocaleString()}
              </text>
            )}
          </box>
        )}
      </scrollbox>
    </box>
  );
}
