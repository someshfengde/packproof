# PackProof build and submission plan

**Team:** Code Rush — Somesh and Suchit (Somesh is the tentative lead)

**Category:** Retail & Commerce: Intelligent Customer and Business Experiences

**Problem:** Small retail teams often compare a supplier’s expected delivery list with items and packaging that physically arrived. Manual visual checks are slow and inconsistent; a damaged or short delivery can be accepted without a clear record.

**Solution:** PackProof turns a delivery photo and a short expected-items list into a reviewable receiving report. Gemini on Vertex AI extracts visible labels, observed counts, and visible packaging damage into structured data. Application code compares those observations against expected quantities and flags candidate shortages, substitutions, or damage. A person corrects uncertain observations and confirms the final counts before export. The prototype does not auto-accept deliveries or make supplier/payment decisions.

## MVP decisions

- Use a Vite + React + TypeScript frontend and an Express API, served together from one Cloud Run container.
- API contract: `GET /api/mode` returns `{mode:'demo_fixture'|'live_vertex',ready,model,location}`; `GET /api/sample` returns a signed deterministic synthetic case; `POST /api/analyze` accepts multipart `image` plus an `items` JSON string and returns a signed case snapshot with observations; `POST /api/export` accepts only `{caseToken,confirmations}` and verifies the HMAC-bound original list, image metadata and observations before returning a ready/blocked report.
- Live mode should call Gemini through Vertex AI with Application Default Credentials, schema-shaped output, bounded input size, server-side validation, and an explicit uncertainty path. Do not claim Gemini is active when credentials are absent.
- Fixture mode uses a fixed, synthetic delivery example. The UI's `Load sample case` action may load a sample payload and generated image. It must remain visibly labeled throughout the workflow. A raw upload must not silently invoke fixture outputs; without Vertex credentials it should clearly explain that AI analysis is unavailable.
- The fixture list and photo must be synthetic. Process uploaded images transiently; do not persist images. Avoid personal data and real supplier/customer records.
- Comparison is deterministic and occurs only after operator-confirmed quantities are provided. The pre-filled fixture is not an extraction benchmark. QA evidence may report deterministic reconciliation/export-blocking/tampering checks and exact locally measured route/workflow timings; do not claim extraction accuracy, discrepancy recall, or real-world time savings from preset observations.
- Host the public app on Cloud Run. Submit a public GitHub repository, a PDF exported from the supplied deck template, and a public demo video strictly under three minutes.

## Build phases and acceptance criteria

### 1. Product contract and demo case

- Lock the item input/output JSON fields and one visually obvious seeded discrepancy.
- Create fixture image/data and expected observations with synthetic labels.
- **Accept when:** app team and deck team agree on route fields, statuses, fixture scenario, and limitations; all fixture contents are original or permissively licensed.

### 2. End-to-end app

- Implement a responsive receiving workflow, `GET /api/mode`, multipart `POST /api/analyze`, and confirmed-count `POST /api/export`.
- Implement fixture mode and live Gemini/Vertex AI mode with transparent mode status, schema validation, bounded uploads, deterministic comparison, correction, and approval.
- **Accept when:** with no GCP credentials, the demo clearly displays fixture mode and completes the full workflow; with Vertex credentials, the app issues a real Gemini request and shows live mode. Model failure or malformed output returns a clear recoverable error, never a fabricated success. Export reflects operator-confirmed values.

### 3. QA and evidence

- Run route-level checks against missing/invalid images, unsupported MIME/signature, missing live configuration, fixture upload no-fallback, unknown/partial observations, unsupported IDs, duplicate SKUs, signed payload tampering, blocked exports and operator-confirmed corrections.
- Open the actual app in a browser, capture genuine screenshots for the deck, and record a reproducible fixture benchmark with sample sizes, exact-match/count accuracy, seeded-discrepancy recall, and median latency where available.
- **Accept when:** no secret or uploaded image is committed; mode labeling is visible; screenshots show the actual running UI; QA evidence reports deterministic reconciliation/export-blocking/tampering checks and measured local fixture workflow time only. Preset fixture observations are not an extraction benchmark.

### 4. Cloud Run handoff

- Provide documented commands to set project/region, enable required APIs, select the runtime service account, grant minimum Vertex AI invocation access, and deploy from the repository source with `gcloud run deploy --source .`.
- Verify the app listens on injected `PORT`; document that public access is explicitly required for a public prototype and has access implications. The project owner runs deployment commands because this workspace has no Google Cloud credentials/project access.
- **Accept when:** a clean deploy produces a working URL, `/api/mode` reports the configured mode and signing readiness, and one end-to-end scenario succeeds. Use one stable Secret Manager `CASE_SIGNING_SECRET` across Cloud Run instances that handle the same case. If deployment cannot be performed, keep the commands ready and clearly report the blocker; do not represent local demo as deployed.

