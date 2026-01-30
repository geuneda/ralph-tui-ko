/**
 * ABOUTME: Tests for the notifications module.
 * Tests notification utility functions and configuration resolution.
 */

import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';
import {
  formatDuration,
  resolveNotificationsEnabled,
  sendNotification,
  sendCompletionNotification,
  sendMaxIterationsNotification,
  sendErrorNotification,
} from '../src/notifications.js';
import type { NotificationsConfig } from '../src/config/types.js';

describe('notifications module', () => {
  describe('formatDuration', () => {
    test('formats 0 milliseconds correctly', () => {
      expect(formatDuration(0)).toBe('0분 0초');
    });

    test('formats seconds only', () => {
      expect(formatDuration(30000)).toBe('0분 30초');
    });

    test('formats minutes only', () => {
      expect(formatDuration(120000)).toBe('2분 0초');
    });

    test('formats minutes and seconds', () => {
      expect(formatDuration(65000)).toBe('1분 5초');
    });

    test('formats larger durations', () => {
      expect(formatDuration(125000)).toBe('2분 5초');
    });

    test('rounds down partial seconds', () => {
      expect(formatDuration(65500)).toBe('1분 5초');
    });

    test('handles hour-length durations', () => {
      expect(formatDuration(3661000)).toBe('61분 1초');
    });
  });

  describe('resolveNotificationsEnabled', () => {
    test('returns CLI flag when provided (true)', () => {
      const config: NotificationsConfig = { enabled: false };
      expect(resolveNotificationsEnabled(config, true)).toBe(true);
    });

    test('returns CLI flag when provided (false)', () => {
      const config: NotificationsConfig = { enabled: true };
      expect(resolveNotificationsEnabled(config, false)).toBe(false);
    });

    test('returns config value when CLI flag is undefined', () => {
      const configEnabled: NotificationsConfig = { enabled: true };
      expect(resolveNotificationsEnabled(configEnabled, undefined)).toBe(true);

      const configDisabled: NotificationsConfig = { enabled: false };
      expect(resolveNotificationsEnabled(configDisabled, undefined)).toBe(false);
    });

    test('returns default (true) when both are undefined', () => {
      expect(resolveNotificationsEnabled(undefined, undefined)).toBe(true);
    });

    test('returns default (true) when config is empty object', () => {
      expect(resolveNotificationsEnabled({}, undefined)).toBe(true);
    });

    test('returns config.enabled when CLI is undefined and config has value', () => {
      expect(resolveNotificationsEnabled({ enabled: false }, undefined)).toBe(false);
    });
  });

  describe('sendNotification', () => {
    test('does not throw when called with valid options', () => {
      expect(() => {
        sendNotification({
          title: 'Test Title',
          body: 'Test Body',
        });
      }).not.toThrow();
    });

    test('does not throw with optional icon', () => {
      expect(() => {
        sendNotification({
          title: 'Test Title',
          body: 'Test Body',
          icon: '/path/to/icon.png',
        });
      }).not.toThrow();
    });

    test('does not throw with sound option', () => {
      expect(() => {
        sendNotification({
          title: 'Test Title',
          body: 'Test Body',
          sound: 'system',
        });
      }).not.toThrow();
    });
  });

  describe('sendCompletionNotification', () => {
    test('does not throw when called with valid options', () => {
      expect(() => {
        sendCompletionNotification({
          durationMs: 60000,
          taskCount: 5,
        });
      }).not.toThrow();
    });

    test('does not throw with sound option', () => {
      expect(() => {
        sendCompletionNotification({
          durationMs: 120000,
          taskCount: 10,
          sound: 'ralph',
        });
      }).not.toThrow();
    });
  });

  describe('sendMaxIterationsNotification', () => {
    test('does not throw when called with valid options', () => {
      expect(() => {
        sendMaxIterationsNotification({
          iterationsRun: 50,
          tasksCompleted: 3,
          tasksRemaining: 2,
          durationMs: 300000,
        });
      }).not.toThrow();
    });

    test('does not throw with sound option', () => {
      expect(() => {
        sendMaxIterationsNotification({
          iterationsRun: 100,
          tasksCompleted: 8,
          tasksRemaining: 1,
          durationMs: 600000,
          sound: 'system',
        });
      }).not.toThrow();
    });
  });

  describe('sendErrorNotification', () => {
    test('does not throw when called with valid options', () => {
      expect(() => {
        sendErrorNotification({
          errorSummary: 'Test error occurred',
          tasksCompleted: 2,
          durationMs: 45000,
        });
      }).not.toThrow();
    });

    test('does not throw with long error message', () => {
      const longError = 'A'.repeat(200);
      expect(() => {
        sendErrorNotification({
          errorSummary: longError,
          tasksCompleted: 0,
          durationMs: 1000,
        });
      }).not.toThrow();
    });

    test('does not throw with sound option', () => {
      expect(() => {
        sendErrorNotification({
          errorSummary: 'Connection failed',
          tasksCompleted: 5,
          durationMs: 120000,
          sound: 'ralph',
        });
      }).not.toThrow();
    });
  });
});
