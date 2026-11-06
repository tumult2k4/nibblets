/**
 * The village's written culture (§19.4, P9.5): a book's title and page when a goblin finishes writing one, the
 * eulogy the eldest goblin at the grave speaks when the dead is buried (from what the dead did lately, its epithet
 * and its family), the chronicle of each season the eldest writes on the first day of the next (the season's top
 * events, its numbers and lines from real diaries), and the village's own name once it has three huts. Answers go
 * into the journals (`world.llm`); the sim never reads them. P9.8: a believer's book may thank the god (a book that
 * speaks of the god earns the divine deed "A Book About You"), and the chronicle tells the god's season.
 */
import './mocksCulture';
import { CFG } from '../sim/config';
import { dist } from '../shared/math';
import { clockAt } from '../sim/time';
import { ageDays } from '../sim/goblin/goblin';
import { FACTS } from '../sim/knowledge';
import { RECIPES } from '../sim/recipes';
import { placesOf } from '../sim/places';
import type { ID, RecipeId, SimEvent, TextSource, Vec2 } from '../shared/types';
import type { Goblin, WorldState } from '../sim/state';
import { tIn, type Lang } from '../ui/i18n';
import type { EventLog, Logged } from './eventLog';
import { pickLines } from './eventCompactor';
import { acceptFor, godFacts, godNameIn, goblinContext, knownNames, mentionsGod, nameOf, relLabel } from './describe';
import { placeName } from './placeNames';
import { bookPrompt, chroniclePrompt, eulogyPrompt, villageNamePrompt } from './prompts';
import { clamp } from './sanitize';
import type { Scheduler } from './scheduler';
import { addJournal, journalsOf, llmOf } from './store';

const DAY = CFG.time.dayTicks, SEASON = CFG.time.daysPerSeason, P = CFG.llm.products;
const HOMES = ['hut', 'stone_hut'], KIN = ['mate', 'parent', 'child', 'sibling'];
/** how the dead stood to a kinsman, from the kinsman's bond to the dead */
const FROM_DEAD: Record<string, string> = { parent: 'child', child: 'parent' };
const RANK: Record<string, number> = { elder: 3, adult: 2, youngling: 1 };
const PRIORITY = { book: 10, eulogy: 11, chronicle: 13, name: 14 };

export interface CultureHooks {
  world: () => WorldState;
  lang: () => Lang;
  /** the eulogy's first words, spoken at the grave */
  say?: (goblinId: ID, text: string, source: TextSource) => void;
  /** the village has named itself */
  named?: (name: string) => void;
  /** a divine deed (§17.10) earned: a goblin wrote a book that speaks of the god (P9.8) */
  deed?: (id: 'book_about_you', note: { name: string; title: string }) => void;
}

const range = (from: number, to: number): number[] => Array.from({ length: Math.max(0, to - from) }, (_, i) => from + i);
const listOf = (xs: readonly string[], lang: Lang): string => (xs.length < 2 ? xs[0] ?? '' : `${xs.slice(0, -1).join(', ')} ${tIn(lang, 'cx.and')} ${xs[xs.length - 1]}`);
const firstSentence = (t: string): string => clamp(/^[^.!?]*[.!?]/.exec(t)?.[0] ?? t, 160);

/** A book's content as its writer would put it: "Club: 2 wood and stone", or "that redcaps are poison". */
export function contentLine(id: string, lang: Lang): string {
  if ((FACTS as readonly string[]).includes(id)) return tIn(lang, 'cx.know', { fact: tIn(lang, `fact.${id}`) });
  const ins = Object.entries(RECIPES[id as RecipeId]?.inputs ?? {}).map(([t, n]) => {
    const w = tIn(lang, `item.${t}`), word = lang === 'en' ? w.toLowerCase() : w;
    return n && n > 1 ? `${n} ${word}` : word;
  });
  return `${tIn(lang, `recipe.${id}`)}: ${ins.length ? listOf(ins, lang) : tIn(lang, 'cx.noInputs')}`;
}

