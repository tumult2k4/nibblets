/**
 * The soundscape: what the village sounds like from where the camera is. Sim events become one-shots and goblin
 * voices; what goblins are busy with (chopping, mining, singing, snoring…) taps along while they do it; the weather,
 * the time of day, fires, water and festivals set the ambience beds; and the music follows the occasion (peaceful
 * day or night, winter, a festival, mourning, under attack). Reads the world, never changes it.
 */
import { audio, type AudioEngine } from '../audio';
import type { BarkId, SfxId } from './manifest';
import type { ID, SimEvent } from '../../shared/types';
import type { ActionId } from '../../sim/state';
import { soundsFor, voiceOf, type Sound } from './eventSounds';
import type { World } from '../../sim/world';
import { isSleeping } from '../../sim/goblin/goblin';
import { weatherAt } from '../../sim/weather';
import { festivalNow } from '../../sim/festivals';
import { menaces } from '../../sim/enemies/common';
import { instrumentOf } from '../../sim/music';
import { isWaterAt } from '../../sim/grid';
import { dist } from '../../shared/math';

/** Sounds a goblin makes while it works or rests: the sound, every how many seconds. */
const BUSY: Partial<Record<ActionId, { s: SfxId | `bark:${BarkId}`; every: number }>> = {
  chop: { s: 'chop', every: 0.8 }, mine: { s: 'mine', every: 0.9 }, build: { s: 'hammer', every: 0.7 },
  repair_building: { s: 'hammer', every: 0.9 }, decorate: { s: 'hammer', every: 2.5 }, plan_building: { s: 'quill', every: 4 },
  craft: { s: 'craft', every: 1.6 }, process: { s: 'saw', every: 1.8 }, cook_stew: { s: 'stew', every: 2.2 },
  dig_clay: { s: 'clay', every: 1.4 }, plant_seed: { s: 'dig', every: 1.5 }, water_plant: { s: 'water_pour', every: 2.5 },
  forage: { s: 'rustle', every: 1.6 }, pick_flowers: { s: 'rustle', every: 2 }, cut_grass: { s: 'rustle', every: 1.2 },
  harvest_fruit: { s: 'rustle', every: 1.8 }, cull_blight: { s: 'rustle', every: 1.4 }, fish: { s: 'fish_cast', every: 7 },
  hunt: { s: 'sling', every: 5 }, pave_path: { s: 'pave', every: 1.4 }, tend_compost: { s: 'compost', every: 2 },
  spread_compost: { s: 'compost', every: 2 }, write_book: { s: 'quill', every: 2.5 }, read_book: { s: 'page_turn', every: 5 },
  dance: { s: 'dance', every: 1.6 }, join_festival: { s: 'dance', every: 3.5 }, brawl: { s: 'brawl', every: 1.6 },
  attack: { s: 'hit', every: 1.1 }, defend_village: { s: 'hit', every: 1.4 }, extinguish_fire: { s: 'fire_stomp', every: 1.2 },
  tend_fire: { s: 'fire_whoosh', every: 6 }, eat: { s: 'eat', every: 2.5 }, eat_core: { s: 'eat', every: 2.5 }, drink: { s: 'drink', every: 3 },
  haul_to_stockpile: { s: 'footstep', every: 1.4 }, store_item: { s: 'store', every: 3 },
  sleep_ground: { s: 'bark:snore', every: 7 }, sleep_home: { s: 'bark:snore', every: 8 }, rest_sick: { s: 'cough', every: 6 },
  pray: { s: 'bark:pray', every: 9 }, lead_prayer: { s: 'bark:pray', every: 7 }, make_offering: { s: 'bark:pray', every: 9 },
  chat: { s: 'bark:chatter', every: 4.5 }, teach: { s: 'bark:chatter', every: 5 }, learn: { s: 'bark:curious', every: 9 },
  court: { s: 'bark:giggle', every: 5 }, play: { s: 'bark:laugh', every: 5 }, sulk: { s: 'bark:angry', every: 9 },
  mourn: { s: 'bark:sad', every: 7 }, flee: { s: 'bark:scared', every: 3.5 }, escape_fire: { s: 'bark:scared', every: 3 },
  shake_fist: { s: 'bark:angry', every: 4 }, struggle: { s: 'bark:grab', every: 3 }, look_up: { s: 'bark:curious', every: 8 },
  greet_visitor: { s: 'bark:greet', every: 6 }, feed_child: { s: 'bark:baby', every: 7 }, prank: { s: 'bark:laugh', every: 6 },
  steal: { s: 'sneak', every: 6 }, wander: { s: 'footstep', every: 3 }, explore: { s: 'footstep', every: 2.5 },
  incubate_egg: { s: 'bark:sing', every: 14 }, comfort: { s: 'bark:chatter', every: 6 }, tend_sick: { s: 'heal', every: 6 },
};
/** Actions whose sound only plays once the goblin has got there (not while walking to the tree). */
const WALKING_OK = new Set<ActionId>(['haul_to_stockpile', 'wander', 'explore', 'flee', 'escape_fire', 'dance', 'join_festival', 'struggle']);

