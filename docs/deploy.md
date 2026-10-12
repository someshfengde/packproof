# Deploy PackProof on Firebase Spark

This handoff deploys the static web app to Firebase Hosting and calls Gemini through Firebase AI Logic's Gemini Developer API backend. It uses the existing Firebase project `packproof-code-rush-2026` on the Spark plan. The project has no billing account linked. Do not upgrade to Blaze or add a billing account; requests and Hosting should stop when a no-cost quota is exhausted.

## What is configured

- Firebase project: `packproof-code-rush-2026` (Spark, no-cost).
- Hosting site: `packproof-code-rush-2026`.
- Public app URL after deployment: `https://packproof-code-rush-2026.web.app` (Firebase also serves the `firebaseapp.com` alias).
- Firebase AI Logic uses `GoogleAIBackend` with `gemini-3.5-flash-lite`; the app sends an image and packing-list lines for structured observations.
- Firebase App Check is enforced for AI Logic. The registered web provider is reCAPTCHA Enterprise / Fraud Defense, with the key restricted to the two Firebase Hosting domains. The public site key is in the local ignored `.env.local` as `VITE_FIREBASE_APPCHECK_SITE_KEY`.
- Optional AI monitoring is disabled. No Gemini API key is used or included in the client.

## Deployment verification

On 12 October 2026, the static build was deployed successfully to the Hosting site above with Hosting-only Firebase CLI deployment. A production browser request returned a real `firebase_ai_logic` response from `gemini-3.5-flash-lite` for the synthetic PNG. One observed response reported 12 visible plates and partial visibility; the model warned that hidden layers could change the total. That result is evidence of integration only, not model accuracy. The live demo's count confirmation is marked as a simulated review and its packet states that no physical receipt check occurred.

## Free-only boundary

Keep the project on Spark and never link billing. Firebase Spark Hosting has published no-cost storage and transfer quotas; if a Spark quota is exhausted, Hosting is disabled or limited until quota resets. Firebase AI Logic with the Gemini Developer API has free-tier quotas; requests can be rejected when limits are reached. reCAPTCHA Enterprise includes a free assessment allowance; with no billing account linked, do not upgrade to obtain paid use. Do not enable App Hosting, Cloud Functions, Cloud Run, Vertex AI, or other paid services for this deployment. Do not enable the optional AI monitoring feature.

Gemini Developer API free-tier requests may be used by Google to improve its products, and quotas can change. Use synthetic demo images and packing lists only; do not upload real customer, supplier, employee, or other sensitive information. This is a no-billing configuration, not a promise of uninterrupted availability: quota exhaustion should block the feature rather than trigger a paid upgrade.

## Build and deploy

The project owner must first complete the standard Firebase CLI OAuth flow for the account that owns the Firebase project. Firebase CLI requests project-wide Firebase and Cloud permissions, so review the Google consent page and select the intended account. For the deployed site, keep the client configuration in the ignored local `.env.local`; the values are Firebase web-app configuration and App Check's public site key, not Gemini credentials. Do not commit local env files.

From the repository root, confirm that `.env.local` contains these entries with values from the Firebase project settings and App Check registration:

```dotenv
VITE_PACKPROOF_PROVIDER=firebase_ai_logic
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=packproof-code-rush-2026.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=packproof-code-rush-2026
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_STORAGE_BUCKET=packproof-code-rush-2026.firebasestorage.app
VITE_FIREBASE_APPCHECK_SITE_KEY=...
```

Then install project dependencies, run the Firebase build, and deploy only the configured Hosting site:

```bash
npm ci
npm run check
npm run build:firebase
npx firebase-tools@15.33.0 deploy --only hosting --project packproof-code-rush-2026
```

The Firebase config publishes only `dist/`. Do not use `firebase deploy` without `--only hosting`, and do not run `firebase deploy --only functions`, App Hosting, or any Cloud Run deployment for this free-only route.

## Verify the published app

1. Open `https://packproof-code-rush-2026.web.app` and confirm the app says Firebase AI Logic / Gemini Developer API and does not show fixed-sample mode for a new upload.
2. Use only the generated synthetic image and seeded packing list, and trigger a separate live analysis. A response is live only when its source says `firebase_ai_logic` and model says `gemini-3.5-flash-lite`; the fixed sample path is always labeled and never invokes Gemini.
3. Confirm that every report line requires review and confirmation. Synthetic live-demo input is explicitly marked as a simulated review in the UI and report. For a real receiving workflow, an operator must physically verify the shipment. The Firebase build exports a local report; it does not provide the previous Express server's HMAC-signed audit guarantee.
4. If App Check or Gemini returns a quota/permission error, leave the app in that state. Do not turn off App Check, switch to a paid tier, or fall back from a failed live request to fixture results.
5. Confirm the Firebase Console still shows Billing plan `Spark` and `No-cost ($0/month)`. No billing account should be attached.

## Official references

- [Firebase pricing plans and Spark limits](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans)
- [Firebase Hosting usage and quotas](https://firebase.google.com/docs/hosting/usage-quotas-pricing)
- [Firebase AI Logic pricing](https://firebase.google.com/docs/ai-logic/pricing?api=dev)
- [Firebase AI Logic model support](https://firebase.google.com/docs/ai-logic/models?api=dev)
- [Firebase AI Logic web setup](https://firebase.google.com/docs/ai-logic/get-started?platform=web)
- [Firebase AI Logic App Check](https://firebase.google.com/docs/ai-logic/app-check)
- [App Check with reCAPTCHA Enterprise for web](https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider)
- [reCAPTCHA Enterprise pricing](https://cloud.google.com/recaptcha/pricing)
- [Gemini API terms](https://ai.google.dev/gemini-api/terms)
- [Gemini API pricing and free-tier data use](https://ai.google.dev/gemini-api/docs/pricing)
- [Firebase Hosting CLI deploy](https://firebase.google.com/docs/hosting/quickstart)
