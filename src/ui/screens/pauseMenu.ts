import { el } from '../dom';
import { t } from '../i18n';
import { tipKey } from '../components/tooltip';
import { keyLabel } from '../keys';
import { overlay } from './common';

export interface PauseActions { resume: () => void; save: () => void; load: () => void; settings: () => void; help: () => void; exit: () => void }

export function pauseMenu(a: PauseActions): HTMLElement {
  const b = (label: string, fn: () => void, key?: string) => el('button.btn.big', { onclick: fn, ...(key ? { 'data-tip': tipKey(label, key) } : {}) }, label);
  return overlay(el('h1', { text: t('menu.paused'), style: 'text-align:center' }),
    el('div.menu', {}, b(t('menu.resume'), a.resume, 'Esc'), b(t('menu.save'), a.save), b(t('menu.load'), a.load), b(t('menu.settings'), a.settings), b(t('menu.help'), a.help, keyLabel('help')), b(t('menu.exit'), a.exit))).root;
}
