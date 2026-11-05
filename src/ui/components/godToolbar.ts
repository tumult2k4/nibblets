import { el } from '../dom';
import { icon } from '../icons';
import { t } from '../i18n';
import type { Ctx, Component } from '../ctx';
import { tipKey } from './tooltip';
import { keyLabel } from '../keys';
import { POWER_DEFS } from '../../sim/god/powerDefs';
import type { ToolId } from '../store';

/** Left god toolbar (§18.2). Only categories with implemented powers are shown. */
export class GodToolbar implements Component {
  private root = el('div.toolbar.panel');
  private flyout = el('div.flyout.panel.hidden');
  private btns = new Map<ToolId, HTMLButtonElement>();

  constructor(private ctx: Ctx) {}

  mount(parent: HTMLElement): void {
    const tools: [ToolId, string, string, string][] = [
      ['hand', 'hand', t('tool.handTip'), 'hand'],
      ['gifts', 'gift', t('tool.giftsTip'), 'gifts'],
    ];
    for (const [id, ic, tip, key] of tools) {
      const b = el('button.btn.iconbtn', { onclick: () => this.choose(id) }, icon(ic));
      b.dataset.tip = tipKey(tip, keyLabel(key));
      this.btns.set(id, b);
      this.root.append(b);
    }
    const help = el('button.btn.iconbtn', { onclick: () => this.ctx.openOverlay('help') }, icon('help'));
    help.dataset.tip = tipKey(t('menu.help'), keyLabel('help'));
    this.root.append(el('div', { style: 'height:8px' }), help);
    parent.append(this.root, this.flyout);
  }

  choose(id: ToolId): void {
    const st = this.ctx.store.state;
    if (id === 'gifts') {
      const open = !(st.activeTool === 'gifts' && st.openPanels.tray);
      this.ctx.store.set({ activeTool: open ? 'gifts' : 'hand', openPanels: { ...st.openPanels, tray: open, flyout: open } });
    } else this.ctx.store.set({ activeTool: 'hand', openPanels: { ...st.openPanels, tray: false, flyout: false } });
  }

  /** Flyout of the Gifts category: power cards (implemented phase only). */
  private renderFlyout(): void {
    this.flyout.replaceChildren(
      ...POWER_DEFS.filter((p) => p.category === 'gift' && p.phase <= 1).map((p) =>
        el('div.card.on', {}, icon('gift'), el('div.name', { text: t(`power.${p.id}`) }), el('div.meta', { text: this.ctx.game.world.s.god.mode === 'sandbox' ? t('power.free') : t('power.cost', { n: p.cost }) }))),
    );
  }

  update(): void {
    const st = this.ctx.store.state;
    this.root.classList.toggle('hidden', this.ctx.readOnly());
    for (const [id, b] of this.btns) b.classList.toggle('on', st.activeTool === id);
    const show = st.openPanels.flyout && !this.ctx.readOnly();
    this.flyout.classList.toggle('hidden', !show);
    if (show && !this.flyout.firstChild) this.renderFlyout();
    if (!show) this.flyout.replaceChildren();
  }
}
