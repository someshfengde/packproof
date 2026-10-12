# PackProof

PackProof is a receiving-desk prototype for small retail teams. It organizes a supplier packing list and delivery photo into a reviewable evidence packet. In live mode, Gemini on Vertex AI suggests what can be seen in the image; an operator checks the physical delivery, confirms every count, and chooses whether to export the report.

## Run locally

Requires Node.js 22.12 or newer.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. By default, the app starts in `demo_fixture` mode. Choose **Open sample case** to walk through the fixed illustrated example. Its observations are deterministic sample content, not Gemini output. Uploading a different photo in fixture mode will not fabricate an analysis.

To analyze a real image locally, configure Application Default Credentials for a Google Cloud project with Vertex AI enabled and the Vertex AI User role, then set:

```bash
export AI_MODE=live_vertex
export GOOGLE_CLOUD_PROJECT=your-project-id
export GOOGLE_CLOUD_LOCATION=global
export GEMINI_MODEL_ID=gemini-3.5-flash
npm run dev
```

`@google/genai` uses Vertex AI mode on the server and reads ADC credentials. The browser receives no API key. Images are held in memory for the request and are not written to disk. In live mode the API request times out after 75 seconds and does not retry automatically.

## How the review works

The packing list accepts manual rows or pasted CSV with `SKU`, `Name`, and `Quantity` columns. The image endpoint accepts one JPG, PNG, or WebP file up to 8 MB and at most 100 distinct item lines.

Gemini returns structured observations with a matched line ID, visible quantity (which can be unknown), visibility, evidence, damage, confidence, and uncertainty. The model never decides that a shipment is short. Partial or unknown visibility cannot establish a shipment total. Counts are suggestions until a person checks and confirms each line. Export stays blocked while any line is unreviewed or lacks an operator-confirmed whole-number count.

Every case carries a server-signed snapshot of its original packing list, image hash, observations, mode, and model provenance. The export endpoint verifies this snapshot before reconciling the submitted operator confirmations against the original expected quantities. The report includes expected, suggested, and confirmed counts, operator notes, source mode, image filename and SHA-256, and generation/review timestamps. PackProof produces JSON and readable text; it does not send a claim to a supplier.

## API

- `GET /api/mode` — configured mode, model/location, and whether required configuration is ready.
- `GET /api/sample` — fixed illustrated sample case and signed case snapshot. Works in fixture mode without GCP credentials when a signing secret is configured.
- `POST /api/analyze` — multipart `image` plus `items` as a JSON string. Available only in live Vertex AI mode.
- `POST /api/export` — `{ caseToken, confirmations }`, where each confirmation is `{ quantity, confirmed, note }`. Returns a blocked status until every original line has a confirmed count.
- `GET /api/health` — process health check.

See `docs/plan.md` for the product contract and limitations, and `docs/deploy.md` for Cloud Run and Secret Manager commands.

## Build and checks

```bash
npm run build
npm test
npm run check
```

The tests cover packing-list and CSV validation, unresolved/partial observations, operator-confirmed comparisons, the Vertex request shape/schema checks, and HMAC snapshot tampering. The Vertex adapter is unit-tested with a fake client; live inference requires a configured Google Cloud project and has not been exercised in this workspace.

Build the Cloud Run container with:

```bash
docker build -t packproof .
```

The runtime requires a stable `CASE_SIGNING_SECRET` in production. Use the same Secret Manager value across revisions and Cloud Run instances so in-flight case reviews can be verified after traffic moves. The development server creates an ephemeral signing key automatically; a local case token expires when that server restarts.

## Limits

- A photo only supports claims about what is visible. Sealed, cropped, occluded, or partly visible contents need an operator’s physical check.
- The demo image and observations are synthetic and do not demonstrate model accuracy.
- Case state is held in the browser and signed server-side; there is no database, user authentication, or persistence across a browser reset.
- The prototype does not contact suppliers or make receipt, payment, or supplier decisions.
