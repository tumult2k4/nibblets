import { el } from '../dom';
import { t, type Lang } from '../i18n';
import { overlay, field, select, checkbox } from './common';
import type { Settings } from '../store';
import { codeLabel, getKeys, resetKeys, setKey } from '../keys';
import { llmTab } from './llmSettings';

type Tab = 'graphics' | 'gameplay' | 'controls' | 'access' | 'language' | 'llm';

/** Settings (§18.3): graphics, gameplay, controls (rebinding with conflict swap), accessibility, language, the LLM voices (P9.1). */
export function settingsScreen(cur: Settings, gentle: boolean, apply: (s: Settings, gentle: boolean) => void, close: () => void): HTMLElement {
  let s = { ...cur };
  let g = gentle;
  let tab: Tab = 'graphics';
  const tabs = el('div.tabs');
  const body = el('div', { style: 'min-height:260px' });
  const msg = el('div.sub', { style: 'min-height:1.4em' });
  const { root } = overlay(el('h1', { text: t('set.title') }), tabs, body, msg, el('button.btn', { onclick: close }, t('menu.close')));
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => {
    s = { ...s, [k]: v };
    apply(s, g);
    if (k === 'language') render();
  };
  const num = (k: 'renderScale' | 'tooltipDelay' | 'uiScale', min: number, max: number, step: number) => {
    const i = el('input', { type: 'range', min, max, step, value: s[k], oninput: () => set(k, Number(i.value)) });
    return i;
  };
  const controls = () => {
    const keys = getKeys();
    const grid = el('div', { style: 'display:grid;grid-template-columns:1fr auto;gap:4px 14px;max-height:300px;overflow:auto' });
    for (const [action, code] of Object.entries(keys)) {
      const b = el('button.btn', { text: codeLabel(code) });
      b.onclick = () => {
        b.textContent = t('set.press');
        (window as unknown as { __rebinding?: boolean }).__rebinding = true;
        const h = (e: KeyboardEvent) => {
          e.preventDefault();
          window.removeEventListener('keydown', h, true);
          (window as unknown as { __rebinding?: boolean }).__rebinding = false;
          if (e.code === 'Escape') return render();
          const clash = setKey(action, e.code);
          msg.textContent = clash ? t('set.conflict', { key: codeLabel(e.code), action: t(`key.${clash}`) }) : '';
          render();
        };
        window.addEventListener('keydown', h, true);
      };
      grid.append(el('span', { text: t(`key.${action}`) }), b);
    }
    return el('div', {}, el('div.sub', { text: t('set.rebind') }), grid, el('button.btn', { style: 'margin-top:8px', onclick: () => { resetKeys(); render(); } }, t('set.reset')));
  };
  const render = () => {
    const names: Tab[] = ['graphics', 'gameplay', 'controls', 'access', 'language', 'llm'];
    tabs.replaceChildren(...names.map((n) => el(`button.btn${n === tab ? '.on' : ''}`, { onclick: () => { tab = n; render(); } }, t(`set.${n}`))));
    let content: HTMLElement;
    if (tab === 'graphics')
      content = el('div.form', {},
        ...field(t('set.shadows'), select<Settings['shadows']>([['off', t('set.off')], ['low', t('set.low')], ['high', t('set.high')]], s.shadows, (v) => set('shadows', v))),
        ...field(t('set.scale'), num('renderScale', 0.5, 1, 0.05)),
        ...field(t('set.outlines'), checkbox(s.outlines, (v) => set('outlines', v))),
        ...field(t('set.fog'), checkbox(s.fog, (v) => set('fog', v))));
    else if (tab === 'gameplay')
      content = el('div.form', {},
        ...field(t('set.gentle'), checkbox(g, (v) => { g = v; apply(s, g); })),
        ...field(t('set.confirmLethal'), checkbox(s.confirmLethal, (v) => set('confirmLethal', v))),
        ...field(t('set.edgePan'), checkbox(s.edgePan, (v) => set('edgePan', v))),
        ...field(t('set.invert'), checkbox(s.invertOrbit, (v) => set('invertOrbit', v))),
        ...field(t('set.autopauseDeath'), checkbox(s.autopauseDeath, (v) => set('autopauseDeath', v))),
        ...field(t('set.tooltipDelay'), num('tooltipDelay', 0, 1500, 50)));
    else if (tab === 'controls') content = controls();
    else if (tab === 'access')
      content = el('div.form', {},
        ...field(t('set.uiScale'), num('uiScale', 0.8, 1.5, 0.05)),
        ...field(t('set.reducedMotion'), checkbox(s.reducedMotion, (v) => set('reducedMotion', v))));
    else if (tab === 'llm') content = llmTab();
    else content = el('div.form', {}, ...field(t('set.language'), select<Lang>([['en', t('set.english')], ['de', t('set.german')]], s.language, (v) => set('language', v))));
    body.replaceChildren(content);
  };
  render();
  return root;
}
