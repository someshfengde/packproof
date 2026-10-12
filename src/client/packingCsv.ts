import type { Item } from './types';

export function parseCsv(input: string): Item[] {
  const rows: string[][] = [];
  let row: string[] = []; let cell = ''; let quoted = false;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (char === '"' && quoted && input[i + 1] === '"') { cell += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(cell.trim()); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && input[i + 1] === '\n') i += 1;
      row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = '';
    } else cell += char;
  }
  if (quoted) throw new Error('Close the quoted text in your CSV, then try again.');
  row.push(cell.trim()); if (row.some(Boolean)) rows.push(row);
  const headers = (rows.shift() ?? []).map((value) => value.toLowerCase());
  const skuAt = headers.indexOf('sku'); const nameAt = headers.indexOf('name'); const quantityAt = headers.indexOf('quantity');
  if ([skuAt, nameAt, quantityAt].some((index) => index < 0)) throw new Error('CSV needs SKU, Name, and Quantity columns.');
  const items = rows.map((cells, index) => {
    const expectedQuantity = Number(cells[quantityAt]);
    const item = { id: `line-${index + 1}`, sku: cells[skuAt] ?? '', name: cells[nameAt] ?? '', expectedQuantity };
    if (!item.sku || !item.name || !Number.isInteger(expectedQuantity) || expectedQuantity < 0) throw new Error(`Check the SKU, item name, and whole number quantity in row ${index + 2}.`);
    return item;
  });
  if (!items.length) throw new Error('Add at least one packing list line.');
  if (items.length > 100) throw new Error('A case can contain up to 100 lines.');
  const skus = items.map((item) => item.sku.toLocaleUpperCase());
  if (new Set(skus).size !== skus.length) throw new Error('Each packing list line needs a unique SKU.');
  return items;
}
