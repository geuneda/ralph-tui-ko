/**
 * ABOUTME: Ralph TUI 애플리케이션의 테마 상수와 타입.
 * 모던 다크 테마로 모든 TUI 컴포넌트에 일관된 스타일링을 제공합니다.
 */

/**
 * Ralph TUI 색상 팔레트
 */
export const colors = {
  // 배경 색상
  bg: {
    primary: '#1a1b26',
    secondary: '#24283b',
    tertiary: '#2f3449',
    highlight: '#3d4259',
  },

  // 전경 (텍스트) 색상
  fg: {
    primary: '#c0caf5',
    secondary: '#a9b1d6',
    muted: '#565f89',
    dim: '#414868',
  },

  // 상태 색상
  status: {
    success: '#9ece6a',
    warning: '#e0af68',
    error: '#f7768e',
    info: '#7aa2f7',
  },

  // 작업 상태 색상
  task: {
    done: '#9ece6a',
    active: '#9ece6a', // 녹색 - 현재 실행 중
    actionable: '#9ece6a', // 녹색 - 작업 가능
    pending: '#565f89',
    blocked: '#f7768e',
    error: '#f7768e', // blocked과 동일 - 오류는 빨간색
    closed: '#414868', // 완료/종료된 작업은 회색 처리
  },

  // 강조 색상
  accent: {
    primary: '#7aa2f7',
    secondary: '#bb9af7',
    tertiary: '#7dcfff',
  },

  // 테두리 색상
  border: {
    normal: '#3d4259',
    active: '#7aa2f7',
    muted: '#2f3449',
  },
} as const;

/**
 * 상태 표시기 기호
 * 작업 상태: ✓ (완료), ▶ (활성/실행 중), ○ (작업 가능/대기 중), ⊘ (차단됨), ✗ (오류), ✓ (종료 - 회색)
 * Ralph 상태: ▶ (실행 중), ◎ (일시정지 중), ⏸ (일시정지), ■ (중지), ✓ (완료), ○ (유휴/준비)
 */
export const statusIndicators = {
  done: '✓',
  active: '▶', // 현재 실행 중 - 녹색 재생 삼각형
  actionable: '○', // 작업 가능 - 녹색 원
  pending: '○',
  blocked: '⊘', // 의존성으로 차단됨 - 빨간색 금지
  error: '✗', // 오류/실패한 작업 - 빨간색 x
  closed: '✓', // done과 동일한 표시기, 회색으로 표시됨
  running: '▶',
  selecting: '◐', // 다음 작업 선택 중 - 반쯤 채워진 원 (애니메이션 느낌)
  executing: '⏵', // 에이전트 실행 중 - 막대가 있는 재생
  pausing: '◎',
  paused: '⏸',
  stopped: '■',
  complete: '✓',
  idle: '○',
  ready: '◉', // 시작 준비 - 사용자 동작 대기
} as const;

/**
 * 푸터용 키보드 단축키 표시 매핑 (축약)
 */
export const keyboardShortcuts = [
  { key: 'q', description: '종료' },
  { key: 's', description: '시작' },
  { key: 'p', description: '일시정지/재개' },
  { key: '+', description: '+10 반복' },
  { key: '-', description: '-10 반복' },
  { key: 'r', description: '새로고침' },
  { key: 'l', description: '에픽 로드' },
  { key: ',', description: '설정' },
  { key: 'd', description: '대시보드' },
  { key: 'o', description: '뷰 전환' },
  { key: 'O', description: '프롬프트' },
  { key: 't', description: '트레이스' },
  { key: '1-9', description: '탭 전환' },
  { key: '[]', description: '이전/다음 탭' },
  { key: '↑↓', description: '탐색' },
  { key: '?', description: '도움말' },
] as const;

/**
 * 도움말 오버레이용 전체 키보드 단축키
 */
