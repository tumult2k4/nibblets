/**
 * Sandbox drawer, "Genome" and "Breed" tabs (§17.5.6): make a goblin from scratch, allele by allele, with a turning
 * preview; reshape a living goblin's looks (it transforms in a puff); or pick two goblins and lay an egg of theirs,
 * with a peek at children they could have.
 */
import { el } from '../../dom';
import { icon } from '../../icons';
import { t } from '../../i18n';
import type { Ctx } from '../../ctx';
import { Rng } from '../../../shared/rng';
import { hslCss } from '../../../shared/math';
import type { ID } from '../../../shared/types';
import type { Goblin } from '../../../sim/state';
import { cloneGenome, LOCUS_DEFS, meiosis, type Genome, type LocusDef, type LocusId } from '../../../sim/goblin/genetics/genome';
import { express, lifeStageForAge, phenotypeOf, PATTERNS } from '../../../sim/goblin/genetics/phenotype';
import { CLAN_ARCHETYPES, founderGenome, type ClanArchetype } from '../../../sim/goblin/genetics/founders';
import { COSMETIC_LOCI } from '../../../sim/sandbox';
import { ageDays } from '../../../sim/goblin/goblin';
import { portraits } from '../../../render/portraits';

const LOCI = LOCUS_DEFS as readonly LocusDef[];
const ui = new Rng(0x5eed); // the UI's own dice: previews never touch the world's
const preview = (genome: Genome, age: number, seed: number, angle = 0.35, full = true): string =>
  portraits.get(phenotypeOf({ genome, ageDays: age, stage: lifeStageForAge(age, 100), hunger: 70, scars: 0 }), seed, angle, full);

/** Editor state lives while the page does: the draft goblin, or edits to the selected one. */
const st = { source: 'new' as 'new' | 'selected', draft: founderGenome(new Rng(7), 'mixed'), age: 25, arch: 'mixed' as ClanArchetype, angle: 0 };
const fmt = (d: LocusDef, v: number): string =>
  d.kind === 'hue' ? `${Math.round(v)}°` : d.key === 'pattern' ? t(`pattern.${PATTERNS[v] ?? 'none'}`) : d.kind === 'recessive' ? (v ? '●' : '○') : v.toFixed(2);

/** One allele's control: a slider, a pattern list or a tick box. */
function alleleInput(d: LocusDef, v: number, on: (v: number) => void, disabled: boolean): HTMLElement {
  if (d.kind === 'recessive') {
    const c = el('input', { type: 'checkbox', disabled, onchange: () => on(c.checked ? 1 : 0) }) as HTMLInputElement;
    c.checked = v === 1;
    return c;
  }
  if (d.kind === 'discrete') {
    const s = el('select', { disabled, onchange: () => on(Number(s.value)) }, ...PATTERNS.map((p, i) => el('option', { value: String(i), text: t(`pattern.${p}`) }))) as HTMLSelectElement;
    s.value = String(v);
    return s;
  }
  const step = d.kind === 'hue' ? 1 : (d.max - d.min) / 100;
  const r = el('input', { type: 'range', min: String(d.min), max: String(d.kind === 'hue' ? 359 : d.max), step: String(step), disabled, oninput: () => on(Number(r.value)) }) as HTMLInputElement;
  r.value = String(v);
  if (d.kind === 'hue') r.classList.add('hue');
  if (d.kind === 'hue') r.style.background = `linear-gradient(90deg, ${[0, 60, 120, 180, 240, 300, 360].map((h) => hslCss({ h, s: 0.6, l: 0.55 })).join(',')})`;
  return r;
}

