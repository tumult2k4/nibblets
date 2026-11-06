/**
 * The Codex's pages (§18.7, P11.1): what the village knows, has lost and has yet to find; the creatures it has met;
 * its beliefs; its named places; its genes (every allele seen in the living, how common, a hue wheel); the divine
 * deeds earned in this browser. Each page is built fresh from the world when it is opened or changes.
 */
import { el } from '../dom';
import { getLang, t } from '../i18n';
import { hslCss } from '../../shared/math';
import type { WorldState } from '../../sim/state';
import { RECIPES } from '../../sim/recipes';
import { knowers } from '../../sim/knowledge';
import { placesOf } from '../../sim/places';
import { placeName } from '../../llm/placeNames';
import { beliefText } from '../notifyCulture';
import { LOCUS_DEFS, type LocusDef } from '../../sim/goblin/genetics/genome';
import { express } from '../../sim/goblin/genetics/phenotype';
import { DEED_ICON, DEED_IDS, deeds } from '../deeds';
import type { Vec2 } from '../../shared/types';

const word = (key: string): string => (getLang() === 'en' ? t(key).toLowerCase() : t(key));

/** Recipes: known (with how many know them, red when one), lost (torn), undiscovered (a silhouette and a hint). */
export function recipesPage(s: WorldState): HTMLElement {
  const lost = new Set(s.village.lost ?? []);
  const rows = Object.entries(RECIPES).map(([id, r]) => {
    const n = r.known ? s.goblins.length : knowers(s, id);
    if (n > 0) return el(`div.cx-row${n === 1 ? '.cx-risk' : ''}`, {}, el('span', { text: t(`recipe.${id}`) }), el('span.sub', { text: r.known ? t('codex.everyone') : t('codex.knowers', { n }) }));
    if (lost.has(id)) return el('div.cx-row.cx-torn', {}, el('span', { text: t(`recipe.${id}`) }), el('span.sub', { text: t('codex.lost') }));
    const hint = Object.keys(r.inputs).map((k) => word(`item.${k}`)).join(', ');
    return el('div.cx-row.cx-unknown', {}, el('span', { text: '▓▓▓▓▓' }), el('span.sub', { text: t('codex.hint', { list: hint }) }));
  });
  const order = (e: HTMLElement) => (e.classList.contains('cx-unknown') ? 2 : e.classList.contains('cx-torn') ? 1 : 0);
  return el('div', {}, ...rows.sort((a, b) => order(a) - order(b)));
}

/** The creatures the village has met (enemies and wildlife), from the history the sim keeps. */
export function creaturesPage(seen: readonly string[]): HTMLElement {
  if (!seen.length) return el('div.sub', { text: t('codex.noCreatures') });
  return el('div', {}, ...seen.map((k) => el('div.cx-row', {}, el('span', { text: t(`enemy.${k}`) === `enemy.${k}` ? t(`critter.${k}`) : t(`enemy.${k}`) }))));
}

export function beliefsPage(s: WorldState): HTMLElement {
  const bs = s.village.culture?.beliefs ?? [];
  if (!bs.length) return el('div.sub', { text: t('village.noBeliefs') });
  return el('div', {}, ...bs.map((b) => el('div.cx-row', {}, el('span', { text: `${b.valence > 0 ? '☀' : '☾'} ${beliefText(b.omen, b.luck)}` }))));
}

export function placesPage(s: WorldState, fly: (p: Vec2) => void): HTMLElement {
  const ps = placesOf(s);
  if (!ps.length) return el('div.sub', { text: t('codex.noPlaces') });
  return el('div', {}, ...ps.map((p) => el('div.cx-row', {},
    el('span', { text: placeName(p, getLang()) }),
    el('button.btn', { text: t('prayers.go'), onclick: () => fly(p.pos) }))));
}

