/**
 * Voice panel (V, §18.7, P8.9): who the god speaks to (the selected goblins, or "All Nibblets"), what it costs and
 * which tier it needs in Divine mode, the Sign wheel, and the conversation log: the god's lines in gold with how they
 * were understood ("understood: gather wood · stern"), the goblins' replies with portraits, kept wishes with a
 * one-click Blessing. P9.7: in LLM mode a text box speaks in words (understood by the interpreter, or by the keyword
 * parser after 10 s; the sky dims while the heavens rumble; one utterance per 10 s) and the hearers' replies come from
 * the responder (a model or the Mock); with LLM mode off, signs only and template replies. The log is kept as an
 * annotation (`llm.voice`), outside the hashed state.
 */
import { el } from '../dom';
import { tipKey } from './tooltip';
import { keyLabel } from '../keys';
import { getLang, godTitle, t } from '../i18n';
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
import { llmSettings } from '../../llm/settings';
import type { Heard } from '../../llm/voice';
import { VoiceFx } from '../voiceFx';
import { audio } from '../audio';

const KEEP = 40, PAUSE_MS = 10_000;

export class VoicePanel implements Component {
  private root = el('div.voicepanel.panel.hidden');
  private head = el('div.sub');
  private actions = el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;margin:6px 0' });
  private log = el('div.vp-log');
  private all = false;
  private sig = '';
  private picking: { intent: WishIntent; tone: Tone } | null = null;
  /** P9.7: the text box, the words being understood, the last utterance's time */
  private input = el('input', { type: 'text', maxLength: 280, style: 'flex:1;min-width:0' }) as HTMLInputElement;
  private speakBtn = el('button.btn', { text: t('voice.speak') }) as HTMLButtonElement;
  private wordsHint = el('div.sub', { style: 'font-size:.8em' });
  private wordsRow = el('div', { style: 'display:flex;gap:6px;margin:4px 0' }, this.input, this.speakBtn);
  private pending = false;
  private lastWords = -Infinity;
  private heard: Heard | null = null;
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
    const close = el('button.btn.iconbtn', { 'data-tip': tipKey(t('insp.close'), keyLabel('voice')), onclick: () => this.toggle(false) }, '✕');
    this.speakBtn.onclick = () => this.speakWords();
    this.input.onkeydown = (e) => { if (e.key === 'Enter') this.speakWords(); };
    this.root.append(el('div.vp-head', {}, el('h2', { text: t('voice.title') }), close), this.head, this.actions, this.wordsRow, this.wordsHint, this.log);
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
  private costText(to: ID[] | 'all', source: 'sign' | 'voice' = 'sign'): string {
    const w = this.app.game.world, g = w.s.god;
    if (g.mode !== 'divine') return t('voice.free');
    const tier = speechTier(source, to);
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

  /** P9.7: words, understood by the interpreter (or the keywords) and pushed as the same command a sign is. */
  private speakWords(): void {
    const to = this.addressees(), text = this.input.value.trim(), now = performance.now();
    if (!to || !text || this.pending || this.app.readOnly() || !llmSettings().enabled) return;
    if (now - this.lastWords < PAUSE_MS) { this.app.toast(t('voice.wait', { n: Math.ceil((PAUSE_MS - now + this.lastWords) / 1000) }), 'info'); return; }
    this.lastWords = now;
    this.pending = true;
    this.sig = '';
    document.body.classList.add('rumbling');
    audio.play('sign_rumble');
    const g = this.app.input.hand.ground, cam = this.app.game.renderer.camera.target;
    const here = g ? { x: g.x, y: g.z } : { x: cam.x, y: cam.z };
    this.app.director.voice.speak(this.app.game.world, text, to, here, getLang(), (h) => {
      this.pending = false;
      this.sig = '';
      document.body.classList.remove('rumbling');
      this.input.value = '';
      this.heard = h;
      this.said = h.cmd.intents;
      this.app.push(h.cmd);
    });
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
    const words = e.source === 'voice' && this.heard?.cmd.textRef === e.textRef ? this.heard : null;
    this.heard = null;
    this.add({ tick: e.tick, goblinId: null, text: understood(intents, e.tone), tone: e.tone, intents: e.intents, who, ...(words ? { said: words.text, how: words.how } : {}) });
    const gs = e.addressees.map((id) => w.goblin(id)).filter((g) => !!g);
    const shaman = gs.find((g) => g.role === 'shaman');
    const rest = gs.filter((g) => g !== shaman).sort(() => Math.random() - 0.5);
    const speakers = [...(shaman ? [shaman] : []), ...rest].slice(0, gs.length > 1 ? 3 : 1);
    const god = godTitle(w.s) || t('voice.unnamed');
    if (llmSettings().enabled) { // P9.7: the responder (a model, or the Mock's lines)
      this.app.director.voice.reply(e, speakers, god, getLang(), (g, text, source, defied, i) => {
        this.fx.bubble(g.id, text, 300 + i * 700);
        this.add({ tick: e.tick, goblinId: g.id, text, defied, source });
      });
      return;
    }
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
        ...(l.said ? [el('div', { text: `“${l.said}”` })] : []),
        el('span.vp-chip', { text: t('voice.understood', { what: l.text }) + (l.how ? ` · ${t(`voice.how.${l.how}`)}` : '') }));
    const g = w.goblin(l.goblinId);
    const ph = g && phenotypeOf({ genome: g.genome, ageDays: ageDays(g, w.s.tick), stage: g.lifeStage, hunger: 70, scars: g.health.scars });
    const bless = l.intents && g && !this.app.readOnly() // a kept wish
      ? [el('button.btn', { text: t('ev.wish_bless'), onclick: () => this.app.push({ type: 'god_cast', power: 'blessing', pos: { ...g.pos }, targetId: g.id }) })] : [];
    return el(`div.vp-line${l.defied ? '.vp-defy' : ''}`, {},
      ...(ph && g ? [el('img.portrait', { src: portraits.get(ph, g.id * 31 + 7), alt: g.name })] : []),
      el('div', { style: 'flex:1' }, el('b', { text: g?.name ?? '?' }), el('div', { text: l.intents ? l.text : `“${l.text}”` }, l.source === 'mock' ? el('span.jmock', { 'data-tip': t('journal.mock'), text: ' ✎' }) : null)), ...bless);
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
    const words = llmSettings().enabled;
    const sig = `${to === 'all' ? 'all' : to?.join(',')}:${ls.length}:${ls[ls.length - 1]?.tick}:${this.costText(to ?? [])}:${this.app.store.state.settings.language}:${words}:${this.pending}`;
    if (sig === this.sig) return;
    this.sig = sig;
    this.head.textContent = this.pending ? t('voice.rumble') : to ? `${t('voice.to', { who: this.who(to) })} · ${this.costText(to)}` : t('voice.none');
    this.wordsRow.style.display = words ? 'flex' : 'none';
    this.input.placeholder = t('voice.placeholder', { god: godTitle(this.app.game.world.s) || t('voice.unnamed') });
    this.input.disabled = this.speakBtn.disabled = this.pending || !to || this.app.readOnly();
    this.speakBtn.textContent = t('voice.speak');
    this.wordsHint.textContent = words ? `${t('voice.wordsHint')}${to ? ` (${this.costText(to, 'voice')})` : ''}` : t('voice.wordsOff');
    this.actions.replaceChildren(
      el('button.btn', { onclick: () => this.openWheel(), ...(to && !this.app.readOnly() ? {} : { disabled: true }) }, `☸ ${t('voice.signs')}`),
      el(`button.btn${this.all ? '.on' : ''}`, { onclick: () => { this.all = !this.all; this.sig = ''; this.update(); } }, t('voice.pickAll')));
    this.log.replaceChildren(...(ls.length ? [...ls].reverse().map((l) => this.row(l)) : [el('div.sub', { text: t('voice.empty') })]));
  }
}
