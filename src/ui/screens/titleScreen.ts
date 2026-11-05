import { el } from '../dom';
import { icon } from '../icons';
import { t } from '../i18n';

export interface TitleActions { cont: (() => void) | null; newWorld: () => void; load: () => void; settings: () => void; replay: () => void; help: () => void }

/** Title screen (§18.3) over a live island running in Observer mode. */
export function titleScreen(a: TitleActions): HTMLElement {
  const btn = (label: string, fn: (() => void) | null) => el('button.btn.big', { onclick: () => fn?.(), disabled: !fn }, label);
  return el('div.screen.clear', {},
    el('div.menu', {},
      el('div.logo', {}, icon('goblin', 'peek'), 'NIBBLETS'),
      el('div', { style: 'color:var(--parchment);font-size:1.2em;margin:-10px 0 14px;text-shadow:0 2px 4px #0008', text: t('title.tagline') }),
      btn(t('menu.continue'), a.cont), btn(t('menu.new'), a.newWorld), btn(t('menu.load'), a.load),
      btn(t('menu.settings'), a.settings), btn(t('menu.replay'), a.replay), btn(t('menu.help'), a.help)));
}
