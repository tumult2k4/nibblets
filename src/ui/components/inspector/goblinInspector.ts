import { el } from '../../dom';
import { t } from '../../i18n';
import { hslCss } from '../../../shared/math';
import type { Goblin, NeedId } from '../../../sim/state';
import type { Goal } from '../../../sim/ai/planner';
import type { World } from '../../../sim/world';
import { ageDays } from '../../../sim/goblin/goblin';
import { phenotypeOf } from '../../../sim/goblin/genetics/phenotype';
import { express, PATTERNS } from '../../../sim/goblin/genetics/phenotype';
import { LOCUS_DEFS, type Genome, type LocusDef } from '../../../sim/goblin/genetics/genome';
import { describePersonality } from '../../../sim/goblin/personality';
import { growthChart, personalityRadar } from './charts';
import { knowers } from '../../../sim/knowledge';
import { trinketsOf } from '../../../sim/trinkets';
import { slotCount } from '../../../sim/inventory';
import type { ItemStack } from '../../../shared/types';
import { isTool, maxUses, usesLeft } from '../../../sim/tools';
import { icon, ITEM_ICON } from '../../icons';
import { portraits } from '../../../render/portraits';
import { CFG } from '../../../sim/config';
import { feltTemperature, isWet, shelterOf, huddleBonus } from '../../../sim/temperature';
import { MAX_LEVEL, SKILLS, skillLevel } from '../../../sim/goblin/skills';
import { diseaseDef } from '../../../sim/disease';
import { quarantined } from '../../../sim/quarantine';
import { favoriteFood, isInspired } from '../../../sim/goblin/mood';

export const bar = (v: number, color = 'var(--moss)'): HTMLElement => el('div.bar', {}, el('i', { style: `width:${Math.max(0, Math.min(100, v))}%;background:${color}` }));
const row = (label: string, v: number, shown: string, color?: string) =>
  el('div.row', {}, el('span.lbl', { text: label }), bar(v, color), el('span.val', { text: shown }));
const needColor = (v: number) => (v < 15 ? 'var(--apple)' : v < 40 ? 'var(--gold)' : 'var(--moss)');

export function goblinHeader(g: Goblin, w: World, onFollow: () => void, onClose: () => void, onFamily: () => void): HTMLElement {
  const ph = phenotypeOf({ genome: g.genome, ageDays: ageDays(g, w.s.tick), stage: g.lifeStage, hunger: 70, scars: g.health.scars });
  const img = el('img.portrait', { src: portraits.get(ph, g.id * 31 + 7), alt: g.name });
  const seasons = (ageDays(g, w.s.tick) / CFG.time.daysPerSeason).toFixed(1);
  const desc = describePersonality(g.personality).map((k) => t(`word.${k}`)).join(', ') || t('word.ordinary');
  return el('div.insp-head', {}, img,
    el('div', { style: 'flex:1' },
      el('h2', { text: g.name + (g.epithet ? ` ${g.epithet}` : '') }),
      el('div.sub', { text: t('insp.age', { stage: t(`stage.${g.lifeStage}`), age: seasons }) }),
      el('div.sub', { text: t('insp.descriptor', { d: desc }) }),
      el('div', { style: 'margin-top:4px;display:flex;gap:4px' },
        el('button.btn', { onclick: onFollow, 'data-tip': t('insp.follow') }, icon('eye')),
        el('button.btn', { onclick: onFamily, 'data-tip': t('insp.familyTree') }, icon('egg')),
        el('button.btn', { onclick: onClose, 'data-tip': t('insp.close') }, icon('close')))));
}

const goalText = (goal: Goal, w: World): string => goal.kind === 'build'
  ? t('goal.build', { b: t(`bld.${w.s.buildings.find((b) => b.id === goal.buildingId)?.type ?? 'hut'}`) })
  : t('goal.obtain', { n: goal.qty, item: t(`item.${goal.item}`) });

/** Illness (P6.1): what it has and how long to go, being tended, immunities. */
function illnessLine(g: Goblin, w: World): string {
  const h = g.health, d = h.disease, parts: string[] = [];
  if (d) {
    const def = diseaseDef(d.id), name = t(`disease.${d.id}`);
    parts.push(d.stage === 'sick' ? t('insp.ill', { d: name, n: Math.max(1, Math.ceil((def?.durationDays ?? 1) - d.progress)) }) : t('insp.incubating', { d: name }));
  }
  if (d?.remedy) parts.push(t('insp.remedy'));
  if (quarantined(g, w)) parts.push(t('insp.quarantined'));
  if (h.tendedUntil > w.s.tick) parts.push(t('insp.tended'));
  for (const [id, until] of Object.entries(h.immune)) if (until > w.s.tick) parts.push(t('insp.immune', { d: t(`disease.${id}`) }));
  return parts.join(' · ');
}

