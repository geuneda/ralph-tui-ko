/**
 * ABOUTME: ralph-tui의 데스크톱 알림 모듈.
 * node-notifier를 사용하여 크로스 플랫폼 데스크톱 알림을 제공합니다.
 * 장시간 실행되는 작업이 완료되면 사용자에게 알림을 보내는 데 사용됩니다.
 * 알림 설정에 대한 구성 해석도 제공합니다.
 */

import notifier from 'node-notifier';
import type { NotificationsConfig, NotificationSoundMode } from './config/types.js';
import { playNotificationSound } from './sound.js';

/**
 * 데스크톱 알림 전송 옵션.
 */
export interface NotificationOptions {
  /** 알림 제목 */
  title: string;
  /** 알림 본문/메시지 */
  body: string;
  /** 아이콘 이미지 경로 (선택사항) */
  icon?: string;
  /** 이 알림의 사운드 모드 (기본값: 'off') */
  sound?: NotificationSoundMode;
}

/**
 * 사용자에게 데스크톱 알림을 보냅니다.
 *
 * 이 함수는 node-notifier를 래핑하여 크로스 플랫폼 데스크톱 알림을 제공합니다.
 * 알림은 중요하지 않으므로 충돌하지 않고 경고를 로깅하여 오류를 우아하게 처리합니다.
 *
 * @param options - 알림 옵션
 * @param options.title - 알림 제목
 * @param options.body - 알림 본문/메시지
 * @param options.icon - 아이콘 이미지 경로 (선택사항)
 * @param options.sound - 사운드 모드 ('off', 'system', 또는 'ralph')
 */
export function sendNotification(options: NotificationOptions): void {
  const { title, body, icon, sound = 'off' } = options;

  try {
    notifier.notify(
      {
        title,
        message: body,
        icon,
        // 크로스 플랫폼 일관성을 위해 사운드는 직접 처리
        sound: false,
      },
      (err: Error | null) => {
        if (err) {
          console.warn(`[알림] 알림 전송 실패: ${err.message}`);
        }
      }
    );

    // 크로스 플랫폼 지원을 위해 사운드를 별도로 재생
    if (sound !== 'off') {
      playNotificationSound(sound).catch((err) => {
        console.warn(`[알림] 사운드 재생 실패: ${err}`);
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[알림] 알림 전송 실패: ${message}`);
  }
}

/**
 * 설정과 CLI 인자에서 최종 알림 활성화 상태를 결정합니다.
 *
 * 우선순위 (높은 순):
 * 1. CLI 플래그 (--notify 또는 --no-notify)
 * 2. 설정 파일 (notifications.enabled)
 * 3. 기본값 (true)
 *
 * @param config - 설정 파일의 알림 설정 (undefined일 수 있음)
 * @param cliNotify - CLI 플래그 값 (미지정시 undefined, --notify는 true, --no-notify는 false)
 * @returns 알림 활성화 여부
 */
export function resolveNotificationsEnabled(
  config?: NotificationsConfig,
  cliNotify?: boolean
): boolean {
  // CLI 플래그가 최우선
  if (cliNotify !== undefined) {
    return cliNotify;
  }

  // 설정 파일이 두 번째 우선순위
  if (config?.enabled !== undefined) {
    return config.enabled;
  }

  // 기본값은 활성화
  return true;
}

/**
 * 밀리초 단위의 시간을 "X분 Y초" 형식으로 포맷합니다.
 *
 * 예시:
 * - 65000 → "1분 5초"
 * - 30000 → "0분 30초"
 * - 125000 → "2분 5초"
 *
 * @param durationMs - 밀리초 단위의 시간
 * @returns 포맷된 시간 문자열
 */
export function formatDuration(durationMs: number): string {
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}분 ${seconds}초`;
}

/**
 * 완료 알림 전송 옵션.
 */
export interface CompletionNotificationOptions {
  /** 총 소요 시간 (밀리초) */
  durationMs: number;
  /** 완료된 작업 수 */
  taskCount: number;
  /** 이 알림의 사운드 모드 */
  sound?: NotificationSoundMode;
}

/**
 * 모든 작업이 완료되면 데스크톱 알림을 보냅니다.
 *
 * 알림 내용:
 * - 제목: "Ralph-TUI 완료"
 * - 본문: 소요 시간 (X분 Y초 형식)과 작업 수 포함
 *
 * @param options - 완료 알림 옵션
 */
export function sendCompletionNotification(options: CompletionNotificationOptions): void {
  const { durationMs, taskCount, sound } = options;
  const durationStr = formatDuration(durationMs);

  sendNotification({
    title: 'Ralph-TUI 완료',
    body: `${taskCount}개 작업을 ${durationStr}에 완료했습니다`,
    sound,
  });
}

/**
 * 최대 반복 횟수 알림 전송 옵션.
 */
export interface MaxIterationsNotificationOptions {
  /** 실행된 반복 횟수 */
  iterationsRun: number;
  /** 완료된 작업 수 */
  tasksCompleted: number;
  /** 남은 작업 수 (open + in_progress) */
  tasksRemaining: number;
  /** 총 소요 시간 (밀리초) */
  durationMs: number;
  /** 이 알림의 사운드 모드 */
  sound?: NotificationSoundMode;
}

/**
 * 최대 반복 횟수 제한에 도달하면 데스크톱 알림을 보냅니다.
 *
 * 알림 내용:
 * - 제목: "Ralph-TUI 최대 반복 횟수"
 * - 본문: 실행된 반복 횟수, 완료/남은 작업 수, 소요 시간 포함
 *
 * @param options - 최대 반복 횟수 알림 옵션
 */
export function sendMaxIterationsNotification(options: MaxIterationsNotificationOptions): void {
  const { iterationsRun, tasksCompleted, tasksRemaining, durationMs, sound } = options;
  const durationStr = formatDuration(durationMs);

  const body = `${iterationsRun}회 반복 후 제한에 도달했습니다. ` +
    `완료: ${tasksCompleted}개, 남음: ${tasksRemaining}개. 소요 시간: ${durationStr}`;

  sendNotification({
    title: 'Ralph-TUI 최대 반복 횟수',
    body,
    sound,
  });
}

/**
 * 오류 알림 전송 옵션.
 */
export interface ErrorNotificationOptions {
  /** 간단한 오류 요약 */
  errorSummary: string;
  /** 실패 전 완료된 작업 수 */
  tasksCompleted: number;
  /** 총 소요 시간 (밀리초) */
  durationMs: number;
  /** 이 알림의 사운드 모드 */
  sound?: NotificationSoundMode;
}

/**
 * 치명적인 오류로 실행이 중단되면 데스크톱 알림을 보냅니다.
 *
 * 알림 내용:
 * - 제목: "Ralph-TUI 오류"
 * - 본문: 간단한 오류 요약, 실패 전 완료된 작업 수, 소요 시간 포함
 *
 * @param options - 오류 알림 옵션
 */
export function sendErrorNotification(options: ErrorNotificationOptions): void {
  const { errorSummary, tasksCompleted, durationMs, sound } = options;
  const durationStr = formatDuration(durationMs);

  // 알림에 너무 길면 오류 요약을 자름
  const maxErrorLength = 100;
  const truncatedError = errorSummary.length > maxErrorLength
    ? errorSummary.substring(0, maxErrorLength) + '...'
    : errorSummary;

  const body = `오류: ${truncatedError}\n` +
    `실패 전 ${tasksCompleted}개 작업 완료. 소요 시간: ${durationStr}`;

  sendNotification({
    title: 'Ralph-TUI 오류',
    body,
    sound,
  });
}