/** "Title: How to Make Things\n…" → the title (or null) and the page. */
export function splitBook(text: string): { title: string | null; text: string } {
  const ls = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const m = /^(?:title|titel)\s*:\s*(.+)$/i.exec(ls[0] ?? '');
  const title = m ? clamp(m[1]!.replace(/^["'“„«»]+|["'“”»«.]+$/g, '').trim(), P.titleChars) : '';
  return { title: title || null, text: (m ? ls.slice(1) : ls).join(' ') };
}

/** An answer to "name the village" (or the god, P9.7): one to `words` words of letters, at most `chars` characters, not a goblin's name. */
export function villageNameOf(t: string, known: readonly string[], words = 3, chars: number = P.nameChars): string | null {
  const first = (t.split('\n').map((l) => l.trim()).find(Boolean) ?? '').replace(/^(?:name|village|dorf)\s*:\s*/i, '')
    .replace(/^["'“„«»*_]+|["'“”»«.!*_]+$/g, '').trim();
  if (!first || first.length > chars || first.split(/\s+/).length > words || !/^\p{L}[\p{L}'’ -]*$/u.test(first)) return null;
  const name = first.charAt(0).toUpperCase() + first.slice(1);
  return known.some((n) => n.toLowerCase() === name.toLowerCase()) ? null : name;
}

/** Who speaks for the village: the eldest goblin old enough, those within `mournRange` of `at` first. */
export function eldest(s: WorldState, at?: Vec2): Goblin | null {
  const near = (g: Goblin): number => (at && dist(g.pos, at) <= P.mournRange ? 1 : 0);
  return s.goblins.filter((g) => RANK[g.lifeStage]).sort((a, b) => near(b) - near(a) || RANK[b.lifeStage]! - RANK[a.lifeStage]!
    || ageDays(b, s.tick) - ageDays(a, s.tick) || a.id - b.id)[0] ?? null;
}

export class CultureWriter {
  constructor(private readonly log: EventLog, private readonly sched: Scheduler, private readonly h: CultureHooks) {}

  onEvent(s: WorldState, e: SimEvent): void {
    if (e.type === 'book_written') this.book(s, e);
    else if (e.type === 'buried') this.eulogy(s, e);
    else if (e.type === 'day_started' && e.day > 0 && e.day % SEASON === 0) this.chronicle(s, e.day);
    else if (e.type === 'building_completed' && HOMES.includes(e.kind)) this.villageName(s);
  }

  private book(s: WorldState, e: Extract<SimEvent, { type: 'book_written' }>): void {
    const g = s.goblins.find((x) => x.id === e.goblinId);
    if (!g) return;
    const lang = this.h.lang(), req = bookPrompt(goblinContext(s, g, lang), e.contents.map((id) => contentLine(id, lang)), lang, godFacts(s, g, lang));
    const clean = acceptFor(s, req, P.bookChars, true);
    this.sched.enqueue({
      key: `book:${e.bookId}`, product: 'book', priority: PRIORITY.book, req,
      accept: (t) => { const c = clean(t); return c && splitBook(c).text ? c : null; },
      done: (text, source) => {
        const w = this.h.world(), b = splitBook(text), title = b.title ?? tIn(lang, 'journal.untitled', { name: g.name });
        addJournal(w, { kind: 'book', goblinId: g.id, day: Math.floor(e.tick / DAY), tick: w.tick, text: b.text, title, source, ref: e.bookId });
        if (mentionsGod(`${title}\n${b.text}`, godNameIn(w, lang))) this.h.deed?.('book_about_you', { name: g.name, title });
      },
    });
  }

  private eulogy(s: WorldState, e: Extract<SimEvent, { type: 'buried' }>): void {
    const gr = s.graves.find((x) => x.id === e.graveId), sp = gr && eldest(s, gr.pos);
    if (!gr || !sp) return;
    const lang = this.h.lang(), day = Math.floor(e.tick / DAY), dead = gr.goblinId;
    const deeds = pickLines(s, this.log, sp, range(day - P.memoryDays, day + 1), 4, lang,
      (l: Logged) => l.who.includes(dead) && !['goblin_died', 'buried', 'mourned'].includes(l.e.type), false);
    const family = s.goblins.flatMap((o) => {
      const r = o.relationships.find((x) => x.targetId === dead && KIN.includes(x.bond));
      return r ? [`${o.name} (${tIn(lang, `cx.rel.${FROM_DEAD[r.bond] ?? r.bond}`)})`] : [];
    }).slice(0, 4);
    const req = eulogyPrompt(goblinContext(s, sp, lang), {
      dead: gr.name, epithet: gr.epithet ? tIn(lang, `epithet.${gr.epithet}`, { name: gr.name }) : '', age: Math.floor((gr.tick - gr.born) / DAY / SEASON),
      cause: tIn(lang, `cause.${gr.cause}`), family: family.join(', '), deeds, rel: relLabel(sp, dead, lang),
    }, lang);
    const near = dist(sp.pos, gr.pos) <= P.mournRange;
    this.sched.enqueue({
      key: `eulogy:${gr.id}`, product: 'eulogy', priority: PRIORITY.eulogy, req, accept: acceptFor(s, req, P.eulogyChars),
      done: (text, source) => {
        const w = this.h.world();
        addJournal(w, { kind: 'eulogy', goblinId: dead, by: sp.id, day, tick: w.tick, text, title: gr.name, source, ref: gr.id });
        if (near) this.h.say?.(sp.id, firstSentence(text), source);
      },
    });
  }

  private chronicle(s: WorldState, day: number): void {
    const c = eldest(s);
    if (!c) return;
    const lang = this.h.lang(), from = day - SEASON, days = range(from, day), clock = clockAt(from * DAY);
    const logged = days.flatMap((d) => this.log.of(d)), count = (f: (l: Logged) => boolean): number => logged.filter(f).length;
    const hatched = count((l) => l.e.type === 'egg_hatched'), died = count((l) => l.e.type === 'goblin_died');
    const end = s.goblins.length, before = [...s.stats.samples].reverse().find((x) => x.tick <= from * DAY);
    const start = before?.pop ?? Math.max(0, end - hatched + died);
    const diaries = journalsOf(s, null, 'diary').filter((j) => j.source === 'llm' && j.day >= from && j.day < day).slice(-3)
      .map((j) => `${nameOf(s, j.goblinId) ?? '?'}: ${firstSentence(j.text)}`);
    const season = tIn(lang, `season.${clock.season}`), village = llmOf(s).villageName?.name ?? s.village.name;
    const spoke = logged.flatMap((l) => (l.e.type === 'god_spoke' ? [l.e] : []));
    const god = {
      name: godNameIn(s, lang), acts: count((l) => l.e.type === 'divine_act'), prayers: count((l) => l.e.type === 'prayer'),
      answered: count((l) => l.e.type === 'prayer_answered'), spoke: spoke.length,
      words: spoke.flatMap((e) => (e.textRef ? [llmOf(s).speechText[e.textRef] ?? ''] : [])).filter(Boolean).slice(-2).map((t) => clamp(t, 120)),
    };
    const req = chroniclePrompt(goblinContext(s, c, lang), {
      village, season, year: clock.year, pop: [start, end], hatched, died,
      built: count((l) => l.e.type === 'building_completed'), learned: count((l) => l.e.type === 'recipe_discovered' && l.e.via === 'discovery'),
      events: pickLines(s, this.log, c, days, 6, lang, (l) => l.e.type !== 'chat'), diaries, god,
    }, lang);
    this.sched.enqueue({
      key: `chronicle:${from}`, product: 'chronicle', priority: PRIORITY.chronicle, req, accept: acceptFor(s, req, P.chronicleChars),
      done: (text, source) => {
        const w = this.h.world();
        addJournal(w, { kind: 'chronicle', goblinId: null, by: c.id, day: day - 1, tick: w.tick, text, title: tIn(lang, 'journal.chronTitle', { season, year: clock.year }), source });
      },
    });
  }

  private villageName(s: WorldState): void {
    const huts = s.buildings.filter((b) => HOMES.includes(b.type) && b.buildProgress >= 1).length;
    if (llmOf(s).villageName || huts < 3) return;
    const lang = this.h.lang(), at = s.village.center;
    const places = [...placesOf(s)].sort((a, b) => dist(a.pos, at) - dist(b.pos, at)).map((p) => placeName(p, lang));
    const req = villageNamePrompt(places, nameOf(s, s.village.chiefId) ?? tIn(lang, 'cx.nochief'), huts, lang), known = knownNames(s);
    this.sched.enqueue({
      key: 'village_name', product: 'village_name', priority: PRIORITY.name, req, accept: (t) => villageNameOf(t, known),
      done: (name, source) => {
        const l = llmOf(this.h.world());
        if (l.villageName) return;
        l.villageName = { name, source, tick: this.h.world().tick };
        this.h.named?.(name);
      },
    });
  }
}
