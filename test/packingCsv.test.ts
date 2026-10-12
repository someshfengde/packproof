import { describe, expect, it } from 'vitest';
import { parseCsv } from '../src/client/packingCsv';

describe('packing list CSV', () => {
  it('accepts column order changes and quoted commas in item names', () => {
    expect(parseCsv('Name,Quantity,SKU\n"Mug, stoneware",12,MUG-1')).toEqual([
      { id: 'line-1', sku: 'MUG-1', name: 'Mug, stoneware', expectedQuantity: 12 },
    ]);
  });

  it('rejects missing columns, invalid quantities, and duplicate SKUs', () => {
    expect(() => parseCsv('SKU,Name\nA,Mug')).toThrow('CSV needs SKU, Name, and Quantity columns.');
    expect(() => parseCsv('SKU,Name,Quantity\nA,Mug,1.2')).toThrow('whole number quantity');
    expect(() => parseCsv('SKU,Name,Quantity\nA,Mug,1\na,Bowl,2')).toThrow('unique SKU');
  });

  it('rejects an unclosed quoted field', () => {
    expect(() => parseCsv('SKU,Name,Quantity\nA,"Mug,12')).toThrow('Close the quoted text');
  });
});
