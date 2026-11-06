import { el } from '../dom';
import { t } from '../i18n';
import { overlay } from './common';
import { codeLabel, getKeys } from '../keys';

/** A little mouse with one part lit: left, right or middle button, or the wheel (P11.1 Help sheet). */
function mouse(part: 'left' | 'right' | 'middle' | 'wheel' | 'still'): HTMLElement {
  const lit = (p: string) => (part === p ? 'var(--gold)' : 'rgba(255,255,255,.7)');
  const svg = `<svg viewBox="0 0 24 34" width="26" height="36" aria-hidden="true">
    <rect x="2" y="2" width="20" height="30" rx="10" fill="rgba(255,255,255,.7)" stroke="var(--bark)" stroke-width="2"/>
    <path d="M12 2 v12 M2 14 h20" stroke="var(--bark)" stroke-width="1.5"/>
    <path d="M12 3 A9 9 0 0 0 3 12 V14 H12 Z" fill="${lit('left')}"/>
    <path d="M12 3 A9 9 0 0 1 21 12 V14 H12 Z" fill="${lit('right')}"/>
    <rect x="10" y="5" width="4" height="7" rx="2" fill="${part === 'wheel' || part === 'middle' ? 'var(--gold)' : 'var(--bark)'}"/>
    ${part === 'still' ? '<circle cx="12" cy="24" r="3" fill="var(--gold)"/>' : ''}</svg>`;
  const s = el('span.help-mouse');
  s.innerHTML = svg;
  return s;
}

const row = (icon: HTMLElement, text: string) => el('div.help-row', {}, icon, el('span', { text }));
const kbd = (text: string) => el('kbd', { text });

/** Help (F1, §18.3): an illustrated sheet of the controls, every key as it is bound now, and first steps. */
export function helpScreen(close: () => void): HTMLElement {
  const keys = getKeys();
  return overlay(
    el('h1', { text: t('help.title') }),
    el('div.help-cols', {},
      el('div', {},
        el('h3', { text: t('help.camera') }),
        row(mouse('right'), t('help.orbit')), row(mouse('middle'), t('help.pan')), row(mouse('wheel'), t('help.zoom')),
        row(el('span.help-keys', {}, kbd('W'), kbd('A'), kbd('S'), kbd('D')), t('help.wasd')),
        el('h3', { text: t('help.hand') }),
        row(mouse('left'), t('help.click')), row(mouse('left'), t('help.drag')), row(mouse('still'), t('help.pet')),
        row(mouse('wheel'), t('help.height')),
        el('h3', { text: t('help.keyboard') }), // P11.4: everything works without a mouse but the hand itself
        row(el('span.help-keys', {}, kbd(codeLabel(keys.focusPanels ?? 'F6')), kbd('Tab'), kbd('Esc')), t('set.keyboardNote', { key: codeLabel(keys.focusPanels ?? 'F6') }))),
      el('div', {},
        el('h3', { text: t('help.godPowers') }),
        ...(['help.c4', 'help.powers', 'help.voice'] as const).map((k) => el('p', { text: t(k) })),
        el('h3', { text: t('help.tips') }),
        el('ul', {}, ...(['help.t1', 'help.t2', 'help.t3', 'help.t4', 'help.t5'] as const).map((k) => el('li', { text: t(k) }))))),
    el('h3', { text: t('help.controls') }),
    el('div.help-keygrid', {},
      ...Object.entries(keys).map(([a, c]) => el('div', {}, el('kbd', { text: codeLabel(c) }), ` ${t(`key.${a}`)}`))),
    el('button.btn', { onclick: close }, t('menu.close')),
  ).root;
}
