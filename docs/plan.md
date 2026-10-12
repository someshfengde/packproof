# PackProof build and submission plan

**Team:** Code Rush — Somesh and Suchit

**Category:** Retail & Commerce: Intelligent Customer and Business Experiences

**Problem:** Small retail teams compare a supplier's expected delivery list with items that physically arrived. Manual checks can miss count differences or visible damage.

**Solution:** PackProof turns a synthetic or user-supplied receiving photo and an expected-items list into structured visual observations. Gemini reports only what is visible and carries uncertainty forward. The operator checks the physical delivery and confirms every quantity before creating a report. PackProof does not auto-accept deliveries, send claims, or make supplier/payment decisions.

## MVP decisions

- The public no-billing route is static Vite + React + TypeScript on Firebase Hosting Spark. Browser requests use Firebase AI Logic with the Gemini Developer API and `gemini-3.5-flash-lite`, protected by Firebase App Check with reCAPTCHA Enterprise. No Gemini API key is bundled in the client.
- The existing Express API and Dockerfile remain as an optional backend adapter for local/Cloud Run use. Cloud Run is not part of the Spark deployment; it requires a billing-linked project.
- Firebase static mode and Express backend mode share the transport contract for mode, sample, image analysis, and export. Firebase AI mode makes the browser request directly through Firebase AI Logic, validates the structured result against the original item IDs, and assembles an unsigned local report. The Express route retains server-signed case snapshots and server-validated exports.
- `GET /api/mode` returns the backend mode; the Firebase static mode is selected at Vite build time with `VITE_PACKPROOF_PROVIDER=firebase_ai_logic` and public Firebase/App Check config. Missing configuration blocks live analysis visibly; live request failures never fall back to sample output.
- The fixture remains separate and deterministic. **Open sample case** loads fixed sample observations without Gemini. **Use synthetic illustration for a live AI test** preloads a PNG and list, then requires a separate Analyze action for real inference.
- Firebase web config and reCAPTCHA site key are public client values. Never place a private Gemini API key or debug App Check token in public source or a production build. Free Gemini inputs may be used by Google to improve products; use synthetic/non-sensitive photos.
- Uploads accept JPG, PNG, or WebP up to 8 MB and packing lists up to 100 lines. Validate image signatures, unique IDs/SKUs, structured output, and exact match against original line IDs.
- Only operator-confirmed whole-number counts are compared with the expected quantities. Partial or unknown visibility never establishes a shortage. Firebase exports disclose that they are local and unsigned; no Firebase database or persistence is claimed.
- Submission includes the public source repository, PDF exported from the supplied template, and a public demo video under three minutes. Claims about deployment/live inference must be backed by an actual URL or observed model response.

## Validation and acceptance

- Validate fixture loading, supported/invalid image MIME and signatures, file caps, packing-list IDs/SKUs, structured output shape and IDs, partial/unknown visibility, physical-count approval gates, and local versus server export provenance.
- Unit tests inject a fake Firebase model transport to verify request construction and output validation without making a paid or live model call. Firebase project/App Check setup and live inference are checked separately.
- Capture actual app screens. The fixture video and screenshots are not model-accuracy evidence. Do not claim extraction accuracy, discrepancy recall, real-world time savings, or performance from preset observations.
- Confirm Firebase remains on Spark and only Hosting is deployed. Do not upgrade billing or add Functions, App Hosting, Storage, or databases. If project configuration requires billing, stop rather than proceed with a paid path.
- Verify the public URL, Firebase AI Logic mode/model, a real synthetic-image Gemini response, App Check enforcement, blocked-until-confirmed export, and local unsigned packet disclosure. Do not invent a URL or claim a successful request if setup is incomplete.

## API and report contract

**Shared analysis:** expected item shape is `{id,sku,name,expectedQuantity}`. Each observation has `{itemId,observedQuantity:number|null,visibility:'complete'|'partial'|'unknown',evidence,damage:string|null,confidence:0..1,uncertainty}` plus `imageSummary`. Every original item ID must appear exactly once; unknown counts remain null.

**Firebase static mode:** the Firebase AI Logic SDK sends text plus inline JPG/PNG/WebP bytes through Google's managed proxy. The browser validates the structured response and matching IDs. Report creation stays local; JSON/text includes image filename/hash, provider/model, timestamps, suggestions, operator confirmations, notes, and an unsigned-local-packet disclosure.

**Optional Express backend:**

- `GET /api/mode` → provider/readiness/model/location.
- `GET /api/sample` → synthetic fixture and server-signed case snapshot.
- `POST /api/analyze` → multipart `image` plus `items` JSON, configured server-side Vertex or Gemini Developer API.
- `POST /api/export` → `{caseToken,confirmations}`. The server verifies the HMAC-bound original items, image metadata and observations before returning a ready/blocked report.
- `GET /api/health` → server health.

## Demo outline

1. Identify the current fixture or Firebase AI Logic mode.
2. Distinguish the fixed fixture from the live synthetic-PNG test action.
3. For live mode, make and identify a real Firebase AI Logic Gemini request; preserve the model's actual counts and uncertainty.
4. Physically confirm each line and show the approval gate.
5. Export and identify JSON/text provenance. In Firebase mode, say the report is created locally and unsigned.

## Official references

- [AI Builder Cup overview](https://aibuildercup.com/)
- [AI Builder Cup judging rubric](https://aibuildercup.com/themes.html)
- [Firebase AI Logic Web setup](https://firebase.google.com/docs/ai-logic/get-started?platform=web)
- [Firebase AI Logic structured output](https://firebase.google.com/docs/ai-logic/generate-structured-output)
- [Firebase AI Logic App Check](https://firebase.google.com/docs/ai-logic/app-check)
- [App Check reCAPTCHA Enterprise Web provider](https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider)
- [Gemini Developer API pricing](https://ai.google.dev/gemini-api/docs/pricing)
