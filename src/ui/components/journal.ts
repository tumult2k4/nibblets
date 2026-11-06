import { el } from '../dom';
import { tipKey } from './tooltip';
import { keyLabel } from '../keys';
import { t, getLang } from '../i18n';
import type { Ctx, Component } from '../ctx';
import { CFG } from '../../sim/config';
import { clockAt } from '../../sim/time';
import { ageDays } from '../../sim/goblin/goblin';
import { phenotypeOf } from '../../sim/goblin/genetics/phenotype';
import { portraits } from '../../render/portraits';
import { journalsOf } from '../../llm/store';
import { colorWord, nameOf, sizeWord } from '../../llm/describe';
import { withEpithet } from '../notifyCulture';
import type { ID, JournalEntry } from '../../shared/types';
import type { WorldState } from '../../sim/state';

type Tab = NonNullable<import('../store').UIState['journalTab']>;
const TABS: Tab[] = ['diary', 'book', 'eulogy', 'chronicle'];

/**
 * The journal (J, §19.7, P9.4): a book. Diaries: the left page shows the goblin (portrait, name and epithet, age,
 * size and color in words), the right page its entries by day, newest first, in ink of its own skin color. The other
 * tabs list the village's books, eulogies and the chronicle (P9.5), each with its title and who wrote or spoke it.
 * Text the Mock wrote is marked.
 */
export class Journal implements Component {
  private root = el('div.journal.panel.hidden');
  private tabs = el('div.tabs');
  private left = el('div.jpage.left');
  private right = el('div.jpage.right');
  private pick = el('select') as HTMLSelectElement;
  private sig = '';

  constructor(private ctx: Ctx) {}

  mount(parent: HTMLElement): void {
    const close = el('button.btn.iconbtn', { 'data-tip': tipKey(t('insp.close'), keyLabel('journal')), onclick: () => this.set({ openPanels: { ...this.ctx.store.state.openPanels, journal: false } }) }, '✕');
    this.pick.onchange = () => this.set({ journalFocus: Number(this.pick.value) });
    this.root.append(el('div.vp-head', {}, el('h2', { text: t('journal.title') }), this.tabs, close), el('div.jbook', {}, this.left, this.right));
    parent.append(this.root);
  }

  private set(p: Partial<import('../store').UIState>): void {
    this.ctx.store.set(p);
  }

  update(): void {
    const st = this.ctx.store.state, open = !!st.openPanels.journal;
    this.root.classList.toggle('hidden', !open);
    if (!open) return;
    const s = this.ctx.game.world.s, tab = st.journalTab ?? 'diary';
    const writers = [...new Set(journalsOf(s, null, 'diary').map((j) => j.goblinId!))];
    const focus = st.journalFocus ?? writers[writers.length - 1] ?? s.goblins[0]?.id ?? null;
    const sig = `${tab}:${focus}:${s.llm.journals.length}:${s.llm.journals[s.llm.journals.length - 1]?.tick}:${st.settings.language}`;
    if (sig === this.sig) return;
    this.sig = sig;
    this.tabs.replaceChildren(...TABS.map((k) => el(`button.btn${k === tab ? '.on' : ''}`, { onclick: () => this.set({ journalTab: k }) }, t(`journal.${k}`))));
    if (tab === 'diary') this.diaries(s, focus, writers);
    else this.others(s, tab);
  }

  private diaries(s: WorldState, focus: ID | null, writers: ID[]): void {
    const ids = focus !== null && !writers.includes(focus) ? [...writers, focus] : writers;
    this.pick.replaceChildren(...ids.map((id) => el('option', { value: String(id), text: nameOf(s, id) ?? '?', ...(id === focus ? { selected: 'selected' } : {}) })));
    if (focus === null) { this.left.replaceChildren(); this.right.replaceChildren(el('p.sub', { text: t('journal.none') })); return; }
    const g = s.goblins.find((x) => x.id === focus), line = s.lineage[focus], lang = getLang();
    const hue = g ? phenotypeOf({ genome: g.genome, ageDays: ageDays(g, s.tick), stage: g.lifeStage, hunger: 70, scars: g.health.scars }).skinColor : null;
    const ink = hue ? `hsl(${Math.round(hue.h)} ${Math.round(Math.min(0.6, hue.s) * 100)}% 28%)` : `hsl(${Math.round(line?.hue ?? 30)} 30% 28%)`;
    this.root.style.setProperty('--ink-accent', ink);
    const name = g ? withEpithet(g.name, g.epithet) : line?.name ?? '?';
    const bio = g && hue
      ? t('journal.bio', { stage: t(`stage.${g.lifeStage}`), age: Math.floor(ageDays(g, s.tick) / CFG.time.daysPerSeason), size: sizeWord(phenotypeOf({ genome: g.genome, ageDays: ageDays(g, s.tick), stage: g.lifeStage, hunger: 70, scars: 0 }).scale, lang), color: colorWord(hue.h, hue.l, lang) })
      : t('journal.dead');
    const img = g ? el('img.jportrait', { src: portraits.get(phenotypeOf({ genome: g.genome, ageDays: ageDays(g, s.tick), stage: g.lifeStage, hunger: 70, scars: g.health.scars }), g.id * 31 + 7), alt: g.name }) : el('div.jportrait.dead', { text: '☠' });
    this.left.replaceChildren(this.pick, img, el('h3', { text: name }), el('div.sub', { text: bio }));
    const es = journalsOf(s, focus, 'diary').reverse();
    this.right.replaceChildren(...(es.length ? es.map((e) => entry(e)) : [el('p.sub', { text: t('journal.noDiary', { name: nameOf(s, focus) ?? '?' }) })]));
  }

  private others(s: WorldState, kind: Tab): void {
    this.root.style.removeProperty('--ink-accent');
    const es = journalsOf(s, null, kind).reverse();
    this.left.replaceChildren(el('h3', { text: t(`journal.${kind}`) }), el('div.sub', { text: String(es.length) }));
    this.right.replaceChildren(...(es.length ? es.map((e) => entry(e, nameOf(s, e.by ?? e.goblinId))) : [el('p.sub', { text: t('journal.none') })]));
  }
}

function entry(e: JournalEntry, by?: string | null): HTMLElement {
  const c = clockAt(e.day * CFG.time.dayTicks);
  const head = `${e.title ? `${e.title} · ` : ''}${by ? `${by} · ` : ''}${t('journal.day', { d: c.seasonDay + 1, season: t(`season.${c.season}`) })}`;
  return el('div.jentry', {}, el('div.jday', {}, head, e.source === 'mock' ? el('span.jmock', { 'data-tip': t('journal.mock'), text: ' ✎' }) : null), el('p', { text: e.text }));
}
