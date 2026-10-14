import assert from 'node:assert/strict';
import { validateImageRequest } from './image.ts';
import { callCloudflareImageProvider, callGrokImageProvider } from './image-provider-clients.ts';

const basic = validateImageRequest({ prompt: 'a cat' });
assert.equal(basic.model, 'gpt-image-2');
assert.equal(basic.aspectRatio, '16:9');
assert.equal(basic.count, 1);

const mm = validateImageRequest({
  model: 'image-01',
  prompt: 'matte bottle',
  count: 3,
  seed: 42,
  width: 1024,
  height: 1536,
  referencePaths: ['/media/uploads/a.jpg'],
  promptOptimizer: false,
});
assert.equal(mm.model, 'image-01');
assert.equal(mm.promptOptimizer, false);
assert.equal(mm.count, 3);
assert.equal(mm.seed, 42);
assert.equal(mm.width, 1024);
assert.equal(mm.referencePaths.length, 1);

assert.throws(
  () => validateImageRequest({ model: 'image-01', prompt: 'x'.repeat(1501) }),
  /at most 1500 characters/,
);
assert.throws(
  () => validateImageRequest({ model: 'image-01', prompt: 'x', count: 10 }),
  /at most 9 images/,
);
assert.throws(
  () => validateImageRequest({ model: 'image-01', prompt: 'x', width: 1025, height: 1024 }),
  /divisible by 8/,
);
assert.throws(
  () => validateImageRequest({ model: 'gpt-image-2', prompt: 'x', promptOptimizer: true }),
  /promptOptimizer is supported by image-01/,
);
assert.throws(
  () => validateImageRequest({ model: 'nano-banana', prompt: 'x', referencePaths: Array.from({ length: 15 }, (_, i) => `/media/uploads/${i}.jpg`) }),
  /too many reference images/,
);

const gpt = validateImageRequest({
  model: 'gpt-image-2',
  prompt: 'product shot',
  referencePaths: ['/media/uploads/source.png'],
  maskPath: '/media/uploads/mask.png',
  background: 'transparent',
  moderation: 'low',
  inputFidelity: 'high',
  outputFormat: 'webp',
  outputCompression: 82,
});
assert.equal(gpt.inputFidelity, 'high');
assert.equal(gpt.outputCompression, 82);
assert.throws(
  () => validateImageRequest({ model: 'gpt-image-2', prompt: 'x', outputCompression: 80 }),
  /requires outputFormat jpeg or webp/,
);
assert.throws(
  () => validateImageRequest({ model: 'nano-banana', prompt: 'x', quality: 'high' }),
  /GPT Image options are not supported/,
);

const waveSpeed = validateImageRequest({ model: 'wavespeed', prompt: 'a mountain at sunset', aspectRatio: '1:1' });
assert.equal(waveSpeed.model, 'wavespeed');
assert.equal(waveSpeed.aspectRatio, '1:1');
assert.throws(
  () => validateImageRequest({ model: 'wavespeed', prompt: 'x', quality: 'high' }),
  /GPT Image options are not supported/,
);
assert.throws(
  () => validateImageRequest({ model: 'wavespeed', prompt: 'x', referencePaths: ['/media/uploads/a.jpg'] }),
  /too many reference images/,
);

const byteplus = validateImageRequest({ model: 'byteplus', prompt: 'a neon city street', aspectRatio: '9:16' });
assert.equal(byteplus.model, 'byteplus');
assert.equal(byteplus.aspectRatio, '9:16');
assert.throws(
  () => validateImageRequest({ model: 'byteplus', prompt: 'x', referencePaths: ['/media/uploads/a.jpg'] }),
  /too many reference images/,
);