/** The genome editor. Returns the tab and a per-frame tick that turns the preview. */
export function genomeTab(ctx: Ctx): { root: HTMLElement; tick: () => void } {
  const w = ctx.game.world;
  const sel = ctx.store.state.selectedKind === 'goblin' ? w.goblin(ctx.store.state.selection[0] ?? -1) : undefined;
  if (st.source === 'selected' && !sel) st.source = 'new';
  const target: Goblin | undefined = st.source === 'selected' ? sel : undefined;
  const genome: Genome = target ? cloneGenome(target.genome) : st.draft;
  const age = target ? ageDays(target, w.s.tick) : st.age;
  const img = el('img.sbx-preview', { alt: '' }) as HTMLImageElement;
  const shown = new Map<LocusId, HTMLElement>();
  const refresh = () => { for (const [k, e] of shown) e.textContent = fmt(LOCI.find((d) => d.key === k)!, express(genome, k)); };
  const rows = LOCI.filter((d) => !target || COSMETIC_LOCI.includes(d.key)).map((d) => {
    const val = el('span.val');
    shown.set(d.key, val);
    const set = (side: 'a' | 'b') => (v: number) => { genome[d.key][side] = v; refresh(); };
    return el('div.sbx-locus', {}, el('span.lbl', { text: d.label }), alleleInput(d, genome[d.key].a, set('a'), false), alleleInput(d, genome[d.key].b, set('b'), false), val);
  });
  refresh();
  const src = (v: 'new' | 'selected', label: string) => el(`button.btn${st.source === v ? '.on' : ''}`, { disabled: v === 'selected' && !sel, onclick: () => { st.source = v; rebuild(); } }, label);
  const root = el('div');
  const rebuild = () => { const next = genomeTab(ctx); root.replaceWith(next.root); Object.assign(api, next); };
  const actions = target
    ? [el('button.btn', { onclick: () => ctx.push({ type: 'sandbox', op: { op: 'edit_genome', goblinId: target.id, genome: Object.fromEntries(COSMETIC_LOCI.map((k) => [k, genome[k]])) } }) }, t('sbx.apply')),
      el('button.btn', { onclick: rebuild }, t('sbx.reset'))]
    : [el('select', { onchange: (e: Event) => { st.arch = (e.target as HTMLSelectElement).value as ClanArchetype; } }, ...CLAN_ARCHETYPES.map((a) => el('option', { value: a, text: t(`clan.${a}`), selected: a === st.arch }))),
      el('button.btn', { onclick: () => { st.draft = founderGenome(new Rng(ui.int(1, 1e9)), st.arch); rebuild(); } }, t('sbx.randomize')),
      el('label', {}, `${t('sbx.age')} `, el('input', { type: 'number', min: '0', max: '90', value: String(st.age), style: 'width:4em', onchange: (e: Event) => { st.age = Math.max(0, Math.min(90, Number((e.target as HTMLInputElement).value) || 0)); } })),
      el('button.btn', { onclick: () => ctx.store.set({ spawn: { kind: 'goblin', genome: cloneGenome(st.draft), ageDays: st.age } }) }, t('sbx.placeGoblin'))];
  root.append(
    el('div.row', {}, src('new', t('sbx.newGoblin')), src('selected', sel ? sel.name : t('sbx.selectedGoblin'))),
    el('div.sbx-head', {}, img, el('div.sub', { text: target ? t('sbx.editHint') : t('sbx.newHint') })),
    el('div.row.sbx-row', {}, ...actions),
    el('div.sbx-locus.head', {}, el('span.lbl', { text: t('insp.allele') }), el('span', { text: 'a' }), el('span', { text: 'b' }), el('span.val', { text: t('insp.expressed') })),
    ...rows);
  const seed = target ? target.id * 31 + 7 : 7;
  const api = {
    root,
    tick: () => {
      st.angle = (st.angle + 1) % 48;
      const src2 = preview(genome, age, seed, 0.35 + (st.angle / 48) * Math.PI * 2);
      if (img.getAttribute('src') !== src2) img.src = src2;
    },
  };
  return api;
}

/** Parents chosen for the breeding tool, and a few children they could have. */
const breed = { a: null as ID | null, b: null as ID | null, roll: 1 };
/** Changes whenever the Breed tab must be drawn again. */
export const breedSig = (): string => `${breed.a}:${breed.b}:${breed.roll}`;

export function breedTab(ctx: Ctx): HTMLElement {
  const w = ctx.game.world, s = ctx.store.state;
  const picked = s.selectedKind === 'goblin' ? s.selection : [];
  if (picked.length >= 2) { breed.a = picked[0]!; breed.b = picked[1]!; }
  const a = breed.a !== null ? w.goblin(breed.a) : undefined, b = breed.b !== null ? w.goblin(breed.b) : undefined;
  const slot = (which: 'a' | 'b', g: Goblin | undefined) => el('div.sbx-parent', {},
    g ? el('img', { src: preview(g.genome, ageDays(g, w.s.tick), g.id * 31 + 7, 0.35, false), alt: g.name }) : el('div.sbx-empty', { text: '?' }),
    el('div', {}, el('b', { text: g ? g.name : t('sbx.nobody') }),
      el('button.btn', { disabled: picked.length < 1, onclick: () => { breed[which] = picked[0] ?? null; } }, t('sbx.useSelected'))));
  const kids = a && b && a !== b
    ? Array.from({ length: 4 }, (_, i) => meiosis(a.genome, b.genome, new Rng(breed.roll * 1009 + i * 7919 + a.id * 31 + b.id)))
      .map((gn, i) => el('img.sbx-kid', { src: preview(gn, 25, a.id + b.id + i, 0.35, false), alt: '' }))
    : [];
  return el('div', {},
    el('p.sub', { text: t('sbx.breedHint') }),
    el('div.row', {}, slot('a', a), slot('b', b)),
    ...(kids.length ? [el('h3', { text: t('sbx.mightBe') }), el('div.sbx-kids', {}, ...kids),
      el('div.row.sbx-row', {},
        el('button.btn', { onclick: () => { breed.roll++; } }, t('sbx.reroll')),
        el('button.btn', { onclick: () => ctx.push({ type: 'sandbox', op: { op: 'breed', aId: a!.id, bId: b!.id } }) }, icon('egg'), t('sbx.layEgg')))] : []));
}
