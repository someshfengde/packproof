import { describe, expect, it } from 'vitest';
import { signCase, verifyCase } from '../src/server/caseSnapshot';
import { sampleAnalysis, sampleItems } from '../src/server/fixtures';

const snapshot = {
  metadata: {
    caseId: 'PP-TEST', createdAt: '2026-10-12T12:00:00.000Z', imageName: 'receipt.webp', imageSha256: 'a'.repeat(64),
    mode: 'demo_fixture' as const, model: null, source: 'deterministic_sample_fixture',
  },
  items: sampleItems,
  analysis: sampleAnalysis,
};

describe('signed case snapshots', () => {
  it('preserves the source packing list and image metadata for later review/export', () => {
    const token = signCase(snapshot, 'a-stable-test-secret');
    expect(verifyCase(token, 'a-stable-test-secret')).toEqual(snapshot);
    expect(verifyCase(token, 'another-secret')).toBeNull();
  });

  it('rejects changed expected quantities and malformed tokens', () => {
    const token = signCase(snapshot, 'stable-key');
    const [payload, signature] = token.split('.');
    const tamperedPayload = Buffer.from(JSON.stringify({ ...snapshot, items: [{ ...sampleItems[0], expectedQuantity: 999 }, ...sampleItems.slice(1)] })).toString('base64url');
    expect(verifyCase(`${tamperedPayload}.${signature}`, 'stable-key')).toBeNull();
    expect(verifyCase('not-a-token', 'stable-key')).toBeNull();
    expect(verifyCase(`${payload}.bad`, 'stable-key')).toBeNull();
  });
});
