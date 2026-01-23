/**
 * ABOUTME: Ralph TUI 설정을 구성하기 위한 설정 뷰 컴포넌트.
 * 현재 설정 값을 표시하고 수정을 허용합니다.
 * 변경사항은 프로젝트 디렉토리의 .ralph-tui/config.toml에 저장됩니다.
 */

import type { ReactNode } from 'react';
import { useState, useCallback, useEffect } from 'react';
import { useKeyboard } from '@opentui/react';
import { colors } from '../theme.js';
import type { StoredConfig, SubagentDetailLevel, NotificationSoundMode } from '../../config/types.js';
import type { AgentPluginMeta } from '../../plugins/agents/types.js';
import type { TrackerPluginMeta } from '../../plugins/trackers/types.js';

/**
 * 다양한 필드 종류에 대한 설정 항목 타입
 */
type SettingType = 'select' | 'number' | 'boolean' | 'text';

/**
 * 개별 설정 정의
 */
interface SettingDefinition {
  key: string;
  label: string;
  type: SettingType;
  description: string;
  options?: string[]; // select 타입용
  min?: number; // number 타입용
  max?: number; // number 타입용
  getValue: (config: StoredConfig) => string | number | boolean | undefined;
  setValue: (config: StoredConfig, value: string | number | boolean) => StoredConfig;
  requiresRestart?: boolean;
}

/**
 * SettingsView 컴포넌트 Props
 */
export interface SettingsViewProps {
  /** 설정 뷰 표시 여부 */
  visible: boolean;
  /** 현재 저장된 설정 */
  config: StoredConfig;
  /** 사용 가능한 에이전트 플러그인 */
  agents: AgentPluginMeta[];
  /** 사용 가능한 트래커 플러그인 */
  trackers: TrackerPluginMeta[];
  /** 설정 저장 시 콜백 */
  onSave: (config: StoredConfig) => Promise<void>;
  /** 설정 뷰 닫기 시 콜백 */
  onClose: () => void;
}

/**
 * 사용 가능한 플러그인을 기반으로 설정 정의 빌드
 */
function buildSettingDefinitions(
  agents: AgentPluginMeta[],
  trackers: TrackerPluginMeta[]
): SettingDefinition[] {
  return [
    {
      key: 'tracker',
      label: '트래커',
      type: 'select',
      description: '사용할 이슈 트래커 플러그인',
      options: trackers.map((t) => t.id),
      getValue: (config) => config.tracker ?? config.defaultTracker,
      setValue: (config, value) => ({
        ...config,
        tracker: value as string,
        defaultTracker: value as string,
      }),
      requiresRestart: true,
    },
    {
      key: 'agent',
      label: '에이전트',
      type: 'select',
      description: '사용할 AI 에이전트 플러그인',
      options: agents.map((a) => a.id),
      getValue: (config) => config.agent ?? config.defaultAgent,
      setValue: (config, value) => ({
        ...config,
        agent: value as string,
        defaultAgent: value as string,
      }),
      requiresRestart: true,
    },
    {
      key: 'maxIterations',
      label: '최대 반복',
      type: 'number',
      description: '실행당 최대 반복 횟수 (0 = 무제한)',
      min: 0,
      max: 1000,
      getValue: (config) => config.maxIterations,
      setValue: (config, value) => ({
        ...config,
        maxIterations: value as number,
      }),
      requiresRestart: false,
    },
    {
      key: 'iterationDelay',
      label: '반복 지연',
      type: 'number',
      description: '반복 간 지연 시간 (밀리초)',
      min: 0,
      max: 60000,
      getValue: (config) => config.iterationDelay,
      setValue: (config, value) => ({
        ...config,
        iterationDelay: value as number,
      }),
      requiresRestart: false,
    },
    {
      key: 'autoCommit',
      label: '자동 커밋',
      type: 'boolean',
      description: '각 작업 완료 후 자동으로 커밋',
      getValue: (config) => config.autoCommit,
      setValue: (config, value) => ({
        ...config,
        autoCommit: value as boolean,
      }),
      requiresRestart: false,
    },
    {
      key: 'subagentTracingDetail',
      label: '서브에이전트 상세',
      type: 'select',
      description: '서브에이전트 트레이싱 표시 상세 수준 ("t"로 전환)',
      options: ['off', 'minimal', 'moderate', 'full'],
      getValue: (config) => config.subagentTracingDetail ?? 'off',
      setValue: (config, value) => ({
        ...config,
        subagentTracingDetail: value as SubagentDetailLevel,
      }),
      requiresRestart: false,
    },
    {
      key: 'notifications',
      label: '알림',
      type: 'boolean',
      description: '작업 완료 시 데스크톱 알림 활성화',
      getValue: (config) => config.notifications?.enabled ?? true,
      setValue: (config, value) => ({
        ...config,
        notifications: {
          ...config.notifications,
          enabled: value as boolean,
        },
      }),
      requiresRestart: false,
    },
    {
      key: 'notificationSound',
      label: '알림 소리',
      type: 'select',
      description: '소리 모드: off, system (OS 기본), ralph (Wiggum 명언)',
      options: ['off', 'system', 'ralph'],
      getValue: (config) => config.notifications?.sound ?? 'off',
      setValue: (config, value) => ({
        ...config,
        notifications: {
          ...config.notifications,
          sound: value as NotificationSoundMode,
        },
      }),
      requiresRestart: false,
    },
  ];
}

