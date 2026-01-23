/**
 * ABOUTME: 원격 인스턴스의 설정을 표시하는 원격 설정 뷰어 컴포넌트.
 * 원격의 전역 및/또는 프로젝트 설정을 읽기 전용 모드로 표시합니다.
 * 로컬 설정을 원격에 푸시하는 옵션을 제공합니다.
 */

import type { ReactNode } from 'react';
import { useState, useCallback, useEffect } from 'react';
import { useKeyboard } from '@opentui/react';
import { colors } from '../theme.js';

/**
 * checkConfig에서 반환되는 원격 설정 데이터
 */
export interface RemoteConfigData {
  globalExists: boolean;
  projectExists: boolean;
  globalPath?: string;
  projectPath?: string;
  globalContent?: string;
  projectContent?: string;
  remoteCwd?: string;
}

/**
 * RemoteConfigView 컴포넌트 Props
 */
export interface RemoteConfigViewProps {
  /** 뷰 표시 여부 */
  visible: boolean;
  /** 표시용 원격 별칭/이름 */
  remoteAlias: string;
  /** 원격에서 가져온 설정 데이터 (로딩 중에는 null) */
  configData: RemoteConfigData | null;
  /** 설정 로딩 중 여부 */
  loading: boolean;
  /** 가져오기 실패 시 오류 메시지 */
  error?: string;
  /** 뷰 닫기 시 콜백 */
  onClose: () => void;
  /** 로컬 설정을 원격에 푸시할 때 콜백 */
  onPushConfig?: (scope: 'global' | 'project') => void;
}

/**
 * RemoteConfigView - 원격 인스턴스의 설정을 읽기 전용으로 표시
 */
