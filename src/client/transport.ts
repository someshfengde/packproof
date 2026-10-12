import { analysisSchema, reconcileLines, type Analysis, type PackingItem } from '../shared/domain';
import { sampleAnalysis, sampleItems } from '../shared/fixtures';
import { analyzeWithFirebase, firebaseConfigMissing, firebaseConfigReady, invokeFirebaseModel, isFirebaseProviderSelected, FIREBASE_MODEL } from './firebaseAnalysis';

export type ProviderMode = 'demo_fixture' | 'live_vertex' | 'live_gemini_api' | 'firebase_ai_logic';
export type ModeInfo = { mode: ProviderMode; ready: boolean; model: string | null; location: string | null; source?: string; missing?: string[]; error?: string };
export type CaseData = {
  caseId: string; createdAt: string; imageName: string; imageSha256: string; mode: ProviderMode;
  model: string | null; source: string; imageSummary: string; observations: Analysis['observations']; caseToken?: string;
  items?: PackingItem[];
};
export type Review = { quantity: string; confirmed: boolean; note: string };
export type ExportResponse = { status: 'ready' | 'blocked'; unresolvedIds: string[]; reportJson?: Record<string, unknown>; reportText?: string; error?: string; local?: boolean };

const selectedProvider = import.meta.env.VITE_PACKPROOF_PROVIDER ?? 'backend';

export async function getMode(): Promise<ModeInfo> {
  if (isFirebaseProviderSelected()) {
    const ready = firebaseConfigReady();
    return { mode: 'firebase_ai_logic', ready, model: FIREBASE_MODEL, location: null, source: 'firebase_ai_logic', missing: ready ? [] : firebaseConfigMissing() };
  }
  if (selectedProvider !== 'backend') throw new Error(`Unsupported VITE_PACKPROOF_PROVIDER: ${selectedProvider}`);
  const response = await fetch('/api/mode');
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'The receiving service could not be reached.');
  return data as ModeInfo;
}

export async function loadSampleCase(): Promise<CaseData> {
  if (isFirebaseProviderSelected()) {
    const image = await fetch('/receiving-sample.svg').then(async (response) => {
      if (!response.ok) throw new Error('The fixed sample image could not be loaded.');
      return response.arrayBuffer();
    });
    return {
      caseId: 'PP-SAMPLE-01', createdAt: new Date().toISOString(), imageName: 'packproof-receiving-sample.svg',
      imageSha256: await sha256(image), mode: 'demo_fixture', model: null, source: 'deterministic_sample_fixture',
      imageSummary: sampleAnalysis.imageSummary, observations: sampleAnalysis.observations, items: sampleItems,
    };
  }
  const response = await fetch('/api/sample');
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'The sample case could not be loaded.');
  return data as CaseData;
}

export async function loadSyntheticLiveImage(): Promise<{ file: File; items: PackingItem[] }> {
  const response = await fetch('/receiving-sample.png');
  if (!response.ok) throw new Error('The synthetic PNG sample image could not be loaded.');
  const file = new File([await response.blob()], 'packproof-synthetic-receiving.png', { type: 'image/png' });
  return { file, items: sampleItems };
}

