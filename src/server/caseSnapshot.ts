import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { analysisSchema, packingItemsSchema, type Analysis, type PackingItem } from './domain.js';

export type CaseMetadata = {
  caseId: string;
  createdAt: string;
  imageName: string;
  imageSha256: string;
  mode: 'demo_fixture' | 'live_vertex';
  model: string | null;
  source: string;
};

export type CaseSnapshot = { metadata: CaseMetadata; items: PackingItem[]; analysis: Analysis };

const snapshotSchema = z.object({
  metadata: z.object({ caseId: z.string(), createdAt: z.string(), imageName: z.string(), imageSha256: z.string().length(64), mode: z.enum(['demo_fixture', 'live_vertex']), model: z.string().nullable(), source: z.string() }),
  items: packingItemsSchema,
  analysis: analysisSchema,
});

export function signCase(snapshot: CaseSnapshot, secret: string): string {
  if (!secret) throw new Error('CASE_SIGNING_SECRET must be set for production case exports.');
  const payload = Buffer.from(JSON.stringify(snapshot)).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyCase(token: string, secret: string): CaseSnapshot | null {
  if (!secret) return null;
  const [payload, providedSignature, extra] = token.split('.');
  if (!payload || !providedSignature || extra) return null;
  const expected = createHmac('sha256', secret).update(payload).digest();
  const received = Buffer.from(providedSignature, 'base64url');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  try {
    const snapshot = snapshotSchema.safeParse(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')));
    return snapshot.success ? snapshot.data : null;
  } catch { return null; }
}
