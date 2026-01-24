/**
 * ABOUTME: Tests for the TUI theme module.
 * Tests utility functions, constants, and color mappings.
 */

import { describe, test, expect } from 'bun:test';
import {
  colors,
  statusIndicators,
  keyboardShortcuts,
  fullKeyboardShortcuts,
  layout,
  getTaskStatusColor,
  getTaskStatusIndicator,
  formatElapsedTime,
  type RalphStatus,
  type TaskStatus,
} from '../../src/tui/theme.js';

describe('theme', () => {
  describe('colors', () => {
    test('should have background colors defined', () => {
      expect(colors.bg.primary).toBeDefined();
      expect(colors.bg.secondary).toBeDefined();
      expect(colors.bg.tertiary).toBeDefined();
      expect(colors.bg.highlight).toBeDefined();
    });

    test('should have foreground colors defined', () => {
      expect(colors.fg.primary).toBeDefined();
      expect(colors.fg.secondary).toBeDefined();
      expect(colors.fg.muted).toBeDefined();
      expect(colors.fg.dim).toBeDefined();
    });

    test('should have status colors defined', () => {
      expect(colors.status.success).toBeDefined();
      expect(colors.status.warning).toBeDefined();
      expect(colors.status.error).toBeDefined();
      expect(colors.status.info).toBeDefined();
    });

    test('should have task status colors defined', () => {
      expect(colors.task.done).toBeDefined();
      expect(colors.task.active).toBeDefined();
      expect(colors.task.actionable).toBeDefined();
      expect(colors.task.pending).toBeDefined();
      expect(colors.task.blocked).toBeDefined();
      expect(colors.task.error).toBeDefined();
      expect(colors.task.closed).toBeDefined();
    });

    test('should have accent colors defined', () => {
      expect(colors.accent.primary).toBeDefined();
      expect(colors.accent.secondary).toBeDefined();
      expect(colors.accent.tertiary).toBeDefined();
    });

    test('should have border colors defined', () => {
      expect(colors.border.normal).toBeDefined();
      expect(colors.border.active).toBeDefined();
      expect(colors.border.muted).toBeDefined();
    });

    test('should have valid hex color format', () => {
      const hexColorRegex = /^#[0-9a-fA-F]{6}$/;
      expect(colors.bg.primary).toMatch(hexColorRegex);
      expect(colors.fg.primary).toMatch(hexColorRegex);
      expect(colors.status.success).toMatch(hexColorRegex);
    });
  });

  describe('statusIndicators', () => {
    test('should have task status indicators', () => {
      expect(statusIndicators.done).toBeDefined();
      expect(statusIndicators.active).toBeDefined();
      expect(statusIndicators.actionable).toBeDefined();
      expect(statusIndicators.pending).toBeDefined();
      expect(statusIndicators.blocked).toBeDefined();
      expect(statusIndicators.error).toBeDefined();
      expect(statusIndicators.closed).toBeDefined();
    });

    test('should have ralph status indicators', () => {
      expect(statusIndicators.running).toBeDefined();
      expect(statusIndicators.selecting).toBeDefined();
      expect(statusIndicators.executing).toBeDefined();
      expect(statusIndicators.pausing).toBeDefined();
      expect(statusIndicators.paused).toBeDefined();
      expect(statusIndicators.stopped).toBeDefined();
      expect(statusIndicators.complete).toBeDefined();
      expect(statusIndicators.idle).toBeDefined();
      expect(statusIndicators.ready).toBeDefined();
    });

    test('should use single character indicators', () => {
      // All indicators should be single characters (Unicode okay)
      Object.values(statusIndicators).forEach((indicator) => {
        expect(indicator.length).toBeLessThanOrEqual(2); // Unicode chars can be 2 code units
      });
    });
  });

  describe('keyboardShortcuts', () => {
    test('should have shortcuts defined', () => {
      expect(keyboardShortcuts.length).toBeGreaterThan(0);
    });

    test('should have key and description for each shortcut', () => {
      keyboardShortcuts.forEach((shortcut) => {
        expect(shortcut.key).toBeDefined();
        expect(shortcut.description).toBeDefined();
        expect(shortcut.key.length).toBeGreaterThan(0);
        expect(shortcut.description.length).toBeGreaterThan(0);
      });
    });

    test('should have quit shortcut', () => {
      const quitShortcut = keyboardShortcuts.find((s) => s.key === 'q');
      expect(quitShortcut).toBeDefined();
      expect(quitShortcut?.description).toContain('종료');
    });

    test('should have help shortcut', () => {
      const helpShortcut = keyboardShortcuts.find((s) => s.key === '?');
      expect(helpShortcut).toBeDefined();
    });
  });

  describe('fullKeyboardShortcuts', () => {
    test('should have more shortcuts than condensed version', () => {
      expect(fullKeyboardShortcuts.length).toBeGreaterThan(keyboardShortcuts.length);
    });

    test('should have category for each shortcut', () => {
      fullKeyboardShortcuts.forEach((shortcut) => {
        expect(shortcut.key).toBeDefined();
        expect(shortcut.description).toBeDefined();
        expect(shortcut.category).toBeDefined();
      });
    });

    test('should have common categories', () => {
      const categories = new Set(fullKeyboardShortcuts.map((s) => s.category));
      expect(categories.has('일반')).toBe(true);
      expect(categories.has('실행')).toBe(true);
    });
  });

  describe('layout', () => {
    test('should have header dimensions', () => {
      expect(layout.header.height).toBeDefined();
      expect(layout.header.height).toBeGreaterThan(0);
    });

    test('should have footer dimensions', () => {
      expect(layout.footer.height).toBeDefined();
      expect(layout.footer.height).toBeGreaterThan(0);
    });

    test('should have left panel constraints', () => {
      expect(layout.leftPanel.minWidth).toBeDefined();
      expect(layout.leftPanel.maxWidth).toBeDefined();
      expect(layout.leftPanel.defaultWidthPercent).toBeDefined();
      expect(layout.leftPanel.minWidth).toBeLessThan(layout.leftPanel.maxWidth);
    });

    test('should have right panel constraints', () => {
      expect(layout.rightPanel.minWidth).toBeDefined();
    });

    test('should have padding values', () => {
      expect(layout.padding.small).toBeDefined();
      expect(layout.padding.medium).toBeDefined();
      expect(layout.padding.small).toBeLessThan(layout.padding.medium);
    });

    test('should have progress dashboard height', () => {
      expect(layout.progressDashboard.height).toBeDefined();
      expect(layout.progressDashboard.height).toBeGreaterThan(0);
    });
  });

  describe('getTaskStatusColor', () => {
    const taskStatuses: TaskStatus[] = ['done', 'active', 'actionable', 'pending', 'blocked', 'error', 'closed'];

    test('should return valid color for all task statuses', () => {
      taskStatuses.forEach((status) => {
        const color = getTaskStatusColor(status);
        expect(color).toBeDefined();
        expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
      });
    });

    test('should return green for done status', () => {
      expect(getTaskStatusColor('done')).toBe(colors.task.done);
    });

    test('should return blue for active status', () => {
      expect(getTaskStatusColor('active')).toBe(colors.task.active);
    });

    test('should return red for blocked status', () => {
      expect(getTaskStatusColor('blocked')).toBe(colors.task.blocked);
    });

    test('should return grey for pending status', () => {
      expect(getTaskStatusColor('pending')).toBe(colors.task.pending);
    });
  });

  describe('getTaskStatusIndicator', () => {
    const taskStatuses: TaskStatus[] = ['done', 'active', 'actionable', 'pending', 'blocked', 'error', 'closed'];

    test('should return indicator for all task statuses', () => {
      taskStatuses.forEach((status) => {
        const indicator = getTaskStatusIndicator(status);
        expect(indicator).toBeDefined();
        expect(indicator.length).toBeGreaterThan(0);
      });
    });

    test('should return checkmark for done status', () => {
      expect(getTaskStatusIndicator('done')).toBe(statusIndicators.done);
      expect(getTaskStatusIndicator('done')).toBe('✓');
    });

    test('should return play triangle for active status (currently running)', () => {
      expect(getTaskStatusIndicator('active')).toBe(statusIndicators.active);
      expect(getTaskStatusIndicator('active')).toBe('▶');
    });

    test('should return circle for actionable status (ready to work on)', () => {
      expect(getTaskStatusIndicator('actionable')).toBe(statusIndicators.actionable);
      expect(getTaskStatusIndicator('actionable')).toBe('○');
    });

    test('should return no-entry symbol for blocked status', () => {
      expect(getTaskStatusIndicator('blocked')).toBe(statusIndicators.blocked);
      expect(getTaskStatusIndicator('blocked')).toBe('⊘');
    });

    test('should return X for error status', () => {
      expect(getTaskStatusIndicator('error')).toBe(statusIndicators.error);
      expect(getTaskStatusIndicator('error')).toBe('✗');
    });

    test('should return checkmark for closed status (greyed)', () => {
      expect(getTaskStatusIndicator('closed')).toBe(statusIndicators.closed);
      expect(getTaskStatusIndicator('closed')).toBe('✓');
    });
  });

  describe('task status colors (Issue 180)', () => {
    test('active status should be green (same as done)', () => {
      // Active tasks (currently running) should be green, not blue
      expect(colors.task.active).toBe('#9ece6a');
      expect(colors.task.active).toBe(colors.task.done);
    });

    test('actionable status should be green', () => {
      // Actionable tasks (ready to work on) should be green
      expect(colors.task.actionable).toBe('#9ece6a');
    });

    test('blocked and error status should be red', () => {
      // Blocked and error tasks should be red
      expect(colors.task.blocked).toBe('#f7768e');
      expect(colors.task.error).toBe('#f7768e');
      expect(colors.task.blocked).toBe(colors.task.error);
    });

    test('pending status should be grey/muted', () => {
      expect(colors.task.pending).toBe('#565f89');
    });

    test('closed status should be dimmed', () => {
      expect(colors.task.closed).toBe('#414868');
    });
  });

  describe('formatElapsedTime', () => {
    test('should format seconds only', () => {
      expect(formatElapsedTime(0)).toBe('0초');
      expect(formatElapsedTime(1)).toBe('1초');
      expect(formatElapsedTime(30)).toBe('30초');
      expect(formatElapsedTime(59)).toBe('59초');
    });

    test('should format minutes and seconds', () => {
      expect(formatElapsedTime(60)).toBe('1분 0초');
      expect(formatElapsedTime(61)).toBe('1분 1초');
      expect(formatElapsedTime(90)).toBe('1분 30초');
      expect(formatElapsedTime(125)).toBe('2분 5초');
      expect(formatElapsedTime(3599)).toBe('59분 59초');
    });

    test('should format hours, minutes, and seconds', () => {
      expect(formatElapsedTime(3600)).toBe('1시간 0분 0초');
      expect(formatElapsedTime(3661)).toBe('1시간 1분 1초');
      expect(formatElapsedTime(7200)).toBe('2시간 0분 0초');
      expect(formatElapsedTime(7325)).toBe('2시간 2분 5초');
    });

    test('should handle large values', () => {
      expect(formatElapsedTime(86400)).toBe('24시간 0분 0초');
      expect(formatElapsedTime(90061)).toBe('25시간 1분 1초');
    });
  });
});
