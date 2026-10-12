# Deploy PackProof to Cloud Run

These commands are a handoff for the project owner. This workspace does not have a configured Google Cloud project or credentials, so no deployment has been performed and no live service URL is known. Replace the example values with your project and a supported Cloud Run / Vertex AI region. Confirm that billing is enabled and that your account can enable APIs, create service accounts, deploy Cloud Run services, and grant project IAM roles.

## 1. Select the project and enable APIs

```bash
export PROJECT_ID="your-google-cloud-project-id"
export REGION="asia-south1" # Cloud Run region; choose a supported Gemini location below for AI calls.

gcloud auth login
gcloud config set project "$PROJECT_ID"
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  aiplatform.googleapis.com \
  secretmanager.googleapis.com

export PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
export DEPLOYER="$(gcloud config get-value account)"
```

Cloud Run source deployment uses Cloud Build and Artifact Registry. The app's live mode calls Vertex AI. Google documents that an active project, billing, Vertex AI API, and Application Default Credentials are needed for Vertex AI usage.

Before source deployment, the deployer identity and build identity need explicit roles on fresh projects. The current official Cloud Run source-deploy guidance specifies `roles/run.sourceDeveloper` and `roles/serviceusage.serviceUsageConsumer` for the deployer, `roles/iam.serviceAccountUser` on the runtime service identity, and `roles/run.builder` for the default Cloud Build identity (the Compute Engine default service account). Grant these only if the account does not already have equivalent permissions:

```bash
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="user:${DEPLOYER}" \
  --role="roles/run.sourceDeveloper"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="user:${DEPLOYER}" \
  --role="roles/serviceusage.serviceUsageConsumer"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/run.builder"
```

If your organization configures a different Cloud Build service account, grant the Cloud Run Builder role to that configured identity instead. The person enabling APIs also needs `roles/serviceusage.serviceUsageAdmin` unless they already have sufficient project permissions.

The commands below make the service public with `--allow-unauthenticated`. Cloud Run requires `run.services.setIamPolicy` to configure public access; Google documents that this permission is included in `roles/run.admin`. Have an administrator grant the deployer this role when needed, or have an appropriately authorized administrator apply the public Invoker policy after deploy. Organization policy may prohibit public access; in that case, do not bypass the restriction—use an approved access path.

```bash
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="user:${DEPLOYER}" \
  --role="roles/run.admin"
```

## 2. Create a runtime service identity

```bash
gcloud iam service-accounts create packproof-runtime \
  --project "$PROJECT_ID" \
  --display-name "PackProof Cloud Run runtime"

export RUNTIME_SA="packproof-runtime@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" \
  --project "$PROJECT_ID" \
  --member="user:${DEPLOYER}" \
  --role="roles/iam.serviceAccountUser"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/aiplatform.user"
```

The Cloud Run service identity needs Vertex AI permissions only when live mode is enabled. Do not download a service-account key or commit credentials; Cloud Run provides credentials to its configured service identity.

PackProof signs its case snapshot so the export endpoint can verify that observations still belong to the original sample/image. Deployed instances need the same stable signing key, including in fixture mode. Create it once in Secret Manager and grant the runtime identity access:

```bash
gcloud secrets create packproof-case-signing-key \
  --project "$PROJECT_ID" \
  --replication-policy=automatic

# Generate and pipe the value directly to Secret Manager; it is not printed.
openssl rand -hex 32 | gcloud secrets versions add packproof-case-signing-key \
  --project "$PROJECT_ID" \
  --data-file=-

gcloud secrets add-iam-policy-binding packproof-case-signing-key \
  --project "$PROJECT_ID" \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/secretmanager.secretAccessor"
```

Run the create/version commands once per project. Reuse the same secret for all serving revisions that may receive a case token. Cloud Run's service identity must be able to read the secret.

## 3. Deploy the public fixture-mode prototype

From the repository root, after source is ready:

```bash
gcloud run deploy packproof \
  --source . \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --service-account "$RUNTIME_SA" \
  --allow-unauthenticated \
  --max-instances 2 \
  --concurrency 10 \
  --cpu 1 \
  --memory 512Mi \
  --timeout 120 \
  --set-env-vars AI_MODE=demo_fixture \
  --update-secrets CASE_SIGNING_SECRET=packproof-case-signing-key:latest
```

