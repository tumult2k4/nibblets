import { el } from '../dom';
import { t } from '../i18n';
import type { Ctx, Component } from '../ctx';
import { villageKnowledge } from '../../sim/knowledge';
import { STARTER_RECIPES } from '../../sim/recipes';
import { knowName } from '../notify';
import { foodStores } from '../../sim/spoilage';
import type { LifeStage } from '../../shared/types';

const STAGES: LifeStage[] = ['hatchling', 'youngling', 'adult', 'elder'];
const cap = (x: string): string => x.charAt(0).toUpperCase() + x.slice(1);

/**
 * Village panel (Y, §18.6 — P5.5 slice): name and god, goblins by life stage, and what the village knows beyond the
 * basics, each with how many know it (red when only one does: one death from being lost), plus what has been lost.
 * Chief, policies, beliefs and festivals join it in P8.
 */
export class VillagePanel implements Component {
  private root = el('div.villagepanel.panel.hidden');
  private body = el('div');
  private lastTick = -1;

  constructor(private ctx: Ctx) {}

  mount(parent: HTMLElement): void {
    const close = el('button.btn.iconbtn', { onclick: () => this.ctx.store.set({ openPanels: { ...this.ctx.store.state.openPanels, village: false } }) }, '✕');
    this.root.append(el('div.vp-head', {}, el('h2', { text: t('village.title') }), close), this.body);
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
    this.body.replaceChildren(
      el('div.sub', { text: s.village.name + (s.god.godName ? ' · ' + t('village.god', { name: s.god.godName }) : '') }),
      el('h3', { text: `${t('village.pop')}: ${s.goblins.length}` }),
      el('div.sub', { text: counts.map(([st, n]) => `${t(`stage.${st}`)} ${n}`).join(' · ') }),
      el('div.sub', { text: t('village.food', { n: Math.round(food.food), d: food.days.toFixed(1) }) }),
      el('h3', { text: t('village.knowledge') }),
      el('div.sub', { text: t('village.basics', { list: STARTER_RECIPES.map((id) => t(`recipe.${id}`)).join(', ') }) }),
      ...(recipes.length ? recipes.map(row) : [el('div.sub', { text: t('village.nothing') })]),
      ...(facts.length ? [el('h3', { text: t('village.facts') }), ...facts.map(row)] : []),
      ...(s.village.lost?.length ? [el('div.sub.vp-lost', { text: t('village.lost', { list: s.village.lost.map(knowName).join(', ') }) })] : []),
    );
  }
}