type Mood = 'title' | 'day' | 'night' | 'winter' | 'festival' | 'danger' | 'sorrow';

export class Soundscape {
  private next = new Map<ID, number>();
  private clock = 0;
  private scan = 0;
  private mood: Mood = 'title';
  private moodSince = 0;
  private dangerUntil = 0;
  private sorrowUntil = 0;
  private perFrame = 0;

  constructor(private readonly a: AudioEngine = audio) {}

  /** Sim events → one-shots and voices. `fast`: the game runs at 16× or more, so only the big moments sound. */
  onEvents(evs: SimEvent[], w: World, fast: boolean): void {
    for (const e of evs) {
      if (e.type === 'goblin_died') this.sorrowUntil = this.clock + 50;
      if (e.type === 'enemy_spotted' || e.type === 'enemy_bit' || e.type === 'clan_raid' || e.type === 'tower_warning' || (e.type === 'visitor_arrived' && e.kind === 'warrior'))
        this.dangerUntil = this.clock + 25;
      if (!this.a.ready) continue;
      for (const s of soundsFor(e, w)) this.emit(s, w, fast);
    }
  }

  private emit(s: Sound, w: World, fast: boolean): void {
    const gb = s.gid != null ? w.goblin(s.gid) : undefined;
    const at = s.at ?? gb?.pos;
    if (fast && at) return; // at speed only the unplaced (big, global) sounds
    if (++this.perFrame > 8) return;
    if ('bark' in s) {
      if (!gb) return;
      const v = voiceOf(gb);
      this.a.bark(v.voice, s.bark, { at: at ?? gb.pos, pitch: v.pitch, key: gb.id });
      return;
    }
    // a goblin's own effects follow its pitch a little (a small goblin's axe rings higher)
    const pitch = gb ? 1 + (voiceOf(gb).pitch - 1) * 0.35 : 1;
    this.a.play(s.sfx, { ...(at ? { at } : {}), pitch, ...(s.gain ? { gain: s.gain } : {}) });
  }

