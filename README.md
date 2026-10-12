# PackProof

PackProof is a receiving-desk prototype for retail teams. It compares a packing list with a delivery photo, keeps Gemini observations separate from operator-confirmed counts, and exports a review packet only after every line has been checked.

## Google AI path

**Live app:** [packproof-code-rush-2026.web.app](https://packproof-code-rush-2026.web.app/). It is hosted on Firebase Spark and uses Firebase AI Logic with Gemini Developer API and reCAPTCHA Enterprise App Check; no billing account is linked.

The no-billing hosted build uses Firebase Hosting on the Spark plan and Firebase AI Logic with the Gemini Developer API. The browser SDK sends image-and-packing-list requests through Firebase's AI Logic proxy to `gemini-3.5-flash-lite`; Firebase App Check uses a reCAPTCHA Enterprise site key. There is no Gemini API key in the browser, repository, or hosting build. Firebase web config and the reCAPTCHA site key are public client values.

The [narrated live-response walkthrough](https://drive.google.com/file/d/1KPzIAlUIXnhyLrj-VjaEXBBAB4d1Fi5Q/view?usp=sharing) shows a genuine Gemini response to generated imagery. Its review is clearly labeled as a simulation, not a physical stock check. [Download the same clip from the GitHub release](https://github.com/someshfengde/packproof/releases/download/v0.1.0/PackProof-live-Gemini-demo.mp4). The [submission PDF](https://github.com/someshfengde/packproof/releases/download/v0.1.0/PackProof-AI-Builder-Cup.pdf) and [editable deck](https://github.com/someshfengde/packproof/releases/download/v0.1.0/PackProof-AI-Builder-Cup.pptx) are available with the public release.

Free Gemini inputs may be used by Google to improve products. Use only synthetic or otherwise non-sensitive demo photos. PackProof does not save uploaded photos or case data to its own backend. In this static path, the JSON/text report is built in the browser and is not signed or tamper-resistant; it remains in the current browser session unless downloaded. It is not sent to a supplier.

The fixed illustrated sample is deterministic fixture data, not model inference. **Open sample case** loads those fixed observations. **Use synthetic illustration for a live AI test** only loads the synthetic PNG and packing list; the operator must then press **Analyze with Gemini** to make a real request. A model error is shown as an error and never replaced with sample output.

## Configure Firebase Hosting

The Firebase project and Hosting site are `packproof-code-rush-2026` / `packproof-code-rush-2026.web.app`. The Firebase AI Logic Developer API and App Check must be set up for that project, and App Check must be enforced with the production reCAPTCHA Enterprise provider.

Copy `.env.example` to `.env.local` and set the public Firebase web config and App Check site key from Firebase Console. Set `VITE_PACKPROOF_PROVIDER=firebase_ai_logic`. Do not put `GEMINI_API_KEY` or any private Gemini key into a `VITE_*` variable. `.env.local` is git-ignored.

With Node.js 24.12 or newer:

```bash
npm install
npx firebase-tools login
npm run build:firebase
npm run deploy:firebase
```

`build:firebase` checks that the static provider, Firebase web config, and production App Check site key exist before generating `dist`. `deploy:firebase` builds and deploys only the preconfigured Firebase Hosting site. Firebase project access is still required. Keep the project on Spark; the app does not require Cloud Run, Cloud Functions, App Hosting, Cloud Storage, a database, a Gemini API key, or a billing upgrade.

For local development with the existing API backend, run `npm run dev`; it defaults to the deterministic fixture unless a server-side live mode is explicitly configured. For Firebase AI Logic local development, set the Firebase public config, `VITE_PACKPROOF_PROVIDER=firebase_ai_logic`, and `VITE_FIREBASE_APPCHECK_DEBUG=true` in `.env.local`. Register the printed App Check debug token in the Firebase Console. Never use the debug provider in a production build.

## Review workflow and safeguards

Enter line items by hand or paste CSV with `SKU`, `Name`, and `Quantity` columns. Analysis accepts a JPG, PNG, or WebP image up to 8 MB and at most 100 packing-list lines. The client validates image signatures, packing-list IDs/SKUs, and Gemini's structured response before displaying observations.

Gemini reports only visible evidence: observed quantity (nullable), complete/partial/unknown visibility, evidence, damage, confidence, and uncertainty. Partial or unknown visibility cannot establish a shipment shortage. The operator physically checks and confirms every count; only the confirmed count is compared with the packing list.

The Firebase Hosting report includes image filename and SHA-256, provider/model provenance, generated/reviewed timestamps, suggested and operator-confirmed counts, and notes. Because the Firebase path has no server, the packet is local and unsigned. The optional Express backend remains available for local or Cloud Run use and retains its server-validated signed export API.

## Local development and checks

```bash
npm install
npm run dev
npm run check
npm run build:firebase
```

The test suite covers CSV and packing-list validation, reconciliation, unresolved/partial observations, server snapshot tampering, Firebase multimodal request construction and schema/ID validation, upload caps/MIME spoofing, and browser-local review/export gates. Automated tests do not make live Gemini requests; a real inference must be verified separately in the configured Firebase app.

## Optional Express API

The static Firebase deployment does not call these routes. They are for the retained local/Cloud Run server adapter:

- `GET /api/mode` — backend provider and readiness.
- `GET /api/sample` — fixed illustrated sample and signed snapshot.
- `POST /api/analyze` — multipart image plus packing list; uses explicitly configured Vertex AI or Gemini Developer API server credentials.
- `POST /api/export` — validates operator confirmations against the original server-signed case.
- `GET /api/health` — server health.

See [docs/deploy.md](docs/deploy.md) for the Spark Hosting path and [docs/plan.md](docs/plan.md) for product limits.