/**
 * 표시용 설정 값 포맷
 */
function formatValue(value: string | number | boolean | undefined): string {
  if (value === undefined) return '(설정 안됨)';
  if (typeof value === 'boolean') return value ? '예' : '아니오';
  return String(value);
}

/**
 * 설정 뷰 컴포넌트
 */
export function SettingsView({
  visible,
  config,
  agents,
  trackers,
  onSave,
  onClose,
}: SettingsViewProps): ReactNode {
  const [editingConfig, setEditingConfig] = useState<StoredConfig>(config);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [editMode, setEditMode] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  const settings = buildSettingDefinitions(agents, trackers);

  // 설정이 외부에서 변경되면 상태 재설정
  useEffect(() => {
    setEditingConfig(config);
    setHasChanges(false);
    setError(null);
  }, [config]);

  // 현재 설정 가져오기
  const currentSetting = settings[selectedIndex];

  // 키보드 탐색 및 편집 처리
  const handleKeyboard = useCallback(
    (key: { name: string; sequence?: string }) => {
      if (!visible) return;

      // 아무 키나 누르면 오류 지우기
      setError(null);

      if (editMode) {
        // 편집 모드에서는 값 편집 처리
        switch (key.name) {
          case 'escape':
            setEditMode(false);
            setEditValue('');
            break;

          case 'return':
          case 'enter': {
            // 편집된 값 적용
            const setting = currentSetting;
            if (!setting) break;

            let newValue: string | number | boolean;
            if (setting.type === 'number') {
              const num = parseInt(editValue, 10);
              if (isNaN(num)) {
                setError('유효한 숫자를 입력하세요');
                break;
              }
              if (setting.min !== undefined && num < setting.min) {
                setError(`값은 최소 ${setting.min} 이상이어야 합니다`);
                break;
              }
              if (setting.max !== undefined && num > setting.max) {
                setError(`값은 최대 ${setting.max} 이하여야 합니다`);
                break;
              }
              newValue = num;
            } else if (setting.type === 'boolean') {
              newValue = editValue.toLowerCase() === 'yes' || editValue.toLowerCase() === 'true' || editValue === '1';
            } else {
              newValue = editValue;
            }

            setEditingConfig(setting.setValue(editingConfig, newValue));
            setHasChanges(true);
            setEditMode(false);
            setEditValue('');
            break;
          }

          case 'backspace':
            setEditValue((prev) => prev.slice(0, -1));
            break;

          default:
            // 편집 값에 문자 추가
            if (key.sequence && key.sequence.length === 1) {
              setEditValue((prev) => prev + key.sequence);
            }
            break;
        }
        return;
      }

      // 일반 탐색 모드
      switch (key.name) {
        case 'escape':
        case 'q':
          if (hasChanges) {
            // 변경사항 버리고 닫기
            setEditingConfig(config);
            setHasChanges(false);
          }
          onClose();
          break;

        case 'up':
        case 'k':
          setSelectedIndex((prev) => Math.max(0, prev - 1));
          break;

        case 'down':
        case 'j':
          setSelectedIndex((prev) => Math.min(settings.length - 1, prev + 1));
          break;

        case 'return':
        case 'enter':
        case 'e': {
          // 현재 설정에 대한 편집 모드 진입
          const setting = currentSetting;
          if (!setting) break;

          if (setting.type === 'select' && setting.options) {
            // select 옵션 순환
            const currentValue = setting.getValue(editingConfig);
            const currentIdx = setting.options.indexOf(String(currentValue ?? ''));
            const nextIdx = (currentIdx + 1) % setting.options.length;
            const nextValue = setting.options[nextIdx];
            if (nextValue !== undefined) {
              setEditingConfig(setting.setValue(editingConfig, nextValue));
              setHasChanges(true);
            }
          } else if (setting.type === 'boolean') {
            // boolean 토글
            const currentValue = setting.getValue(editingConfig);
            setEditingConfig(setting.setValue(editingConfig, !currentValue));
            setHasChanges(true);
          } else {
            // 텍스트 편집 모드 진입
            const currentValue = setting.getValue(editingConfig);
            setEditValue(currentValue !== undefined ? String(currentValue) : '');
            setEditMode(true);
          }
          break;
        }

        case 'left':
        case 'h': {
          // select 타입의 경우 이전 옵션으로
          const setting = currentSetting;
          if (!setting || setting.type !== 'select' || !setting.options) break;

          const currentValue = setting.getValue(editingConfig);
          const currentIdx = setting.options.indexOf(String(currentValue ?? ''));
          const prevIdx = currentIdx <= 0 ? setting.options.length - 1 : currentIdx - 1;
          const prevValue = setting.options[prevIdx];
          if (prevValue !== undefined) {
            setEditingConfig(setting.setValue(editingConfig, prevValue));
            setHasChanges(true);
          }
          break;
        }

        case 'right':
        case 'l': {
          // select 타입의 경우 다음 옵션으로
          const setting = currentSetting;
          if (!setting || setting.type !== 'select' || !setting.options) break;

          const currentValue = setting.getValue(editingConfig);
          const currentIdx = setting.options.indexOf(String(currentValue ?? ''));
          const nextIdx = (currentIdx + 1) % setting.options.length;
          const nextValue = setting.options[nextIdx];
          if (nextValue !== undefined) {
            setEditingConfig(setting.setValue(editingConfig, nextValue));
            setHasChanges(true);
          }
          break;
        }

        case 's': {
          // 변경사항 저장
          if (!hasChanges) break;

          setSaving(true);
          onSave(editingConfig)
            .then(() => {
              setSaving(false);
              setHasChanges(false);
            })
            .catch((err: Error) => {
              setSaving(false);
              setError(`저장 실패: ${err.message}`);
            });
          break;
        }

        case 'space': {
          // boolean 토글 또는 select 순환
          const setting = currentSetting;
          if (!setting) break;

          if (setting.type === 'boolean') {
            const currentValue = setting.getValue(editingConfig);
            setEditingConfig(setting.setValue(editingConfig, !currentValue));
            setHasChanges(true);
          } else if (setting.type === 'select' && setting.options) {
            const currentValue = setting.getValue(editingConfig);
            const currentIdx = setting.options.indexOf(String(currentValue ?? ''));
            const nextIdx = (currentIdx + 1) % setting.options.length;
            const nextValue = setting.options[nextIdx];
            if (nextValue !== undefined) {
              setEditingConfig(setting.setValue(editingConfig, nextValue));
              setHasChanges(true);
            }
          }
          break;
        }
      }
    },
    [
      visible,
      editMode,
      editValue,
      selectedIndex,
      settings,
      currentSetting,
      editingConfig,
      config,
      hasChanges,
      onClose,
      onSave,
    ]
  );

  useKeyboard(handleKeyboard);

  if (!visible) {
    return null;
  }

  return (
    <box
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#000000B3', // 70% 불투명 검정 (OpenTUI는 rgba 문법 미지원)
      }}
    >
      <box
        style={{
          flexDirection: 'column',
          padding: 2,
          backgroundColor: colors.bg.secondary,
          borderColor: colors.accent.primary,
          minWidth: 60,
          maxWidth: 70,
        }}
        border
      >
        {/* 헤더 */}
        <box style={{ marginBottom: 1, justifyContent: 'center' }}>
          <text fg={colors.accent.primary}>⚙ 설정</text>
        </box>

        {/* 설정 목록 */}
        {settings.map((setting, index) => {
          const isSelected = index === selectedIndex;
          const value = setting.getValue(editingConfig);
          const displayValue = editMode && isSelected ? editValue : formatValue(value);

          return (
            <box
              key={setting.key}
              style={{
                flexDirection: 'row',
                backgroundColor: isSelected ? colors.bg.highlight : undefined,
                paddingLeft: 1,
                paddingRight: 1,
              }}
            >
              {/* 선택 표시기 */}
              <text fg={isSelected ? colors.accent.primary : colors.fg.dim}>
                {isSelected ? '▶ ' : '  '}
              </text>

              {/* 라벨 */}
              <box style={{ width: 18 }}>
                <text fg={isSelected ? colors.fg.primary : colors.fg.secondary}>
                  {setting.label}
                </text>
              </box>

              {/* 값 */}
              <box style={{ flexGrow: 1 }}>
                {setting.type === 'select' && setting.options ? (
                  <box style={{ flexDirection: 'row' }}>
                    <text fg={colors.fg.muted}>{isSelected ? '‹ ' : '  '}</text>
                    <text fg={isSelected ? colors.accent.tertiary : colors.fg.primary}>
                      {displayValue}
                    </text>
                    <text fg={colors.fg.muted}>{isSelected ? ' ›' : ''}</text>
                  </box>
                ) : (
                  <text
                    fg={
                      editMode && isSelected
                        ? colors.accent.secondary
                        : isSelected
                          ? colors.accent.tertiary
                          : colors.fg.primary
                    }
                  >
                    {displayValue}
                    {editMode && isSelected ? '▏' : ''}
                  </text>
                )}
              </box>

              {/* 재시작 필요 표시기 */}
              {setting.requiresRestart && (
                <text fg={colors.status.warning}> ⟳</text>
              )}
            </box>
          );
        })}

        {/* 설명 */}
        {currentSetting && (
          <box style={{ marginTop: 1, paddingLeft: 3 }}>
            <text fg={colors.fg.muted}>{currentSetting.description}</text>
          </box>
        )}

        {/* 오류 메시지 */}
        {error && (
          <box style={{ marginTop: 1, paddingLeft: 3 }}>
            <text fg={colors.status.error}>{error}</text>
          </box>
        )}

        {/* 상태 라인 */}
        <box style={{ marginTop: 1, flexDirection: 'row', justifyContent: 'space-between' }}>
          <text fg={colors.fg.muted}>
            {hasChanges ? '● 수정됨' : ''}
            {saving ? ' 저장 중...' : ''}
          </text>
          <text fg={colors.status.warning}>⟳ = 재시작 필요</text>
        </box>

        {/* 키보드 힌트가 있는 푸터 */}
        <box style={{ marginTop: 1, justifyContent: 'center' }}>
          <text fg={colors.fg.muted}>
            {editMode
              ? 'Enter: 적용  Esc: 취소'
              : '↑↓: 탐색  Enter/Space: 편집  ←→: 순환  s: 저장  q/Esc: 닫기'}
          </text>
        </box>
      </box>
    </box>
  );
}
