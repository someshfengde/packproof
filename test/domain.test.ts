import { describe, expect, it } from 'vitest';
import { packingItemsSchema, reconcileLines, type Observation, type PackingItem } from '../src/server/domain';

const items: PackingItem[] = [
  { id: 'a', sku: 'MUG-1', name: 'Mug', expectedQuantity: 12 },
  { id: 'b', sku: 'BWL-2', name: 'Bowl', expectedQuantity: 6 },
  { id: 'c', sku: 'PLT-3', name: 'Plate', expectedQuantity: 4 },
];
const observations: Observation[] = [
  { itemId: 'a', observedQuantity: 10, visibility: 'complete', evidence: 'Open carton.', damage: null, confidence: 0.9, uncertainty: '' },
  { itemId: 'b', observedQuantity: 3, visibility: 'partial', evidence: 'Carton partly occluded.', damage: null, confidence: 0.6, uncertainty: 'May be more inside.' },
  { itemId: 'c', observedQuantity: null, visibility: 'unknown', evidence: 'Sealed carton.', damage: null, confidence: 0.95, uncertainty: 'Contents not visible.' },
];

describe('packing list validation', () => {
  it('rejects duplicate line IDs and duplicate SKUs case-insensitively', () => {
    expect(packingItemsSchema.safeParse([items[0], { ...items[1], id: 'a' }]).success).toBe(false);
    expect(packingItemsSchema.safeParse([items[0], { ...items[1], sku: 'mug-1' }]).success).toBe(false);
  });

  it('rejects invalid quantities and empty required fields', () => {
    expect(packingItemsSchema.safeParse([{ ...items[0], expectedQuantity: 1.5 }]).success).toBe(false);
    expect(packingItemsSchema.safeParse([{ ...items[0], expectedQuantity: -1 }]).success).toBe(false);
    expect(packingItemsSchema.safeParse([{ ...items[0], name: ' ' }]).success).toBe(false);
  });
});

describe('operator reconciliation', () => {
  it('keeps every model suggestion pending until an operator confirms it', () => {
    const lines = reconcileLines(items, observations, {});
    expect(lines.map((line) => line.outcome)).toEqual(['pending', 'pending', 'pending']);
    expect(lines[0].variance).toBeNull();
    expect(lines[1].outcome).not.toBe('short');
  });

  it('compares only the confirmed count to the signed packing-list expectation', () => {
    const lines = reconcileLines(items, observations, {
      a: { quantity: 10, confirmed: true },
      b: { quantity: 6, confirmed: true },
      c: { quantity: 4, confirmed: true },
    });
    expect(lines.map((line) => line.outcome)).toEqual(['short', 'matched', 'matched']);
    expect(lines.map((line) => line.variance)).toEqual([-2, 0, 0]);
    expect(lines[1].observation?.visibility).toBe('partial');
  });

  it('blocks a checked row with a missing operator count', () => {
    const lines = reconcileLines(items, observations, { a: { quantity: null, confirmed: true } });
    expect(lines[0].outcome).toBe('unresolved');
    expect(lines[1].outcome).toBe('pending');
  });
});
