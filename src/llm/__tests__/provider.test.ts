import { describe, expect, it } from 'vitest';
import { AnthropicDirectProvider, LlmError, MockProvider, OllamaProvider, ProxyProvider, registerMock, stripThinking } from '../provider';
import { DEFAULT_LLM, makeProvider } from '../settings';

/** A stand-in for fetch that records the call and answers `reply` with `status`. */
function fakeFetch(reply: unknown, status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(typeof reply === 'string' ? reply : JSON.stringify(reply), { status });
  }) as unknown as typeof fetch;
  return { f, calls, body: () => JSON.parse(calls[0]!.init.body as string), headers: () => calls[0]!.init.headers as Record<string, string> };
}
const REQ = { system: 'sys', prompt: 'hello', maxTokens: 50, temperature: 0.5 };

describe('LLM providers (§19.2, P9.1)', () => {
  it('Mock: the same prompt gets the same answer, a registered template fills from the facts, an abort is refused', async () => {
    const m = new MockProvider();
    expect(await m.complete(REQ)).toBe(await m.complete(REQ));
    registerMock('bark', (r, pick) => `${String(r.facts?.name)}: ${pick(['Hooray!', 'Grub-gob!'])}`);
    expect(await m.complete({ ...REQ, product: 'bark', facts: { name: 'Pipnok' } })).toMatch(/^Pipnok: (Hooray!|Grub-gob!)$/);
    expect(await m.complete({ ...REQ, facts: { lang: 'de' } })).toMatch(/Grub-gob! Alles gut\.|Beim großen Apfel, ja!/);
    const ac = new AbortController();
    ac.abort();
    await expect(m.complete(REQ, ac.signal)).rejects.toBeInstanceOf(LlmError);
  });

  it('Proxy: posts {system, prompt, maxTokens, temperature} and reads { text }', async () => {
    const ff = fakeFetch({ text: 'Yes yes!' });
    expect(await new ProxyProvider('http://x/complete', ff.f).complete(REQ)).toBe('Yes yes!');
    expect(ff.calls[0]!.url).toBe('http://x/complete');
    expect(ff.body()).toEqual({ system: 'sys', prompt: 'hello', maxTokens: 50, temperature: 0.5 });
  });

  it('Ollama: model, system, prompt, no streaming, num_predict; reads response', async () => {
    const ff = fakeFetch({ response: 'Ooo!' });
    expect(await new OllamaProvider('tiny', 'http://o/api/generate', ff.f).complete(REQ)).toBe('Ooo!');
    expect(ff.body()).toMatchObject({ model: 'tiny', system: 'sys', prompt: 'hello', stream: false, options: { num_predict: 50, temperature: 0.5 } });
    await expect(new OllamaProvider('', 'http://o', ff.f).complete(REQ)).rejects.toThrow(/no model/);
  });

  it('Ollama: asks thinking models not to think, and cuts any <think> block they still send', async () => {
    const ff = fakeFetch({ response: '<think>\nThe god wants a greeting.\n</think>\n\nHail, big one!' });
    expect(await new OllamaProvider('deepseek-r1:8b', 'http://o/api/generate', ff.f).complete(REQ)).toBe('Hail, big one!');
    expect(ff.body()).toMatchObject({ think: false });
    expect(stripThinking('<think>cut short by the budget')).toBe('');
    await expect(new OllamaProvider('deepseek-r1:8b', 'http://o', fakeFetch({ response: '<think>hmm' }).f).complete(REQ)).rejects.toThrow(/only thought/);
  });

  it('Ollama: an unreachable server says how to let the page in', async () => {
    const down = (async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;
    await expect(new OllamaProvider('m', 'http://o', down).complete(REQ)).rejects.toThrow(/OLLAMA_ORIGINS/);
  });

  it('Anthropic direct: key, version and browser opt-in headers; the text blocks joined', async () => {
    const ff = fakeFetch({ content: [{ type: 'text', text: 'By the big ' }, { type: 'text', text: 'apple!' }] });
    expect(await new AnthropicDirectProvider('k', 'm', 'http://a/v1/messages', ff.f).complete(REQ)).toBe('By the big apple!');
    expect(ff.headers()).toMatchObject({ 'x-api-key': 'k', 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' });
    expect(ff.body()).toEqual({ model: 'm', max_tokens: 50, system: 'sys', messages: [{ role: 'user', content: 'hello' }], temperature: 0.5 });
    await expect(new AnthropicDirectProvider('', 'm', 'http://a', ff.f).complete(REQ)).rejects.toThrow(/API key/);
  });

  it('errors: a refusal keeps its status, a wrong shape and a dead server are LlmErrors', async () => {
    const bad = fakeFetch('rate limited', 429);
    await expect(new ProxyProvider('http://x', bad.f).complete(REQ)).rejects.toMatchObject({ status: 429 });
    await expect(new ProxyProvider('http://x', fakeFetch({ nope: 1 }).f).complete(REQ)).rejects.toThrow(/no text/);
    const dead = (async () => { throw new TypeError('connection refused'); }) as unknown as typeof fetch;
    await expect(new ProxyProvider('http://x', dead).complete(REQ)).rejects.toThrow(/no answer/);
  });

  it('settings: Mock by default and on, no model preset, the provider each setting describes', () => {
    expect(DEFAULT_LLM).toMatchObject({ enabled: true, provider: 'mock', model: '' });
    expect(makeProvider(DEFAULT_LLM).name).toBe('mock');
    expect(makeProvider({ ...DEFAULT_LLM, provider: 'proxy' }).name).toBe('proxy');
    expect(makeProvider({ ...DEFAULT_LLM, provider: 'ollama', model: 'x' }).name).toBe('ollama');
    expect(makeProvider({ ...DEFAULT_LLM, provider: 'anthropic', apiKey: 'k', model: 'x' }).name).toBe('anthropic');
  });
});
