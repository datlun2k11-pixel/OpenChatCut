// Probe definitions for each provider page. Import utilities from key-probe-utils.ts

import {
  type ProbeDef,
  llmProbe,
  fetchWithProxy,
  base,
  bearer,
  t,
  minimaxPostCheck,
  cloudflareAccountRoot,
  parseModelCatalog,
  parseTextModelCatalog,
} from './key-probe-utils.ts';
import { LLM_PROVIDER_PRESETS } from '../shared/llm-providers.ts';
import { versionedApiBaseUrl } from './plugins/media-provider-config.ts';
import { xaiOauthAccessToken } from './xai-oauth-session.ts';
import { AI_SDK_BASE_URL_FORMAT, resolveLlmBaseUrl } from './llm-config.ts';
import { r2Probe } from './r2.ts';
import { mediaDirProbe, mediaDirPostCheck, mediaDirOkText } from './media-dir.ts';

const requestyLlmProbe = llmProbe('requesty');
const cheaperInferenceProbe = { ...llmProbe('cheaperinference'), models: parseTextModelCatalog };

// MiniMax: shared probe for image, voice, video, music pages
export const minimaxProbe: ProbeDef = {
  needs: [['MINIMAX_API_KEY']],
  run: (get) => fetch(`${base(get, 'MINIMAX_BASE_URL', 'https://api.minimaxi.com')}/v1/get_voice`, {
    method: 'POST', signal: t(),
    headers: { 'Content-Type': 'application/json', ...bearer(get('MINIMAX_API_KEY')) },
    body: JSON.stringify({ voice_type: 'voice_cloning' }),
  }),
  postCheck: minimaxPostCheck,
};

