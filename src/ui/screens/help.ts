import { el } from '../dom';
import { t } from '../i18n';
import { overlay } from './common';
import { codeLabel, getKeys } from '../keys';

export function helpScreen(close: () => void): HTMLElement {
  const keys = getKeys();
  return overlay(
    el('h1', { text: t('help.title') }),
    el('h3', { text: t('help.controls') }),
    ...(['help.c1', 'help.c2', 'help.c3', 'help.c4'] as const).map((k) => el('p', { text: t(k) })),
    el('div', { style: 'display:grid;grid-template-columns:repeat(3,1fr);gap:4px 16px;font-size:.9em' },
      ...Object.entries(keys).map(([a, c]) => el('div', {}, el('kbd', { text: codeLabel(c) }), ` ${t(`key.${a}`)}`))),
    el('h3', { text: t('help.tips') }),
    el('ul', {}, ...(['help.t1', 'help.t2', 'help.t3'] as const).map((k) => el('li', { text: t(k) }))),
    el('button.btn', { onclick: close }, t('menu.close')),
  ).root;
}
