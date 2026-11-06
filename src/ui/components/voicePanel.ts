/**
 * Voice panel (V, §18.7, P8.9): who the god speaks to (the selected goblins, or "All Nibblets"), what it costs and
 * which tier it needs in Divine mode, the Sign wheel, and the conversation log: the god's lines in gold with how they
 * were understood ("understood: gather wood · stern"), the goblins' replies with portraits, kept wishes with a
 * one-click Blessing. Replies are mock lines (§17.7.2) until the Voice gets its language model (P9.7). The log is
 * kept as an annotation (`llm.voice`), outside the hashed state.
 */
import { el } from '../dom';
import { godNameText, t } from '../i18n';
import type { App } from '../app';
import type { Component } from '../ctx';
import type { ID, ParsedIntent, SimEvent, Tone, VoiceLine, WishIntent } from '../../shared/types';
import { ageDays } from '../../sim/goblin/goblin';
import { phenotypeOf } from '../../sim/goblin/genetics/phenotype';
import { portraits } from '../../render/portraits';
import { speechCost, speechTier } from '../../sim/god/tiers';
import { wishBuildings } from '../../sim/god/speech';
import { SignWheel, INTENT_GLYPH } from './signWheel';
import { mockReply, stanceOf, understood } from '../mockReplies';
import { VoiceFx } from '../voiceFx';
import { audio } from '../audio';

const KEEP = 40;

export class VoicePanel implements Component {
  private root = el('div.voicepanel.panel.hidden');
  private head = el('div.sub');
  private actions = el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;margin:6px 0' });
  private log = el('div.vp-log');
  private all = false;
  private sig = '';
  private picking: { intent: WishIntent; tone: Tone } | null = null;
  /** what the god last said, so its line can show how it was understood */
  private said: ParsedIntent[] = [];
  readonly wheel: SignWheel;
  readonly fx: VoiceFx;

  constructor(private app: App) {
    this.wheel = new SignWheel({
      send: (intents, tone) => this.say(intents, tone),
      pickSpot: (intent, tone) => this.pick(intent, tone),
      buildings: () => wishBuildings(this.app.game.world),
    });
    this.fx = new VoiceFx(app);
  }

  mount(parent: HTMLElement): void {
    const close = el('button.btn.iconbtn', { onclick: () => this.toggle(false) }, '✕');
    this.root.append(el('div.vp-head', {}, el('h2', { text: t('voice.title') }), close), this.head, this.actions,
      el('div.sub', { text: t('voice.wordsLater'), style: 'font-size:.8em' }), this.log);
    parent.append(this.root);
    this.wheel.mount(parent);
  }
  destroy(): void {
    this.fx.clear();
    this.wheel.root.remove();
  }

  toggle(open = !this.app.store.state.openPanels.voice): void {
    this.app.store.set({ openPanels: { ...this.app.store.state.openPanels, voice: open } });
  }
  private wasOpen = false;

  /** The selected goblins, everyone, or null (no one to speak to). */
  private addressees(): ID[] | 'all' | null {
    if (this.all) return 'all';
    const st = this.app.store.state, w = this.app.game.world;
    const ids = st.selectedKind === 'goblin' ? st.selection.filter((id) => w.goblin(id)) : [];
    return ids.length ? ids : null;
  }
  private who(to: ID[] | 'all'): string {
    if (to === 'all') return t('voice.all');
    return to.length === 1 ? this.app.game.world.goblin(to[0]!)?.name ?? '?' : t('voice.toMany', { n: to.length });
  }
  /** "5 favor", "free", or "needs tier 2". */
  private costText(to: ID[] | 'all'): string {
    const w = this.app.game.world, g = w.s.god;
    if (g.mode !== 'divine') return t('voice.free');
    const tier = speechTier('sign', to);
    return g.tier < tier ? t('voice.locked', { n: tier }) : t('voice.cost', { n: Math.round(speechCost(w, to)) });
  }

  private openWheel(): void {
    const to = this.addressees();
    if (!to || this.app.readOnly()) return;
    this.wheel.open(t('voice.to', { who: this.who(to) }), this.costText(to));
  }

  private say(intents: ParsedIntent[], tone: Tone): void {
    const to = this.addressees();
    if (!to) return;
    this.said = intents;
    audio.play('sign_rumble');
    this.app.push({ type: 'divine_speech', addressees: to, tone, intents, isQuestion: false, source: 'sign' });
  }