/** Wounds, scars and fighting record, e.g. "limping · 1 scars · 5 fights, 2 kills". */
function woundsLine(g: Goblin): string {
  const parts = g.health.injuries.map((i) => t(`injury.${i.kind}`));
  if (g.health.scars) parts.push(t('insp.scars', { n: g.health.scars }));
  if (g.deeds.fights) parts.push(t('insp.fights', { n: g.deeds.fights, k: g.deeds.kills }));
  return parts.join(' · ');
}

const TRAIT_ICON: Record<string, string> = { veteran: 'spear', scarred: 'fang', green_thumb: 'leaf', orphan: 'heart', twin: 'egg', grudge_holder: 'curse' };
/** Acquired traits (§7.7, P5.7) with icons and what each does. */
function traitList(g: Goblin): HTMLElement[] {
  if (!g.traits.length) return [el('div.sub', { text: t('insp.noLifeTraits') })];
  return g.traits.map((tr) => el('div.trait-row', {},
    el('span.trait-chip', {}, icon(TRAIT_ICON[tr] ?? 'star'), el('span', { text: t(`atrait.${tr}`) })), el('span.sub', { text: t(`atrait.${tr}.d`) })));
}

/** A mood modifier in words: grief names whom it is for (P6.4). */
function modLabel(id: string, w: World): string {
  if (id.startsWith('grief:')) {
    const deadId = Number(id.slice(6));
    return t('mod.grief', { name: w.s.graves.find((gr) => gr.goblinId === deadId)?.name ?? w.s.lineage[deadId]?.name ?? '?' });
  }
  const k = `mod.${id.split(':')[0]}`, s = t(k);
  return s === k ? id.replace(/_/g, ' ') : s;
}

/** Favorite food, a mood break under way, inspiration (P8.1). */
function moodTags(g: Goblin, w: World): string[] {
  const tags = [t('insp.favorite', { item: t(`item.${favoriteFood(g)}`) })];
  if (g.moodBreak) tags.push(t('insp.onBreak', { kind: t(`break.${g.moodBreak.kind}`) }));
  if (isInspired(g, w)) tags.push(t('insp.inspired'));
  return tags;
}

export function statusTab(g: Goblin, w: World): HTMLElement {
  const n = g.needs;
  // fun counts for younglings only until pranks, music and festivals (P5.4); comfort and purpose are still stubs
  const kid = g.lifeStage === 'youngling';
  const live: NeedId[] = ['hunger', 'thirst', 'energy', 'warmth', 'safety', 'social', 'curiosity', ...(kid ? ['fun' as const] : [])];
  const needs = live.map((k) => row(t(`need.${k}`), n[k], String(Math.round(n[k])), needColor(n[k])));
  const stubs = ([...(kid ? [] : ['fun' as const]), 'comfort', 'purpose'] as NeedId[]).map((k) => row(t(`need.${k}`), n[k], String(Math.round(n[k])), '#b5a98f'));
  const tags = [t('insp.felt', { t: Math.round(feltTemperature(w, g)) })];
  if (isWet(w, g)) tags.push(t('insp.wet'));
  if (shelterOf(w, g)) tags.push(t('insp.sheltered'));
  if (huddleBonus(w, g) > 0) tags.push(t('insp.huddle'));
  if ((g.fertileUntil ?? 0) > w.s.tick) tags.push(t('insp.fertile'));
  const home = g.homeId !== null ? w.s.buildings.find((b) => b.id === g.homeId) : undefined;
  tags.push(home ? `${t('bld.hut')} ${home.buildProgress >= 1 ? '' : `(${t('insp.blueprint')})`}`.trim() : t('insp.homeless'));
  const mood = g.mood.value;
  const mods = [...g.mood.modifiers].filter((m) => m.amount !== 0).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).slice(0, 3).map((m) => `${modLabel(m.id, w)} ${m.amount > 0 ? '+' : ''}${Math.round(m.amount)}`);
  return el('div', {},
    el('div.row', {}, el('b', { text: `${t('insp.doing')}: ` }), el('span', { text: t(`act.${g.activity.action}`) })),
    g.goalStack.length ? el('div.row', {}, el('b', { text: `${t('insp.goal')}: ` }), el('span', { text: g.goalStack.map((e) => goalText(e.goal, w)).join(' → ') })) : null,
    el('h3', { text: t('insp.needs') }), ...needs, el('div.sub', { text: tags.join(' · ') }), ...stubs,
    el('h3', { text: t('insp.mood') }),
    row(t(`emotion.${g.mood.emotion}`), (mood + 100) / 2, String(Math.round(mood)), mood < -30 ? 'var(--apple)' : 'var(--gold)'),
    mods.length ? el('div.sub', { text: mods.join(' · ') }) : null,
    el('div.sub', { text: moodTags(g, w).join(' · ') }),
    el('h3', { text: t('insp.health') }),
    row(t('insp.hp'), (g.health.hp / g.health.maxHp) * 100, `${Math.round(g.health.hp)}/${g.health.maxHp}`, needColor((g.health.hp / g.health.maxHp) * 100)),
    woundsLine(g) ? el('div.sub', { text: woundsLine(g) }) : null,
    illnessLine(g, w) ? el('div.sub.ill', { text: illnessLine(g, w) }) : null,
  );
}

