import { el } from '../dom';
import { icon } from '../icons';
import { t } from '../i18n';
import type { Ctx, Component } from '../ctx';
import { tipKey } from './tooltip';
import { keyLabel } from '../keys';
import type { KeyHandlers } from '../input';

/** One window the dock can open: its key action (so the button does exactly what the shortcut does). */
interface DockEntry {
  action: string;
  icon: string;
  label: string;
  /** is the window open right now */
  on: () => boolean;
  /** shown only when this holds (e.g. the Sandbox drawer only in Sandbox mode) */
  shown?: () => boolean;
}

/** Bottom dock: a button for every window that otherwise only opens by a key (Journal, Family tree, Stats, …). */
export class WindowDock implements Component {
  private root = el('div.windock.panel');
  private btns: { e: DockEntry; b: HTMLButtonElement }[] = [];

  constructor(private ctx: Ctx, private keys: KeyHandlers, private extra: { director: () => boolean; photo: () => boolean }) {}

  private entries(): DockEntry[] {
    const st = () => this.ctx.store.state;
    const open = (k: keyof ReturnType<typeof st>['openPanels']) => () => !!st().openPanels[k];
    const god = () => this.ctx.game.world.s.god;
    return [
      { action: 'inspector', icon: 'inspect', label: t('dock.inspector'), on: open('inspector') },
      { action: 'feed', icon: 'scroll', label: t('dock.feed'), on: open('feed') },
      { action: 'village', icon: 'hut', label: t('dock.village'), on: open('village') },
      { action: 'family', icon: 'family', label: t('key.family'), on: open('family') },
      { action: 'journal', icon: 'book', label: t('key.journal'), on: open('journal') },
      { action: 'stats', icon: 'chart', label: t('dock.stats'), on: open('stats') },
      { action: 'prayers', icon: 'candle', label: t('dock.prayers'), on: open('prayers') },
      { action: 'codex', icon: 'tome', label: t('key.codex'), on: open('codex') },
      { action: 'timeline', icon: 'timeline', label: t('key.timeline'), on: open('timeline') },
      { action: 'sandbox', icon: 'spade', label: t('dock.sandbox'), on: open('sandbox'), shown: () => god().mode === 'sandbox' && !this.ctx.readOnly() },
      { action: 'director', icon: 'film', label: t('key.director'), on: this.extra.director },
      { action: 'photo', icon: 'camera', label: t('key.photo'), on: this.extra.photo },
      { action: 'debug', icon: 'bug', label: t('key.debug'), on: open('debug') },
    ];
  }

  mount(parent: HTMLElement): void {
    for (const e of this.entries()) {
      const b = el('button.btn.iconbtn', { onclick: () => { this.keys[e.action]?.(); this.update(); }, 'aria-label': e.label }, icon(e.icon));
      b.dataset.tip = tipKey(e.label, keyLabel(e.action));
      this.btns.push({ e, b });
      this.root.append(b);
    }
    parent.append(this.root);
  }

  update(): void {
    for (const { e, b } of this.btns) {
      b.classList.toggle('hidden', e.shown ? !e.shown() : false);
      b.classList.toggle('on', e.on());
    }
  }
}
