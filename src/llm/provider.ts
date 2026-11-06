/**
 * LLM providers (§19.2, P9.1). The game asks for text through one small interface and never waits on it: whatever
 * answers is a setting. `MockProvider` (the default, offline) fills templates from the facts a prompt was built
 * from; `ProxyProvider` posts to the local proxy (`npm run llm-proxy`, which keeps the API key out of the browser);
 * `OllamaProvider` asks a local model; `AnthropicDirectProvider` calls the Messages API from the browser (developer
 * use only: the key sits in the page). Nothing here touches the sim.
 */
import { CFG } from '../sim/config';

/** What a request is for: the Mock provider picks its template by this (§19.4). */
export type LlmProduct =
  | 'diary' | 'dialogue' | 'bark' | 'book' | 'eulogy' | 'chronicle' | 'village_name' | 'god_name' | 'interpret' | 'reply' | 'test';

export interface LLMRequest {
  system: string; prompt: string; maxTokens: number; temperature?: number;
  /** the product, and the facts its prompt was built from (names, events, language): only the Mock reads these */
  product?: LlmProduct; facts?: Record<string, unknown>;
}
export interface LLMProvider { name: string; complete(req: LLMRequest, signal?: AbortSignal): Promise<string> }

/** A provider failed: no answer, a refusal by the server (`status`), or a reply in a shape it did not expect. */
export class LlmError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'LlmError';
  }
}

type Fetch = typeof fetch;
type MockTemplate = (req: LLMRequest, pick: <T>(xs: readonly T[]) => T) => string;
const TEMPLATES = new Map<LlmProduct, MockTemplate>();

/** Later steps register the Mock's template for their product (diaries, barks, the Voice…). */
export function registerMock(product: LlmProduct, fn: MockTemplate): void {
  TEMPLATES.set(product, fn);
}

/** 32-bit FNV-1a, so the Mock answers the same prompt the same way every time. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

export class MockProvider implements LLMProvider {
  readonly name = 'mock';
  async complete(req: LLMRequest, signal?: AbortSignal): Promise<string> {
    if (signal?.aborted) throw new LlmError('aborted');
    let h = hash(req.prompt);
    const pick = <T>(xs: readonly T[]): T => {
      h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
      return xs[h % xs.length]!;
    };
    const t = req.product && TEMPLATES.get(req.product);
    if (t) return t(req, pick);
    return req.facts?.lang === 'de' ? pick(['Grub-gob! Alles gut.', 'Beim großen Apfel, ja!']) : pick(['Grub-gob! All is well.', 'By the big apple, yes!']);
  }
}

async function post(fetchFn: Fetch, url: string, body: unknown, headers: Record<string, string>, signal?: AbortSignal): Promise<unknown> {
  let res: Response;
  try {
    res = await fetchFn(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), ...(signal ? { signal } : {}) });
  } catch (e) {
    throw new LlmError(`no answer from ${url}: ${(e as Error).message}`);
  }
  if (!res.ok) throw new LlmError(`${url} answered ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`, res.status);
  try {
    return await res.json();
  } catch {
    throw new LlmError(`${url} did not answer JSON`);
  }
}
const str = (v: unknown, what: string): string => {
  if (typeof v !== 'string') throw new LlmError(`unexpected reply: no ${what}`);
  return v;
};

/** POSTs `{system, prompt, maxTokens, temperature}` to the local proxy, which answers `{ text }`. */
export class ProxyProvider implements LLMProvider {
  readonly name = 'proxy';
  constructor(private endpoint = CFG.llm.endpoints.proxy, private fetchFn: Fetch = (...a) => fetch(...a)) {}
  async complete(req: LLMRequest, signal?: AbortSignal): Promise<string> {
    const r = (await post(this.fetchFn, this.endpoint, { system: req.system, prompt: req.prompt, maxTokens: req.maxTokens, temperature: req.temperature }, {}, signal)) as { text?: unknown };
    return str(r.text, 'text');
  }
}

/** A local Ollama model (`/api/generate`, not streamed). */
export class OllamaProvider implements LLMProvider {
  readonly name = 'ollama';
  constructor(private model: string, private endpoint = CFG.llm.endpoints.ollama, private fetchFn: Fetch = (...a) => fetch(...a)) {}
  async complete(req: LLMRequest, signal?: AbortSignal): Promise<string> {
    if (!this.model) throw new LlmError('no model set');
    const body = { model: this.model, system: req.system, prompt: req.prompt, stream: false, options: { num_predict: req.maxTokens, ...(req.temperature !== undefined ? { temperature: req.temperature } : {}) } };
    const r = (await post(this.fetchFn, this.endpoint, body, {}, signal)) as { response?: unknown };
    return str(r.response, 'response');
  }
}

/** The Anthropic Messages API, straight from the browser (needs the direct-browser-access opt-in header). */
export class AnthropicDirectProvider implements LLMProvider {
  readonly name = 'anthropic';
  constructor(private apiKey: string, private model: string, private endpoint = CFG.llm.endpoints.anthropic, private fetchFn: Fetch = (...a) => fetch(...a)) {}
  async complete(req: LLMRequest, signal?: AbortSignal): Promise<string> {
    if (!this.apiKey) throw new LlmError('no API key set');
    if (!this.model) throw new LlmError('no model set');
    const body = { model: this.model, max_tokens: req.maxTokens, system: req.system, messages: [{ role: 'user', content: req.prompt }], ...(req.temperature !== undefined ? { temperature: req.temperature } : {}) };
    const headers = { 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' };
    const r = (await post(this.fetchFn, this.endpoint, body, headers, signal)) as { content?: { type?: string; text?: unknown }[] };
    if (!Array.isArray(r.content)) throw new LlmError('unexpected reply: no content');
    return r.content.filter((c) => c.type === 'text').map((c) => str(c.text, 'text')).join('');
  }
}
