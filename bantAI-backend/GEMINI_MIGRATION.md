# Gemini Migration Runbook

## Goal
Run the backend on Gemini only while preserving the extension API contract.

## What was implemented
1. Gemini request path in api/analyze.js using generateContent endpoint.
2. Stable response contract preserved for extension:
   - Request: messageText, parentEmail, context
   - Response: shouldBlock, analysis
3. Gemini-focused configuration validation in scripts/validate-env.js.
4. CI validation updated to include Gemini secrets.

## Recommended Gemini model choices for this project
1. Primary recommendation: gemini-2.5-flash
   - Good cost/latency balance for high-frequency text classification.
2. Budget fallback: gemini-2.5-flash-lite
   - Lower cost, faster, slightly lower quality.
3. Accuracy-heavy option: gemini-3.5-flash
   - Better reasoning, usually higher cost/latency.

Use stable model names in production where possible. Avoid preview/experimental names for safety-critical workflows.

## Required secrets for Gemini deployment
1. AI_PROVIDER=gemini
2. GEMINI_API_KEY (or GOOGLE_API_KEY)
3. GEMINI_MODEL (recommended gemini-2.5-flash)
4. Optional GEMINI_ENDPOINT (defaults to public v1beta endpoint)
5. Optional GEMINI_SAFETY_THRESHOLD (recommended BLOCK_MEDIUM_AND_ABOVE)

## Suggested rollout sequence
1. Set AI_PROVIDER=gemini in the deployment environment.
2. Set GEMINI_API_KEY and GEMINI_MODEL.
3. Run validate:config and confirm pass.
4. Deploy and verify /api/health returns provider=gemini.
5. Perform extension smoke tests on real Messenger message flows.
6. Monitor backend logs for MODEL_OUTPUT_ERROR or content_filter spikes.
7. Monitor logs and adjust prompt/safety threshold based on observed outcomes.

## Smoke test checklist
1. Non-harmful text returns shouldBlock=false.
2. Harmful text returns shouldBlock=true with severity >= 2.
3. High-severity text with parent email triggers notification when email config exists.
4. Gemini safety block produces controlled fallback block response.
5. Health endpoint reports provider and deployment/model correctly.

## Known caveats
1. Gemini safety thresholding is probability-based and may differ from business severity expectations.
2. Always validate with your own labeled harmful/non-harmful examples before full rollout.
3. If parsing failures increase, tighten system prompt and add schema checks before actioning.
