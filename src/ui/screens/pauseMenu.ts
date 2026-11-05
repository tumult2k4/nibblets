import { el } from '../dom';
import { t } from '../i18n';
import { overlay } from './common';

export interface PauseActions { resume: () => void; save: () => void; load: () => void; settings: () => void; help: () => void; exit: () => void }

export function pauseMenu(a: PauseActions): HTMLElement {
  const b = (label: string, fn: () => void) => el('button.btn.big', { onclick: fn }, label);
  return overlay(el('h1', { text: t('menu.paused'), style: 'text-align:center' }),
    el('div.menu', {}, b(t('menu.resume'), a.resume), b(t('menu.save'), a.save), b(t('menu.load'), a.load), b(t('menu.settings'), a.settings), b(t('menu.help'), a.help), b(t('menu.exit'), a.exit))).root;
}
