import { el } from '../dom';
import { CFG } from '../../sim/config';
import { godTitle, t } from '../i18n';
import type { Ctx, Component } from '../ctx';
import { villageKnowledge } from '../../sim/knowledge';
import { STARTER_RECIPES } from '../../sim/recipes';
import { knowName } from '../notify';
import { foodStores } from '../../sim/spoilage';
import { chiefOf } from '../../sim/leadership';
import { festivalNow, nextFestival } from '../../sim/festivals';
import { beliefText } from '../notifyCulture';
import { shamanOf } from '../../sim/god/shaman';
import { godTemper } from '../../sim/god/devotion';
import { believers, maxFavor } from '../../sim/god/favor';
import type { LifeStage } from '../../shared/types';
import { villageTitle } from '../../llm/store';
import { inBooks } from '../../sim/books';

const STAGES: LifeStage[] = ['hatchling', 'youngling', 'adult', 'elder'];
const cap = (x: string): string => x.charAt(0).toUpperCase() + x.slice(1);

/**
 * Village panel (Y, §18.6 — P5.5 slice): name and god, goblins by life stage, and what the village knows beyond the
 * basics, each with how many know it (red when only one does: one death from being lost), plus what has been lost.
 * The chief and its policies (P8.4), the festivals: on now or next, and the last few held (P8.5); the village's beliefs,
 * lucky (☀) or unlucky (☾) (P8.6); the shaman, how the god seems (its alignment), believers and favor (P8.8).
 */
export class VillagePanel implements Component {
  private root = el('div.villagepanel.panel.hidden');
  private body = el('div');
  private lastTick = -1;

  constructor(private ctx: Ctx) {}

  mount(parent: HTMLElement): void {
    const close = el('button.btn.iconbtn', { onclick: () => this.ctx.store.set({ openPanels: { ...this.ctx.store.state.openPanels, village: false } }) }, '✕');
    // P7.6: the charts open beside it
    const charts = el('button.btn', { text: t('village.charts'), onclick: () => this.ctx.store.set({ openPanels: { ...this.ctx.store.state.openPanels, stats: !this.ctx.store.state.openPanels.stats } }) });
    this.root.append(el('div.vp-head', {}, el('h2', { text: t('village.title') }), charts, close), this.body);
    parent.append(this.root);
  }

  update(): void {
    const open = this.ctx.store.state.openPanels.village;
    this.root.classList.toggle('hidden', !open);
    const s = this.ctx.game.world.s;
    if (!open || Math.abs(s.tick - this.lastTick) < 10) return;
    this.lastTick = s.tick;
    const counts = STAGES.map((st) => [st, s.goblins.filter((g) => g.lifeStage === st).length] as const).filter(([, n]) => n > 0);
    const know = villageKnowledge(s);
    const food = foodStores(s);
    const row = (k: (typeof know)[number]) => {
      const only = k.knowers === 1 ? s.goblins.find((g) => g.knownRecipes.includes(k.id) || g.knownFacts.includes(k.id)) : undefined;
      return el(`div.vp-row${only ? '.vp-risk' : ''}`, {},
        el('span', { text: cap(knowName(k.id)) }),
        el('span.sub', { text: only ? t('village.onlyOne', { name: only.name }) : t('village.knowers', { n: k.knowers }) }));
    };
    const recipes = know.filter((k) => !k.fact), facts = know.filter((k) => k.fact);
    const w = this.ctx.game.world, chief = chiefOf(w), shaman = shamanOf(w), pol = s.village.policies ?? {};
    const beliefs = s.village.culture?.beliefs ?? [];
    const fest = festivalNow(this.ctx.game.world), next = nextFestival(this.ctx.game.world), held = (s.village.culture?.held ?? []).slice(-4).reverse();
    const policies = [pol.work && 'work', pol.rota && 'rota', pol.festivals && 'festivals', pol.shrine && 'shrine', pol.quarantine && 'quarantine',
      pol.law !== undefined && (pol.law < CFG.mischief.theft.law ? 'lax' : 'strict')].filter((x): x is string => !!x).map((k) => t(`policy.${k}`));
    this.body.replaceChildren(
      el('div.sub', { text: villageTitle(s) + (s.god.godName ? ' · ' + t('village.god', { name: godTitle(s) }) : '') }),
      el('h3', { text: `${t('village.pop')}: ${s.goblins.length}` }),
      el('div.sub', { text: counts.map(([st, n]) => `${t(`stage.${st}`)} ${n}`).join(' · ') }),
      el('div.sub', { text: t('village.food', { n: Math.round(food.food), d: food.days.toFixed(1) }) }),
      el('h3', { text: chief ? t('village.chief', { name: chief.name }) : t('village.noChief') }), // P8.4
      el('div.sub', { text: `${t('village.policies')}: ${policies.join(' · ') || t('village.noPolicies')}` }),
      el('h3', { text: shaman ? t('village.shaman', { name: shaman.name }) : t('village.noShaman') }), // P8.8
      el('div.sub', { text: t('village.temper', { temper: t(`temper.${godTemper(s) ?? 'none'}`), n: Math.round(s.god.alignment) }) }),
      el('div.sub', { text: t('village.believers', { n: believers(w), all: s.goblins.length, f: Math.floor(s.god.favor), max: maxFavor(w) }) }),
      el('h3', { text: t('village.festivals') }), el('div.sub', { text: fest ? t('village.festivalNow', { fest: cap(t(`fest.${fest.kind}`)) }) : t('village.nextFestival', { fest: t(`fest.${next[0]}`), day: next[1] + 1 }) }),
      el('div.sub', { text: held.length ? held.map(([d, k, n]) => t('village.held', { fest: cap(t(`fest.${k}`)), day: d + 1, n })).join(' · ') : t('village.noneHeld') }),
      el('h3', { text: t('village.beliefs') }), // P8.6
      ...(beliefs.length ? beliefs.map((b) => el('div.vp-row', {}, el('span', { text: `${b.valence > 0 ? '☀' : '☾'} ${beliefText(b.omen, b.luck)}` }))) : [el('div.sub', { text: t('village.noBeliefs') })]),
      el('h3', { text: t('village.knowledge') }),
      el('div.sub', { text: t('village.basics', { list: STARTER_RECIPES.map((id) => t(`recipe.${id}`)).join(', ') }) }),
      ...(recipes.length ? recipes.map(row) : [el('div.sub', { text: t('village.nothing') })]),
      ...(facts.length ? [el('h3', { text: t('village.facts') }), ...facts.map(row)] : []),
      ...(s.village.lost?.length ? [el('div.sub.vp-lost', { text: t('village.lost', { list: s.village.lost.map((id) => (inBooks(s, id) ? `${knowName(id)} (${t('village.inBook')})` : knowName(id))).join(', ') }) })] : []),
    );
  }
}