/** The bin an allele falls in, and its label: 15° of hue, a tenth of a range, or the value itself. */
function bins(def: LocusDef): number {
  return def.kind === 'hue' ? 24 : def.kind === 'discrete' || def.kind === 'recessive' ? def.max - def.min + 1 : 10;
}
function binOf(def: LocusDef, v: number): number {
  if (def.kind === 'hue') return Math.floor((((v % 360) + 360) % 360) / 15);
  if (def.kind === 'discrete' || def.kind === 'recessive') return Math.round(v) - def.min;
  return Math.min(9, Math.max(0, Math.floor(((v - def.min) / (def.max - def.min)) * 10)));
}
const binColor = (def: LocusDef, b: number, n: number): string => def.kind === 'hue' ? hslCss({ h: b * 15 + 7.5, s: 0.75, l: 0.55 }) : hslCss({ h: 210 - (185 * b) / Math.max(1, n - 1), s: 0.6, l: 0.55 });

/** Genes: each locus a strip of its alleles among the living (wider = commoner), and a hue wheel of the living. */
export function geneticsPage(s: WorldState): HTMLElement {
  const gs = s.goblins;
  if (!gs.length) return el('div.sub', { text: t('codex.nobody') });
  const strips = (LOCUS_DEFS as readonly LocusDef[]).map((def) => {
    const n = bins(def), count = new Array<number>(n).fill(0);
    for (const g of gs) { count[binOf(def, g.genome[def.key].a)]!++; count[binOf(def, g.genome[def.key].b)]!++; }
    const seen = count.filter((c) => c > 0).length;
    const strip = el('div.cx-strip', {}, ...count.map((c, b) => c ? el('span', { style: `flex:${c};background:${binColor(def, b, n)}`, 'data-tip': `${Math.round((c / (2 * gs.length)) * 100)} %` }) : null));
    const carriers = def.kind === 'recessive' ? gs.filter((g) => g.genome[def.key].a + g.genome[def.key].b === 1).length : 0;
    return el('div.cx-gene', {}, el('div.cx-row', {}, el('span', { text: t(`locus.${def.key}`) === `locus.${def.key}` ? def.label : t(`locus.${def.key}`) }),
      el('span.sub', { text: def.kind === 'recessive' ? t('codex.carriers', { n: carriers }) : t('codex.alleles', { n: seen }) })), strip);
  });
  return el('div', {}, el('div.sub', { text: t('codex.genesNote', { n: gs.length }) }), hueWheel(s), ...strips);
}

function hueWheel(s: WorldState): HTMLCanvasElement {
  const cv = el('canvas', { width: 220, height: 220, style: 'display:block;margin:6px auto' }) as HTMLCanvasElement;
  const c = cv.getContext('2d');
  if (!c) return cv;
  const R = 96, cx = 110, cy = 110;
  for (let h = 0; h < 360; h += 3) {
    c.beginPath(); c.strokeStyle = hslCss({ h, s: 0.5, l: 0.8 }); c.lineWidth = 10;
    c.arc(cx, cy, R, ((h - 90) * Math.PI) / 180, ((h - 87) * Math.PI) / 180); c.stroke();
  }
  s.goblins.forEach((g, i) => {
    const h = express(g.genome, 'skinHue'), r = R - 16 - (i % 5) * 9, a = ((h - 90) * Math.PI) / 180;
    c.beginPath(); c.fillStyle = hslCss({ h, s: express(g.genome, 'skinSat'), l: express(g.genome, 'skinLight') });
    c.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 5, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 1; c.stroke();
  });
  return cv;
}

/** Divine deeds (§17.10): earned ones with when and how, the rest locked with what earns them. */
export function deedsPage(): HTMLElement {
  const d = deeds();
  return el('div.cx-deeds', {}, ...DEED_IDS.map((id) => {
    const e = d[id];
    return el(`div.cx-deed${e ? '' : '.cx-locked'}`, {},
      el('div.cx-badge', { text: DEED_ICON[id] }),
      el('div', {}, el('b', { text: t(`deed.${id}`) }),
        el('div.sub', { text: e ? `${e.how ? e.how + ' · ' : ''}${new Date(e.at).toLocaleDateString()}` : t(`deed.${id}.goal`) })));
  }));
}
