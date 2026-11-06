import { el } from '../dom';
import { t } from '../i18n';
import { keyLabel } from '../keys';
import { loadPref, savePref } from '../store';
import type { Ctx, Component } from '../ctx';
import type { World } from '../../sim/world';
import { openPrayers } from '../../sim/god/prayers';
import { clockAt } from '../../sim/time';
import { knownRivals } from '../../sim/clans';
import { CFG } from '../../sim/config';

interface TipPrefs { seen: string[]; off: boolean }
let prefs: TipPrefs | null = null;
const tipPrefs = (): TipPrefs => (prefs ??= loadPref<TipPrefs>('tips', { seen: [], off: false }));

/** Settings: the tips on again, from the first. */
export function resetTips(): void {
  prefs = { seen: [], off: false };
  savePref('tips', prefs);
}

/** Each tip: when it applies (the first time), and the keys it names. Checked in order, one shown at a time. */
const TIPS: { id: string; when: (w: World, mins: number) => boolean; keys?: string[] }[] = [
  { id: 'select', when: (_w, m) => m > 0.15 },
  { id: 'hungry', when: (w) => w.s.god.mode !== 'observer' && w.s.goblins.some((g) => g.needs.hunger < 25 && g.lifeStage !== 'egg'), keys: ['gifts'] },
  { id: 'pickup', when: (w, m) => w.s.god.mode !== 'observer' && m > 1.5 },
  { id: 'night', when: (w) => clockAt(w.s.tick).hour >= 20 || clockAt(w.s.tick).hour < 5 },
  { id: 'prayer', when: (w) => openPrayers(w).length > 0, keys: ['prayers'] },
  { id: 'egg', when: (w) => w.s.eggs.length > 0 },
  { id: 'director', when: (_w, m) => m > 4, keys: ['director'] },
  { id: 'timeline', when: (w) => w.s.tick > CFG.time.startTick + CFG.time.dayTicks * 1.2, keys: ['timeline'] },
  { id: 'clans', when: (w) => knownRivals(w.s).length > 0, keys: ['village'] },
  { id: 'codex', when: (w) => (w.s.history?.events ?? []).some((h) => h.e === 'recipe_discovered'), keys: ['codex'] },
  { id: 'speed', when: (_w, m) => m > 6 },
];

/**
 * Contextual first-session tips (§18.3 Help, P11.1): a small card at the bottom left the first time something
 * happens that a newcomer should know how to use ("A goblin is hungry: drag an apple from the Gift Tray onto it").
 * Each shows once per browser; "No more tips" turns them off (Settings can turn them back on).
 */
export class Tips implements Component {
  private root = el('div.tip-card.panel.hidden');
  private shown: string | null = null;
  private since = performance.now();
  private hideAt = 0;

  constructor(private ctx: Ctx) {}

  mount(parent: HTMLElement): void {
    parent.append(this.root);
  }

  private dismiss(off = false): void {
    const p = tipPrefs();
    if (this.shown) p.seen.push(this.shown);
    if (off) p.off = true;
    savePref('tips', p);
    this.shown = null;
    this.root.classList.add('hidden');
  }

  update(): void {
    const st = this.ctx.store.state, w = this.ctx.game.world;
    const p = tipPrefs();
    if (p.off || st.screen !== 'game' || st.overlay) return;
    const now = performance.now();
    if (this.shown) { if (now > this.hideAt) this.dismiss(); return; }
    const mins = (now - this.since) / 60_000;
    const tip = TIPS.find((x) => !p.seen.includes(x.id) && x.when(w, mins));
    if (!tip) return;
    this.shown = tip.id;
    this.hideAt = now + 25_000;
    const keys = Object.fromEntries((tip.keys ?? []).map((k) => [k, keyLabel(k)]));
    this.root.replaceChildren(el('div.tip-head', {}, el('b', { text: `💡 ${t('tips.title')}` })),
      el('div', { text: t(`tips.${tip.id}`, keys) }),
      el('div.tip-buttons', {}, el('button.btn', { text: t('tips.ok'), onclick: () => this.dismiss() }), el('button.btn', { text: t('tips.off'), onclick: () => this.dismiss(true) })));
    this.root.classList.remove('hidden');
  }
}
