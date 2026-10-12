import express, { type ErrorRequestHandler } from 'express';
import multer from 'multer';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { confirmationSchema, packingItemsSchema, reconcileLines } from './domain.js';
import { sampleAnalysis, sampleItems } from './fixtures.js';
import { analyzeImage } from './vertex.js';
import { deriveCaseSigningSecret, signCase, verifyCase } from './caseSnapshot.js';
import { createAiClient, isAiConfigurationReady, type AiMode } from './aiClient.js';

const here = dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT ?? 8080);
const apiKey = process.env.GEMINI_API_KEY ?? '';
const mode = process.env.AI_MODE ?? (apiKey ? 'live_gemini_api' : 'demo_fixture');
if (!['demo_fixture', 'live_vertex', 'live_gemini_api'].includes(mode)) throw new Error('AI_MODE must be demo_fixture, live_vertex, or live_gemini_api.');
const aiMode = mode as AiMode;
const project = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT ?? '';
const location = process.env.GOOGLE_CLOUD_LOCATION ?? 'global';
const vertexModel = process.env.GEMINI_MODEL_ID ?? 'gemini-3.5-flash';
const apiModel = process.env.GEMINI_API_MODEL_ID ?? 'gemini-3.5-flash-lite';
const isVertex = aiMode === 'live_vertex';
const isGeminiApi = aiMode === 'live_gemini_api';
const isLive = isVertex || isGeminiApi;
const model = isGeminiApi ? apiModel : vertexModel;
const explicitSigningSecret = process.env.CASE_SIGNING_SECRET ?? '';
const signingSecret = explicitSigningSecret || (process.env.NODE_ENV === 'production'
  ? (isGeminiApi && apiKey ? deriveCaseSigningSecret(apiKey) : '')
  : randomBytes(32).toString('hex'));
const ai = isVertex || isGeminiApi
  ? createAiClient(aiMode as Exclude<AiMode, 'demo_fixture'>, { project, location, apiKey })
  : null;
const isReady = isAiConfigurationReady(aiMode, { signingSecret, project, apiKey, client: ai });
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) cb(null, true);
    else cb(new Error('Upload a JPG, PNG, or WebP image.'));
  },
});
if (process.env.NODE_ENV === 'production' && !signingSecret) {
  throw new Error('CASE_SIGNING_SECRET is required in production unless live_gemini_api is configured with GEMINI_API_KEY.');
}
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/mode', (_req, res) => res.json({
  mode: aiMode,
  ready: isReady,
  model: isLive ? model : null,
  location: isVertex ? location : null,
}));

app.get('/api/sample', async (_req, res, next) => {
  try {
    const samplePath = process.env.NODE_ENV === 'production' ? resolve(here, '../receiving-sample.svg') : resolve(here, '../../public/receiving-sample.svg');
    const imageBytes = await readFile(samplePath);
    const now = new Date().toISOString();
    const imageName = 'packproof-receiving-sample.svg';
    const metadata = {
      caseId: 'PP-SAMPLE-01', createdAt: now, imageName,
      imageSha256: createHash('sha256').update(imageBytes).digest('hex'),
      mode: 'demo_fixture' as const, model: null, source: 'deterministic_sample_fixture' as const,
    };
    const caseToken = signCase({ metadata, items: sampleItems, analysis: sampleAnalysis }, signingSecret);
    return res.json({ ...metadata, items: sampleItems, ...sampleAnalysis, caseToken });
  } catch (error) { next(error); }
});

const exportBodySchema = z.object({
  caseToken: z.string().min(1),
  confirmations: z.record(z.string(), confirmationSchema),
});

app.post('/api/analyze', upload.single('image'), async (req, res, next) => {
  try {
    if (!isLive) return res.status(409).json({ error: 'Demo fixture mode does not analyze new uploads. Load the labeled sample case or configure a live Gemini provider.' });
    if (!isReady || !ai) {
      const missing = isVertex ? 'GOOGLE_CLOUD_PROJECT and server Application Default Credentials' : 'GEMINI_API_KEY';
      return res.status(503).json({ error: `Live mode is selected, but ${missing} is not configured. Add the server-side setting, then retry.` });
    }
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Choose a delivery image to inspect.' });
    if (!hasValidImageSignature(file.buffer, file.mimetype)) return res.status(400).json({ error: 'The file contents do not match a supported image. Choose a JPG, PNG, or WebP.' });
    let parsedItems: unknown;
    try { parsedItems = JSON.parse(String(req.body.items ?? '')); }
    catch { return res.status(400).json({ error: 'Packing list must be valid JSON.' }); }
    const validatedItems = packingItemsSchema.safeParse(parsedItems);
    if (!validatedItems.success) return res.status(400).json({ error: validatedItems.error.issues[0]?.message ?? 'Check the packing list.' });

    const extracted = await analyzeImage(ai, model, file.buffer, file.mimetype, validatedItems.data);
    const metadata = {
      caseId: `PP-${randomUUID().slice(0, 8).toUpperCase()}`,
      createdAt: new Date().toISOString(), imageName: file.originalname.slice(0, 180),
      imageSha256: createHash('sha256').update(file.buffer).digest('hex'),
      mode: aiMode, model, source: isVertex ? 'vertex_ai' as const : 'gemini_api' as const,
    };
    const caseToken = signCase({ metadata, items: validatedItems.data, analysis: extracted }, signingSecret);
    res.json({ ...metadata, ...extracted, caseToken });
  } catch (error) {
    next(error);
  }
});

