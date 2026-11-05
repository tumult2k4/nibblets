import { el, setText } from '../dom';
import { icon } from '../icons';
import { t } from '../i18n';
import type { Ctx, Component } from '../ctx';
import { SPEEDS } from '../../game';
import { tipKey } from './tooltip';
import { isFood, itemDef } from '../../sim/items';
import { CFG } from '../../sim/config';
import { keyLabel } from '../keys';

/** Top bar (§18.2): menu, village, calendar, weather, population, food, faith, mode badge, speed, alerts. */
export class TopBar implements Component {
  private root = el('div.topbar.panel');
  private village = el('span.village');
  private cal = el('span.stat');
  private weather = el('span.stat');
  private pop = el('span.stat');
  private food = el('span.stat');
  private faith = el('span.stat');
  private mode = el('span.badge');
  private speedBtns: HTMLButtonElement[] = [];
  private alerts = el('span.alert-count.hidden');
  alertCount = 0;

  constructor(private ctx: Ctx) {}

  mount(parent: HTMLElement): void {
    const menu = el('button.btn.iconbtn', { onclick: () => this.ctx.openOverlay('pause') }, icon('menu'));
    menu.dataset.tip = tipKey(t('top.menu'), 'Esc');
    const speed = el('span.speed');
    SPEEDS.forEach((s, i) => {
      const b = el('button.btn', { onclick: () => this.setSpeed(i) }, i === 0 ? icon('pause') : '▸'.repeat(i));
      b.dataset.tip = i === 0 ? tipKey(t('top.pause'), keyLabel('pause')) : tipKey(t('top.speed', { n: s }), keyLabel(`speed${i}`));
      this.speedBtns.push(b);
      speed.append(b);
    });
    const bell = el('button.btn.iconbtn', { onclick: () => { this.alertCount = 0; this.ctx.store.set({ openPanels: { ...this.ctx.store.state.openPanels, feed: true } }); this.update(); } }, icon('bell'), this.alerts);
    bell.dataset.tip = t('top.alerts');
    this.root.append(menu, this.village, el('span.sep'), this.cal, this.weather, el('span.sep'), this.pop, this.food, this.faith, el('span.grow'), this.mode, speed, bell);
    parent.append(this.root);
  }

  setSpeed(i: number): void {
    const g = this.ctx.game;
    g.speedIdx = i === 0 && g.speedIdx === 0 ? 1 : i;
    this.update();
  }

  update(): void {
    const w = this.ctx.game.world;
    const s = w.s;
    const c = w.clock;
    setText(this.village, s.village.name);
    this.village.dataset.tip = s.god.godName ? t('insp.glanceGod', { name: s.god.godName }) : t('insp.glance');
    const hh = Math.floor(c.hour), mm = Math.floor((c.hour % 1) * 60);
    setText(this.cal, `${t('top.day', { season: t(`season.${c.season}`), day: c.seasonDay + 1 })} · ${t('top.year', { year: c.year })} · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
    if (!this.weather.firstChild || this.weather.dataset.k !== s.weather.kind + (c.phase === 'night')) {
      this.weather.replaceChildren(icon(c.phase === 'night' ? 'moon' : s.weather.kind === 'clear' ? 'sun' : 'cloud'), ` ${t(`weather.${s.weather.kind}`)}`);
      this.weather.dataset.k = s.weather.kind + (c.phase === 'night');
      this.weather.dataset.tip = t('weather.forecast', { w: t(`weather.${s.weather.kind}`) });
    }
    const gs = s.goblins;
    const by = (st: string) => gs.filter((g) => g.lifeStage === st).length;
    const young = by('hatchling') + by('youngling');
    setText(this.pop, `${t('top.pop', { n: gs.length })} ${young ? t('top.young', { n: young }) : ''}`);
    this.pop.dataset.tip = t('top.popTip', { h: by('hatchling'), y: by('youngling'), a: by('adult'), e: by('elder') });
    // food reserve in days: nutrition available ÷ daily village need
    let nut = 0;
    for (const p of s.plants) if (p.kind === 'apple_bush') nut += p.fruit * (itemDef('apple').nutrition ?? 0);
    for (const it of s.groundItems) if (isFood(it.stack.type)) nut += it.stack.qty * (itemDef(it.stack.type).nutrition ?? 0);
    for (const g of gs) for (const st of g.inventory) if (isFood(st.type)) nut += st.qty * (itemDef(st.type).nutrition ?? 0);
    const need = Math.max(1, gs.length * CFG.goblin.decayPerDay.hunger);
    setText(this.food, t('top.food', { n: (nut / need).toFixed(1) }));
    const avgFaith = gs.length ? gs.reduce((a, g) => a + g.godView.faith, 0) / gs.length : 0;
    setText(this.faith, t('top.faith', { n: Math.round(avgFaith) }));
    setText(this.mode, this.ctx.readOnly() ? t('replay.banner') : s.god.mode === 'observer' ? t('top.observer') : t('top.sandbox'));
    const sp = this.ctx.game.speedIdx;
    this.speedBtns.forEach((b, i) => b.classList.toggle('on', i === sp));
    this.alerts.classList.toggle('hidden', this.alertCount === 0);
    setText(this.alerts, String(this.alertCount));
  }
}
