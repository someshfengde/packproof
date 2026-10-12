import { getAI, getGenerativeModel, GoogleAIBackend, Schema } from 'firebase/ai';
import { initializeApp, getApp, getApps, type FirebaseApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { analysisSchema, packingItemsSchema, type Analysis, type PackingItem } from '../shared/domain';

export const FIREBASE_MODEL = 'gemini-3.5-flash-lite';

type FirebaseEnv = {
  provider: string;
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  messagingSenderId: string;
  appCheckSiteKey: string;
  debugAppCheck: boolean;
};

const env: FirebaseEnv = {
  provider: import.meta.env.VITE_PACKPROOF_PROVIDER ?? 'backend',
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appCheckSiteKey: import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY ?? '',
  debugAppCheck: import.meta.env.DEV && import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG === 'true',
};

export function isFirebaseProviderSelected() { return env.provider === 'firebase_ai_logic'; }
export function firebaseConfigReady() {
  return Boolean(env.apiKey && env.projectId && env.appId && (env.appCheckSiteKey || env.debugAppCheck));
}
export function firebaseConfigMissing() {
  const missing = [
    ['VITE_FIREBASE_API_KEY', env.apiKey], ['VITE_FIREBASE_PROJECT_ID', env.projectId],
    ['VITE_FIREBASE_APP_ID', env.appId],
  ].filter(([, value]) => !value).map(([name]) => name);
  if (!env.appCheckSiteKey && !env.debugAppCheck) missing.push('VITE_FIREBASE_APPCHECK_SITE_KEY');
  return missing;
}

function getFirebaseApp(): FirebaseApp {
  if (!firebaseConfigReady()) throw new Error(`Firebase AI Logic is not configured. Missing: ${firebaseConfigMissing().join(', ')}.`);
  const app = getApps().length ? getApp() : initializeApp({
    apiKey: env.apiKey,
    authDomain: env.authDomain || undefined,
    projectId: env.projectId,
    appId: env.appId,
    messagingSenderId: env.messagingSenderId || undefined,
  });
  if (!globalThis.__packProofAppCheck) {
    if (env.debugAppCheck) (globalThis as typeof globalThis & { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(env.appCheckSiteKey || 'debug-provider'),
      isTokenAutoRefreshEnabled: true,
    });
    globalThis.__packProofAppCheck = true;
  }
  return app;
}

declare global { var __packProofAppCheck: boolean | undefined; }

export function buildInspectionPrompt(items: PackingItem[]): string {
  const rows = items.map((item) => `${item.id} | SKU ${item.sku} | ${item.name} | expected ${item.expectedQuantity}`).join('\n');
  return `Inspect this delivery photo for visible packing-list evidence. Do not infer concealed contents or shipment totals from packaging labels. Count only items clearly visible. If any part of a line is obscured, sealed, cropped, or otherwise incomplete, mark visibility partial or unknown; a partial/unknown view cannot establish a shortage. Match observations only to the supplied line IDs and SKUs. Return one observation for every line, use null when count cannot be supported, describe visual evidence and damage, and state uncertainty. Never decide whether the shipment is short or complete.\n\nPACKING LIST\n${rows}`;
}

export function buildResponseSchema() {
  const observation = Schema.object({ properties: {
    itemId: Schema.string(), observedQuantity: Schema.integer({ nullable: true }),
    visibility: Schema.enumString({ enum: ['complete', 'partial', 'unknown'] }), evidence: Schema.string(),
    damage: Schema.string({ nullable: true }), confidence: Schema.number(), uncertainty: Schema.string(),
  } });
  return Schema.object({ properties: {
    imageSummary: Schema.string(),
    observations: Schema.array({ items: observation }),
  } });
}

export async function analyzeWithFirebase(
  file: File,
  items: PackingItem[],
  generate: (prompt: string, image: { inlineData: { data: string; mimeType: string } }, responseSchema: ReturnType<typeof buildResponseSchema>) => Promise<string>,
): Promise<Analysis> {
  if (!firebaseConfigReady()) throw new Error(`Firebase AI Logic is not configured. Missing: ${firebaseConfigMissing().join(', ')}.`);
  const request = await buildInspectionRequest(file, items);
  const raw = await generate(request.prompt, request.image, request.responseSchema);
  return validateAnalysisForItems(raw, items);
}

export async function buildInspectionRequest(file: File, items: PackingItem[]) {
  const validItems = packingItemsSchema.safeParse(items);
  if (!validItems.success) throw new Error(validItems.error.issues[0]?.message ?? 'Check the packing list.');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) {
    throw new Error('Choose a JPG, PNG, or WebP image up to 8 MB.');
  }
  if (!await hasValidImageSignature(file)) throw new Error('The selected file does not contain a valid JPG, PNG, or WebP image.');
  return {
    prompt: buildInspectionPrompt(items),
    image: { inlineData: { data: await fileToBase64(file), mimeType: file.type } },
    responseSchema: buildResponseSchema(),
  };
}

export function validateAnalysisForItems(raw: string, items: PackingItem[]): Analysis {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error('Gemini returned invalid JSON. Retry the analysis; no result was accepted.'); }
  const result = analysisSchema.safeParse(parsed);
  if (!result.success) throw new Error('Gemini response did not match the required evidence schema. Retry the analysis.');
  const expected = new Set(items.map((item) => item.id));
  const returned = new Set(result.data.observations.map((line) => line.itemId));
  if (returned.size !== items.length || returned.size !== result.data.observations.length || [...returned].some((id) => !expected.has(id))) {
    throw new Error('Gemini response did not match every packing-list line. Retry the analysis.');
  }
  return result.data;
}

export async function invokeFirebaseModel(
  prompt: string,
  image: { inlineData: { data: string; mimeType: string } },
  responseSchema: ReturnType<typeof buildResponseSchema>,
): Promise<string> {
  const app = getFirebaseApp();
  const ai = getAI(app, { backend: new GoogleAIBackend() });
  const model = getGenerativeModel(ai, {
    model: FIREBASE_MODEL,
    generationConfig: { responseMimeType: 'application/json', responseSchema },
  });
  const result = await model.generateContent([prompt, { type: 'inlineData', inlineData: image.inlineData }]);
  return result.response.text();
}

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  return btoa(binary);
}

async function hasValidImageSignature(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (file.type === 'image/png') return bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  if (file.type === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return file.type === 'image/webp' && bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
}