app.post('/api/export', (req, res) => {
  const parsed = exportBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check the review data before exporting.' });
  const { caseToken, confirmations } = parsed.data;
  const snapshot = verifyCase(caseToken, signingSecret);
  if (!snapshot) return res.status(400).json({ error: 'This review no longer matches its original case evidence. Reload the case and review it again.' });
  const itemIds = new Set(snapshot.items.map((item) => item.id));
  if (Object.keys(confirmations).some((id) => !itemIds.has(id))) return res.status(400).json({ error: 'A review row does not match the original packing list.' });
  const lines = reconcileLines(snapshot.items, snapshot.analysis.observations, confirmations);
  const unresolvedIds = lines.filter((line) => line.outcome === 'pending' || line.outcome === 'unresolved').map((line) => line.item.id);
  if (unresolvedIds.length) return res.status(409).json({ status: 'blocked', unresolvedIds, error: 'Confirm a count for every packing list line before exporting the claim packet.' });

  const reportJson = {
    caseId: snapshot.metadata.caseId,
    generatedAt: snapshot.metadata.createdAt,
    reviewedAt: new Date().toISOString(),
    evidenceSource: snapshot.metadata.source,
    mode: snapshot.metadata.mode,
    model: snapshot.metadata.model,
    image: { filename: snapshot.metadata.imageName, sha256: snapshot.metadata.imageSha256 },
    decisionBasis: 'All compared counts were entered or confirmed by an operator. Image observations are evidence only.',
    lines: lines.map(({ item, observation, confirmedQuantity, outcome, variance }) => ({
      sku: item.sku, item: item.name, expectedQuantity: item.expectedQuantity, confirmedQuantity,
      modelSuggestedQuantity: observation?.observedQuantity ?? null,
      operatorNote: confirmations[item.id]?.note ?? '',
      outcome, variance, visibility: observation?.visibility ?? 'unknown', evidence: observation?.evidence ?? 'No image observation was available.',
      damage: observation?.damage ?? null, uncertainty: observation?.uncertainty ?? 'Operator verified the count.',
    })),
    totalShort: lines.reduce((sum, line) => sum + (line.outcome === 'short' ? Math.abs(line.variance ?? 0) : 0), 0),
    totalOver: lines.reduce((sum, line) => sum + (line.outcome === 'over' ? line.variance ?? 0 : 0), 0),
    hasDamage: lines.some((line) => Boolean(line.observation?.damage)),
  };
  const reportText = [
    `PACKPROOF · RECEIVING CLAIM ${reportJson.caseId}`,
    `Evidence source: ${reportJson.evidenceSource} · ${reportJson.mode}${reportJson.model ? ` · ${reportJson.model}` : ''}`,
    `Image: ${reportJson.image.filename} · SHA-256 ${reportJson.image.sha256}`,
    '',
    'OPERATOR-CONFIRMED LINE REVIEW',
    ...reportJson.lines.map((line) => `${line.sku} — ${line.item}: expected ${line.expectedQuantity}, AI suggested ${line.modelSuggestedQuantity ?? 'not visible'}, operator confirmed ${line.confirmedQuantity} (${line.outcome}). ${line.evidence}${line.damage ? ` Damage: ${line.damage}` : ''}${line.operatorNote ? ` Operator note: ${line.operatorNote}` : ''}`),
    '',
    `Short units: ${reportJson.totalShort} · Over units: ${reportJson.totalOver}`,
    `Decision basis: ${reportJson.decisionBasis}`,
  ].join('\n');
  return res.json({ status: 'ready', reportJson, reportText, unresolvedIds: [] });
});

if (process.env.NODE_ENV === 'production') {
  const clientRoot = resolve(here, '..');
  app.use(express.static(clientRoot));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(resolve(clientRoot, 'index.html')));
}

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    const message = error.code === 'LIMIT_FILE_SIZE' ? 'Image must be 8 MB or smaller.' : 'Choose one image at a time.';
    return res.status(400).json({ error: message });
  }
  if (error instanceof Error && error.message.startsWith('Upload a JPG')) return res.status(400).json({ error: error.message });
  if (error instanceof Error && error.message.startsWith('CASE_SIGNING_SECRET')) return res.status(503).json({ error: 'Set CASE_SIGNING_SECRET before using this mode.' });
  // Keep provider details and request contents out of API responses and logs.
  console.error('PackProof request failed:', error instanceof Error ? error.name : 'unknown error');
  return res.status(502).json({ error: `${isGeminiApi ? 'Gemini Developer API' : 'Vertex AI'} could not analyze this image. Check connectivity and server configuration, then retry or load the sample case.` });
};
app.use(errorHandler);

app.listen(port, '0.0.0.0', () => console.log(`PackProof listening on ${port} (${aiMode})`));

function hasValidImageSignature(bytes: Buffer, mimeType: string): boolean {
  if (mimeType === 'image/png') return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mimeType === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === 'image/webp') return bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  return false;
}
