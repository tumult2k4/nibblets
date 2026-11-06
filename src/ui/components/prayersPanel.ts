import { el } from '../dom';
import { tipKey } from './tooltip';
import { keyLabel } from '../keys';
import { CFG } from '../../sim/config';
import { t } from '../i18n';
import type { Ctx, Component } from '../ctx';
import { openPrayers } from '../../sim/god/prayers';
import type { Prayer } from '../../sim/god/faithState';
import type { World } from '../../sim/world';
import type { ID } from '../../shared/types';
import { answerFor } from '../../sim/god/answer';
import { ageDays } from '../../sim/goblin/goblin';
import { phenotypeOf } from '../../sim/goblin/genetics/phenotype';
import { portraits } from '../../render/portraits';
import { prayerText } from '../notifyCulture';
import { bar } from './inspector/goblinInspector';

const ICON: Record<string, string> = {
  food: '🍎', water: '💧', rain: '🌧', sun: '☀', warmth: '🔥', healing: '✚', protection: '🛡', child: '🥚', mate: '♥', lost_item: '💎', revenge: '⚡', forgiveness: '🙏', thanks: '✧',
};

/**
 * Prayers panel (P, §18.7, P8.8): the prayers open now, soonest to run out first, each with the goblin's portrait,
 * what it asks for, the time left, and Go there (fly to it), Answer (casts the fitting power at it: Rain over it,
 * Healing Touch on the sick one, lightning on the nearest Gnasher…; in Divine mode only what is unlocked and
 * affordable) and Ignore (off the list). Answered prayers move to "Recently answered", in gold.
 */
export class PrayersPanel implements Component {
  private root = el('div.prayerspanel.panel.hidden');
  private body = el('div');
  private lastTick = -1;
  private ignored = new Set<ID>();

  constructor(private ctx: Ctx) {}

  mount(parent: HTMLElement): void {
    const close = el('button.btn.iconbtn', { 'data-tip': tipKey(t('insp.close'), keyLabel('prayers')), onclick: () => this.ctx.store.set({ openPanels: { ...this.ctx.store.state.openPanels, prayers: false } }) }, '✕');
    this.root.append(el('div.vp-head', {}, el('h2', { text: t('prayers.title') }), close), this.body);
    parent.append(this.root);
  }

  private card(w: World, p: Prayer, done = false): HTMLElement {
    const g = w.goblin(p.goblinId);
    const name = g?.name ?? '?', target = p.targetId !== undefined ? w.goblin(p.targetId)?.name : undefined;
    const ph = g && phenotypeOf({ genome: g.genome, ageDays: ageDays(g, w.s.tick), stage: g.lifeStage, hunger: 70, scars: g.health.scars });
    const left = Math.max(0, p.expiresTick - w.s.tick), span = CFG.god.prayerTicks;
    const cast = answerFor(w, p);
    const buttons = done ? [] : [
      el('button.btn', { text: t('prayers.go'), onclick: () => { if (g) { this.ctx.flyTo(g.pos); this.ctx.select('goblin', [g.id]); } } }),
      ...(!this.ctx.readOnly() && cast ? [el('button.btn', { text: t('prayers.answer'), onclick: () => this.ctx.push(cast) })] : []),
      el('button.btn', { text: t('prayers.ignore'), onclick: () => { this.ignored.add(p.id); this.lastTick = -1; } }),
    ];
    return el(`div.pr-card${done ? '.pr-done' : ''}`, {},
      ...(ph && g ? [el('img.portrait', { src: portraits.get(ph, g.id * 31 + 7), alt: name })] : []),
      el('div', { style: 'flex:1' },
        el('div', { text: `${ICON[p.kind] ?? '✧'} ${prayerText(p.kind, name, target)}` }),
        el('div.sub', { text: done ? t('prayers.by', { act: t(`power.${p.answeredBy}`) === `power.${p.answeredBy}` ? p.answeredBy ?? '' : t(`power.${p.answeredBy}`) })
          : p.kind === 'thanks' ? t('prayers.thanksNote') : `${t('prayers.left', { h: Math.ceil(left / CFG.god.hourTicks) })}${p.desperate ? ' · ' + t('prayers.desperate') : ''}` }),
        ...(done ? [] : [bar((left / span) * 100, p.desperate ? 'var(--bad)' : 'var(--gold)')]),
        el('div.pr-buttons', {}, ...buttons)));
  }

  update(): void {
    const open = !!this.ctx.store.state.openPanels.prayers;
    this.root.classList.toggle('hidden', !open);
    const w = this.ctx.game.world;
    if (!open || Math.abs(w.s.tick - this.lastTick) < 10) return;
    this.lastTick = w.s.tick;
    const list = openPrayers(w).filter((p) => !this.ignored.has(p.id));
    const answered = [...(w.s.god.faith?.answered ?? [])].reverse();
    this.body.replaceChildren(
      ...(list.length ? list.map((p) => this.card(w, p)) : [el('div.sub', { text: t('prayers.none') })]),
      ...(answered.length ? [el('h3', { text: t('prayers.answered') }), ...answered.map((p) => this.card(w, p, true))] : []),
    );
  }
}
