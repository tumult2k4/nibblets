import { el } from '../../dom';
import { t } from '../../i18n';
import { hslCss } from '../../../shared/math';
import type { Goblin } from '../../../sim/state';
import type { World } from '../../../sim/world';
import { ageDays } from '../../../sim/goblin/goblin';
import { phenotypeOf } from '../../../sim/goblin/genetics/phenotype';
import { express } from '../../../sim/goblin/genetics/phenotype';
import { LOCUS_DEFS, type LocusDef } from '../../../sim/goblin/genetics/genome';
import { describePersonality, TRAITS } from '../../../sim/goblin/personality';
import { slotCount } from '../../../sim/inventory';
import { icon, ITEM_ICON } from '../../icons';
import { portraits } from '../../../render/portraits';
import { CFG } from '../../../sim/config';

export const bar = (v: number, color = 'var(--moss)'): HTMLElement => el('div.bar', {}, el('i', { style: `width:${Math.max(0, Math.min(100, v))}%;background:${color}` }));
const row = (label: string, v: number, shown: string, color?: string) =>
  el('div.row', {}, el('span.lbl', { text: label }), bar(v, color), el('span.val', { text: shown }));
const needColor = (v: number) => (v < 15 ? 'var(--apple)' : v < 40 ? 'var(--gold)' : 'var(--moss)');

export function goblinHeader(g: Goblin, w: World, onFollow: () => void, onClose: () => void): HTMLElement {
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
        el('button.btn', { onclick: onClose, 'data-tip': t('insp.close') }, icon('close')))));
}

export function statusTab(g: Goblin): HTMLElement {
  const n = g.needs;
  const needs = (['hunger', 'thirst', 'energy', 'curiosity'] as const).map((k) => row(t(`need.${k}`), n[k], String(Math.round(n[k])), needColor(n[k])));
  const stubs = (['warmth', 'safety', 'social', 'fun', 'comfort', 'purpose'] as const).map((k) => row(t(`need.${k}`), n[k], String(Math.round(n[k])), '#b5a98f'));
  const mood = g.mood.value;
  const mods = [...g.mood.modifiers].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).slice(0, 3).map((m) => `${m.id.replace(/_/g, ' ')} ${m.amount > 0 ? '+' : ''}${Math.round(m.amount)}`);
  return el('div', {},
    el('div.row', {}, el('b', { text: `${t('insp.doing')}: ` }), el('span', { text: t(`act.${g.activity.action}`) })),
    el('h3', { text: t('insp.needs') }), ...needs, ...stubs,
    el('h3', { text: t('insp.mood') }),
    row(t(`emotion.${g.mood.emotion}`), (mood + 100) / 2, String(Math.round(mood)), mood < -30 ? 'var(--apple)' : 'var(--gold)'),
    mods.length ? el('div.sub', { text: mods.join(' · ') }) : null,
    el('h3', { text: t('insp.health') }),
    row(t('insp.hp'), (g.health.hp / g.health.maxHp) * 100, `${Math.round(g.health.hp)}/${g.health.maxHp}`, needColor((g.health.hp / g.health.maxHp) * 100)),
  );
}

export function mindTab(g: Goblin): HTMLElement {
  const v = g.godView;
  return el('div', {},
    el('h3', { text: t('insp.personality') }),
    ...TRAITS.map((k) => row(t(`trait.${k}`), g.personality[k] * 100, g.personality[k].toFixed(2), 'var(--sky)')),
    el('h3', { text: t('insp.godview') }),
    row(t('insp.faith'), v.faith, String(Math.round(v.faith)), 'var(--gold)'),
    row(t('insp.love'), v.love, String(Math.round(v.love)), '#e57a9a'),
    row(t('insp.fear'), v.fear, String(Math.round(v.fear)), 'var(--wrath)'),
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
  if (def.key === 'pattern') return ['none', 'freckles', 'spots', 'stripes', 'two-tone'][v] ?? String(v);
  if (def.kind === 'recessive') return v ? '●' : '○';
  return v.toFixed(2);
}

export function bodyTab(g: Goblin, w: World): HTMLElement {
  const ph = phenotypeOf({ genome: g.genome, ageDays: ageDays(g, w.s.tick), stage: g.lifeStage, hunger: g.needs.hunger, scars: g.health.scars });
  const full = el('img', { src: portraits.get(ph, g.id * 31 + 7, 0.5, true), style: 'width:128px;height:128px;display:block;margin:0 auto' });
  const rows = (LOCUS_DEFS as readonly LocusDef[]).map((d) => {
    const l = g.genome[d.key];
    const note = d.kind === 'recessive' ? (l.a + l.b === 1 ? ' (carrier)' : '') : '';
    return el('tr', {}, el('td', { text: d.label }), el('td', {}, fmtAllele(d, l.a)), el('td', {}, fmtAllele(d, l.b)), el('td', {}, fmtAllele(d, express(g.genome, d.key)), note));
  });
  return el('div', {}, full,
    el('h3', { text: t('insp.genome') }),
    el('table.genome', {}, el('tr', {}, el('td', {}, el('b', { text: t('insp.allele') })), el('td', { text: 'a' }), el('td', { text: 'b' }), el('td', {}, el('b', { text: t('insp.expressed') }))), ...rows));
}

export function inventoryTab(g: Goblin): HTMLElement {
  const items = g.inventory.map((s) => el('div.row', {}, icon(ITEM_ICON[s.type] ?? 'gift'), el('span', { text: `${t(`item.${s.type}`)} ×${s.qty}${s.divine ? ` (${t('insp.sky')})` : ''}` })));
  return el('div', {}, el('div.sub', { text: t('insp.slots', { n: slotCount(g) }) }), ...(items.length ? items : [el('div.sub', { text: t('insp.empty') })]));
}
