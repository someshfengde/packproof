# PackProof QA and local evidence

Date: 2026-10-12. These checks were run against the local synthetic fixture; they do not measure Gemini extraction quality or real-store performance.

## API checks

`node scripts/qa-smoke.mjs` passed 10/10 route checks:

- Fixture/sample provenance is explicit; fixture uploads do not masquerade as analysis.
- Missing live Vertex configuration returns an error and never falls back to fixture mode.
- Unknown or unconfirmed counts block export; an unsupported row ID and a modified signed case are rejected.
- Confirmed counts drive deterministic reconciliation.
- Unsupported MIME, mismatched image signatures, and duplicate SKUs are rejected before a model call.

The script's 10-request local route timing sample reported median `/api/sample` 0.75 ms, blocked export 0.79 ms, and ready export 0.85 ms. These are local fixture/API timings only; they exclude image inference, network/cloud latency, and real receiving work. They are not an accuracy, productivity, or customer-impact claim.

## Production server check

`npm run build` completed. Starting `NODE_ENV=production npm start` on `PORT=4319` with a QA-only HMAC secret served the built HTML and JS assets with HTTP 200. `GET /api/mode` returned `demo_fixture`, `ready:true`; the sample fixture loaded; an unconfirmed export returned 409 with all three rows unresolved; confirming every row returned 200 and a three-line report. The report's decision basis states that counts are operator-entered/confirmed and image observations are evidence only. The temporary production process was stopped after checks.

The Docker CLI is installed, but `docker info` could not connect to the local Docker daemon; the container image was not built or run in Docker.

## Browser flow and artifacts

Playwright used the installed Chrome executable to exercise the actual local app at `http://localhost:5174/`. It loaded the sample, entered operator-confirmed quantities, confirmed all three rows, exported the packet, and downloaded both report formats. The UI/API action from export click to packet-ready took 100 ms in this one local run; this is not a general latency benchmark.

Current captures are genuine browser screenshots from that app:

- `artifacts/screenshots/01-empty-workspace.png`
- `artifacts/screenshots/02-sample-review.png`
- `artifacts/screenshots/03-manual-counts-pending.png`
- `artifacts/screenshots/04-all-lines-confirmed.png`
- `artifacts/screenshots/05-exported-packet-full.png`

Downloaded report files are `artifacts/demo/packproof-claim.json` and `artifacts/demo/packproof-claim.txt`. These are synthetic fixture exports.

The current fixture image needs a visual consistency correction for the partially visible plate count and chipped mug. Do not use these captures as final slide/video evidence until the image and caption are aligned and captures are refreshed.