/** Skill bars (P5.2): level 0–10 from XP, only the skills it has practised. */
function skillRows(g: Goblin): HTMLElement[] {
  const rows = SKILLS.filter((k) => (g.skills[k] ?? 0) > 0)
    .map((k) => ({ k, lv: skillLevel(g, k) }))
    .sort((a, b) => b.lv - a.lv)
    .map(({ k, lv }) => row(t(`skill.${k}`), (lv / MAX_LEVEL) * 100, lv.toFixed(1), 'var(--gold)'));
  return rows.length ? rows : [el('div.sub', { text: t('insp.noSkills') })];
}

export function mindTab(g: Goblin): HTMLElement {
  const v = g.godView;
  return el('div', {},
    el('h3', { text: t('insp.skills') }), ...skillRows(g),
    el('h3', { text: t('insp.personality') }), personalityRadar(g),
    el('h3', { text: t('insp.lifeTraits') }), ...traitList(g),
    el('h3', { text: t('insp.godview') }),
    row(t('insp.faith'), v.faith, String(Math.round(v.faith)), 'var(--gold)'),
    row(t('insp.love'), v.love, String(Math.round(v.love)), '#e57a9a'),
    row(t('insp.fear'), v.fear, String(Math.round(v.fear)), 'var(--wrath)'),
    v.angryAtGod ? el('div.sub', { text: t('insp.angryAtGod'), style: 'color:var(--apple)' }) : null,
    el('h3', { text: t('insp.deeds') }),
    el('div.sub', { text: t('insp.deedsLine', { e: g.deeds.eaten, d: g.deeds.drank, h: g.deeds.harvested, g: g.deeds.timesHeld }) }),
    el('div.sub', { text: t('insp.deedsLine2', { p: g.deeds.planted }) }),
    el('h3', { text: t('insp.memory') }),
    el('div.sub', { text: t('insp.memoryLine', {
      f: g.memory.filter((m) => m.kind === 'fruit_plant').length, w: g.memory.filter((m) => m.kind === 'water').length,
      r: g.memory.filter((m) => m.kind === 'rock').length, n: g.memory.length,
    }) }),
  );
}

function fmtAllele(def: LocusDef, v: number): string | HTMLElement {
  if (def.kind === 'hue') return el('span', {}, el('span.swatch', { style: `background:${hslCss({ h: v, s: 0.6, l: 0.5 })}` }), ` ${Math.round(v)}°`);
  if (def.key === 'pattern') return t(`pattern.${PATTERNS[v] ?? 'none'}`);
  if (def.kind === 'recessive') return v ? '●' : '○';
  return v.toFixed(2);
}

/** How the two alleles combine: a carrier of a recessive, which pattern wins, colors and sizes blend. */
function dominanceNote(d: LocusDef, a: number, b: number): string {
  if (d.kind === 'recessive') return a + b === 2 ? ` (${t('insp.shows')})` : a + b === 1 ? ` (${t('insp.carrier')})` : '';
  if (d.kind === 'discrete') return a === b ? '' : ` (${t('insp.dominant')})`;
  return '';
}

