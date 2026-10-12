# AI Builder Cup research and project direction

Research checked on 12 October 2026 against the public AI Builder Cup site, its linked FAQ and terms, and Google Cloud product documentation. This is requirements research, not proof of registration or eligibility for any particular team.

## Recommendation

Build **PackProof**, a receiving-desk assistant for small retailers. The operator supplies a packing list (initially a small, typed demo fixture or CSV) and a photo of the delivered carton/items. Gemini on Vertex AI extracts visible product labels, counts, and obvious package damage into a constrained JSON shape. Ordinary application code compares the extracted observations with the expected list and flags candidate shortages, substitutions, or damage. The operator can correct the extraction and approve the discrepancy report before anything is recorded.

The demo should show one intentionally mismatched delivery from input to output, including the source image, extracted observations, deterministic comparison, and operator correction/approval. Label synthetic supplier and delivery data as synthetic. Use a real Vertex AI Gemini request in the live mode; if credentials or Vertex access are unavailable, show an explicit “fixture demo” state and return a fixed recorded example, never present it as live AI. Do not claim audited savings or model accuracy without a measured benchmark. A small labeled set can report extraction exact-match/count accuracy and median end-to-end time, with the sample size and synthetic nature visible.

This fits **Retail & Commerce: Intelligent Customer and Business Experiences**. It offers a visible, easy-to-follow multimodal AI task and a responsible separation: Gemini interprets ambiguous visual evidence; deterministic code performs the item comparison; a person confirms uncertain or consequential results. Keep the first prototype to one photo, a short product list, transparent confidence/uncertainty, editable findings, and a simple audit/result view. Avoid OCR-only invoice parsing as the centerpiece; a compact structured packing-list fixture keeps the demo buildable and puts the live model on the distinctive image-inspection task.

### Alternatives

| Idea | Theme | Demo core | Trade-off |
|---|---|---|---|
| **PackProof** (recommended) | Retail & Commerce | Photo + expected delivery list → Gemini observations → deterministic discrepancy checklist → human approval | Clear visual proof and bounded workflow; image interpretation needs careful uncertainty handling. |
| **SurplusLink** | Sustainability & Social Impact | Gemini turns a surplus-food photo and short note into a listing; deterministic rules match quantity, pickup window, and recipient constraints | Strong local impact story; any “food saved” estimate must be labeled as scenario data and not measured impact. |
| **DecisionTrace** | Future of Work & Enterprise Productivity | Gemini extracts decisions and owners from meeting notes and links each item to the source passage for human review | Simple and credible; more crowded product space and less distinctive live demo. |

## Official event requirements and timing

- The overview shows registration from 1 September through **11 October 2026**, team formation through **14 October**, prototype building and submission through **18 October**, prototype deadline **18 October**, evaluation **19 October–6 November**, finalist announcement **7 November**, and the Singapore finale **4 December 2026**. As checked 12 October, the site says “Registration Closed.”
- Teams must have **2–4 members** during the build; the FAQ says a person cannot participate solo. Eligibility is 21+, working professionals/entrepreneurs/startups, based in JAPAC; students are ineligible. The event page says registration can begin solo but a team must be formed. Whether the user/team is registered and meets the eligibility rules is not known from the workspace.
- The prototype must be working and end-to-end, use Google Cloud as its primary stack, integrate Google AI models (Gemini or Gemma) or a named Google agentic platform, and be deployed on Cloud Run/GCP/Firebase. The FAQ says solutions primarily on other cloud platforms are ineligible and excludes pre-existing work started before the program launch.
- FAQ deliverables: working deployed link, public GitHub repository, deck explaining the solution, and public demo video under three minutes. The Themes page specifies the deck must be PPT converted to PDF and asks for a public YouTube/Vimeo or Google Drive video link. All materials must be in English.
- Weighted judging: Technical Merit & GenAI Implementation **40%**; Problem Alignment & Impact **25%**; Innovation & Creativity **25%**; User Experience & Solution Design **10%**. The demo should therefore show the actual Gemini-powered core, functional workflow, a sharply described target problem, and a polished review/approval path.
- The Themes page lists six top-level themes: BFSI; Retail & Commerce; Manufacturing; Media, Content & Digital Experiences; Future of Work & Enterprise Productivity; Sustainability & Social Impact. A later “Category Specification” paragraph on the same page instead lists “Healthcare, Education, Sustainability, Accessibility, Social Good.” That appears inconsistent with the six-theme list and the FAQ; select one of the six top-level themes and confirm the actual submission portal’s category field if accessible.
- The linked terms require fresh code/assets created during the hackathon timeline, set out deliverables, and include a broad organizer first-refusal / publicity license for submitted materials. Team members should review the terms and rights implications before submission.

