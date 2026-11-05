/**
 * `Process` (§7.2 work, §11.2, P5.6): put apples by before they rot. A goblin empties a drying rack whose batch is
 * done, fills an idle rack from the stockpile's surplus apples (it starts drying once it holds six), or grinds
 * surplus apples to mash at the grinding stone (2 → 1, cooking skill speeds it up). Whatever it makes goes back to
 * the stockpile. Stages: 0 to the stockpile (fetch), 1 to the station, 2 work, 3 back to the stockpile (store).
 */
import { CFG } from '../../config';
import { dist } from '../../../shared/math';
import { addItem, countItem, removeItems } from '../../inventory';
import { moveAlong, planPath, faceToward } from '../../steering';
import { deposit, withdraw } from '../../stockpile';
import { buildingDef, workSpot } from '../../buildings';
import { gainXp, skillSpeed } from '../../goblin/skills';
import { isDrying, processJob, processUrge, rackDried, rackLoad, startDrying, surplusApples } from '../../preserve';
import { observe } from '../../knowledge';
import { busy } from './village';
import type { Building, Goblin } from '../../state';
import type { World } from '../../world';
import type { StepResult, UtilityAction } from '../action';

const R = CFG.preserve;
const KINDS = ['unload', 'load', 'grind'] as const;

/** Drop everything this job made or fetched at the stockpile. */
function storeAll(g: Goblin, w: World): void {
  for (const t of ['apple_mash', 'dried_apple', 'apple'] as const) {
    const n = countItem(g, t);
    if (n > 0) {
      removeItems(g, t, n);
      deposit(w.s, { type: t, qty: n });
      w.emit({ type: 'item_stored', goblinId: g.id, item: t, qty: n });
    }
  }
}

function toStock(g: Goblin, w: World): StepResult {
  const a = g.activity;
  a.stage = 3;
  return dist(g.pos, w.s.village.stockpilePos) < 0.9 || planPath(w, g, w.s.village.stockpilePos) ? 'running' : 'failed';
}

export const Process: UtilityAction = {
  id: 'process', tags: ['work'], minStage: 'adult', interruptible: (g) => g.activity.stage === 0,
  isAvailable: (g, w) => !!processJob(g, w),
  score(g, w) {
    const j = processJob(g, w)!;
    if (j.kind === 'unload') return 0.4 * (1 - busy(g));
    return (R.processScore[0] + R.processScore[1] * processUrge(w.s, w.clock.season)) * (1 - busy(g));
  },
  start(g, w) {
    const j = processJob(g, w);
    if (!j) return false;
    const a = g.activity;
    a.targetId = j.b.id;
    a.count = KINDS.indexOf(j.kind);
    if (j.kind === 'unload') {
      a.stage = 1;
      return planPath(w, g, workSpot(w.s, j.b, g));
    }
    a.stage = 0;
    return dist(g.pos, w.s.village.stockpilePos) < 0.9 || planPath(w, g, w.s.village.stockpilePos);
  },
  step(g, w) {
    const a = g.activity;
    const b = w.s.buildings.find((x) => x.id === a.targetId) as Building | undefined;
    const kind = KINDS[a.count ?? 0]!;
    if (a.stage === 3) {
      if (a.path.length && moveAlong(w, g) !== 'arrived') return 'running';
      storeAll(g, w);
      return 'done';
    }
    if (!b) return countItem(g, 'apple') + countItem(g, 'apple_mash') + countItem(g, 'dried_apple') > 0 ? toStock(g, w) : 'failed';
    if (a.stage === 0) { // fetch the apples
      if (a.path.length && moveAlong(w, g) !== 'arrived') return 'running';
      const room = kind === 'load' ? (buildingDef(b.type)?.storage ?? 0) - rackLoad(b) : R.grindIn * R.grindBatch;
      const n = withdraw(w.s, 'apple', Math.max(0, Math.min(room, surplusApples(w.s))));
      const kept = addItem(g, { type: 'apple', qty: n });
      if (kept < n) deposit(w.s, { type: 'apple', qty: n - kept });
      if (kept < (kind === 'grind' ? R.grindIn : 1)) return kept > 0 ? toStock(g, w) : 'failed';
      a.stage = 1;
      if (!planPath(w, g, workSpot(w.s, b, g))) return toStock(g, w);
    }
    if (a.stage === 1) {
      if (a.path.length && moveAlong(w, g) !== 'arrived') return 'running';
      a.stage = 2;
      a.progress = 0;
      if (kind === 'unload') { // take the dried apples down
        const k = addItem(g, { type: 'dried_apple', qty: rackDried(b) });
        const st = b.storage.find((x) => x.type === 'dried_apple');
        if (st) st.qty -= k;
        b.storage = b.storage.filter((x) => x.qty > 0);
        return k > 0 ? toStock(g, w) : 'failed';
      }
    }
    g.velocity = { x: 0, y: 0 };
    faceToward(g, b.pos);
    if (kind === 'load') {
      if (++a.progress < R.loadTicks) return 'running';
      if (isDrying(b)) return toStock(g, w); // someone else got there first
      const n = Math.min(countItem(g, 'apple'), (buildingDef(b.type)?.storage ?? 0) - rackLoad(b));
      removeItems(g, 'apple', n);
      const st = b.storage.find((x) => x.type === 'apple');
      if (st) st.qty += n;
      else b.storage.push({ type: 'apple', qty: n });
      if (rackLoad(b) >= R.rackMin) startDrying(b, g);
      gainXp(w, g, 'cooking', CFG.skills.xp.process);
      observe(w, 'drying_rack', b.pos, g);
      return countItem(g, 'apple') > 0 ? toStock(g, w) : 'done';
    }
    // grind: one mash per round of work, until fewer than two apples are left
    if (++a.progress < Math.round(R.grindTicks / skillSpeed(g, 'cooking'))) return 'running';
    a.progress = 0;
    removeItems(g, 'apple', R.grindIn);
    if (addItem(g, { type: 'apple_mash', qty: 1 }) < 1) deposit(w.s, { type: 'apple_mash', qty: 1 });
    gainXp(w, g, 'cooking', CFG.skills.xp.process);
    w.emit({ type: 'food_processed', goblinId: g.id, buildingId: b.id, item: 'apple_mash', qty: 1, at: { ...b.pos } });
    observe(w, 'grinding_stone', b.pos, g);
    return countItem(g, 'apple') >= R.grindIn ? 'running' : toStock(g, w);
  },
};