`--allow-unauthenticated` makes the service publicly reachable. Use it only for the intended public prototype; uploaded images should remain transient and the app must not store them. The prototype shows fixture mode explicitly, and only its `Load sample case` action uses the deterministic sample. An uploaded photo will not silently receive a fixture analysis.

After deployment, copy the exact service URL from the CLI output and check:

```bash
curl -fsS "https://YOUR_CLOUD_RUN_URL/api/mode"
```

Expected fixture response should identify `demo_fixture`; do not claim a live Gemini run from this response.

## 4. Configure live Vertex AI mode (required for AI eligibility)

The event requires actual Google AI integration. Fixture mode is for deterministic product walkthroughs and does not by itself demonstrate the live-AI requirement. Before finalizing a submission, the project owner must enable Vertex AI, configure the runtime identity, deploy with `AI_MODE=live_vertex`, and verify one real Gemini image request on a non-sensitive synthetic photo. If a required variable or model permission is absent, PackProof should report `ready:false` and return a clear error instead of switching to fixture output.

```bash
gcloud run deploy packproof \
  --source . \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --service-account "$RUNTIME_SA" \
  --allow-unauthenticated \
  --max-instances 2 \
  --concurrency 10 \
  --cpu 1 \
  --memory 512Mi \
  --timeout 120 \
  --set-env-vars AI_MODE=live_vertex,GOOGLE_CLOUD_PROJECT="$PROJECT_ID",GOOGLE_CLOUD_LOCATION=global,GEMINI_MODEL_ID=gemini-3.5-flash \
  --update-secrets CASE_SIGNING_SECRET=packproof-case-signing-key:latest
```

The current application contract uses `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION` (default `global`), and optional `GEMINI_MODEL_ID` (default `gemini-3.5-flash`). Cloud Run's `REGION` above selects where the service runs; `GOOGLE_CLOUD_LOCATION` selects the Vertex AI model endpoint and is intentionally set to `global` independently. The app sets Vertex mode in the SDK client directly; `GOOGLE_GENAI_USE_VERTEXAI` is not required. Google's current [Gemini 3.5 Flash model page](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-5-flash) lists the model as GA; verify model/location availability when deploying, and consult the [Vertex AI locations table](https://cloud.google.com/vertex-ai/generative-ai/docs/learn/locations). Do not set API keys in source control or in a command that may be saved to shell history. The recommended Vertex AI path uses the Cloud Run service identity and ADC.

## 5. Verify the end-to-end flow

1. Open the exact Cloud Run URL and confirm the visible mode indicator.
2. In fixture mode, use `GET /api/sample` or the UI's `Load sample case` action to load the provided synthetic case, run the workflow, edit/confirm the observation, and export the report.
3. In live mode, confirm `/api/mode` reports `live_vertex` and `ready:true`, then use a non-sensitive synthetic photo to make one real Gemini call. Verify that the returned source says `vertex_ai`.
4. Confirm the report is blocked until every item has operator-confirmed counts. Refresh the app and verify images were not persisted.
5. Record only the URL and mode actually observed. A local run is not a deployed prototype.

## References

- [Cloud Run deploy from source, including deployer and Cloud Build roles](https://docs.cloud.google.com/run/docs/deploying-source-code)
- [Cloud Run IAM role reference](https://docs.cloud.google.com/run/docs/reference/iam/roles)
- [Cloud Run deploy command and public-access options](https://docs.cloud.google.com/sdk/gcloud/reference/run/deploy)
- [Allowing public (unauthenticated) Cloud Run access and required IAM permission](https://docs.cloud.google.com/run/docs/authenticating/public)
- [Cloud Run container runtime contract](https://docs.cloud.google.com/run/docs/building/containers)
- [Cloud Run service identity configuration](https://docs.cloud.google.com/run/docs/configuring/services/service-identity)
- [Cloud Run secrets configuration](https://docs.cloud.google.com/run/docs/configuring/services/secrets)
- [Secret Manager access control](https://cloud.google.com/secret-manager/docs/access-control)
- [Vertex AI Gemini quickstart and image understanding](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/start/quickstart)
- [Vertex AI IAM roles](https://cloud.google.com/vertex-ai/docs/general/access-control)
- [Vertex AI model locations](https://cloud.google.com/vertex-ai/generative-ai/docs/learn/locations)
- [Gemini 3.5 Flash model and supported locations](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-5-flash)