export const fullKeyboardShortcuts = [
  { key: '?', description: '이 도움말 표시/숨기기', category: '일반' },
  { key: 'q', description: 'Ralph 종료', category: '일반' },
  { key: 'Esc', description: '뒤로가기 / 취소', category: '일반' },
  { key: ',', description: '설정 열기', category: '일반' },
  { key: 's', description: '실행 시작 (준비 상태일 때)', category: '실행' },
  { key: 'p', description: '실행 일시정지 / 재개', category: '실행' },
  { key: '+', description: '10 반복 추가', category: '실행' },
  { key: '-', description: '10 반복 제거', category: '실행' },
  { key: 'r', description: '트래커에서 작업 목록 새로고침', category: '실행' },
  { key: 'l', description: '에픽 로드 / 전환', category: '실행' },
  { key: 'd', description: '진행 대시보드 토글', category: '뷰' },
  { key: 'h', description: '종료된 작업 표시/숨기기 토글', category: '뷰' },
  { key: 'v', description: '반복 / 작업 뷰 토글', category: '뷰' },
  { key: 'o', description: '뷰 순환 (상세/출력/프롬프트)', category: '뷰' },
  { key: 'O', description: '프롬프트 미리보기로 이동', category: '뷰' },
  { key: 't', description: '서브에이전트 상세 수준 순환', category: '뷰' },
  { key: 'T', description: '서브에이전트 트리 패널 토글', category: '뷰' },
  { key: '↑ / k', description: '선택 위로 이동', category: '탐색' },
  { key: '↓ / j', description: '선택 아래로 이동', category: '탐색' },
  { key: 'Enter', description: '선택한 항목 상세 보기', category: '탐색' },
  { key: '1-9', description: '번호로 탭 전환', category: '인스턴스' },
  { key: '[', description: '이전 탭', category: '인스턴스' },
  { key: ']', description: '다음 탭', category: '인스턴스' },
  { key: 'Ctrl+Tab', description: '다음 탭 (대체)', category: '인스턴스' },
  { key: 'Ctrl+Shift+Tab', description: '이전 탭 (대체)', category: '인스턴스' },
  { key: 'Ctrl+C', description: '인터럽트 (확인 필요)', category: '시스템' },
  { key: 'Ctrl+C ×2', description: '즉시 강제 종료', category: '시스템' },
] as const;

/**
 * 레이아웃 치수
 */
export const layout = {
  tabBar: {
    // 인스턴스 탐색용 탭 바
    height: 1,
  },
  header: {
    // 컴팩트 단일 라인 헤더 (테두리 없음)
    height: 1,
  },
  footer: {
    height: 3,
  },
  progressDashboard: {
    // 대시보드 표시 시 높이: 2 (테두리) + 2 (패딩) + 4 (그리드 레이아웃 콘텐츠 행)
    height: 8,
  },
  leftPanel: {
    minWidth: 30,
    maxWidth: 50,
    defaultWidthPercent: 35,
  },
  rightPanel: {
    minWidth: 40,
  },
  padding: {
    small: 1,
    medium: 2,
  },
} as const;

/**
 * Ralph 상태 타입
 * - 'ready': 사용자가 실행을 시작하기를 기다림 (대화형 모드)
 * - 'running': 반복을 적극적으로 실행 중 (일반 실행 상태)
 * - 'selecting': 작업할 다음 작업 선택 중
 * - 'executing': 현재 작업에서 에이전트 실행 중
 * - 'pausing': 일시정지 요청됨, 현재 반복 완료 대기 중
 * - 'paused': 일시정지됨, 재개 대기 중
 * - 'stopped': 실행 중이 아님 (일반)
 * - 'complete': 모든 작업이 성공적으로 완료됨
 * - 'idle': 중지됨, 더 이상 사용 가능한 작업 없음
 * - 'error': 오류로 인해 중지됨
 */
export type RalphStatus = 'ready' | 'running' | 'selecting' | 'executing' | 'pausing' | 'paused' | 'stopped' | 'complete' | 'idle' | 'error';

/**
 * 완료 조건에 맞는 작업 상태 타입
 * - 'done': 현재 세션에서 완료된 작업 (녹색 체크마크 ✓)
 * - 'active': 현재 작업 중인 작업 (녹색 재생 삼각형 ▶)
 * - 'actionable': 차단 의존성 없이 작업 가능한 작업 (녹색 원 ○)
 * - 'pending': 작업 대기 중인 작업 (회색 원 ○) - 레거시, actionable 선호
 * - 'blocked': 의존성으로 차단된 작업 (빨간색 금지 ⊘)
 * - 'error': 작업 실행 실패 (빨간색 X ✗)
 * - 'closed': 이전에 완료된 작업 (과거 작업용 회색 체크마크 ✓)
 */
export type TaskStatus = 'done' | 'active' | 'actionable' | 'pending' | 'blocked' | 'error' | 'closed';

/**
 * 주어진 작업 상태에 대한 색상 가져오기
 */
export function getTaskStatusColor(status: TaskStatus): string {
  return colors.task[status];
}

/**
 * 주어진 작업 상태에 대한 표시기 기호 가져오기
 */
export function getTaskStatusIndicator(status: TaskStatus): string {
  return statusIndicators[status];
}

/**
 * 경과 시간을 사람이 읽을 수 있는 형식으로 포맷
 */
export function formatElapsedTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}시간 ${minutes}분 ${secs}초`;
  }
  if (minutes > 0) {
    return `${minutes}분 ${secs}초`;
  }
  return `${secs}초`;
}