export function RemoteConfigView({
  visible,
  remoteAlias,
  configData,
  loading,
  error,
  onClose,
  onPushConfig,
}: RemoteConfigViewProps): ReactNode {
  // 탭 상태: 'global' 또는 'project'
  const [activeTab, setActiveTab] = useState<'global' | 'project'>('global');
  // 콘텐츠 스크롤 오프셋
  const [scrollOffset, setScrollOffset] = useState(0);

  // 열 때 상태 초기화
  useEffect(() => {
    if (visible) {
      setScrollOffset(0);
      // 존재하는 설정으로 기본 설정
      if (configData) {
        if (configData.globalExists) {
          setActiveTab('global');
        } else if (configData.projectExists) {
          setActiveTab('project');
        }
      }
    }
  }, [visible, configData]);

  // 키보드 입력 처리
  useKeyboard(
    useCallback(
      (key) => {
        if (!visible) return;

        switch (key.name) {
          case 'escape':
          case 'q':
            onClose();
            break;

          case 'tab':
            // 전역과 프로젝트 탭 간 전환
            if (configData?.globalExists && configData?.projectExists) {
              setActiveTab((prev) => (prev === 'global' ? 'project' : 'global'));
              setScrollOffset(0);
            }
            break;

          case 'j':
          case 'down':
            setScrollOffset((prev) => prev + 1);
            break;

          case 'k':
          case 'up':
            setScrollOffset((prev) => Math.max(0, prev - 1));
            break;

          case 'g':
            // 맨 위로 이동
            setScrollOffset(0);
            break;

          case 'G':
            // 맨 아래로 이동 (근사값 - 높은 값 설정)
            setScrollOffset(1000);
            break;

          case 'p':
            // 설정 푸시 (핸들러가 제공된 경우)
            if (onPushConfig) {
              onPushConfig(activeTab);
            }
            break;
        }
      },
      [visible, configData, activeTab, onClose, onPushConfig]
    )
  );

  if (!visible) return null;

  // 활성 탭에 따라 현재 콘텐츠 가져오기
  const currentContent = activeTab === 'global'
    ? configData?.globalContent
    : configData?.projectContent;
  const currentPath = activeTab === 'global'
    ? configData?.globalPath
    : configData?.projectPath;
  const currentExists = activeTab === 'global'
    ? configData?.globalExists
    : configData?.projectExists;

  // 표시를 위해 콘텐츠를 줄 단위로 분리
  const contentLines = currentContent?.split('\n') ?? [];
  const visibleLines = contentLines.slice(scrollOffset, scrollOffset + 20);
  const canScrollDown = scrollOffset + 20 < contentLines.length;
  const canScrollUp = scrollOffset > 0;

  return (
    <box
      style={{
        position: 'absolute',
        top: 2,
        left: 4,
        right: 4,
        bottom: 2,
        backgroundColor: colors.bg.secondary,
        border: true,
        borderColor: colors.border.normal,
        flexDirection: 'column',
        padding: 1,
      }}
    >
      {/* 헤더 */}
      <box style={{ flexDirection: 'row', marginBottom: 1 }}>
        <text fg={colors.fg.primary}>
          ⚙ 설정: {remoteAlias}
        </text>
        <text fg={colors.fg.muted}> (읽기 전용)</text>
      </box>

      {/* 로딩 상태 */}
      {loading && (
        <box style={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center' }}>
          <text fg={colors.fg.muted}>설정 로딩 중...</text>
        </box>
      )}

      {/* 오류 상태 */}
      {error && !loading && (
        <box style={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center' }}>
          <text fg={colors.status.error}>오류: {error}</text>
        </box>
      )}

      {/* 설정 콘텐츠 */}
      {!loading && !error && configData && (
        <>
          {/* 탭 바 (두 설정 모두 존재하는 경우) */}
          {configData.globalExists && configData.projectExists && (
            <box style={{ flexDirection: 'row', marginBottom: 1 }}>
              <box
                style={{
                  paddingLeft: 1,
                  paddingRight: 1,
                  backgroundColor: activeTab === 'global' ? colors.bg.tertiary : undefined,
                  border: activeTab === 'global',
                  borderColor: colors.accent.primary,
                }}
              >
                <text fg={activeTab === 'global' ? colors.accent.primary : colors.fg.muted}>
                  전역
                </text>
              </box>
              <text fg={colors.fg.muted}> </text>
              <box
                style={{
                  paddingLeft: 1,
                  paddingRight: 1,
                  backgroundColor: activeTab === 'project' ? colors.bg.tertiary : undefined,
                  border: activeTab === 'project',
                  borderColor: colors.accent.primary,
                }}
              >
                <text fg={activeTab === 'project' ? colors.accent.primary : colors.fg.muted}>
                  프로젝트
                </text>
              </box>
              <text fg={colors.fg.muted}> (Tab으로 전환)</text>
            </box>
          )}

          {/* 설정 경로 */}
          {currentPath && (
            <box style={{ marginBottom: 1 }}>
              <text fg={colors.fg.muted}>경로: {currentPath}</text>
            </box>
          )}

          {/* 원격 CWD */}
          {configData.remoteCwd && (
            <box style={{ marginBottom: 1 }}>
              <text fg={colors.fg.muted}>원격 CWD: {configData.remoteCwd}</text>
            </box>
          )}

          {/* 설정 콘텐츠 영역 */}
          <box
            style={{
              flexGrow: 1,
              border: true,
              borderColor: colors.border.muted,
              backgroundColor: colors.bg.primary,
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {!currentExists ? (
              <box style={{ padding: 1 }}>
                <text fg={colors.fg.muted}>
                  이 원격에 {activeTab === 'global' ? '전역' : '프로젝트'} 설정이 없습니다.
                </text>
              </box>
            ) : !currentContent ? (
              <box style={{ padding: 1 }}>
                <text fg={colors.fg.muted}>설정 파일이 비어 있습니다.</text>
              </box>
            ) : (
              <>
                {/* 스크롤 표시기 (위) */}
                {canScrollUp && (
                  <text fg={colors.fg.muted}>  ↑ 위에 더 있음 (k/↑로 스크롤)</text>
                )}

                {/* 콘텐츠 라인 */}
                {visibleLines.map((line, idx) => (
                  <text key={idx} fg={colors.fg.secondary}>
                    {formatConfigLine(line)}
                  </text>
                ))}

                {/* 스크롤 표시기 (아래) */}
                {canScrollDown && (
                  <text fg={colors.fg.muted}>  ↓ 아래에 더 있음 (j/↓로 스크롤)</text>
                )}
              </>
            )}
          </box>
        </>
      )}

      {/* 설정 없음 */}
      {!loading && !error && configData && !configData.globalExists && !configData.projectExists && (
        <box style={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center' }}>
          <text fg={colors.fg.muted}>이 원격에서 설정을 찾을 수 없습니다.</text>
        </box>
      )}

      {/* 컨트롤이 있는 푸터 */}
      <box style={{ marginTop: 1, flexDirection: 'row' }}>
        <text fg={colors.fg.muted}>
          [q/Esc] 닫기
          {configData?.globalExists && configData?.projectExists && '  [Tab] 전환'}
          {'  [j/k] 스크롤'}
          {onPushConfig && '  [p] 로컬 설정 푸시'}
        </text>
      </box>
    </box>
  );
}

/**
 * 기본 문법 강조로 TOML 설정 라인 포맷
 */
function formatConfigLine(line: string): string {
  // 현재는 그대로 반환
  // 나중에 TOML 문법 강조 추가 가능
  return '  ' + line;
}