  /** Each frame: the ear follows the camera; busy goblins tap along; beds and music follow the world. */
  frame(dt: number, w: World | null, cam: { x: number; y: number; dist: number; yaw: number }, opts: { title: boolean; speed: number }): void {
    this.clock = performance.now() / 1000; // wall time: a slow frame rate must not stretch the music's moods
    this.perFrame = 0;
    const a = this.a;
    a.listener = cam;
    a.frame();
    if (!a.ctx) return;
    if (opts.title || !w) {
      for (const id of ['day', 'night', 'rain', 'storm', 'wind', 'heat', 'fog', 'fire', 'wildfire', 'water', 'crowd'] as const) a.setLoop(id, 0);
      this.setMood('title');
      return;
    }
    const here = { x: cam.x, y: cam.y };
    const zoomFade = Math.max(0.35, Math.min(1, 50 / Math.max(cam.dist, 1)));

    // ---- ambience ----
    const c = w.clock;
    const dayness = c.phase === 'day' ? 1 : c.phase === 'night' ? 0 : c.phase === 'dawn' ? 0.5 : 0.4;
    const wx = weatherAt(w, here);
    const winter = c.season === 'winter';
    const quiet = wx === 'storm' || wx === 'blizzard' ? 0.3 : wx === 'rain' || wx === 'snow' ? 0.6 : 1;
    a.setLoop('day', dayness * quiet * (winter ? 0.35 : 1));
    a.setLoop('night', (1 - dayness) * quiet * (winter ? 0.3 : 1));
    a.setLoop('rain', wx === 'rain' ? 0.9 : 0);
    a.setLoop('storm', wx === 'storm' ? 1 : 0);
    a.setLoop('wind', wx === 'blizzard' ? 1 : wx === 'snow' ? 0.45 : 0);
    a.setLoop('heat', wx === 'heatwave' && dayness > 0.4 ? 0.8 : 0);
    a.setLoop('fog', wx === 'fog' ? 0.8 : 0);
    let fire = Infinity;
    for (const b of w.s.buildings) if ((b.type === 'campfire' || b.type === 'hearth') && (b.fuel ?? 0) > 0) fire = Math.min(fire, dist(b.pos, here));
    a.setLoop('fire', fire < 14 ? (1 - fire / 14) * zoomFade : 0);
    let blaze = 0;
    for (const f of w.s.fires) { const d = dist({ x: f.x + 0.5, y: f.y + 0.5 }, here); if (d < 30) blaze = Math.max(blaze, (1 - d / 30) * f.intensity); }
    a.setLoop('wildfire', Math.min(1, blaze * 1.4));
    this.scan -= dt;
    if (this.scan <= 0) {
      this.scan = 1;
      let water = 0;
      for (let dy = -6; dy <= 6; dy += 3) for (let dx = -6; dx <= 6; dx += 3) if (isWaterAt(w.s, { x: here.x + dx, y: here.y + dy })) water++;
      a.setLoop('water', Math.min(1, water / 8) * zoomFade);
    }
    const fest = festivalNow(w);
    a.setLoop('crowd', fest ? Math.max(0, 1 - dist(fest.pos, here) / 30) * zoomFade : 0);

    // ---- music ----
    const center = w.s.village.center;
    const threat = w.s.enemies.some((e) => e.kind !== 'night_wisp' && menaces(e, center, 28));
    if (threat) this.dangerUntil = Math.max(this.dangerUntil, this.clock + 12);
    const mood: Mood = this.clock < this.dangerUntil ? 'danger'
      : this.clock < this.sorrowUntil ? 'sorrow'
      : fest ? 'festival'
      : winter ? 'winter'
      : dayness >= 0.5 ? 'day' : 'night';
    // calm moods hold a while before they change, so dusk does not flip the music back and forth
    if (this.mood === 'title' || mood === 'danger' || mood === 'sorrow' || mood === 'festival' || this.clock - this.moodSince > 25) this.setMood(mood);

    // ---- busy goblins ----
    if (opts.speed === 0 || opts.speed > 4) return;
    const r = a.hearing * Math.max(1, cam.dist / 34);
    for (const g of w.s.goblins) {
      if (Math.abs(g.pos.x - here.x) > r || Math.abs(g.pos.y - here.y) > r) continue;
      const act = g.activity.action;
      const rule = BUSY[act];
      if (!rule || g.heldByGod || g.airborne) continue;
      const moving = Math.hypot(g.velocity.x, g.velocity.y) > 0.01;
      if (moving && !WALKING_OK.has(act)) continue;
      if ((act === 'sleep_ground' || act === 'sleep_home') && !isSleeping(g)) continue;
      const due = this.next.get(g.id);
      const every = rule.every / Math.sqrt(Math.max(1, opts.speed));
      if (due === undefined) { this.next.set(g.id, this.clock + Math.random() * every); continue; }
      if (this.clock < due) continue;
      this.next.set(g.id, this.clock + every * (0.8 + Math.random() * 0.4));
      if (rule.s.startsWith('bark:')) this.emit({ bark: rule.s.slice(5) as BarkId, gid: g.id }, w, false);
      else this.emit({ sfx: rule.s as SfxId, gid: g.id }, w, false);
    }
    // the evening's music: whoever holds a drum or flute and is playing it
    for (const g of w.s.goblins) {
      if (g.activity.action !== 'play_music' || Math.abs(g.pos.x - here.x) > r || Math.abs(g.pos.y - here.y) > r) continue;
      const due = this.next.get(-g.id - 1) ?? 0;
      if (this.clock < due) continue;
      this.next.set(-g.id - 1, this.clock + 2 + Math.random());
      const inst = instrumentOf(g);
      this.emit({ sfx: inst?.type === 'flute' ? 'flute' : 'drum', gid: g.id }, w, false);
    }
    if (this.next.size > 600) this.next.clear();
  }

  private setMood(m: Mood): void {
    if (m === this.mood && this.a.musicId) return;
    this.mood = m;
    this.moodSince = this.clock;
    this.a.setMusic(m);
  }
}
