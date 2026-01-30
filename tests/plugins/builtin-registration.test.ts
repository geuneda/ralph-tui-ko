/**
 * ABOUTME: Tests for built-in plugin factory functions.
 * Tests the exported factory functions for built-in agents and trackers.
 */

import { describe, test, expect } from 'bun:test';
import { createClaudeAgent, createOpenCodeAgent, createDroidAgent, createGeminiAgent, createCodexAgent, createKiroAgent } from '../../src/plugins/agents/builtin/index.js';
import { builtinTrackers, createJsonTracker, createBeadsTracker, createBeadsBvTracker, createBeadsRustTracker, createHierarchicalJsonTracker } from '../../src/plugins/trackers/builtin/index.js';

describe('builtin agent factory functions', () => {
  test('createClaudeAgent is exported and callable', () => {
    expect(typeof createClaudeAgent).toBe('function');
    const plugin = createClaudeAgent();
    expect(plugin).toBeDefined();
    expect(plugin.meta.id).toBe('claude');
  });

  test('createOpenCodeAgent is exported and callable', () => {
    expect(typeof createOpenCodeAgent).toBe('function');
    const plugin = createOpenCodeAgent();
    expect(plugin).toBeDefined();
    expect(plugin.meta.id).toBe('opencode');
  });

  test('createDroidAgent is exported and callable', () => {
    expect(typeof createDroidAgent).toBe('function');
    const plugin = createDroidAgent();
    expect(plugin).toBeDefined();
    expect(plugin.meta.id).toBe('droid');
  });

  test('createGeminiAgent is exported and callable', () => {
    expect(typeof createGeminiAgent).toBe('function');
    const plugin = createGeminiAgent();
    expect(plugin).toBeDefined();
    expect(plugin.meta.id).toBe('gemini');
  });

  test('createCodexAgent is exported and callable', () => {
    expect(typeof createCodexAgent).toBe('function');
    const plugin = createCodexAgent();
    expect(plugin).toBeDefined();
    expect(plugin.meta.id).toBe('codex');
  });

  test('createKiroAgent is exported and callable', () => {
    expect(typeof createKiroAgent).toBe('function');
    const plugin = createKiroAgent();
    expect(plugin).toBeDefined();
    expect(plugin.meta.id).toBe('kiro');
  });
});

describe('builtin tracker factory functions', () => {
  describe('builtinTrackers map', () => {
    test('contains all expected tracker factories', () => {
      expect(builtinTrackers.json).toBeDefined();
      expect(builtinTrackers.beads).toBeDefined();
      expect(builtinTrackers['beads-bv']).toBeDefined();
      expect(builtinTrackers['beads-rust']).toBeDefined();
      expect(builtinTrackers['hierarchical-json']).toBeDefined();
    });

    test('has correct number of trackers', () => {
      expect(Object.keys(builtinTrackers).length).toBe(5);
    });
  });

  test('createJsonTracker is exported and callable', () => {
    expect(typeof createJsonTracker).toBe('function');
    const plugin = createJsonTracker();
    expect(plugin).toBeDefined();
    expect(plugin.meta.id).toBe('json');
  });

  test('createBeadsTracker is exported and callable', () => {
    expect(typeof createBeadsTracker).toBe('function');
    const plugin = createBeadsTracker();
    expect(plugin).toBeDefined();
    expect(plugin.meta.id).toBe('beads');
  });

  test('createBeadsBvTracker is exported and callable', () => {
    expect(typeof createBeadsBvTracker).toBe('function');
    const plugin = createBeadsBvTracker();
    expect(plugin).toBeDefined();
    expect(plugin.meta.id).toBe('beads-bv');
  });

  test('createBeadsRustTracker is exported and callable', () => {
    expect(typeof createBeadsRustTracker).toBe('function');
    const plugin = createBeadsRustTracker();
    expect(plugin).toBeDefined();
    expect(plugin.meta.id).toBe('beads-rust');
  });

  test('createHierarchicalJsonTracker is exported and callable', () => {
    expect(typeof createHierarchicalJsonTracker).toBe('function');
    const plugin = createHierarchicalJsonTracker();
    expect(plugin).toBeDefined();
    expect(plugin.meta.id).toBe('hierarchical-json');
  });
});
