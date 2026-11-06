/**
 * The player's LLM settings (§19.2): provider, model, endpoint, key, temperature, per-day budgets and the kill
 * switch. Kept in this browser's localStorage, never in a save. No model is preset: the player names one (or the
 * proxy's `NIBBLETS_MODEL`), so the game never pins a model that ages. The language comes from the game's own
 * setting.
 */
import { CFG } from '../sim/config';
import { AnthropicDirectProvider, MockProvider, OllamaProvider, ProxyProvider, type LLMProvider } from './provider';

export type ProviderKind = 'mock' | 'proxy' | 'ollama' | 'anthropic';
export const PROVIDERS: readonly ProviderKind[] = ['mock', 'proxy', 'ollama', 'anthropic'];
export type Budgets = typeof CFG.llm.budgets;

export interface LlmSettings {
  /** the kill switch: off, nothing is asked of any provider */
  enabled: boolean;
  provider: ProviderKind;
  /** for Ollama and the direct API (the proxy picks its own) */
  model: string;
  /** '' = the provider's usual address */
  endpoint: string;
  /** only for the direct API */
  apiKey: string;
  temperature: number;
  budgets: Budgets;
}

export const DEFAULT_LLM: LlmSettings = {
  enabled: true, provider: 'mock', model: '', endpoint: '', apiKey: '', temperature: CFG.llm.temperature, budgets: { ...CFG.llm.budgets },
};

const KEY = 'nibblets.llm';

export function loadLlmSettings(): LlmSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_LLM, budgets: { ...DEFAULT_LLM.budgets } };
    const v = JSON.parse(raw) as Partial<LlmSettings>;
    return { ...DEFAULT_LLM, ...v, provider: PROVIDERS.includes(v.provider!) ? v.provider! : 'mock', budgets: { ...DEFAULT_LLM.budgets, ...v.budgets } };
  } catch {
    return { ...DEFAULT_LLM, budgets: { ...DEFAULT_LLM.budgets } };
  }
}

export function saveLlmSettings(s: LlmSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage blocked: the settings last this session */
  }
}

/** The provider these settings describe. */
export function makeProvider(s: LlmSettings): LLMProvider {
  const ep = s.endpoint.trim();
  switch (s.provider) {
    case 'proxy': return new ProxyProvider(ep || CFG.llm.endpoints.proxy);
    case 'ollama': return new OllamaProvider(s.model.trim(), ep || CFG.llm.endpoints.ollama);
    case 'anthropic': return new AnthropicDirectProvider(s.apiKey.trim(), s.model.trim(), ep || CFG.llm.endpoints.anthropic);
    default: return new MockProvider();
  }
}

let current: LlmSettings | null = null;
const listeners = new Set<(s: LlmSettings) => void>();
/** The settings in force (loaded once). */
export const llmSettings = (): LlmSettings => (current ??= loadLlmSettings());
/** Change and keep the settings; whoever listens (the scheduler) picks them up at once. */
export function setLlmSettings(s: LlmSettings): void {
  current = s;
  saveLlmSettings(s);
  for (const f of listeners) f(s);
}
export function onLlmSettings(f: (s: LlmSettings) => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}
