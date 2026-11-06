/**
 * Scripted gods for the balance runner (P8.9): `--god absent|kind|benevolent|stern|wrathful` plays a Divine-mode
 * world the way such a god would, through the same commands the UI sends, once an in-game hour (and spends favor as
 * it earns it).
 *  - absent: never acts (faith should fall to the piety floors).
 *  - benevolent: the kind god who also lays out apples every morning (dependence, §17.5).
 *  - kind: answers the most pressing prayer it can, blesses the saddest goblin each morning, feeds a famine,
 *    and now and then signs "worship" or "gather food" to the faithful; lightning only at Gnashers.
 *  - stern: answers only prayers in despair, keeps the village at work with stern signs (gather, build), smites
 *    Gnashers near the village.
 *  - wrathful: answers only revenge and protection, curses the mischievous, throws lightning a few strides from goblins as a show, and
 *    commands worship in a wrathful voice.
 */
import { Rng } from '../src/shared/rng';
import { CFG } from '../src/sim/config';
import { dist } from '../src/shared/math';
import type { Command } from '../src/sim/commands';
import type { World } from '../src/sim/world';
import type { Goblin } from '../src/sim/state';
import type { ParsedIntent, Tone } from '../src/shared/types';
import { answerFor } from '../src/sim/god/answer';
import { openPrayers } from '../src/sim/god/prayers';
import { foodStores } from '../src/sim/spoilage';
import { validate } from '../src/sim/commands';

export type GodProfile = 'absent' | 'kind' | 'benevolent' | 'stern' | 'wrathful';
export const GOD_PROFILES: readonly GodProfile[] = ['absent', 'kind', 'benevolent', 'stern', 'wrathful'];

const HOUR = CFG.god.hourTicks, DAY = CFG.time.dayTicks;

export function godPlayer(w: World, profile: GodProfile, seed: number): () => void {
  const rng = new Rng(seed * 7717 + 11);
  const tryCmd = (c: Command): boolean => {
    if (validate(w, c) !== null) return false;
    w.push(c);
    return true;
  };
  const say = (to: number[] | 'all', intents: ParsedIntent[], tone: Tone): boolean =>
    tryCmd({ type: 'divine_speech', addressees: to, tone, intents, isQuestion: false, source: 'sign' });
  const faithful = (): Goblin[] => w.s.goblins.filter((g) => g.godView.faith >= CFG.god.believerFaith && g.lifeStage !== 'hatchling');
  const answer = (only?: (desperate: boolean, kind: string) => boolean): boolean => {
    const ps = openPrayers(w).filter((p) => p.kind !== 'thanks' && (!only || only(!!p.desperate, p.kind)));
    ps.sort((a, b) => Number(!!b.desperate) - Number(!!a.desperate) || a.expiresTick - b.expiresTick);
    for (const p of ps.slice(0, 4)) {
      const c = answerFor(w, p);
      if (c && tryCmd(c)) return true;
    }
    return false;
  };
  const smiteNear = (r: number): boolean => {
    const e = w.s.enemies.find((x) => dist(x.pos, w.s.village.center) < r && !w.s.goblins.some((g) => dist(g.pos, x.pos) < 2));
    return !!e && tryCmd({ type: 'god_cast', power: 'lightning', pos: { x: e.pos.x, y: e.pos.y } });
  };
  return () => {
    const s = w.s;
    if (profile === 'absent' || s.tick % HOUR !== 0 || !s.goblins.length) return;
    const hour = Math.floor((s.tick % DAY) / HOUR);
    const famine = foodStores(s).days < 1 && s.goblins.some((g) => g.needs.hunger < 30);
    if (profile === 'kind' || profile === 'benevolent') {
      if (profile === 'benevolent' && hour === 6) {
        const p = s.village.stockpilePos, n = Math.min(12, s.goblins.length);
        if (tryCmd({ type: 'god_spawn_item', item: 'apple', qty: n, pos: { x: p.x + rng.range(-2, 2), y: p.y + rng.range(-2, 2) } })) return;
      }
      if (answer()) return;
      if (famine && (tryCmd({ type: 'god_cast', power: 'apple_shower', pos: { ...s.village.stockpilePos }, radius: 4 })
        || tryCmd({ type: 'god_spawn_item', item: 'apple', qty: 6, pos: { ...s.village.stockpilePos } }))) return;
      if (hour === 7) {
        const sad = [...s.goblins].sort((a, b) => a.mood.value - b.mood.value)[0]!;
        if (s.god.favor > 40 && tryCmd({ type: 'god_cast', power: 'blessing', pos: { ...sad.pos }, targetId: sad.id })) return;
      }
      if (hour === 9 && rng.chance(0.4) && s.god.favor > 30) {
        const fs = faithful();
        if (fs.length) say([rng.pick(fs).id], [rng.chance(0.5) ? { intent: 'worship' } : { intent: 'gather', target: { kind: 'item', value: 'apple' } }], 'kind');
      }
      smiteNear(10);
      return;
    }
    if (profile === 'stern') {
      if (smiteNear(14)) return;
      if (answer((d) => d)) return;
      if (hour === 8 && s.god.favor > 25) {
        const fs = faithful();
        if (fs.length) say([rng.pick(fs).id], [rng.chance(0.5) ? { intent: 'gather', target: { kind: 'item', value: 'wood' } } : { intent: 'build' }], 'stern');
      }
      return;
    }
    // wrathful
    if (answer((_, kind) => kind === 'revenge' || kind === 'protection')) return; // smiting, never giving
    if (hour === 12 && s.god.favor > 30) {
      const g = rng.pick(s.goblins);
      const a = rng.range(0, Math.PI * 2);
      const at = { x: g.pos.x + Math.cos(a) * 7, y: g.pos.y + Math.sin(a) * 7 };
      if (!s.goblins.some((o) => dist(o.pos, at) < 5) && tryCmd({ type: 'god_cast', power: 'lightning', pos: at })) return;
    }
    if (hour === 15 && s.god.favor > 40) {
      const imp = [...s.goblins].sort((a, b) => b.personality.mischief - a.personality.mischief)[0]!;
      if (rng.chance(0.4) && tryCmd({ type: 'god_cast', power: 'curse', pos: { ...imp.pos }, targetId: imp.id })) return;
    }
    if (hour === 18 && rng.chance(0.3)) {
      if (!say('all', [{ intent: 'worship' }], 'wrathful')) {
        const fs = faithful();
        if (fs.length) say([rng.pick(fs).id], [{ intent: 'worship' }], 'wrathful');
      }
    }
    smiteNear(8);
  };
}
