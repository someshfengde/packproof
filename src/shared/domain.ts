import { z } from 'zod';

export const packingItemSchema = z.object({
  id: z.string().trim().min(1).max(48),
  sku: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(120),
  expectedQuantity: z.number().int().min(0).max(100_000),
});

export const packingItemsSchema = z.array(packingItemSchema).min(1).max(100).superRefine((items, ctx) => {
  const ids = new Set<string>();
  const skus = new Set<string>();
  items.forEach((item, index) => {
    const normalizedSku = item.sku.toLocaleUpperCase();
    if (ids.has(item.id)) ctx.addIssue({ code: 'custom', path: [index, 'id'], message: `Duplicate line ID: ${item.id}` });
    if (skus.has(normalizedSku)) ctx.addIssue({ code: 'custom', path: [index, 'sku'], message: `Duplicate SKU: ${item.sku}` });
    ids.add(item.id);
    skus.add(normalizedSku);
  });
});

export const visibilitySchema = z.enum(['complete', 'partial', 'unknown']);
export const observationSchema = z.object({
  itemId: z.string().min(1),
  observedQuantity: z.number().int().min(0).nullable(),
  visibility: visibilitySchema,
  evidence: z.string().max(500),
  damage: z.string().max(300).nullable(),
  confidence: z.number().min(0).max(1),
  uncertainty: z.string().max(500),
});
export const analysisSchema = z.object({ observations: z.array(observationSchema), imageSummary: z.string().max(600) });

export type PackingItem = z.infer<typeof packingItemSchema>;
export type Observation = z.infer<typeof observationSchema>;
export type Analysis = z.infer<typeof analysisSchema>;
export type ReviewConfirmation = { quantity: number | null; confirmed: boolean; note?: string };

export type ReconciledLine = {
  item: PackingItem; observation: Observation | null; confirmedQuantity: number | null;
  confirmed: boolean; outcome: 'pending' | 'matched' | 'short' | 'over' | 'unresolved'; variance: number | null;
};

export const confirmationSchema = z.object({
  quantity: z.number().int().min(0).max(100_000).nullable(),
  confirmed: z.boolean(),
  note: z.string().trim().max(300).default(''),
});

export function reconcileLines(items: PackingItem[], observations: Observation[], confirmations: Record<string, ReviewConfirmation>): ReconciledLine[] {
  const byId = new Map(observations.map((observation) => [observation.itemId, observation]));
  return items.map((item) => {
    const observation = byId.get(item.id) ?? null;
    const confirmation = confirmations[item.id];
    const confirmedQuantity = confirmation?.quantity ?? null;
    const confirmed = confirmation?.confirmed === true && confirmedQuantity !== null;
    if (!confirmed) return { item, observation, confirmedQuantity, confirmed: false, outcome: confirmation?.confirmed ? 'unresolved' : 'pending', variance: null };
    const variance = confirmedQuantity - item.expectedQuantity;
    return { item, observation, confirmedQuantity, confirmed: true, outcome: variance === 0 ? 'matched' : variance < 0 ? 'short' : 'over', variance };
  });
}
