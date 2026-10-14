// Shared utilities for key probes: URL validation, proxy fetch, MiniMax post-check, LLM probe factory.

import { proxyDispatcher } from './outbound-proxy.ts';
import { PROBE_TIMEOUT_MS } from './key-probe-local.ts';
import { sanitizeProbeText } from './key-probe-result.ts';
import {
  isLocalLlmProvider,
  llmProviderConfigNames,
  protocolForProvider,
  type LlmProvider,
} from '../shared/llm-providers.ts';
import { AI_SDK_BASE_URL_FORMAT, resolveLlmBaseUrl } from './llm-config.ts';
import type { KeyName } from './keystore.ts';

export { sanitizeProbeText, parseModelCatalog, parseTextModelCatalog } from './key-probe-result.ts';
export { PROBE_TIMEOUT_MS } from './key-probe-local.ts';

type FetchInit = Parameters<typeof fetch>[1] & { dispatcher?: unknown };

// Probes send REAL stored credentials to a user/agent-settable base URL.
// Loopback and private hosts stay allowed (local models and LAN gateways are
// legitimate), but cloud metadata / link-local targets and credential-bearing
// or non-http(s) URLs never are — those only appear in SSRF exfil attempts.
export function probeUrlError(url: RequestInfo | URL): string | null {
  let parsed: URL;
  try {
    parsed = new URL(String(url));
  } catch {
    return '探测地址不是合法 URL';
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return `探测地址协议不支持:${parsed.protocol}`;
  }
  if (parsed.username || parsed.password) return '探测地址不允许携带内嵌凭据';
  const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(host) || host.startsWith('fe80:')
    || host === 'metadata.google.internal') {
    return '探测地址指向云元数据/链路本地网段,已拒绝';
  }
  return null;
}

const fetchWithProxy = (url: RequestInfo | URL, init?: FetchInit): Promise<Response> => {
  const unsafe = probeUrlError(url);
  if (unsafe) return Promise.reject(new Error(unsafe));
  return fetch(url, { ...init, dispatcher: proxyDispatcher() } as RequestInit);
};

type Get = (name: KeyName) => string;

export interface ProbeDef {
  readonly needs: readonly (readonly KeyName[])[];
  readonly run: (get: Get) => Promise<Response>;
  readonly postCheck?: (bodyText: string) => string | null;
  readonly okText?: (bodyText: string) => string | null;
  readonly models?: (bodyText: string) => string[];
}

const t = (): AbortSignal => AbortSignal.timeout(PROBE_TIMEOUT_MS);
const base = (get: Get, name: KeyName, def: string): string => (get(name) || def).replace(/\/+$/, '');
const bearer = (key: string): Record<string, string> => ({ Authorization: `Bearer ${key}` });

/** The provider's error copy is flattened before entering the results: line breaks and truncation are removed. Never splice any key values.*/
export function sanitize(text: string): string {
  return sanitizeProbeText(text);
}

/** MiniMax: HTTP 200 may also cause authentication failure, the truth is in base_resp.status_code(0 = success).*/
export function minimaxPostCheck(bodyText: string): string | null {
  try {
    const body = JSON.parse(bodyText) as { base_resp?: { status_code?: number; status_msg?: string } };
    const code = body.base_resp?.status_code ?? 0;
    if (code === 0) return null;
    const msg = body.base_resp?.status_msg ?? '';
    const hint = code === 1004 ? '（鉴权失败，检查 Key）' : '';
    return `MiniMax base_resp ${code}${msg ? ` · ${sanitize(msg)}` : ''}${hint}`;
  } catch {
    return null; // Non-JSON 2xx are counted as successful
  }
}

function llmProbe(provider: LlmProvider): ProbeDef {
  const names = llmProviderConfigNames(provider);
  const protocol = protocolForProvider(provider);
  const apiKeyName = names.apiKey as KeyName;
  const baseUrlName = names.baseUrl as KeyName;
  const isLocal = isLocalLlmProvider(provider);
  return {
    needs: isLocal ? [[]] : [[apiKeyName]],
    run: (get) => {
      const key = get(apiKeyName);
      const headers = protocol === 'anthropic'
        ? { 'x-api-key': key, 'anthropic-version': '2023-06-01' }
        : protocol === 'google'
          ? { 'x-goog-api-key': key }
          : key ? bearer(key) : {};
      const root = resolveLlmBaseUrl(provider, get(baseUrlName), AI_SDK_BASE_URL_FORMAT);
      return fetchWithProxy(`${root}/models`, { signal: t(), headers });
    },
    models: (bodyText: string) => {
      try {
        const body = JSON.parse(bodyText) as {
          data?: Array<{ id?: unknown; name?: unknown }>;
          models?: Array<{ id?: unknown; name?: unknown }>;
        };
        const rows = Array.isArray(body.data) ? body.data : Array.isArray(body.models) ? body.models : [];
        return [...new Set(rows
          .map((row) => typeof row.id === 'string' ? row.id : typeof row.name === 'string' ? row.name : '')
          .map((id) => id.trim())
          .filter(Boolean))]
          .sort((a, b) => a.localeCompare(b));
      } catch {
        return [];
      }
    },
  };
}

export function cloudflareAccountRoot(get: Get): string {
  return `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(get('CLOUDFLARE_ACCOUNT_ID'))}/ai/v1`;
}

export { llmProbe, fetchWithProxy, base, bearer, t, type Get, type KeyName };