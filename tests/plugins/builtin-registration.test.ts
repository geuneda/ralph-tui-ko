/**
 * ABOUTME: Tests for built-in plugin registration.
 * Tests the registration of built-in agents and trackers with their registries.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { registerBuiltinAgents, createClaudeAgent, createOpenCodeAgent, createDroidAgent, createGeminiAgent, createCodexAgent, createKiroAgent } from '../../src/plugins/agents/builtin/index.js';
import { registerBuiltinTrackers, builtinTrackers, createJsonTracker, createBeadsTracker, createBeadsBvTracker, createBeadsRustTracker, createHierarchicalJsonTracker } from '../../src/plugins/trackers/builtin/index.js';
import { getAgentRegistry, AgentRegistry } from '../../src/plugins/agents/registry.js';
import { getTrackerRegistry, TrackerRegistry } from '../../src/plugins/trackers/registry.js';

describe('builtin agent registration', () => {
  beforeEach(() => {
    AgentRegistry.resetInstance();
  });

  afterEach(() => {
    AgentRegistry.resetInstance();
  });

  describe('registerBuiltinAgents', () => {
    test('registers all built-in agents without error', () => {
      expect(() => registerBuiltinAgents()).not.toThrow();
    });

    test('makes agents available in registry after registration', () => {
      registerBuiltinAgents();
      const registry = getAgentRegistry();

      // Check that some known agents are registered
      expect(registry.hasPlugin('claude')).toBe(true);
      expect(registry.hasPlugin('opencode')).toBe(true);
    });

    test('can be called multiple times without error', () => {
      expect(() => {
        registerBuiltinAgents();
        registerBuiltinAgents();
      }).not.toThrow();
    });
  });

  describe('exported factory functions', () => {
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
});

describe('builtin tracker registration', () => {
  beforeEach(() => {
    TrackerRegistry.resetInstance();
  });

  afterEach(() => {
    TrackerRegistry.resetInstance();
  });

  describe('registerBuiltinTrackers', () => {
    test('registers all built-in trackers without error', () => {
      expect(() => registerBuiltinTrackers()).not.toThrow();
    });

    test('makes trackers available in registry after registration', () => {
      registerBuiltinTrackers();
      const registry = getTrackerRegistry();

      // Check that some known trackers are registered
      expect(registry.hasPlugin('json')).toBe(true);
      expect(registry.hasPlugin('beads')).toBe(true);
    });

    test('can be called multiple times without error', () => {
      expect(() => {
        registerBuiltinTrackers();
        registerBuiltinTrackers();
      }).not.toThrow();
    });
  });

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

  describe('exported factory functions', () => {
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
});
