/**
 * ABOUTME: 원격 인스턴스 관리를 위한 오버레이 컴포넌트 (추가, 수정, 삭제).
 * 새 원격을 추가하거나 기존 원격을 수정하기 위한 통합 폼과
 * 삭제를 위한 확인 다이얼로그를 제공합니다.
 */

import type { ReactNode } from 'react';
import { useState, useCallback, useEffect } from 'react';
import { useKeyboard } from '@opentui/react';
import { colors } from '../theme.js';

/**
 * 표시할 UI를 결정하는 모드
 */
export type RemoteManagementMode = 'add' | 'edit' | 'delete';

/**
 * 기존 원격 데이터 (수정/삭제 모드용)
 */
export interface ExistingRemoteData {
  alias: string;
  host: string;
  port: number;
  token: string;
}

/**
 * RemoteManagementOverlay 컴포넌트 Props
 */
export interface RemoteManagementOverlayProps {
  /** 오버레이 표시 여부 */
  visible: boolean;
  /** 현재 모드: 추가, 수정, 또는 삭제 */
  mode: RemoteManagementMode;
  /** 수정/삭제 모드용 기존 원격 데이터 */
  existingRemote?: ExistingRemoteData;
  /** 저장 시 콜백 (추가 또는 수정) */
  onSave: (data: { alias: string; host: string; port: number; token: string }) => Promise<void>;
  /** 삭제 시 콜백 */
  onDelete: (alias: string) => Promise<void>;
  /** 오버레이 닫기 시 콜백 */
  onClose: () => void;
}

/**
 * 키보드 탐색용 폼 필드 인덱스
 */
const FIELD_ALIAS = 0;
const FIELD_HOST = 1;
const FIELD_PORT = 2;
const FIELD_TOKEN = 3;
const FIELD_COUNT = 4;

/**
 * 별칭 형식 검증
 */
function validateAlias(alias: string): string | null {
  if (!alias.trim()) {
    return '별칭은 필수입니다';
  }
  if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(alias)) {
    return '별칭은 문자로 시작해야 하며 문자, 숫자, 대시, 밑줄만 포함할 수 있습니다';
  }
  return null;
}

/**
 * 호스트 검증
 */
function validateHost(host: string): string | null {
  if (!host.trim()) {
    return '호스트는 필수입니다';
  }
  return null;
}

/**
 * 포트 검증
 */
function validatePort(portStr: string): string | null {
  if (!portStr.trim()) {
    return '포트는 필수입니다';
  }
  const port = parseInt(portStr, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    return '포트는 1에서 65535 사이의 숫자여야 합니다';
  }
  return null;
}

/**
 * 토큰 검증
 */
function validateToken(token: string): string | null {
  if (!token.trim()) {
    return '토큰은 필수입니다';
  }
  return null;
}

/**
 * RemoteManagementOverlay - 원격 추가, 수정, 삭제 작업 처리
 */
