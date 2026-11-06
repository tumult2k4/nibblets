import { el } from '../dom';
import { tipKey } from './tooltip';
import { keyLabel } from '../keys';
import { getLang, t } from '../i18n';
import type { Ctx, Component } from '../ctx';
import { CFG } from '../../sim/config';
import type { WorldState } from '../../sim/state';
import { HIST_CATS, type HistCat, type HistEntry } from '../../sim/history';

const DAY = CFG.time.dayTicks;
export const CAT_ICON: Record<HistCat, string> = {
  birth: '🥚', death: '✝', building: '🏠', discovery: '💡', raid: '⚔', disaster: '🌊', festival: '🎉', divine: '✨', clan: '⛺',
};
const word = (key: string): string => (getLang() === 'en' ? t(key).toLowerCase() : t(key));

/** A marker's words: "Pipnok hatched", "A hut was built", "The Ash clan raided the village". */
export function histText(s: WorldState, h: HistEntry): string {
  const name = h.id !== undefined ? s.lineage[h.id]?.name ?? s.goblins.find((g) => g.id === h.id)?.name ?? '?' : '?';
  const k = h.k ?? '';
  switch (h.e) {
    case 'egg_hatched': return t('tl.hatched', { name });
    case 'goblin_died': return t('tl.died', { name, cause: word(`cause.${k}`) });
    case 'building_completed': return t('tl.built', { what: t(`bld.${k}`) });
    case 'building_destroyed': return t('tl.destroyed', { what: t(`bld.${k}`) });
    case 'recipe_discovered': return t('tl.discovered', { what: t(`recipe.${k}`), name });
    case 'recipe_lost': return t('tl.lost', { what: t(`recipe.${k}`) });
    case 'clan_raid': return t('tl.raid', { clan: k });
    case 'festival': return t('tl.festival', { what: t(`fest.${k}`) });
    case 'divine_act': return t('tl.divine', { what: t(`power.${k}`) });
    case 'clan_contact': return t('tl.contact', { clan: k });
    case 'clan_alliance': return t('tl.alliance', { clan: k });
    case 'goblin_joined': return t('tl.joined', { name, clan: k });
    case 'goblin_left': return t('tl.left', { name, clan: k });
    case 'outbreak': return t('tl.outbreak', { what: t(`disease.${k}`) });
    default: return t(`tl.${h.e}`);
  }
}

/**
 * The Timeline (U, §18.7, P11.1): a strip of days, newest at the right, with a marker for each thing worth
 * remembering (hatchings, deaths, buildings, discoveries, raids, disasters, festivals, the god's acts, the clans),
 * filtered by kind. Hover a marker for what it was; click it and the camera flies there and the goblin it was about
 * is selected. History browsing, not time rewind.
 */
export class Timeline implements Component {
  private root = el('div.timeline.panel.hidden');
  private filters = el('div.tl-filters');
  private strip = el('div.tl-strip');
  private off = new Set<HistCat>();
  private key = '';

  constructor(private ctx: Ctx) {}

  mount(parent: HTMLElement): void {
    const close = el('button.btn.iconbtn', { 'data-tip': tipKey(t('insp.close'), keyLabel('timeline')), onclick: () => this.ctx.store.set({ openPanels: { ...this.ctx.store.state.openPanels, timeline: false } }) }, '✕');
    this.root.append(el('div.vp-head', {}, el('h2', { text: t('tl.title') }), this.filters, close), this.strip);
    parent.append(this.root);
    this.renderFilters();
  }

  private renderFilters(): void {
    this.filters.replaceChildren(...HIST_CATS.map((c) => el(`button.btn.tl-cat${this.off.has(c) ? '' : '.on'}`, {
      text: CAT_ICON[c], 'data-tip': t(`tl.cat.${c}`),
      onclick: () => { if (this.off.has(c)) this.off.delete(c); else this.off.add(c); this.key = ''; this.renderFilters(); this.update(); },
    })));
  }

  update(): void {
    const open = !!this.ctx.store.state.openPanels.timeline;
    this.root.classList.toggle('hidden', !open);
    if (!open) { this.key = ''; return; }
    const s = this.ctx.game.world.s, hs = s.history?.events ?? [];
    const key = `${hs.length}:${hs[hs.length - 1]?.tick}:${Math.floor(s.tick / DAY)}`;
    if (key === this.key) return;
    const atEnd = this.strip.scrollLeft + this.strip.clientWidth >= this.strip.scrollWidth - 30;
    this.key = key;
    const days = new Map<number, HistEntry[]>();
    for (const h of hs) if (!this.off.has(h.cat)) {
      const d = Math.floor(h.tick / DAY);
      (days.get(d) ?? days.set(d, []).get(d)!).push(h);
    }
    const today = Math.floor(s.tick / DAY), first = Math.max(0, Math.min(today, ...days.keys()));
    const cols: HTMLElement[] = [];
    for (let d = first; d <= today; d++) {
      const marks = (days.get(d) ?? []).slice(-12).map((h) => el(`button.tl-mark.tl-${h.cat}`, {
        text: CAT_ICON[h.cat], 'data-tip': histText(s, h), onclick: () => this.go(h),
      }));
      cols.push(el(`div.tl-day${d % CFG.time.daysPerSeason === 0 ? '.tl-season' : ''}`, {}, el('div.tl-marks', {}, ...marks), el('div.tl-label', { text: String(d + 1) })));
    }
    this.strip.replaceChildren(...(cols.length ? cols : [el('div.sub', { text: t('tl.empty') })]));
    if (atEnd) this.strip.scrollLeft = this.strip.scrollWidth;
  }

  private go(h: HistEntry): void {
    const w = this.ctx.game.world, g = h.id !== undefined ? w.goblin(h.id) : undefined;
    if (h.at) this.ctx.flyTo(h.at);
    else if (g) this.ctx.flyTo(g.pos);
    if (g) this.ctx.select('goblin', [g.id]);
  }
}