## Workspace and submission template

- The workspace has `submission_template.pptx` and no project source tree or Git repository at the time of this inspection. No `AGENTS.md` was found in the workspace or its parent chain.
- The supplied template contains 16 slides. Its editable content prompts are: 1 Team Details; 2 template-use note; 3 Brief about the idea; 4 Opportunities/differentiation/how it solves/USP; 5 Features; 6 Process or use-case diagram; 7 optional wireframes; 8 Architecture; 9 Technologies; 10 optional estimated implementation cost; 11 prototype snapshots; 12 performance report/benchmarking; 13 future development; 14 links to public GitHub, 3-minute demo video, and product; 15–16 blank. Keep the final PPT and exported PDF in English and fill the required fields with actual team/deployment/video details once known.
- A read-only `gh auth status` check showed an active GitHub CLI account with `repo` scope. No credentials were printed here. The current directory itself is not a Git repository. This does not establish a Google Cloud project, billing, API enablement, or deploy permission.

## Proposed implementation boundary

- **App:** a single small web app deployed to Cloud Run; use a compact Python web stack or another simple runtime, and make the server listen on Cloud Run’s injected `PORT`.
- **AI:** Google Gen AI SDK against Vertex AI Gemini using Application Default Credentials. Send a user-provided image with the expected catalog/list context; request schema-shaped JSON fields such as observed labels, count, visible damage, and uncertainty. Validate and bound the model output server-side. Do not let the model decide the final reconciliation or auto-approve receipt.
- **Comparison:** deterministic, transparent code maps expected versus observed lines and flags candidate discrepancies. Show “needs review” for ambiguous labels or poor images; allow edits and approval.
- **Demo reliability:** keep an explicit fixture mode, backed by a fixed synthetic delivery, for local/no-credentials usage. Indicate the mode in the UI and record which mode produced each result. The deployed demonstration should use live Vertex AI when configured.
- **Data handling:** process the image transiently for the prototype; avoid collecting personal data and provide a clear delete/retake path. Do not claim compliance with any retail, privacy, or food safety standard.
- **Evidence:** report actual demo flow and a small benchmark over disclosed synthetic fixtures. Suitable measures are item/count exact match against labels, discrepancy recall on seeded errors, and median time from upload to review-ready report. Do not frame the benchmark as a real store pilot.

## Primary sources

- [AI Builder Cup overview and timeline](https://aibuildercup.com/)
- [AI Builder Cup themes, requirements, deliverables, and judging](https://aibuildercup.com/themes.html)
- [AI Builder Cup FAQs](https://aibuildercup.com/Faqs.html)
- [AI Builder Cup terms and conditions](https://docs.google.com/document/d/e/2PACX-1vRm7ChZ6Ij9fG7uFDkxzUMpwgVeBmnQ6cMDnAIEEX84AiLBOOQ9cYbl3S5OzFBbcVb8TF55s-eVpiXb/pub)
- [Vertex AI Gemini API quickstart, SDK setup, and image understanding](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/start/quickstart)
- [Vertex AI controlled generation with a response schema](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/samples/generativeaionvertexai-gemini-controlled-generation-response-schema-2)
- [Cloud Run service deployment options, including source deploy](https://docs.cloud.google.com/run/docs/deployment-options-for-services)
- [Cloud Run source build/runtime contract](https://docs.cloud.google.com/run/docs/building/containers)
- [Cloud Run deploy command reference](https://docs.cloud.google.com/sdk/gcloud/reference/run/deploy)

Google’s current documentation supports Gemini image understanding with the Google Gen AI SDK and Vertex AI, and schema-constrained JSON generation. Cloud Run can deploy directly from source with `gcloud run deploy --source .`; Cloud Run services must listen on the injected `PORT`. Those are supported implementation options, not confirmation that this workspace has cloud access or that any deployment has occurred.