/** Every locus: allele a, allele b, what shows and how they combine (§18.6 Body tab; the egg inspector too). */
export function genomeTable(genome: Genome): HTMLElement {
  const rows = (LOCUS_DEFS as readonly LocusDef[]).map((d) => {
    const l = genome[d.key];
    return el('tr', {}, el('td', { text: d.label }), el('td', {}, fmtAllele(d, l.a)), el('td', {}, fmtAllele(d, l.b)), el('td', {}, fmtAllele(d, express(genome, d.key)), dominanceNote(d, l.a, l.b)));
  });
  return el('table.genome', {}, el('tr', {}, el('td', {}, el('b', { text: t('insp.allele') })), el('td', { text: 'a' }), el('td', { text: 'b' }), el('td', {}, el('b', { text: t('insp.expressed') }))), ...rows);
}

export function bodyTab(g: Goblin, w: World): HTMLElement {
  const age = ageDays(g, w.s.tick);
  const ph = phenotypeOf({ genome: g.genome, ageDays: age, stage: g.lifeStage, hunger: g.needs.hunger, scars: g.health.scars });
  const full = el('img', { src: portraits.get(ph, g.id * 31 + 7, 0.5, true), style: 'width:128px;height:128px;display:block;margin:0 auto' });
  return el('div', {}, full,
    g.health.scars ? el('div.sub', { style: 'text-align:center', text: t('insp.scars', { n: g.health.scars }) }) : null,
    el('h3', { text: t('insp.growth') }), growthChart(g, age),
    el('div.sub', { text: t('insp.growthLine', { s: express(g.genome, 'adultSize').toFixed(2), now: ph.scale.toFixed(2) }) }),
    el('h3', { text: t('insp.genome') }), genomeTable(g.genome));
}

const stackLabel = (s: ItemStack): string =>
  `${s.fine ? t('insp.fine') + ' ' : ''}${t(`item.${s.type}`)}${s.qty > 1 ? ` ×${s.qty}` : ''}`
  + `${isTool(s.type) ? ` · ${t('insp.uses', { n: usesLeft(s), max: maxUses(s.type, s.fine) })}` : ''}${s.divine ? ` (${t('insp.sky')})` : ''}`;
const itemRow = (s: ItemStack): HTMLElement => el('div.row', {}, icon(ITEM_ICON[s.type] ?? 'gift'), el('span', { text: stackLabel(s) }));

/** Hand slot, pack, crafting skill and known hand/site recipes (§P4.2). */
export function inventoryTab(g: Goblin, w: World): HTMLElement {
  const items = g.inventory.map(itemRow);
  const hand = g.equipped.hand;
  const worn = [g.equipped.body, g.equipped.head].filter((s): s is ItemStack => !!s);
  return el('div', {},
    el('h3', { text: t('insp.hand') }), hand ? itemRow(hand) : el('div.sub', { text: t('insp.emptyHand') }),
    ...(worn.length ? [el('h3', { text: t('insp.wearing') }), ...worn.map(itemRow)] : []),
    el('h3', { text: t('insp.pack') }), el('div.sub', { text: t('insp.slots', { n: slotCount(g) }) }), ...(items.length ? items : [el('div.sub', { text: t('insp.empty') })]),
    el('h3', { text: t('insp.recipes') }),
    el('div.recipes', {}, ...g.knownRecipes.map((r) => knowers(w.s, r) === 1
      ? el('span.recipe.only', { 'data-tip': t('insp.onlyKnowerTip') }, `${t(`recipe.${r}`)} · ${t('insp.onlyKnower')}`)
      : el('span.recipe', { text: t(`recipe.${r}`) }))),
    ...(g.trinkets.length ? [el('h3', { text: t('insp.trinkets') }), ...trinketsOf(g, w).map((x) =>
      el('div.row', {}, el('span.swatch', { style: `background:hsl(${Math.round(x.hue)} 70% 60%)` }), el('span', { text: `${t(`trinket.${x.kind}`)} · ${t(`rarity.${x.rarity}`)}` })))] : []),
    ...(g.knownFacts.length ? [el('h3', { text: t('insp.facts') }), el('div.sub', { text: g.knownFacts.map((f) => t(`fact.${f}`)).join(' · ') })] : []));
}
