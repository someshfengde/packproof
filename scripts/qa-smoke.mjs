import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const root = new URL('..', import.meta.url);
const children = [];
const results = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function startServer(port, vars = {}) {
  const child = spawn('node_modules/.bin/tsx', ['src/server/index.ts'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), NODE_ENV: 'development', ...vars },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
  children.push(child);
  return { child, getStderr: () => stderr };
}

async function waitForServer(port, processInfo) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (processInfo.child.exitCode !== null) throw new Error(`Server on ${port} exited: ${processInfo.getStderr()}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) return;
    } catch {}
    await delay(150);
  }
  throw new Error(`Server on ${port} did not become ready: ${processInfo.getStderr()}`);
}

async function check(name, fn) {
  await fn();
  results.push(name);
  console.log(`PASS ${name}`);
}

async function timed(url, init) {
  const start = performance.now();
  const response = await fetch(url, init);
  const data = await response.json();
  return { response, data, ms: performance.now() - start };
}

function formData(mime, bytes, items = []) {
  const form = new FormData();
  form.set('image', new Blob([bytes], { type: mime }), 'qa-image.bin');
  form.set('items', JSON.stringify(items));
  return form;
}

const fixturePort = 4315;
const noConfigPort = 4316;
const validationPort = 4317;

try {
  const fixture = startServer(fixturePort, { AI_MODE: 'demo_fixture' });
  const noConfig = startServer(noConfigPort, { AI_MODE: 'live_vertex', GOOGLE_CLOUD_PROJECT: '', CASE_SIGNING_SECRET: '' });
  const validation = startServer(validationPort, {
    AI_MODE: 'live_vertex',
    GOOGLE_CLOUD_PROJECT: 'qa-no-provider-calls',
    GOOGLE_CLOUD_LOCATION: 'global',
    CASE_SIGNING_SECRET: 'qa-only-fixed-secret-not-for-deployment',
  });
  await Promise.all([
    waitForServer(fixturePort, fixture),
    waitForServer(noConfigPort, noConfig),
    waitForServer(validationPort, validation),
  ]);

  const base = `http://127.0.0.1:${fixturePort}`;
  let sample;
  await check('fixture mode and signed sample are explicit', async () => {
    const mode = await fetch(`${base}/api/mode`).then((r) => r.json());
    sample = await fetch(`${base}/api/sample`).then((r) => r.json());
    assert(mode.mode === 'demo_fixture' && mode.ready, 'fixture mode should be ready locally');
    assert(sample.source === 'deterministic_sample_fixture' && sample.mode === 'demo_fixture', 'sample provenance should be explicit');
    assert(sample.observations.some((line) => line.visibility === 'unknown' && line.observedQuantity === null), 'sample should include an unknown count');
    assert(sample.observations.some((line) => line.visibility === 'partial'), 'sample should include a partial observation');
    assert(typeof sample.caseToken === 'string' && sample.caseToken.includes('.'), 'sample should include a signed case token');
  });

  await check('incomplete or unknown counts block report export', async () => {
    const confirmations = {
      'line-1': { quantity: 20, confirmed: true },
      'line-3': { quantity: 18, confirmed: true },
    };
    const { response, data } = await timed(`${base}/api/export`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ caseToken: sample.caseToken, confirmations }),
    });
    assert(response.status === 409 && data.status === 'blocked', 'unconfirmed lines should block export');
    assert(data.unresolvedIds.includes('line-2'), 'unknown line should be unresolved');
  });

  await check('unsupported item IDs are rejected', async () => {
    const { response } = await timed(`${base}/api/export`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ caseToken: sample.caseToken, confirmations: { rogue: { quantity: 1, confirmed: true } } }),
    });
    assert(response.status === 400, 'unknown confirmation IDs should be rejected');
  });

  await check('tampered signed case tokens are rejected', async () => {
    const { response } = await timed(`${base}/api/export`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ caseToken: `${sample.caseToken}x`, confirmations: {} }),
    });
    assert(response.status === 400, 'tampered token should fail signature verification');
  });

  await check('confirmed counts drive deterministic reconciliation', async () => {
    const confirmations = {
      'line-1': { quantity: 23, confirmed: true, note: 'Count checked by operator.' },
      'line-2': { quantity: 12, confirmed: true, note: 'Opened carton and verified.' },
      'line-3': { quantity: 18, confirmed: true },
    };
    const { response, data } = await timed(`${base}/api/export`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ caseToken: sample.caseToken, confirmations }),
    });
    assert(response.ok && data.status === 'ready', 'all confirmed lines should create a report');
    assert(data.reportJson.lines[0].outcome === 'short' && data.reportJson.totalShort === 1, 'confirmed quantity should drive the shortage result');
    assert(data.reportJson.evidenceSource === 'deterministic_sample_fixture', 'report should preserve the fixture provenance');
    assert(data.reportJson.lines[0].confirmedQuantity === 23, 'report should preserve operator correction');
  });

  await check('fixture mode never analyzes an arbitrary upload as if it were Gemini', async () => {
    const { response, data } = await timed(`${base}/api/analyze`, {
      method: 'POST', body: formData('image/jpeg', new Uint8Array([0xff, 0xd8, 0xff]), sample.items),
    });
    assert(response.status === 409 && /does not analyze new uploads/i.test(data.error), 'fixture uploads should clearly require Vertex AI');
  });

  const noConfigBase = `http://127.0.0.1:${noConfigPort}`;
  await check('missing Vertex configuration does not fall back to fixture mode', async () => {
    const mode = await fetch(`${noConfigBase}/api/mode`).then((r) => r.json());
    const response = await fetch(`${noConfigBase}/api/sample`);
    const body = await response.json();
    assert(mode.mode === 'live_vertex' && !mode.ready, 'missing live config should be visible');
    assert(response.status === 503 && !body.caseToken, 'live-config failure should not produce a fixture case');
  });

  const validationBase = `http://127.0.0.1:${validationPort}`;
  await check('unsupported MIME types are rejected before model calls', async () => {
    const { response, data } = await timed(`${validationBase}/api/analyze`, {
      method: 'POST', body: formData('image/svg+xml', new Uint8Array([1, 2, 3])),
    });
    assert(response.status === 400 && /JPG, PNG, or WebP/i.test(data.error), 'unsupported MIME should be rejected');
  });

  await check('spoofed image MIME with a mismatched file signature is rejected', async () => {
    const { response, data } = await timed(`${validationBase}/api/analyze`, {
      method: 'POST', body: formData('image/jpeg', new Uint8Array([0, 1, 2]), sample.items),
    });
    assert(response.status === 400 && /contents do not match/i.test(data.error), 'MIME spoof should be rejected before Gemini');
  });

  await check('duplicate SKUs are rejected before model calls', async () => {
    const duplicateSkuItems = [
      { id: 'one', sku: 'same-sku', name: 'Item one', expectedQuantity: 1 },
      { id: 'two', sku: 'SAME-SKU', name: 'Item two', expectedQuantity: 1 },
    ];
    const { response, data } = await timed(`${validationBase}/api/analyze`, {
      method: 'POST', body: formData('image/png', new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), duplicateSkuItems),
    });
    assert(response.status === 400 && /Duplicate SKU/i.test(data.error), 'duplicate normalized SKUs should be rejected');
  });

  const timings = [];
  for (let i = 0; i < 10; i += 1) {
    const sampleRequest = await timed(`${base}/api/sample`);
    const next = sampleRequest.data;
    const blocked = await timed(`${base}/api/export`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ caseToken: next.caseToken, confirmations: {} }),
    });
    const ready = await timed(`${base}/api/export`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ caseToken: next.caseToken, confirmations: {
        'line-1': { quantity: 23, confirmed: true },
        'line-2': { quantity: 12, confirmed: true },
        'line-3': { quantity: 18, confirmed: true },
      } }),
    });
    assert(blocked.data.status === 'blocked' && ready.data.status === 'ready', 'benchmark iteration should exercise blocked and ready export');
    timings.push({ sampleMs: sampleRequest.ms, blockedExportMs: blocked.ms, readyExportMs: ready.ms });
  }
  const median = (key) => {
    const values = timings.map((entry) => entry[key]).sort((a, b) => a - b);
    return Number(values[Math.floor(values.length / 2)].toFixed(2));
  };
  console.log(JSON.stringify({
    evidence: 'fixture API route benchmark only; no Gemini inference or real-store timing',
    iterations: timings.length,
    medianSampleMs: median('sampleMs'),
    medianBlockedExportMs: median('blockedExportMs'),
    medianReadyExportMs: median('readyExportMs'),
    passedChecks: results.length,
  }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  for (const child of children) child.kill('SIGTERM');
}
