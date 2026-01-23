/**
 * ABOUTME: Ralph TUI용 메인 App 컴포넌트.
 * Header, LeftPanel, RightPanel, Footer를 반응형 레이아웃으로 구성합니다.
 */

import { useKeyboard, useTerminalDimensions } from '@opentui/react';
import type { ReactNode } from 'react';
import { useState, useCallback, useEffect } from 'react';
import { colors, layout } from '../theme.js';
import type { AppState, TaskItem } from '../types.js';
import { Header } from './Header.js';
import { Footer } from './Footer.js';
import { LeftPanel } from './LeftPanel.js';
import { RightPanel } from './RightPanel.js';

/**
 * App 컴포넌트 Props
 */
export interface AppProps {
  /** 초기 애플리케이션 상태 */
  initialState?: Partial<AppState>;
  /** 종료 요청 시 콜백 */
  onQuit?: () => void;
}

/**
 * 빈 작업으로 기본 애플리케이션 상태 생성.
 * 실제 작업은 'ralph-tui run' 사용 시 트래커에서 가져옵니다.
 */
function createDefaultState(tasks: TaskItem[] = []): AppState {
  const completedTasksCount = tasks.filter((t) => t.status === 'done').length;

  return {
    header: {
      status: 'ready',
      elapsedTime: 0,
      completedTasks: completedTasksCount,
      totalTasks: tasks.length,
    },
    leftPanel: {
      tasks,
      selectedIndex: 0,
    },
    rightPanel: {
      selectedTask: tasks[0] ?? null,
      currentIteration: 1,
      iterationOutput: '반복 시작 중...',
    },
  };
}

/**
 * 반응형 레이아웃을 가진 메인 App 컴포넌트
 * 참고: 작업 상세는 RightPanel에 인라인으로 표시되며, 별도의 드릴다운 뷰 없음
 */
export function App({ initialState, onQuit }: AppProps): ReactNode {
  const { width, height } = useTerminalDimensions();
  const [state, setState] = useState<AppState>(() => ({
    ...createDefaultState(),
    ...initialState,
  }));
  const [elapsedTime, setElapsedTime] = useState(state.header.elapsedTime);

  // 매초 경과 시간 업데이트
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedTime((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // 키보드 탐색 처리
  const handleKeyboard = useCallback(
    (key: { name: string }) => {
      const { tasks, selectedIndex } = state.leftPanel;

      switch (key.name) {
        case 'q':
        case 'escape':
          // 애플리케이션 종료
          onQuit?.();
          process.exit(0);
          break;

        case 'up':
        case 'k':
          if (selectedIndex > 0) {
            const newIndex = selectedIndex - 1;
            setState((prev) => ({
              ...prev,
              leftPanel: { ...prev.leftPanel, selectedIndex: newIndex },
              rightPanel: { ...prev.rightPanel, selectedTask: tasks[newIndex] ?? null },
            }));
          }
          break;

        case 'down':
        case 'j':
          if (selectedIndex < tasks.length - 1) {
            const newIndex = selectedIndex + 1;
            setState((prev) => ({
              ...prev,
              leftPanel: { ...prev.leftPanel, selectedIndex: newIndex },
              rightPanel: { ...prev.rightPanel, selectedTask: tasks[newIndex] ?? null },
            }));
          }
          break;

        case 'p':
          // 일시정지/재개 전환
          setState((prev) => ({
            ...prev,
            header: {
              ...prev.header,
              status: prev.header.status === 'running' ? 'paused' : 'running',
            },
          }));
          break;
      }
    },
    [state.leftPanel, onQuit]
  );

  useKeyboard(handleKeyboard);

  // 콘텐츠 영역 높이 계산 (전체 높이에서 헤더와 푸터 제외)
  const contentHeight = Math.max(1, height - layout.header.height - layout.footer.height);

  // 좁은 터미널에서 컴팩트 레이아웃 사용 여부 결정
  const isCompact = width < 80;

  return (
    <box
      style={{
        width: '100%',
        height: '100%',
        flexDirection: 'column',
        backgroundColor: colors.bg.primary,
      }}
    >
      {/* 헤더 - 컴팩트 디자인 */}
      <Header
        status={state.header.status}
        elapsedTime={elapsedTime}
        completedTasks={state.header.completedTasks}
        totalTasks={state.header.totalTasks}
      />

      {/* 메인 콘텐츠 영역 */}
      <box
        style={{
          flexGrow: 1,
          flexDirection: isCompact ? 'column' : 'row',
          height: contentHeight,
        }}
      >
        <LeftPanel
          tasks={state.leftPanel.tasks}
          selectedIndex={state.leftPanel.selectedIndex}
        />
        <RightPanel
          selectedTask={state.rightPanel.selectedTask}
          currentIteration={state.rightPanel.currentIteration}
          iterationOutput={state.rightPanel.iterationOutput}
        />
      </box>

      {/* 푸터 */}
      <Footer />
    </box>
  );
}
