import { GoogleGenAI } from '@google/genai';
import { analysisSchema, type Analysis, type PackingItem } from './domain.js';

export type VertexClient = Pick<GoogleGenAI, 'models'>;

export async function analyzeImage(client: VertexClient, model: string, bytes: Buffer, mimeType: string, items: PackingItem[]): Promise<Analysis> {
  const itemLines = items.map((item) => `${item.id} | SKU ${item.sku} | ${item.name} | expected ${item.expectedQuantity}`).join('\n');
  const response = await client.models.generateContent({
    model,
    contents: [{
      role: 'user',
      parts: [
        { text: `Inspect this delivery photo for visible packing-list evidence. Do not infer concealed contents or shipment totals from packaging labels. Count only items clearly visible. If any part of a line is obscured, sealed, cropped, or otherwise incomplete, mark visibility partial or unknown; a partial/unknown view cannot establish a shortage. Match observations only to the supplied line IDs and SKUs. Return one observation for every line, use null when count cannot be supported, describe visual evidence and damage, and state uncertainty. Never decide whether the shipment is short or complete.\n\nPACKING LIST\n${itemLines}` },
        { inlineData: { data: bytes.toString('base64'), mimeType } },
      ],
    }],
    config: {
      responseMimeType: 'application/json',
      responseJsonSchema: {
        type: 'OBJECT', required: ['imageSummary', 'observations'], additionalProperties: false,
        properties: {
          imageSummary: { type: 'STRING' },
          observations: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT', required: ['itemId', 'observedQuantity', 'visibility', 'evidence', 'damage', 'confidence', 'uncertainty'], additionalProperties: false,
              properties: {
                itemId: { type: 'STRING' }, observedQuantity: { type: 'INTEGER', nullable: true },
                visibility: { type: 'STRING', enum: ['complete', 'partial', 'unknown'] },
                evidence: { type: 'STRING' }, damage: { type: 'STRING', nullable: true },
                confidence: { type: 'NUMBER', minimum: 0, maximum: 1 }, uncertainty: { type: 'STRING' },
              },
            },
          },
        },
      },
    },
  });
  if (!response.text) throw new Error('Vertex AI returned an empty response.');
  const result = analysisSchema.safeParse(JSON.parse(response.text));
  if (!result.success) throw new Error('Vertex AI response did not match the required schema.');
  const requestedIds = new Set(items.map((item) => item.id));
  const returnedIds = new Set(result.data.observations.map((line) => line.itemId));
  if (returnedIds.size !== result.data.observations.length || returnedIds.size !== requestedIds.size || [...returnedIds].some((id) => !requestedIds.has(id))) {
    throw new Error('Vertex AI response did not match the packing list lines.');
  }
  return result.data;
}