  /** come here / keep away: the next click on the ground says where. */
  private pick(intent: WishIntent, tone: Tone): void {
    this.picking = { intent, tone };
    this.app.toast(t('sign.where'), 'info');
    const canvas = this.app.canvas;
    const done = () => {
      canvas.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
      this.picking = null;
    };
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || !this.picking) return;
      e.stopPropagation();
      e.preventDefault();
      const g = this.app.input.hand.ground, p = this.picking;
      done();
      if (g) this.say([{ intent: p.intent, target: { kind: 'pos', value: 0, pos: { x: g.x, y: g.z } } }], p.tone);
    };
    const onKey = (e: KeyboardEvent) => { if (e.code === 'Escape') { e.stopPropagation(); done(); } };
    canvas.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
  }

  private lines(): VoiceLine[] {
    const llm = this.app.game.world.s.llm;
    return (llm.voice ??= []);
  }
  private add(l: VoiceLine): void {
    const ls = this.lines();
    ls.push(l);
    if (ls.length > KEEP) ls.splice(0, ls.length - KEEP);
    this.sig = '';
  }

  /** The god spoke (sim event): the sign in the sky, the line in the log, and a few replies. */
  spoke(e: Extract<SimEvent, { type: 'god_spoke' }>): void {
    const w = this.app.game.world;
    const intents: ParsedIntent[] = this.said.length && this.said.map((x) => x.intent).join() === e.intents.join() ? this.said : e.intents.map((intent) => ({ intent }));
    this.said = [];
    this.fx.sign(e.intents.map((x) => INTENT_GLYPH[x]).join('') || '✧', e.addressees);
    const who = e.addressees.length === w.s.goblins.length && e.addressees.length > 1 ? t('voice.all') : this.who(e.addressees);
    this.add({ tick: e.tick, goblinId: null, text: understood(intents, e.tone), tone: e.tone, intents: e.intents, who });
    const gs = e.addressees.map((id) => w.goblin(id)).filter((g) => !!g);
    const shaman = gs.find((g) => g.role === 'shaman');
    const rest = gs.filter((g) => g !== shaman).sort(() => Math.random() - 0.5);
    const speakers = [...(shaman ? [shaman] : []), ...rest].slice(0, gs.length > 1 ? 3 : 1);
    const god = godNameText(w.s.god.godName) || t('voice.god');
    speakers.forEach((g, i) => {
      const stance = stanceOf(g, e.tick, e.intents.length);
      const text = mockReply(g, stance, e.tone, god);
      this.fx.bubble(g.id, text, 500 + i * 700);
      this.add({ tick: e.tick, goblinId: g.id, text, defied: stance === 'defy' });
    });
  }

  /** A wish was kept: a line with a Blessing at hand. */
  kept(e: { tick: number; goblinId: ID; intent: WishIntent }): void {
    const g = this.app.game.world.goblin(e.goblinId);
    if (g) this.add({ tick: e.tick, goblinId: g.id, text: t('ev.wish_fulfilled', { name: g.name, what: t(`intent.${e.intent}`) }), intents: [e.intent] });
  }

  private row(l: VoiceLine): HTMLElement {
    const w = this.app.game.world;
    if (l.goblinId === null)
      return el('div.vp-line.vp-god', {}, el('div', { text: `${t('voice.god')} → ${l.who ?? ''}` }),
        el('span.vp-chip', { text: t('voice.understood', { what: l.text }) }));
    const g = w.goblin(l.goblinId);
    const ph = g && phenotypeOf({ genome: g.genome, ageDays: ageDays(g, w.s.tick), stage: g.lifeStage, hunger: 70, scars: g.health.scars });
    const bless = l.intents && g && !this.app.readOnly() // a kept wish
      ? [el('button.btn', { text: t('ev.wish_bless'), onclick: () => this.app.push({ type: 'god_cast', power: 'blessing', pos: { ...g.pos }, targetId: g.id }) })] : [];
    return el(`div.vp-line${l.defied ? '.vp-defy' : ''}`, {},
      ...(ph && g ? [el('img.portrait', { src: portraits.get(ph, g.id * 31 + 7), alt: g.name })] : []),
      el('div', { style: 'flex:1' }, el('b', { text: g?.name ?? '?' }), el('div', { text: l.intents ? l.text : `“${l.text}”` })), ...bless);
  }

  frame(): void {
    this.fx.frame();
  }

  update(): void {
    const open = !!this.app.store.state.openPanels.voice;
    this.root.classList.toggle('hidden', !open);
    if (open !== this.wasOpen) { // opening with goblins chosen brings up the wheel at once
      this.wasOpen = open;
      if (!open) this.wheel.close();
      else if (this.addressees() !== null) this.openWheel();
    }
    if (!open) return;
    const to = this.addressees();
    const ls = this.lines();
    const sig = `${to === 'all' ? 'all' : to?.join(',')}:${ls.length}:${ls[ls.length - 1]?.tick}:${this.costText(to ?? [])}:${this.app.store.state.settings.language}`;
    if (sig === this.sig) return;
    this.sig = sig;
    this.head.textContent = to ? `${t('voice.to', { who: this.who(to) })} · ${this.costText(to)}` : t('voice.none');
    this.actions.replaceChildren(
      el('button.btn', { onclick: () => this.openWheel(), ...(to && !this.app.readOnly() ? {} : { disabled: true }) }, `☸ ${t('voice.signs')}`),
      el(`button.btn${this.all ? '.on' : ''}`, { onclick: () => { this.all = !this.all; this.sig = ''; this.update(); } }, t('voice.pickAll')));
    this.log.replaceChildren(...(ls.length ? [...ls].reverse().map((l) => this.row(l)) : [el('div.sub', { text: t('voice.empty') })]));
  }
}
