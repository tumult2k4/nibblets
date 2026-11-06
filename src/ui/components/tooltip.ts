import { el } from '../dom';
import type { Ctx, Component } from '../ctx';

/** Delegated tooltips: any element with data-tip shows it after the configured delay, under the pointer or, for
 * keyboard use (P11.4), on focus. */
export class Tooltip implements Component {
  private tip = el('div.tooltip.hidden', { role: 'tooltip' });
  private timer = 0;
  constructor(private ctx: Ctx) {}
  mount(parent: HTMLElement): void {
    parent.append(this.tip);
    const hover = (e: Event) => this.show((e.target as HTMLElement).closest?.('[data-tip]') as HTMLElement | null);
    document.addEventListener('pointerover', hover);
    document.addEventListener('focusin', (e) => { if ((e.target as HTMLElement).matches?.(':focus-visible')) hover(e); });
    document.addEventListener('focusout', () => this.show(null));
    document.addEventListener('pointerdown', () => this.tip.classList.add('hidden'));
  }
  private show(t: HTMLElement | null): void {
    window.clearTimeout(this.timer);
    if (!t) {
      this.tip.classList.add('hidden');
      return;
    }
    this.timer = window.setTimeout(() => {
      if (!t.isConnected) return;
      this.tip.innerHTML = t.dataset.tip ?? '';
      const r = t.getBoundingClientRect();
      this.tip.classList.remove('hidden');
      const w = this.tip.offsetWidth;
      this.tip.style.left = `${Math.min(window.innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2))}px`;
      this.tip.style.top = `${r.bottom + 8 > window.innerHeight - 40 ? r.top - this.tip.offsetHeight - 8 : r.bottom + 8}px`;
    }, this.ctx.store.state.settings.tooltipDelay);
  }
  update(): void {}
}

/** Tooltip text with a shortcut hint. */
export const tipKey = (text: string, key?: string): string => (key ? `${text} <kbd>${key}</kbd>` : text);