export function RemoteManagementOverlay({
  visible,
  mode,
  existingRemote,
  onSave,
  onDelete,
  onClose,
}: RemoteManagementOverlayProps): ReactNode {
  // 폼 상태
  const [alias, setAlias] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('7890');
  const [token, setToken] = useState('');

  // UI 상태
  const [focusedField, setFocusedField] = useState(FIELD_ALIAS);
  const [showToken, setShowToken] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // 열 때 폼 상태 초기화
  useEffect(() => {
    if (visible) {
      if (mode === 'add') {
        setAlias('');
        setHost('');
        setPort('7890');
        setToken('');
        setFocusedField(FIELD_ALIAS);
      } else if (existingRemote) {
        setAlias(existingRemote.alias);
        setHost(existingRemote.host);
        setPort(String(existingRemote.port));
        setToken(existingRemote.token);
        setFocusedField(FIELD_ALIAS);
      }
      setShowToken(false);
      setError(null);
      setSaving(false);
    }
  }, [visible, mode, existingRemote]);

  // 폼 제출 처리
  const handleSubmit = useCallback(async () => {
    // 모든 필드 검증
    const aliasError = validateAlias(alias);
    if (aliasError) {
      setError(aliasError);
      setFocusedField(FIELD_ALIAS);
      return;
    }

    const hostError = validateHost(host);
    if (hostError) {
      setError(hostError);
      setFocusedField(FIELD_HOST);
      return;
    }

    const portError = validatePort(port);
    if (portError) {
      setError(portError);
      setFocusedField(FIELD_PORT);
      return;
    }

    const tokenError = validateToken(token);
    if (tokenError) {
      setError(tokenError);
      setFocusedField(FIELD_TOKEN);
      return;
    }

    setError(null);
    setSaving(true);

    try {
      await onSave({
        alias: alias.trim(),
        host: host.trim(),
        port: parseInt(port, 10),
        token: token.trim(),
      });
      // 저장 성공 후 부모에서 onClose 호출
    } catch (err) {
      setError(err instanceof Error ? err.message : '원격 저장 실패');
      setSaving(false);
    }
  }, [alias, host, port, token, onSave]);

  // 삭제 확인 처리
  const handleDelete = useCallback(async () => {
    if (!existingRemote) return;

    setSaving(true);
    try {
      await onDelete(existingRemote.alias);
      // 삭제 성공 후 부모에서 onClose 호출
    } catch (err) {
      setError(err instanceof Error ? err.message : '원격 삭제 실패');
      setSaving(false);
    }
  }, [existingRemote, onDelete]);

  // 현재 포커스된 필드의 값 업데이트
  const updateCurrentField = useCallback((updater: (prev: string) => string) => {
    switch (focusedField) {
      case FIELD_ALIAS:
        setAlias(updater);
        break;
      case FIELD_HOST:
        setHost(updater);
        break;
      case FIELD_PORT:
        setPort(updater);
        break;
      case FIELD_TOKEN:
        setToken(updater);
        break;
    }
  }, [focusedField]);

  // 키보드 입력 처리
  useKeyboard(
    useCallback(
      (key) => {
        if (!visible) return;

        // 아무 키나 누르면 오류 지우기
        setError(null);

        // 삭제 확인 모드는 다른 키보드 처리 사용
        if (mode === 'delete') {
          switch (key.name) {
            case 'y':
              handleDelete();
              break;
            case 'n':
            case 'escape':
              onClose();
              break;
          }
          return;
        }

        // 폼 모드 (추가/수정)
        switch (key.name) {
          case 'tab':
            // 필드 간 이동
            if (key.shift) {
              setFocusedField((prev) => (prev - 1 + FIELD_COUNT) % FIELD_COUNT);
            } else {
              setFocusedField((prev) => (prev + 1) % FIELD_COUNT);
            }
            break;

          case 'return':
          case 'enter':
            handleSubmit();
            break;

          case 'escape':
            onClose();
            break;

          case 'backspace':
            updateCurrentField((prev) => prev.slice(0, -1));
            break;

          default:
            // '*'로 토큰 표시 토글
            if (key.sequence === '*') {
              setShowToken((prev) => !prev);
              break;
            }

            // 현재 필드에 출력 가능 문자 추가
            if (key.sequence && key.sequence.length === 1) {
              // 포트 필드는 숫자만 허용
              if (focusedField === FIELD_PORT) {
                if (/^\d$/.test(key.sequence)) {
                  updateCurrentField((prev) => prev + key.sequence);
                }
              } else {
                updateCurrentField((prev) => prev + key.sequence);
              }
            }
            break;
        }
      },
      [visible, mode, focusedField, handleSubmit, handleDelete, onClose, updateCurrentField]
    )
  );

  if (!visible) return null;

  // 삭제 확인 UI
  if (mode === 'delete' && existingRemote) {
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
          backgroundColor: '#000000B3',
        }}
      >
        <box
          style={{
            flexDirection: 'column',
            padding: 2,
            backgroundColor: colors.bg.secondary,
            borderColor: colors.status.error,
            minWidth: 50,
            maxWidth: 60,
          }}
          border
        >
          {/* 헤더 */}
          <box style={{ marginBottom: 1, justifyContent: 'center' }}>
            <text fg={colors.status.error}>원격 삭제</text>
          </box>

          {/* 확인 메시지 */}
          <box style={{ marginBottom: 1 }}>
            <text fg={colors.fg.primary}>
              정말 삭제하시겠습니까
            </text>
          </box>
          <box style={{ marginBottom: 1, justifyContent: 'center' }}>
            <text fg={colors.accent.primary}>"{existingRemote.alias}"</text>
            <text fg={colors.fg.primary}>?</text>
          </box>

          {/* 원격 상세 */}
          <box style={{ marginBottom: 1 }}>
            <text fg={colors.fg.muted}>
              호스트: {existingRemote.host}:{existingRemote.port}
            </text>
          </box>

          {/* 오류 메시지 */}
          {error && (
            <box style={{ marginBottom: 1 }}>
              <text fg={colors.status.error}>{error}</text>
            </box>
          )}

          {/* 푸터 */}
          <box style={{ marginTop: 1, justifyContent: 'center' }}>
            <text fg={colors.fg.muted}>
              {saving ? '삭제 중...' : '[y] 예, 삭제    [n/Esc] 취소'}
            </text>
          </box>
        </box>
      </box>
    );
  }

  // 추가/수정 폼 UI
  const title = mode === 'add' ? '원격 추가' : '원격 수정';

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
        backgroundColor: '#000000B3',
      }}
    >
      <box
        style={{
          flexDirection: 'column',
          padding: 2,
          backgroundColor: colors.bg.secondary,
          borderColor: colors.accent.primary,
          minWidth: 50,
          maxWidth: 60,
        }}
        border
      >
        {/* 헤더 */}
        <box style={{ marginBottom: 1, justifyContent: 'center' }}>
          <text fg={colors.accent.primary}>{title}</text>
        </box>

        {/* 폼 필드 */}
        <FormField
          label="별칭"
          value={alias}
          focused={focusedField === FIELD_ALIAS}
        />
        <FormField
          label="호스트"
          value={host}
          focused={focusedField === FIELD_HOST}
        />
        <FormField
          label="포트"
          value={port}
          focused={focusedField === FIELD_PORT}
        />
        <FormField
          label="토큰"
          value={showToken ? token : '*'.repeat(token.length || 8)}
          focused={focusedField === FIELD_TOKEN}
        />

        {/* 토큰 표시 힌트 */}
        <box style={{ paddingLeft: 10, marginBottom: 1 }}>
          <text fg={colors.fg.muted}>
            * 키로 토큰 {showToken ? '숨기기' : '표시'}
          </text>
        </box>

        {/* 오류 메시지 */}
        {error && (
          <box style={{ marginTop: 1, justifyContent: 'center' }}>
            <text fg={colors.status.error}>{error}</text>
          </box>
        )}

        {/* 힌트가 있는 푸터 */}
        <box style={{ marginTop: 1, justifyContent: 'center' }}>
          <text fg={colors.fg.muted}>
            {saving
              ? '저장 중...'
              : '[Tab] 다음 필드  [Enter] 저장  [Esc] 취소'}
          </text>
        </box>
      </box>
    </box>
  );
}

