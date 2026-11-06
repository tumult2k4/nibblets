/**
 * The Voices (LLM) tab of Settings (§19.2, P9.1): the kill switch, provider, model, address, the direct API's key
 * behind its warning, temperature, the per-day budgets, and a Test button that asks the chosen provider for one line.
 * The language is the game's (P9.6): every prompt says "Write in English/German", and the Mock writes both.
 */
import { el } from '../dom';
import { getLang, t } from '../i18n';
import { field, select, checkbox } from './common';
import { CFG } from '../../sim/config';
import { systemPrompt } from '../../llm/prompts';
import { llmSettings, makeProvider, setLlmSettings, PROVIDERS, type Budgets, type LlmSettings, type ProviderKind } from '../../llm/settings';

const LANG_NAME = { en: 'English', de: 'Deutsch' } as const;
const ENDPOINT: Record<ProviderKind, string> = { mock: '', proxy: CFG.llm.endpoints.proxy, ollama: CFG.llm.endpoints.ollama, anthropic: CFG.llm.endpoints.anthropic };

export function llmTab(): HTMLElement {
  const root = el('div');
  const render = () => {
    const s = llmSettings();
    const set = (patch: Partial<LlmSettings>, redraw = false) => {
      setLlmSettings({ ...s, ...patch });
      if (redraw) render();
    };
    const text = (v: string, onIn: (v: string) => void, type = 'text') => {
      const i = el('input', { type, value: v, oninput: () => onIn(i.value), style: 'width:100%' });
      return i;
    };
    const p = s.provider;
    const rows: HTMLElement[] = [
      ...field(t('llm.enabled'), checkbox(s.enabled, (v) => set({ enabled: v }))),
      ...field(t('llm.provider'), select<ProviderKind>(PROVIDERS.map((k) => [k, t(`llm.p.${k}`)]), p, (v) => set({ provider: v }, true))),
      ...field(t('set.language'), el('span.sub', { text: t('llm.lang', { lang: LANG_NAME[getLang()] }) })), // P9.6: the game's own
    ];
    if (p === 'ollama' || p === 'anthropic') rows.push(...field(t('llm.model'), text(s.model, (v) => set({ model: v }))));
    if (p !== 'mock') {
      const ep = text(s.endpoint, (v) => set({ endpoint: v }));
      ep.placeholder = ENDPOINT[p];
      rows.push(...field(t('llm.endpoint'), ep));
    }
    if (p === 'anthropic') rows.push(...field(t('llm.apiKey'), text(s.apiKey, (v) => set({ apiKey: v }), 'password')));
    const temp = el('input', { type: 'range', min: 0, max: 1, step: 0.05, value: s.temperature, oninput: () => set({ temperature: Number(temp.value) }) });
    rows.push(...field(t('llm.temperature'), temp));
    const budget = (k: keyof Budgets) => {
      const i = el('input', { type: 'number', min: 0, step: k.endsWith('okens') || k === 'tokensPerDay' ? 500 : 1, value: s.budgets[k], style: 'width:90px',
        onchange: () => set({ budgets: { ...llmSettings().budgets, [k]: Math.max(0, Math.round(Number(i.value) || 0)) } }) });
      return el('label', { style: 'display:flex;gap:6px;align-items:center' }, el('span', { text: t(`llm.b.${k}`), style: 'min-width:150px' }), i);
    };
    const keys = Object.keys(s.budgets) as (keyof Budgets)[];
    const out = el('div.sub', { style: 'min-height:1.4em;margin-top:6px;white-space:pre-wrap' });
    const test = el('button.btn', { text: t('llm.test') });
    test.onclick = async () => {
      out.textContent = t('llm.testing');
      test.disabled = true;
      try {
        const reply = await makeProvider(llmSettings()).complete({ system: systemPrompt(getLang()), prompt: t('llm.testPrompt'), maxTokens: 40, temperature: llmSettings().temperature, product: 'test', facts: { lang: getLang() } });
        out.textContent = t('llm.testOk', { text: reply.trim().slice(0, 200) });
      } catch (e) {
        out.textContent = t('llm.testFail', { err: (e as Error).message });
      } finally {
        test.disabled = false;
      }
    };
    const hint = p === 'anthropic' ? t('llm.keyWarn') : p === 'proxy' ? t('llm.proxyHint') : p === 'mock' ? '' : t('llm.modelHint');
    root.replaceChildren(
      el('div.sub', { text: t('llm.enabledHint'), style: 'margin-bottom:6px' }),
      el('div.form', {}, ...rows),
      ...(hint ? [el(`div.sub${p === 'anthropic' ? '.warn' : ''}`, { text: hint, style: 'margin:6px 0' })] : []),
      el('h3', { text: t('llm.budgets'), style: 'margin:8px 0 4px' }),
      el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:4px 12px' }, ...keys.map(budget)),
      el('div', { style: 'margin-top:8px;display:flex;gap:8px;align-items:center' }, test, el('span.sub', { text: t('llm.local') })), out);
  };
  render();
  return root;
}
