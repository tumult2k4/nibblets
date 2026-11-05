import { el } from '../dom';
import { icon } from '../icons';
import { t } from '../i18n';
import type { Ctx, Component } from '../ctx';
import { keyLabel } from '../keys';
import { tipKey } from './tooltip';

/** Quick action ring around the selected goblin in screen space (§18.6). Only implemented actions. */
export class QuickRing implements Component {
  private root = el('div.qring');
  private buttons: { b: HTMLButtonElement; angle: number }[] = [];
  private forId: number | null = null;

  constructor(private ctx: Ctx, private actions: { pickUp: (id: number) => void; pet: (id: number) => void; poke: (id: number) => void }) {}

  mount(parent: HTMLElement): void {
    parent.append(this.root);
  }

  private build(id: number): void {
    const defs: [string, string, () => void, string?][] = [
      ['up', t('ring.pickup'), () => this.actions.pickUp(id)],
      ['eye', t('ring.follow'), () => this.ctx.follow(id), keyLabel('follow')],
      ['gift', t('ring.gift'), () => this.ctx.store.set({ activeTool: 'gifts', openPanels: { ...this.ctx.store.state.openPanels, tray: true, flyout: true } }), keyLabel('gifts')],
      ['heart', t('ring.pet'), () => this.actions.pet(id)],
      ['poke', t('ring.poke'), () => this.actions.poke(id)],
    ];
    this.buttons = defs.map(([ic, tip, fn, key], i) => {
      const b = el('button.btn.iconbtn', { onclick: (e: Event) => { e.stopPropagation(); fn(); } }, icon(ic));
      b.dataset.tip = tipKey(tip, key);
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      return { b, angle: -Math.PI / 2 + ((i - (defs.length - 1) / 2) * Math.PI) / 5.5 };
    });
    this.root.replaceChildren(...this.buttons.map((x) => x.b));
    this.forId = id;
  }

  update(): void {}

  frame(): void {
    const st = this.ctx.store.state;
    const id = st.selectedKind === 'goblin' && st.selection.length === 1 ? st.selection[0]! : null;
    const w = this.ctx.game.world;
    const g = id !== null ? w.goblin(id) : undefined;
    if (!g || g.heldByGod || this.ctx.readOnly() || w.s.god.mode === 'observer') {
      this.root.classList.add('hidden');
      return;
    }
    if (this.forId !== id) this.build(id!);
    const r = this.ctx.game.renderer;
    const p = r.goblinWorldPos(g.id, 1);
    if (!p) return;
    const sc = r.toScreen(p);
    this.root.classList.toggle('hidden', !sc.visible);
    const rad = 58;
    for (const { b, angle } of this.buttons) {
      b.style.left = `${sc.x + Math.cos(angle) * rad}px`;
      b.style.top = `${sc.y + Math.sin(angle) * rad - 10}px`;
    }
  }
}
