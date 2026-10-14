// Main entry point for key probes: getter factory, runProbe orchestration, and re-exports.

import { PROBES } from './key-probe-defs.ts';
import { runDataDirProbe, runProxyProbe } from './key-probe-local.ts';
import { getKey, KEY_NAMES } from './keystore.ts';
import {
  classifyStatus,
  networkMessage,
  type ProbeResult,
} from './key-probe-result.ts';
import { AI_SDK_BASE_URL_FORMAT } from './llm-config.ts';
import type { Get } from './key-probe-utils.ts';

// Re-export utilities and types
export {
  probeUrlError,
  sanitize,
  minimaxPostCheck,
  llmProbe,
  type ProbeDef,
} from './key-probe-utils.ts';
export {
  classifyStatus,
  networkMessage,
  parseModelCatalog,
  type ProbeResult,
} from './key-probe-result.ts';
export {
  PROBE_TIMEOUT_MS,
  runDataDirProbe,
  runProxyProbe,
} from './key-probe-local.ts';
export { PROBES } from './key-probe-defs.ts';

/** Temporarily stored overrides (in the whitelist, the empty string represents clearing for this test) overwrite the stored value.*/
export function makeGetter(overrides: Record<string, unknown>): Get {
  const clean = new Map<string, string>();
  for (const [name, raw] of Object.entries(overrides)) {
    if (!(KEY_NAMES as readonly string[]).includes(name)) continue; // Discarded outside the whitelist
    clean.set(name, String(raw ?? '').trim());
  }
  if (clean.has('LLM_BASE_URL') && !clean.has('LLM_BASE_URL_FORMAT')) {
    clean.set('LLM_BASE_URL_FORMAT', clean.get('LLM_BASE_URL') ? AI_SDK_BASE_URL_FORMAT : '');
  }
  return (name) => clean.has(name) ? clean.get(name)! : getKey(name);
}

/** Run a connectivity probe of the provider's page. Unconfigured/unknown pages are returned before sending a request and do not hit the network.*/
export async function runProbe(page: string, overrides: Record<string, unknown>): Promise<ProbeResult> {
  if (page === 'agent/proxy') return runProxyProbe(overrides);
  // The storage root is not a keystore key (makeGetter would drop it), so its
  // writability check reads the panel's raw value directly.
  if (page === 'storage/projects') return runDataDirProbe(overrides);
  const probe = PROBES[page];
  if (!probe) return { ok: false, message: '该厂商暂不支持连接测试' };
  const get = makeGetter(overrides);
  const ready = probe.needs.some((group) => group.every((n) => get(n).length > 0));
  if (!ready) return { ok: false, message: '尚未填写 API Key · 填好后再点测试' };
  const started = Date.now();
  try {
    const response = await probe.run(get);
    const latencyMs = Date.now() - started;
    const bodyText = await response.text().catch(() => '');
    if (response.ok) {
      const vendorError = probe.postCheck?.(bodyText) ?? null;
      if (vendorError) return { ok: false, status: response.status, latencyMs, message: vendorError };
      const models = probe.models?.(bodyText);
      const modelText = models
        ? models.length > 0 ? ` · 已读取 ${models.length} 个模型` : ' · 接口未返回模型列表'
        : '';
      const okText = probe.okText?.(bodyText) ?? '连接成功 · 鉴权通过';
      return {
        ok: true,
        status: response.status,
        latencyMs,
        message: `${okText}${modelText} · ${latencyMs}ms`,
        ...(models ? { models } : {}),
      };
    }
    return { ...classifyStatus(response.status, bodyText), latencyMs };
  } catch (error) {
    return { ok: false, latencyMs: Date.now() - started, message: networkMessage(error) };
  }
}