export const atlasMusicProbe: ProbeDef = {
  needs: [['ATLASCLOUD_API_KEY']],
  run: async (get) => {
    const root = base(get, 'ATLASCLOUD_API_BASE', 'https://api.atlascloud.ai/api/v1');
    const response = await fetchWithProxy(`${root}/model/prediction/openchatcut-credential-probe`, {
      signal: t(), headers: bearer(get('ATLASCLOUD_API_KEY')),
    });
    if (response.status !== 404) return response;
    const body = await response.text().catch(() => '');
    try {
      const payload = JSON.parse(body) as { code?: number; message?: string };
      if (payload.code === 404 && payload.message === 'not found') {
        return new Response('{"authenticated":true}', { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
    } catch {
      // Preserve an unrecognized 404 so the common classifier reports a bad Base URL.
    }
    return new Response(body, { status: 404, headers: response.headers });
  },
};

export const byteplusProbe: ProbeDef = {
  needs: [['BYTEPLUS_API_KEY']],
  run: (get) => fetch(`${base(get, 'BYTEPLUS_BASE_URL', 'https://ark.ap-southeast.bytepluses.com/api/v3')}/models`, {
    signal: t(), headers: bearer(get('BYTEPLUS_API_KEY')),
  }),
  models: parseModelCatalog,
};

export const openAiMediaProbe: ProbeDef = {
  needs: [['OPENAI_API_KEY']],
  run: (get) => fetch(`${versionedApiBaseUrl(base(get, 'IMAGE_BASE_URL', 'https://api.openai.com'), 'v1')}/models`, {
    signal: t(), headers: bearer(get('OPENAI_API_KEY')),
  }),
};

export const geminiMediaProbe: ProbeDef = {
  needs: [['GEMINI_API_KEY']],
  run: (get) => fetch(`${versionedApiBaseUrl(base(get, 'GEMINI_BASE_URL', 'https://generativelanguage.googleapis.com'), 'v1beta')}/models?pageSize=1`, {
    signal: t(), headers: { 'x-goog-api-key': get('GEMINI_API_KEY') },
  }),
};

export const mistralMediaProbe: ProbeDef = {
  needs: [['LLM_MISTRAL_API_KEY']],
  run: (get) => fetch(`${versionedApiBaseUrl(base(get, 'LLM_MISTRAL_BASE_URL', 'https://api.mistral.ai/v1'), 'v1')}/models`, {
    signal: t(), headers: bearer(get('LLM_MISTRAL_API_KEY')),
  }),
};

export const deepgramProbe: ProbeDef = {
  needs: [['DEEPGRAM_API_KEY']],
  run: (get) => fetch('https://api.deepgram.com/v1/projects', {
    signal: t(), headers: { Authorization: `Token ${get('DEEPGRAM_API_KEY')}` },
  }),
};

export const groqProbe: ProbeDef = {
  needs: [['GROQ_API_KEY']],
  run: (get) => fetch(`${base(get, 'GROQ_BASE_URL', 'https://api.groq.com/openai/v1')}/models`, {
    signal: t(), headers: bearer(get('GROQ_API_KEY')),
  }),
};

export const xaiMediaProbe: ProbeDef = {
  needs: [['LLM_XAI_OAUTH_API_KEY'], ['LLM_XAI_API_KEY']],
  run: (get) => {
    const token = xaiOauthAccessToken() || get('LLM_XAI_API_KEY');
    return fetchWithProxy(`${base(get, 'LLM_XAI_BASE_URL', 'https://api.x.ai/v1')}/models`, {
      signal: t(), headers: token ? bearer(token) : {},
    });
  },
  models: parseModelCatalog,
};

export const elevenLabsProbe: ProbeDef = {
  needs: [['ELEVENLABS_API_KEY']],
  run: (get) => fetch(`${base(get, 'ELEVENLABS_BASE_URL', 'https://api.elevenlabs.io')}/v1/models`, {
    signal: t(), headers: { 'xi-api-key': get('ELEVENLABS_API_KEY') },
  }),
};

export const cartesiaProbe: ProbeDef = {
  needs: [['CARTESIA_API_KEY']],
  run: (get) => fetch('https://api.cartesia.ai/voices?limit=1', {
    signal: t(),
    headers: {
      Authorization: `Bearer ${get('CARTESIA_API_KEY')}`,
      'Cartesia-Version': '2026-03-01',
    },
  }),
};

export const requestyProbe: ProbeDef = {
  ...requestyLlmProbe,
  run: async (get) => {
    const checked = await requestyLlmProbe.run(get);
    if (!checked.ok) return checked;
    const root = resolveLlmBaseUrl('requesty', get('LLM_REQUESTY_BASE_URL'), AI_SDK_BASE_URL_FORMAT);
    const managed = await fetchWithProxy(`${root}/models/managed`, { signal: t() }).catch(() => null);
    return managed?.ok ? managed : checked;
  },
};

export const cloudflareProbe: ProbeDef = {
  needs: [['CLOUDFLARE_ACCOUNT_ID', 'LLM_CLOUDFLARE_API_KEY']],
  run: (get) => fetchWithProxy(`${cloudflareAccountRoot(get)}/chat/completions`, {
    method: 'POST',
    signal: t(),
    headers: { 'Content-Type': 'application/json', ...bearer(get('LLM_CLOUDFLARE_API_KEY')) },
    body: JSON.stringify({
      model: get('LLM_CLOUDFLARE_MODEL') || '@cf/meta/llama-3.1-8b-instruct',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 1,
      stream: false,
    }),
  }),
};

/** page key (same name as the vendor page key of settingsSchema) → detection definition.*/
export const PROBES: Record<string, ProbeDef> = {
  ...Object.fromEntries(LLM_PROVIDER_PRESETS.map((preset) => [
    `llm/${preset.id}`,
    llmProbe(preset.id),
  ])),
  'llm/requesty': requestyProbe,
  'llm/cheaperinference': cheaperInferenceProbe,
  'image/openai': {
    needs: [['IMAGE_API_KEY'], ['OPENAI_API_KEY']],
    run: (get) => fetch(`${base(get, 'IMAGE_BASE_URL', 'https://api.openai.com')}/v1/models`, {
      signal: t(), headers: bearer(get('IMAGE_API_KEY') || get('OPENAI_API_KEY')),
    }),
  },
  'image/gemini': geminiMediaProbe,
  'image/minimax': minimaxProbe,
  'image/byteplus': byteplusProbe,
  'image/xai': xaiMediaProbe,
  'image/cloudflare': cloudflareProbe,
  'image/wavespeed': {
    needs: [['WAVESPEED_API_KEY']],
    run: (get) => fetch(`${base(get, 'WAVESPEED_BASE_URL', 'https://api.wavespeed.ai')}/api/v3/balance`, {
      signal: t(), headers: bearer(get('WAVESPEED_API_KEY')),
    }),
  },
  'voice/elevenlabs': elevenLabsProbe,
  'voice/openai': openAiMediaProbe,
  'voice/gemini': geminiMediaProbe,
  'voice/mistral': mistralMediaProbe,
  'voice/cartesia': cartesiaProbe,
  'voice/cloudflare': cloudflareProbe,
  // openpeech does not have free probing endpoints, synthesizing 1 word is the minimum real verification (the cost is negligible).
  'voice/doubao': {
    needs: [['DOUBAO_TTS_APP_ID', 'DOUBAO_TTS_ACCESS_KEY']],
    run: (get) => fetch(`${base(get, 'DOUBAO_TTS_BASE_URL', 'https://openspeech.bytedance.com')}/api/v3/tts/unidirectional`, {
      method: 'POST', signal: t(),
      headers: {
        'Content-Type': 'application/json',
        'X-Api-App-Id': get('DOUBAO_TTS_APP_ID'),
        'X-Api-Access-Key': get('DOUBAO_TTS_ACCESS_KEY'),
        'X-Api-Resource-Id': get('DOUBAO_TTS_RESOURCE_ID') || 'seed-tts-2.0',
      },
      body: JSON.stringify({
        user: { uid: 'openchatcut-probe' },
        req_params: { text: '测', speaker: 'zh_female_vv_uranus_bigtts', audio_params: { format: 'mp3', sample_rate: 24_000 } },
      }),
    }),
  },
  'voice/minimax': minimaxProbe,
  'voice/inworld': {
    needs: [['INWORLD_TTS_API_KEY']],
    run: (get) => fetch(`${base(get, 'INWORLD_TTS_BASE_URL', 'https://api.inworld.ai')}/voices/v1/voices`, {
      signal: t(), headers: { Authorization: `Basic ${get('INWORLD_TTS_API_KEY')}` },
    }),
  },
  'voice/fishaudio': {
    needs: [['FISHAUDIO_TTS_API_KEY']],
    run: (get) => fetch(`${base(get, 'FISHAUDIO_TTS_BASE_URL', 'https://api.fish.audio')}/model`, {
      signal: t(), headers: bearer(get('FISHAUDIO_TTS_API_KEY')),
    }),
  },
  // No free read-only endpoint is documented; synthesizing 1 word is the minimum real verification (negligible cost).
  'voice/speechify': {
    needs: [['SPEECHIFY_TTS_API_KEY']],
    run: (get) => fetch(`${base(get, 'SPEECHIFY_TTS_BASE_URL', 'https://api.sws.speechify.com')}/v1/audio/speech`, {
      method: 'POST', signal: t(),
      headers: { 'Content-Type': 'application/json', ...bearer(get('SPEECHIFY_TTS_API_KEY')) },
      body: JSON.stringify({ input: '测', voice_id: 'george', audio_format: 'mp3', model: get('SPEECHIFY_TTS_MODEL') || 'simba-multilingual' }),
    }),
  },
  'video/seedance': {
    needs: [['SEEDANCE_API_KEY']],
    run: (get) => fetch(`${base(get, 'SEEDANCE_BASE_URL', 'https://ark.cn-beijing.volces.com/api/v3')}/contents/generations/tasks?page_num=1&page_size=1`, {
      signal: t(), headers: bearer(get('SEEDANCE_API_KEY')),
    }),
  },
  'video/kling': {
    needs: [['KLING_API_KEY']],
    run: (get) => fetch(`${base(get, 'KLING_BASE_URL', 'https://api-singapore.klingai.com')}/v1/videos/text2video?pageNum=1&pageSize=1`, {
      signal: t(), headers: bearer(get('KLING_API_KEY')),
    }),
  },
  'video/hailuo': minimaxProbe,
  'video/byteplus': byteplusProbe,
  'video/xai': xaiMediaProbe,
  'video/ofox': {
    needs: [['LLM_OFOX_API_KEY']],
    run: (get) => fetch(`${base(get, 'LLM_OFOX_BASE_URL', 'https://api.ofox.ai/v1')}/models`, {
      signal: t(), headers: bearer(get('LLM_OFOX_API_KEY')),
    }),
    models: parseModelCatalog,
  },
  'music/mureka': {
    needs: [['MUREKA_API_KEY']],
    run: (get) => fetch(`${base(get, 'MUREKA_BASE_URL', 'https://api.mureka.ai')}/v1/account/billing`, {
      signal: t(), headers: bearer(get('MUREKA_API_KEY')),
    }),
  },
  'music/minimax': minimaxProbe,
  'music/atlas': atlasMusicProbe,
  // Read-only account endpoint; fake key → 401. The same key also serves
  // /generate/sound (video-to-SFX), so one probe covers both capabilities.
  'music/sonilo': {
    needs: [['SONILO_API_KEY']],
    run: (get) => fetch(`${base(get, 'SONILO_BASE_URL', 'https://api.sonilo.com')}/v1/account/services`, {
      signal: t(), headers: bearer(get('SONILO_API_KEY')),
    }),
  },
  // /v1/search has been opened to anonymous users (the measured number is 200 without key), and the key; collections cannot be detected
  // It is the account binding endpoint, and the fake key is stable 401.
  'stock/pexels': {
    needs: [['PEXELS_API_KEY']],
    run: (get) => fetch('https://api.pexels.com/v1/collections?per_page=1', {
      signal: t(), headers: { Authorization: get('PEXELS_API_KEY') },
    }),
  },
  // Pixabay official design: key takes the query parameter (the server is directly connected to HTTPS, the same shape as the stock plugin).
  'stock/pixabay': {
    needs: [['PIXABAY_API_KEY']],
    run: (get) => {
      const params = new URLSearchParams({ key: get('PIXABAY_API_KEY'), q: 'sky', per_page: '3' });
      return fetchWithProxy(`https://pixabay.com/api/?${params.toString()}`, { signal: t() });
    },
  },
  // Unsplash: The search endpoint requires Client-ID, fake key 401.
  'stock/unsplash': {
    needs: [['UNSPLASH_ACCESS_KEY']],
    run: (get) => fetch('https://api.unsplash.com/search/photos?query=sky&per_page=1', {
      signal: t(), headers: { Authorization: 'Client-ID ' + get('UNSPLASH_ACCESS_KEY') },
    }),
  },
  // Freesound: token uses query (same shape as stock plugin), false token 401.
  'stock/freesound': {
    needs: [['FREESOUND_API_KEY']],
    run: (get) => {
      const params = new URLSearchParams({ query: 'wind', page_size: '1', fields: 'id', token: get('FREESOUND_API_KEY') });
      return fetchWithProxy('https://freesound.org/apiv2/search/text/?' + params.toString(), { signal: t() });
    },
  },
  'transcription/assemblyai': {
    needs: [['ASSEMBLYAI_API_KEY']],
    run: (get) => fetch('https://api.assemblyai.com/v2/transcript?limit=1', {
      signal: t(), headers: { authorization: get('ASSEMBLYAI_API_KEY') },
    }),
  },
  'transcription/openai': openAiMediaProbe,
  'transcription/mistral': mistralMediaProbe,
  'transcription/deepgram': deepgramProbe,
  'transcription/groq': groqProbe,
  'transcription/elevenlabs': elevenLabsProbe,
  'transcription/cartesia': cartesiaProbe,
  'sandbox/e2b': {
    needs: [['E2B_API_KEY']],
    run: (get) => fetch('https://api.e2b.dev/sandboxes', {
      signal: t(), headers: { 'X-API-KEY': get('E2B_API_KEY') },
    }),
  },
  'web/firecrawl': {
    needs: [['FIRECRAWL_API_KEY']],
    run: (get) => fetch('https://api.firecrawl.dev/v2/team/credit-usage', {
      signal: t(), headers: bearer(get('FIRECRAWL_API_KEY')),
    }),
  },
  // Read-only account endpoint; a fake key is a stable 401. Upload-Post keys
  // use the `Apikey` scheme, not `Bearer`.
  'publish/upload-post': {
    needs: [['UPLOAD_POST_API_KEY']],
    run: (get) => fetch(`${base(get, 'UPLOAD_POST_BASE_URL', 'https://api.upload-post.com')}/api/uploadposts/me`, {
      signal: t(), headers: { Authorization: `Apikey ${get('UPLOAD_POST_API_KEY')}` },
    }),
  },
  // S3 HeadBucket is sent via SDK (SigV4 signature cannot be fetched manually), r2.ts synthesizes Response:
  // 200=The bucket exists and has been authenticated; 403/404 goes to classifyStatus; the network layer throws it to networkMessage as it is.
  'storage/r2': {
    needs: [['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET']],
    run: (get) => r2Probe(get),
  },
  // Local saving directory: disk check (create directory + write and delete detection files), non-network request. Empty group needs = not filled in
  // It can also be tested (if not set = use the default directory, it is legal).
  'storage/local': {
    needs: [[]],
    run: (get) => mediaDirProbe(get),
    postCheck: mediaDirPostCheck,
    okText: mediaDirOkText,
  },
};