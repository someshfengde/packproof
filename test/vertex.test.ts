import { describe, expect, it, vi } from 'vitest';
import { sampleItems } from '../src/server/fixtures';
import type { VertexClient } from '../src/server/vertex';
import { analyzeImage } from '../src/server/vertex';

const validResponse = {
  imageSummary: 'Three cartons are at the desk.',
  observations: sampleItems.map((item, index) => ({
    itemId: item.id,
    observedQuantity: index === 1 ? null : 4,
    visibility: index === 0 ? 'complete' : index === 1 ? 'unknown' : 'partial',
    evidence: 'Visible sample evidence.',
    damage: null,
    confidence: 0.8,
    uncertainty: index === 1 ? 'Contents are sealed.' : 'Verify during physical review.',
  })),
};

describe('Gemini image analysis adapter', () => {
  it('constructs a multimodal request with JSON output and validates returned line IDs', async () => {
    const generateContent = vi.fn().mockResolvedValue({ text: JSON.stringify(validResponse) });
    const client = { models: { generateContent } } as unknown as VertexClient;
    const bytes = Buffer.from('fake-image');
    const result = await analyzeImage(client, 'gemini-test-model', bytes, 'image/png', sampleItems);

    expect(generateContent).toHaveBeenCalledTimes(1);
    const request = generateContent.mock.calls[0][0];
    expect(request.model).toBe('gemini-test-model');
    expect(request.config?.responseMimeType).toBe('application/json');
    expect(request.config?.responseJsonSchema).toBeDefined();
    expect(request.contents[0].parts[0].text).toContain('partial/unknown view cannot establish a shortage');
    expect(request.contents[0].parts[1].inlineData).toEqual({ data: bytes.toString('base64'), mimeType: 'image/png' });
    expect(result.observations).toHaveLength(sampleItems.length);
    expect(result.observations[1].observedQuantity).toBeNull();
  });

  it('rejects malformed schemas and missing or mismatched line IDs', async () => {
    const malformed = { models: { generateContent: vi.fn().mockResolvedValue({ text: '{"imageSummary":"x","observations":[]}' }) } } as unknown as VertexClient;
    await expect(analyzeImage(malformed, 'model', Buffer.from('x'), 'image/jpeg', sampleItems)).rejects.toThrow('did not match the packing list lines');

    const wrongId = { ...validResponse, observations: [{ ...validResponse.observations[0], itemId: 'invented-line' }] };
    const mismatched = { models: { generateContent: vi.fn().mockResolvedValue({ text: JSON.stringify(wrongId) }) } } as unknown as VertexClient;
    await expect(analyzeImage(mismatched, 'model', Buffer.from('x'), 'image/jpeg', sampleItems)).rejects.toThrow('did not match the packing list lines');

    const invalidShape = { models: { generateContent: vi.fn().mockResolvedValue({ text: JSON.stringify({ imageSummary: 'x', observations: [{ itemId: 'a', observedQuantity: -1 }] }) }) } } as unknown as VertexClient;
    await expect(analyzeImage(invalidShape, 'model', Buffer.from('x'), 'image/jpeg', sampleItems)).rejects.toThrow('did not match the required schema');
  });
});
