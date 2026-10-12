import type { Analysis, PackingItem } from './domain.js';

export const sampleItems: PackingItem[] = [
  { id: 'line-1', sku: 'MUG-12-OAT', name: 'Stoneware mug · oat', expectedQuantity: 24 },
  { id: 'line-2', sku: 'BWL-08-SLT', name: 'Serving bowl · slate', expectedQuantity: 12 },
  { id: 'line-3', sku: 'PLT-10-CRM', name: 'Dinner plate · cream', expectedQuantity: 18 },
];

export const sampleAnalysis: Analysis = {
  imageSummary: 'Three labeled cartons are at the receiving desk. Twenty oat mugs are visible in the open mug carton, including one chipped rim. The serving bowl carton is sealed; the partly open plate carton shows 12 cream plates with the rest occluded.',
  observations: [
    { itemId: 'line-1', observedQuantity: 20, visibility: 'complete', evidence: 'Twenty mug rims are visible in the fully open carton; the full stack can be counted.', damage: 'One mug near the front has a chipped rim.', confidence: 0.92, uncertainty: 'A chipped rim is visible; inspect the remaining pieces for concealed damage.' },
    { itemId: 'line-2', observedQuantity: null, visibility: 'unknown', evidence: 'The serving bowl carton is sealed and its contents cannot be seen.', damage: null, confidence: 0.97, uncertainty: 'No quantity can be verified from this image.' },
    { itemId: 'line-3', observedQuantity: 12, visibility: 'partial', evidence: 'Twelve cream plate faces are visible in the partly open carton; the remaining contents are occluded.', damage: null, confidence: 0.67, uncertainty: 'The package is partly occluded; the visible count is not a complete shipment count.' },
  ],
};
