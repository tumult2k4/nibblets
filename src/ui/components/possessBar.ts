import { el } from '../dom';
import { t } from '../i18n';
import type { Ctx, Component } from '../ctx';

/** Possess (Sandbox, P11.1): while the player has a goblin, a bar at the top says whom and what a click does. */
export class PossessBar implements Component {
  private root = el('div.possess-bar.panel.hidden');
  private shown = '';

  constructor(private ctx: Ctx) {}

  mount(parent: HTMLElement): void {
    parent.append(this.root);
  }

  update(): void {
    const w = this.ctx.game.world, id = w.s.god.possessedId, g = id != null ? w.goblin(id) : undefined;
    const text = g && w.s.god.mode === 'sandbox' ? t('possess.bar', { name: g.name }) : '';
    if (text === this.shown) return;
    this.shown = text;
    this.root.classList.toggle('hidden', !text);
    this.root.replaceChildren(el('span', { text: `👁 ${text}` }),
      el('button.btn', { text: t('possess.release'), onclick: () => this.ctx.push({ type: 'sandbox', op: { op: 'possess', goblinId: null } }) }));
  }
}
