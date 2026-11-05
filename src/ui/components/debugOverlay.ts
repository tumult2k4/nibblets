import { el } from '../dom';
import { t } from '../i18n';
import type { Ctx, Component } from '../ctx';
import { scoreActions } from '../../sim/ai/utility';
import { stateHash } from '../../sim/save';

/** Debug overlay (`): FPS, tick time, counts, AI score table for the selection, command log tail, hash. */
export class DebugOverlay implements Component {
  private root = el('div.debug.panel.hidden');
  private pre = el('pre', { style: 'margin:0;white-space:pre-wrap' });
  private hash = el('span');

  constructor(private ctx: Ctx) {}

  mount(parent: HTMLElement): void {
    const btn = el('button.btn', { onclick: () => (this.hash.textContent = ` ${stateHash(this.ctx.game.world.s)} @${this.ctx.game.world.s.tick}`) }, t('debug.hash'));
    this.root.append(el('b', { text: t('debug.title') }), ' ', btn, this.hash, this.pre);
    parent.append(this.root);
  }

  update(): void {
    const st = this.ctx.store.state;
    this.root.classList.toggle('hidden', !st.openPanels.debug);
    if (!st.openPanels.debug) return;
    const g = this.ctx.game;
    const s = g.world.s;
    const lines = [
      `fps ${g.fps.toFixed(0)}  tick ${g.tickMs.toFixed(3)} ms  speed ${g.speed}×`,
      `tick ${s.tick}  seed ${s.seed}  preset ${s.preset}`,
      `goblins ${s.goblins.length}  plants ${s.plants.length}  items ${s.groundItems.length}  graves ${s.graves.length}`,
      `paths cached ${g.world.pathCache.size}  terrainVersion ${s.terrainVersion}`,
    ];
    const id = st.selection[0];
    const gob = st.selectedKind === 'goblin' && id !== undefined ? g.world.goblin(id) : undefined;
    if (gob) {
      lines.push('', `${t('debug.scores')}: ${gob.name} → ${gob.activity.action} (${gob.activity.status})`);
      lines.push('action          base  pers  mood  hyst  final');
      for (const r of scoreActions(gob, g.world, false).slice(0, 8))
        lines.push(`${r.id.padEnd(15)} ${r.base.toFixed(2)}  ${r.personality.toFixed(2)}  ${r.mood.toFixed(2)}  ${r.hysteresis.toFixed(2)}  ${r.final.toFixed(3)}`);
      if (gob.activity.path.length) lines.push(`path: ${gob.activity.path.length} waypoints → (${gob.activity.path.at(-1)!.x.toFixed(1)}, ${gob.activity.path.at(-1)!.y.toFixed(1)})`);
    }
    lines.push('', `${t('debug.log')} (${s.commandLog.length}):`);
    for (const c of s.commandLog.slice(-6)) lines.push(`  ${c.tick}: ${JSON.stringify(c.cmd).slice(0, 70)}`);
    this.pre.textContent = lines.join('\n');
  }
}
