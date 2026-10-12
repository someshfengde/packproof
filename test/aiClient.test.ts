import { describe, expect, it, vi } from 'vitest';
import { createAiClient, isAiConfigurationReady } from '../src/server/aiClient';

describe('Google Gen AI client selection', () => {
  it('constructs a Gemini Developer API client with the server key and bounded requests', () => {
    const factory = vi.fn(() => ({ models: {} }));
    const client = createAiClient('live_gemini_api', { apiKey: 'server-only-test-key' }, factory);

    expect(client).toBeDefined();
    expect(factory).toHaveBeenCalledWith({
      vertexai: false,
      apiKey: 'server-only-test-key',
      httpOptions: { timeout: 75_000, retryOptions: { attempts: 1 } },
    });
  });

  it('keeps Vertex authentication separate and refuses missing credentials without fallback', () => {
    const factory = vi.fn(() => ({ models: {} }));
    expect(createAiClient('live_vertex', { project: 'test-project', location: 'global' }, factory)).toBeDefined();
    expect(factory).toHaveBeenCalledWith({
      vertexai: true,
      project: 'test-project',
      location: 'global',
      httpOptions: { timeout: 75_000, retryOptions: { attempts: 1 } },
    });

    factory.mockClear();
    expect(createAiClient('live_gemini_api', {}, factory)).toBeNull();
    expect(createAiClient('live_vertex', {}, factory)).toBeNull();
    expect(factory).not.toHaveBeenCalled();
  });

  it('reports readiness only when signing and selected-provider credentials are present', () => {
    const client = { models: {} };
    expect(isAiConfigurationReady('demo_fixture', { signingSecret: 'stable', project: '', apiKey: '', client: null })).toBe(true);
    expect(isAiConfigurationReady('demo_fixture', { signingSecret: '', project: '', apiKey: '', client: null })).toBe(false);
    expect(isAiConfigurationReady('live_gemini_api', { signingSecret: 'stable', project: '', apiKey: '', client })).toBe(false);
    expect(isAiConfigurationReady('live_gemini_api', { signingSecret: 'stable', project: '', apiKey: 'set', client })).toBe(true);
    expect(isAiConfigurationReady('live_vertex', { signingSecret: 'stable', project: '', apiKey: 'set', client })).toBe(false);
    expect(isAiConfigurationReady('live_vertex', { signingSecret: 'stable', project: 'project', apiKey: '', client })).toBe(true);
  });
});
