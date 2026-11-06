import { el } from '../dom';
import { CFG } from '../../sim/config';
import { t } from '../i18n';
import type { Ctx, Component } from '../ctx';
import { villageKnowledge } from '../../sim/knowledge';
import { STARTER_RECIPES } from '../../sim/recipes';
import { knowName } from '../notify';
import { foodStores } from '../../sim/spoilage';
import { chiefOf } from '../../sim/leadership';
import type { LifeStage } from '../../shared/types';

const STAGES: LifeStage[] = ['hatchling', 'youngling', 'adult', 'elder'];
const cap = (x: string): string => x.charAt(0).toUpperCase() + x.slice(1);

/**
 * Village panel (Y, §18.6 — P5.5 slice): name and god, goblins by life stage, and what the village knows beyond the
 * basics, each with how many know it (red when only one does: one death from being lost), plus what has been lost.
 * The chief and its policies (P8.4); beliefs and festivals join it later in P8.
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
    const chief = chiefOf(this.ctx.game.world), pol = s.village.policies ?? {};
    const policies = [pol.work && 'work', pol.rota && 'rota', pol.festivals && 'festivals', pol.shrine && 'shrine', pol.quarantine && 'quarantine',
      pol.law !== undefined && (pol.law < CFG.mischief.theft.law ? 'lax' : 'strict')].filter((x): x is string => !!x).map((k) => t(`policy.${k}`));
    this.body.replaceChildren(
      el('div.sub', { text: s.village.name + (s.god.godName ? ' · ' + t('village.god', { name: s.god.godName }) : '') }),
      el('h3', { text: `${t('village.pop')}: ${s.goblins.length}` }),
      el('div.sub', { text: counts.map(([st, n]) => `${t(`stage.${st}`)} ${n}`).join(' · ') }),
      el('div.sub', { text: t('village.food', { n: Math.round(food.food), d: food.days.toFixed(1) }) }),
      el('h3', { text: chief ? t('village.chief', { name: chief.name }) : t('village.noChief') }), // P8.4
      el('div.sub', { text: `${t('village.policies')}: ${policies.join(' · ') || t('village.noPolicies')}` }),
      el('h3', { text: t('village.knowledge') }),
      el('div.sub', { text: t('village.basics', { list: STARTER_RECIPES.map((id) => t(`recipe.${id}`)).join(', ') }) }),
      ...(recipes.length ? recipes.map(row) : [el('div.sub', { text: t('village.nothing') })]),
      ...(facts.length ? [el('h3', { text: t('village.facts') }), ...facts.map(row)] : []),
      ...(s.village.lost?.length ? [el('div.sub.vp-lost', { text: t('village.lost', { list: s.village.lost.map(knowName).join(', ') }) })] : []),
    );
  }
}