/**
 * 일관된 필드 렌더링을 위한 폼 필드 컴포넌트
 */
interface FormFieldProps {
  label: string;
  value: string;
  focused: boolean;
  disabled?: boolean;
}

function FormField({ label, value, focused, disabled }: FormFieldProps): ReactNode {
  const labelWidth = 8;
  const fieldBg = focused ? colors.bg.tertiary : colors.bg.primary;
  const fieldFg = disabled
    ? colors.fg.muted
    : focused
      ? colors.fg.primary
      : colors.fg.secondary;

  return (
    <box style={{ flexDirection: 'row', marginBottom: 1 }}>
      <box style={{ width: labelWidth }}>
        <text fg={focused ? colors.accent.primary : colors.fg.secondary}>
          {label}:
        </text>
      </box>
      <box
        style={{
          flexGrow: 1,
          backgroundColor: fieldBg,
          paddingLeft: 1,
          paddingRight: 1,
          borderColor: focused ? colors.accent.primary : colors.border.muted,
        }}
        border={focused}
      >
        <text fg={fieldFg}>
          {value || (focused ? '' : '(비어 있음)')}
          {focused && !disabled ? '▏' : ''}
        </text>
      </box>
      {disabled && (
        <text fg={colors.fg.muted}> (읽기 전용)</text>
      )}
    </box>
  );
}
