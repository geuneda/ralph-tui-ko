/**
 * ABOUTME: Ralph TUI용 에픽 선택 애플리케이션 컴포넌트.
 * 키보드 탐색과 에픽 선택 기능을 제공합니다.
 * ralph-tui가 --epic 플래그 없이 실행될 때 사용됩니다.
 */

import type { ReactNode } from 'react';
import { useState, useCallback, useEffect } from 'react';
import { useKeyboard } from '@opentui/react';
import { EpicSelectionView } from './EpicSelectionView.js';
import type { TrackerPlugin, TrackerTask } from '../../plugins/trackers/types.js';

/**
 * EpicSelectionApp 컴포넌트 Props
 */
export interface EpicSelectionAppProps {
  /** 트래커 플러그인 인스턴스 */
  tracker: TrackerPlugin;
  /** 사용자가 에픽을 선택하고 실행을 시작할 때 콜백 */
  onEpicSelected: (epic: TrackerTask) => void;
  /** 사용자가 선택 없이 종료할 때 콜백 */
  onQuit: () => void;
}

/**
 * EpicSelectionApp 컴포넌트
 * 에픽 선택 모드용 메인 애플리케이션 컴포넌트
 */
export function EpicSelectionApp({
  tracker,
  onEpicSelected,
  onQuit,
}: EpicSelectionAppProps): ReactNode {
  const [epics, setEpics] = useState<TrackerTask[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  // 사용 가능한 경우 트래커에서 구성된 레이블 추출 (빈 상태 안내용)
  const configuredLabels = (() => {
    const trackerWithLabels = tracker as { getConfiguredLabels?: () => string[] };
    if (typeof trackerWithLabels.getConfiguredLabels === 'function') {
      return trackerWithLabels.getConfiguredLabels();
    }
    return [];
  })();

  // 마운트 시 에픽 로드
  useEffect(() => {
    const loadEpics = async () => {
      try {
        setLoading(true);
        setError(undefined);
        const loadedEpics = await tracker.getEpics();
        setEpics(loadedEpics);
      } catch (err) {
        setError(err instanceof Error ? err.message : '에픽 로드 실패');
      } finally {
        setLoading(false);
      }
    };

    void loadEpics();
  }, [tracker]);

  // 키보드 탐색 처리
  const handleKeyboard = useCallback(
    (key: { name: string }) => {
      switch (key.name) {
        case 'q':
        case 'escape':
          onQuit();
          break;

        case 'up':
        case 'k':
          setSelectedIndex((prev) => Math.max(0, prev - 1));
          break;

        case 'down':
        case 'j':
          setSelectedIndex((prev) => Math.min(epics.length - 1, prev + 1));
          break;

        case 'return':
        case 'enter':
        case 'r':
          // 선택한 에픽으로 실행 시작
          if (epics.length > 0 && epics[selectedIndex]) {
            onEpicSelected(epics[selectedIndex]);
          }
          break;
      }
    },
    [epics, selectedIndex, onEpicSelected, onQuit]
  );

  useKeyboard(handleKeyboard);

  return (
    <EpicSelectionView
      epics={epics}
      selectedIndex={selectedIndex}
      trackerName={tracker.meta.name}
      loading={loading}
      error={error}
      configuredLabels={configuredLabels}
    />
  );
}