export async function analyzeCase(file: File, items: PackingItem[]): Promise<CaseData> {
  if (isFirebaseProviderSelected()) {
    const analysis = await analyzeWithFirebase(file, items, invokeFirebaseModel);
    return {
      caseId: `PP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, createdAt: new Date().toISOString(),
      imageName: file.name.slice(0, 180), imageSha256: await sha256(await file.arrayBuffer()),
      mode: 'firebase_ai_logic', model: FIREBASE_MODEL, source: 'firebase_ai_logic', ...analysis, items,
    };
  }
  const form = new FormData(); form.set('image', file); form.set('items', JSON.stringify(items));
  const response = await fetch('/api/analyze', { method: 'POST', body: form });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'Analysis failed.');
  return data as CaseData;
}

export async function exportCase(caseData: CaseData, items: PackingItem[], reviews: Record<string, Review>): Promise<ExportResponse> {
  if (caseData.caseToken) {
    const confirmations = Object.fromEntries(items.map((item) => {
      const review = reviews[item.id];
      return [item.id, { quantity: Number(review.quantity), confirmed: review.confirmed, note: review.note }];
    }));
    const response = await fetch('/api/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ caseToken: caseData.caseToken, confirmations }) });
    const data: ExportResponse = await response.json();
    if (!response.ok) throw new Error(data.error ?? 'The claim packet could not be generated.');
    return data;
  }

  const confirmations = Object.fromEntries(items.map((item) => {
    const review = reviews[item.id];
    const quantity = review && review.quantity !== '' && Number.isInteger(Number(review.quantity)) && Number(review.quantity) >= 0 ? Number(review.quantity) : null;
    return [item.id, { quantity, confirmed: review?.confirmed === true && quantity !== null, note: review?.note ?? '' }];
  }));
  const lines = reconcileLines(items, caseData.observations, confirmations);
  const unresolvedIds = lines.filter((line) => !line.confirmed).map((line) => line.item.id);
  if (unresolvedIds.length) return { status: 'blocked', unresolvedIds, error: 'Confirm a whole-number count for every line before exporting.' };

  const reportJson = {
    caseId: caseData.caseId, generatedAt: caseData.createdAt, reviewedAt: new Date().toISOString(),
    evidenceSource: caseData.source, mode: caseData.mode, model: caseData.model,
    image: { filename: caseData.imageName, sha256: caseData.imageSha256 },
    packetIntegrity: 'Browser-generated local report; not signed or tamper-resistant.',
    decisionBasis: 'All compared counts were entered or confirmed by an operator. Image observations are evidence only.',
    lines: lines.map(({ item, observation, confirmedQuantity, outcome, variance }) => ({
      sku: item.sku, item: item.name, expectedQuantity: item.expectedQuantity, confirmedQuantity,
      modelSuggestedQuantity: observation?.observedQuantity ?? null, operatorNote: confirmations[item.id]?.note ?? '',
      outcome, variance, visibility: observation?.visibility ?? 'unknown', evidence: observation?.evidence ?? 'No image observation was available.',
      damage: observation?.damage ?? null, uncertainty: observation?.uncertainty ?? 'Operator verified the count.',
    })),
    totalShort: lines.reduce((sum, line) => sum + (line.outcome === 'short' ? Math.abs(line.variance ?? 0) : 0), 0),
    totalOver: lines.reduce((sum, line) => sum + (line.outcome === 'over' ? line.variance ?? 0 : 0), 0),
    hasDamage: lines.some((line) => Boolean(line.observation?.damage)),
  };
  const reportText = [
    `PACKPROOF · RECEIVING CLAIM ${reportJson.caseId}`,
    `Evidence source: ${reportJson.evidenceSource} · ${reportJson.mode} · ${reportJson.model}`,
    `Image: ${reportJson.image.filename} · SHA-256 ${reportJson.image.sha256}`,
    'Packet integrity: browser-generated local report; not signed or tamper-resistant.', '', 'OPERATOR-CONFIRMED LINE REVIEW',
    ...reportJson.lines.map((line) => `${line.sku} — ${line.item}: expected ${line.expectedQuantity}, model suggested ${line.modelSuggestedQuantity ?? 'not visible'}, operator confirmed ${line.confirmedQuantity} (${line.outcome}). ${line.evidence}${line.damage ? ` Damage: ${line.damage}` : ''}${line.operatorNote ? ` Operator note: ${line.operatorNote}` : ''}`),
    '', `Short units: ${reportJson.totalShort} · Over units: ${reportJson.totalOver}`,
    'No claim was sent to a supplier.',
  ].join('\n');
  return { status: 'ready', unresolvedIds: [], reportJson, reportText, local: true };
}

export function validateAnalysisForItems(value: unknown, items: PackingItem[]): Analysis {
  const parsed = analysisSchema.safeParse(value);
  if (!parsed.success) throw new Error('Gemini response did not match the evidence schema.');
  const expected = new Set(items.map((item) => item.id));
  const actual = new Set(parsed.data.observations.map((item) => item.itemId));
  if (actual.size !== items.length || actual.size !== parsed.data.observations.length || [...actual].some((id) => !expected.has(id))) {
    throw new Error('Gemini response did not match the packing list.');
  }
  return parsed.data;
}

async function sha256(data: ArrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
