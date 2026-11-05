/**
 * Sandbox drawer (`B`, §17.5.6, P5.9): Spawn anything, Breed two goblins, the Genome editor, the selected Goblin's
 * needs, mood and faith, and the World (weather, time, remove). Sandbox mode only; everything goes through commands.
 */
import { el } from '../../dom';
import { t } from '../../i18n';
import type { Ctx, Component } from '../../ctx';
import type { SandboxTab } from '../../store';
import type { NeedId } from '../../../sim/state';
import { WEATHER_KINDS } from '../../../sim/weather';
import type { GodStat } from '../../../sim/sandbox';
import { spawnTab } from './spawnTab';
import { breedSig, breedTab, genomeTab } from './genomeTab';

const TABS: SandboxTab[] = ['spawn', 'breed', 'genome', 'goblin', 'world'];
const NEEDS: NeedId[] = ['hunger', 'thirst', 'energy', 'warmth', 'safety', 'social', 'fun', 'curiosity'];
const STATS: GodStat[] = ['mood', 'faith', 'love', 'fear'];

export class SandboxDrawer implements Component {
  private root = el('div.sandbox.panel.hidden');
  private tabs = el('div.tabs');
  private body = el('div.sbx-body');
  private sig = '';
  private turner: { tick: () => void } | null = null;
  private lastTick = 0;

  constructor(private ctx: Ctx) {}

  mount(parent: HTMLElement): void {
    const close = el('button.btn.iconbtn', { onclick: () => this.setOpen(false) }, '✕');
    this.root.append(el('div.vp-head', {}, el('h2', { text: t('sbx.title') }), close), this.tabs, this.body);
    parent.append(this.root);
  }

  private setOpen(open: boolean): void {
    const st = this.ctx.store.state;
    this.ctx.store.set({ openPanels: { ...st.openPanels, sandbox: open }, ...(open ? {} : { spawn: null }) });
  }

  update(): void {
    const st = this.ctx.store.state, w = this.ctx.game.world;
    const open = !!st.openPanels.sandbox && w.s.god.mode === 'sandbox' && !this.ctx.readOnly();
    this.root.classList.toggle('hidden', !open);
    if (!open) { this.sig = ''; return; }
    const tab = st.sandboxTab ?? 'spawn';
    const goblin = st.selectedKind === 'goblin' ? st.selection.join(',') : '';
    const sig = `${tab}:${st.settings.language}:${tab === 'spawn' ? JSON.stringify(st.spawn ?? null) : ''}:${tab === 'world' ? w.s.weather.kind : goblin}:${tab === 'breed' ? breedSig() : ''}`;
    if (sig !== this.sig) {
      this.sig = sig;
      this.tabs.replaceChildren(...TABS.map((k) => el(`button.btn${k === tab ? '.on' : ''}`, { onclick: () => this.ctx.store.set({ sandboxTab: k }) }, t(`sbx.tab.${k}`))));
      this.turner = null;
      let content: HTMLElement;
      if (tab === 'spawn') content = spawnTab(this.ctx);
      else if (tab === 'breed') content = breedTab(this.ctx);
      else if (tab === 'genome') { const g = genomeTab(this.ctx); content = g.root; this.turner = g; }
      else if (tab === 'goblin') content = this.goblinTab();
      else content = this.worldTab();
      this.body.replaceChildren(content);
    }
    const now = performance.now();
    if (this.turner && now - this.lastTick > 110) { this.lastTick = now; this.turner.tick(); }
  }

  /** Needs, mood and the view of the god for the selected goblin: drag a slider, let go to set it. */
  private goblinTab(): HTMLElement {
    const st = this.ctx.store.state, w = this.ctx.game.world;
    const g = st.selectedKind === 'goblin' ? w.goblin(st.selection[0] ?? -1) : undefined;
    if (!g) return el('p.sub', { text: t('sbx.pickGoblin') });
    const slider = (label: string, v: number, min: number, push: (v: number) => void) => {
      const out = el('span.val', { text: String(Math.round(v)) });
      const r = el('input', { type: 'range', min: String(min), max: '100', step: '1', oninput: () => { out.textContent = r.value; }, onchange: () => push(Number(r.value)) }) as HTMLInputElement;
      r.value = String(Math.round(v));
      return el('div.row.sbx-slider', {}, el('span.lbl', { text: label }), r, out);
    };
    const id = g.id;
    return el('div', {},
      el('h3', { text: g.name }),
      ...NEEDS.map((k) => slider(t(`need.${k}`), g.needs[k], 0, (v) => this.ctx.push({ type: 'sandbox', op: { op: 'set_need', goblinId: id, need: k, value: v } }))),
      el('h3', { text: t('insp.mood') }),
      ...STATS.map((k) => slider(t(`sbx.stat.${k}`), k === 'mood' ? g.mood.value : g.godView[k], k === 'mood' ? -100 : 0,
        (v) => this.ctx.push({ type: 'sandbox', op: { op: 'set_stat', goblinId: id, stat: k, value: v } }))),
      el('div.row.sbx-row', {}, el('button.btn', { onclick: () => { this.ctx.push({ type: 'sandbox', op: { op: 'remove', id } }); this.ctx.select(null, []); } }, t('sbx.remove'))));
  }

  /** Weather, time and removing whatever is selected. */
  private worldTab(): HTMLElement {
    const st = this.ctx.store.state, w = this.ctx.game.world;
    const cast = (power: string) => this.ctx.push({ type: 'god_cast', power, pos: { x: 0, y: 0 } });
    const sel = st.selection[0];
    return el('div', {},
      el('h3', { text: t('sbx.weather') }),
      el('div.sbx-grid.wide', {}, ...WEATHER_KINDS.map((k) => el(`button.btn${w.s.weather.kind === k ? '.on' : ''}`, { onclick: () => this.ctx.push({ type: 'sandbox', op: { op: 'set_weather', kind: k } }) }, t(`weather.${k}`)))),
      el('h3', { text: t('sbx.time') }),
      el('div.row.sbx-row', {},
        el('button.btn', { onclick: () => cast('fast_forward') }, t('power.fast_forward')),
        el('button.btn', { onclick: () => cast('hasten_season') }, t('power.hasten_season'))),
      el('h3', { text: t('sbx.removeTitle') }),
      el('div.row.sbx-row', {},
        el('button.btn', { disabled: sel === undefined || !st.selectedKind, onclick: () => { if (sel !== undefined) { this.ctx.push({ type: 'sandbox', op: { op: 'remove', id: sel } }); this.ctx.select(null, []); } } }, t('sbx.removeSelected'))),
      el('p.sub', { text: t('sbx.removeHint') }));
  }
}
