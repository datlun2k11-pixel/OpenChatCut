# Cloudflare Workers AI — Image (`cloudflare`)

Text-to-image via the Cloudflare Workers AI REST API
(`POST /client/v4/accounts/{ACCOUNT_ID}/ai/run/{MODEL}`). Auth: the shared
`CLOUDFLARE_ACCOUNT_ID` + `LLM_CLOUDFLARE_API_KEY` pair (same pair as the
Agent provider). Configured model id comes from Settings
(`CLOUDFLARE_IMAGE_MODEL`), default `@cf/black-forest-labs/flux-1-schnell`.

## Wired capabilities

- **Text-to-image only.** No reference images, no mask/edit controls in this
  integration — do not send `referenceAssetIds` / `maskAssetId` /
  `background` / `moderation` / `inputFidelity` / `outputFormat` /
  `outputCompression` / `promptOptimizer` for this model.
- **Count**: 1–4 per call.
- **Prompt**: at most 2048 characters.
- **Seed** is supported (passed straight to the model).
- `aspectRatio` / `imageSize` / `quality` are accepted but ignored: the model
  returns its native size. No `width`/`height`.

## Prompt guidance

Single clear subject per request with detailed scene language (subject,
action, environment, lighting, style). Outputs are returned as base64 and
saved into the media pool immediately.

## Errors

- 401/403: the API Token lacks Workers AI permission or the Account ID is
  wrong — re-check both in Settings →生图 → Cloudflare Workers AI.
- `Cloudflare Workers AI returned no image`: the model response shape was
  unexpected — do not retry unchanged, try another model id.