const grok = validateImageRequest({ model: 'grok-imagine', prompt: 'a corgi surfing', aspectRatio: '9:16', imageSize: '2K', count: 4 });
assert.equal(grok.model, 'grok-imagine');
assert.equal(grok.aspectRatio, '9:16');
assert.equal(grok.count, 4);
assert.throws(
  () => validateImageRequest({ model: 'grok-imagine', prompt: 'x', imageSize: '4K' }),
  /imageSize must be 1K or 2K/,
);
assert.throws(
  () => validateImageRequest({ model: 'grok-imagine', prompt: 'x', aspectRatio: '21:9' }),
  /does not support aspect ratio/,
);
assert.throws(
  () => validateImageRequest({ model: 'grok-imagine', prompt: 'x', count: 5 }),
  /at most 4 images/,
);
assert.throws(
  () => validateImageRequest({ model: 'grok-imagine', prompt: 'x', referencePaths: ['/media/uploads/a.jpg'] }),
  /too many reference images/,
);
assert.throws(
  () => validateImageRequest({ model: 'grok-imagine', prompt: 'x', width: 1024, height: 1024 }),
  /custom width\/height are not supported/,
);

const cloudflare = validateImageRequest({ model: 'cloudflare', prompt: 'a corgi surfing', count: 2, seed: 7 });
assert.equal(cloudflare.model, 'cloudflare');
assert.equal(cloudflare.count, 2);
assert.equal(cloudflare.seed, 7);
assert.throws(
  () => validateImageRequest({ model: 'cloudflare', prompt: 'x', count: 5 }),
  /at most 4 images/,
);
assert.throws(
  () => validateImageRequest({ model: 'cloudflare', prompt: 'x'.repeat(2049) }),
  /at most 2048 characters/,
);
assert.throws(
  () => validateImageRequest({ model: 'cloudflare', prompt: 'x', referencePaths: ['/media/uploads/a.jpg'] }),
  /too many reference images/,
);
assert.throws(
  () => validateImageRequest({ model: 'cloudflare', prompt: 'x', width: 1024, height: 1024 }),
  /custom width\/height are not supported/,
);
assert.throws(
  () => validateImageRequest({ model: 'cloudflare', prompt: 'x', promptOptimizer: true }),
  /promptOptimizer is supported by image-01/,
);

const originalFetch = globalThis.fetch;
let grokRequest: Record<string, unknown> | null = null;
globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
  grokRequest = JSON.parse(String(init?.body)) as Record<string, unknown>;
  return new Response(JSON.stringify({ data: [{ b64_json: 'aGVsbG8=' }] }), {
    headers: { 'content-type': 'application/json' },
  });
}) as typeof fetch;
await callGrokImageProvider('https://api.x.ai/v1', 'test-key', 'grok-imagine-image', {
  prompt: 'portrait', count: 1, aspectRatio: '9:16', imageSize: '2K',
});
globalThis.fetch = originalFetch;
assert.equal(grokRequest?.aspect_ratio, '9:16', 'Grok receives the requested aspect ratio');

let cloudflareCalls: Array<{ url: string; body: Record<string, unknown> }> = [];
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  cloudflareCalls.push({ url: String(input), body: JSON.parse(String((init as RequestInit)?.body)) as Record<string, unknown> });
  return new Response(JSON.stringify({ result: { image: 'aGVsbG8=' }, success: true, errors: [], messages: [] }), {
    headers: { 'content-type': 'application/json' },
  });
}) as typeof fetch;
const cloudflareImages = await callCloudflareImageProvider('acct-123', 'cf-token', '@cf/black-forest-labs/flux-1-schnell', {
  prompt: 'portrait', count: 2, seed: 7,
});
globalThis.fetch = originalFetch;
assert.equal(cloudflareImages.length, 2);
assert.equal(cloudflareImages[0]?.b64_json, 'aGVsbG8=', 'Cloudflare base64 image is extracted from result.image');
assert.equal(cloudflareCalls[0]?.url, 'https://api.cloudflare.com/client/v4/accounts/acct-123/ai/run/@cf/black-forest-labs/flux-1-schnell');
assert.equal(cloudflareCalls[0]?.body.prompt, 'portrait');
assert.equal(cloudflareCalls[1]?.body.seed, 8, 'seed increments per image in the batch');
await assert.rejects(
  callCloudflareImageProvider('', 'cf-token', '@cf/black-forest-labs/flux-1-schnell', { prompt: 'x', count: 1 }),
  /CLOUDFLARE_ACCOUNT_ID/,
);
console.log('image.check: ok (provider-specific official parameters)');