## Agreed API contract

- `GET /api/mode` → `{mode:'demo_fixture'|'live_vertex',ready:boolean,model:string|null,location:string}`. `AI_MODE=demo_fixture` is the default; `AI_MODE=live_vertex` selects live mode. Missing live configuration makes `ready:false`; live requests return a clear `503` and never fall back to fixture data.
- `POST /api/analyze` multipart fields: `image` (JPEG/PNG/WebP, max 8 MB), and `items` (JSON string of `[{id,sku,name,expectedQuantity}]`). Response: `{imageSummary,observations:[{itemId,observedQuantity:number|null,visibility:'complete'|'partial'|'unknown',evidence,damage:string|null,confidence:0..1,uncertainty}],source:'vertex_ai'}`. Candidate variance is display-only and may be derived only for complete observations.
- `GET /api/sample` returns a generated SVG image plus synthetic expected lines, fixed observations, metadata and a signed case token. It does not call Gemini.
- `POST /api/export` JSON body: `{caseToken,confirmations:{[itemId]:{quantity:number|null,confirmed:boolean,note?:string}}}`. The HMAC-signed snapshot binds the original expected list, image hash/filename, observations, mode and model; clients cannot replace those inputs at export. Response: `{status:'ready'|'blocked',reportJson,reportText,unresolvedIds}`. Report metadata includes case ID, created/reviewed timestamps, evidence source, mode/model, image filename/hash and suggested versus confirmed quantities. Comparison happens after operator confirmation; suggestions alone cannot finalize.
- Current demo constraint: in fixture mode, `GET /api/sample` / `Load sample case` returns a signed deterministic fixture payload and sample SVG. It does not call Gemini. A user upload does not invoke fixtures and explains that Vertex AI is required. Always show the mode and source.
- Exports depend on a signed case snapshot. In production, set a single stable `CASE_SIGNING_SECRET` from Secret Manager and grant the Cloud Run service identity access; do not use per-instance or process-generated keys for deployed cases.

### 5. Demo and submission package

- Record a narrated or captioned app walkthrough of the fixed scenario, beginning with the fixture/live status, and show extraction, comparison, correction, approval, and export.
- Keep the final MP4 under 3:00, verify audio/video playback, and make a public link only after the approved release step. Fill the provided presentation template with actual implementation status, honest measured evidence, architecture, screenshots, public repo/video URLs, and deployed URL.
- **Accept when:** video duration is under three minutes, public access works, links resolve, and deck/PDF claims match the built app. Do not include a fabricated deployed URL, benchmark, team role, or live-AI claim.

## Demo outline (target 2:20)

1. (0:00–0:15) Frame the receiving problem and identify fixture/live mode.
2. (0:15–0:40) Load the synthetic sample and show the expected list and sample image.
3. (0:40–1:10) Review the fixed, clearly labeled fixture observations; say these are preset demo observations, not a Gemini call.
4. (1:10–1:45) Enter the physical count, confirm every row, and show that export stays blocked until confirmation is complete.
5. (1:45–2:05) Export the confirmed report and point to its actual source/evidence fields.
6. (2:05–2:20) State that the live Vertex AI adapter is implemented but requires the project owner to configure Vertex AI and Cloud Run; show a deployed URL only if it has actually been deployed.

## Official references

- [AI Builder Cup overview and timeline](https://aibuildercup.com/)
- [AI Builder Cup themes, requirements, and judging rubric](https://aibuildercup.com/themes.html)
- [AI Builder Cup FAQ and deliverables](https://aibuildercup.com/Faqs.html)
- [AI Builder Cup terms](https://docs.google.com/document/d/e/2PACX-1vRm7ChZ6Ij9fG7uFDkxzUMpwgVeBmnQ6cMDnAIEEX84AiLBOOQ9cYbl3S5OzFBbcVb8TF55s-eVpiXb/pub)
- [Vertex AI Gemini quickstart and image understanding](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/start/quickstart)
- [Vertex AI schema-constrained generation sample](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/samples/generativeaionvertexai-gemini-controlled-generation-response-schema-2)
- [Cloud Run source deployment options](https://docs.cloud.google.com/run/docs/deployment-options-for-services)
- [Cloud Run container runtime contract](https://docs.cloud.google.com/run/docs/building/containers)
