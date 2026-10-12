import { describe, expect, it } from 'vitest';
import { buildInspectionPrompt, buildInspectionRequest, buildResponseSchema, validateAnalysisForItems } from '../src/client/firebaseAnalysis';
import { exportCase, type CaseData } from '../src/client/transport';
import type { PackingItem } from '../src/shared/domain';

const items: PackingItem[] = [
  { id: 'line-a', sku: 'MUG-1', name: 'Mug', expectedQuantity: 12 },
  { id: 'line-b', sku: 'BOWL-2', name: 'Bowl', expectedQuantity: 6 },
];
const goodAnalysis = {
  imageSummary: 'Two cartons; one remains sealed.',
  observations: [
    { itemId: 'line-a', observedQuantity: 10, visibility: 'complete', evidence: 'Ten rims are visible.', damage: null, confidence: 0.9, uncertainty: '' },
    { itemId: 'line-b', observedQuantity: null, visibility: 'unknown', evidence: 'Carton is sealed.', damage: null, confidence: 0.95, uncertainty: 'Contents cannot be seen.' },
  ],
};

describe('Firebase AI Logic request adapter', () => {
  it('builds a multimodal structured request with only the submitted SKU IDs', async () => {
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2]);
    const request = await buildInspectionRequest(new File([png], 'dock.png', { type: 'image/png' }), items);
    expect(request.image.inlineData.mimeType).toBe('image/png');
    expect(request.image.inlineData.data).toBe('iVBORw0KGgoBAg==');
    expect(request.prompt).toContain('line-a | SKU MUG-1 | Mug | expected 12');
    expect(request.prompt).toContain('line-b | SKU BOWL-2 | Bowl | expected 6');
    expect(request.prompt).toContain('mark visibility partial or unknown; a partial/unknown view cannot establish a shortage');
    expect(request.responseSchema).toBeInstanceOf(buildResponseSchema().constructor);
  });

  it('rejects a MIME spoof or oversized file before calling the model', async () => {
    await expect(buildInspectionRequest(new File(['hello'], 'fake.png', { type: 'image/png' }), items)).rejects.toThrow('valid JPG, PNG, or WebP');
    const large = new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' });
    await expect(buildInspectionRequest(large, items)).rejects.toThrow('up to 8 MB');
  });

  it('accepts schema-valid observations only when every original packing ID appears exactly once', () => {
    expect(validateAnalysisForItems(JSON.stringify(goodAnalysis), items)).toEqual(goodAnalysis);
    expect(() => validateAnalysisForItems(JSON.stringify({ ...goodAnalysis, observations: [goodAnalysis.observations[0], { ...goodAnalysis.observations[1], itemId: 'attacker-id' }] }), items)).toThrow('every packing-list line');
    expect(() => validateAnalysisForItems('{broken json', items)).toThrow('invalid JSON');
  });
});

describe('Firebase local approval and export', () => {
  const caseData: CaseData = {
    caseId: 'PP-LOCAL-01', createdAt: '2026-10-12T00:00:00.000Z', imageName: 'dock.png', imageSha256: 'a'.repeat(64),
    mode: 'firebase_ai_logic', model: 'gemini-3.5-flash-lite', source: 'firebase_ai_logic', items, ...goodAnalysis,
  };

  it('blocks incomplete review and emits an explicitly unsigned packet only after operator confirmation', async () => {
    const blocked = await exportCase(caseData, items, { 'line-a': { quantity: '10', confirmed: true, note: '' } });
    expect(blocked.status).toBe('blocked');
    expect(blocked.unresolvedIds).toEqual(['line-b']);

    const ready = await exportCase(caseData, items, {
      'line-a': { quantity: '12', confirmed: true, note: 'Physically counted at dock.' },
      'line-b': { quantity: '6', confirmed: true, note: '' },
    });
    expect(ready.status).toBe('ready');
    expect(ready.reportJson?.mode).toBe('firebase_ai_logic');
    expect(ready.reportJson?.packetIntegrity).toContain('not signed or tamper-resistant');
    expect(ready.reportText).toContain('operator confirmed 6');
    expect(ready.reportText).toContain('No claim was sent to a supplier.');
  });

  it('keeps the fixed sample fixture separate and still exports it as a local unsigned packet', async () => {
    const fixed = { ...caseData, caseId: 'PP-SAMPLE-01', mode: 'demo_fixture' as const, model: null, source: 'deterministic_sample_fixture' };
    const packet = await exportCase(fixed, items, {
      'line-a': { quantity: '12', confirmed: true, note: '' },
      'line-b': { quantity: '6', confirmed: true, note: '' },
    });
    expect(packet.local).toBe(true);
    expect(packet.reportJson?.mode).toBe('demo_fixture');
    expect(packet.reportJson?.evidenceSource).toBe('deterministic_sample_fixture');
    expect(packet.reportJson?.packetIntegrity).toContain('not signed or tamper-resistant');
  });

  it('labels real-model analysis of the synthetic illustration as a simulated review', async () => {
    const synthetic = { ...caseData, imageName: 'packproof-synthetic-receiving.png', syntheticDemoInput: true };
    const packet = await exportCase(synthetic, items, {
      'line-a': { quantity: '12', confirmed: true, note: '' },
      'line-b': { quantity: '6', confirmed: true, note: '' },
    });
    expect(packet.reportJson?.mode).toBe('firebase_ai_logic');
    expect(packet.reportJson?.model).toBe('gemini-3.5-flash-lite');
    expect(packet.reportJson?.demoInput).toBe(true);
    expect(packet.reportJson?.confirmationContext).toContain('no physical receipt check was performed');
    expect(packet.reportJson?.decisionBasis).toContain('not a physical receiving inspection');
    expect(packet.reportText).toContain('Demo input: yes, synthetic illustration');
  });
});
