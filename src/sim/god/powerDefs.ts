/** POWER_DEFS data table (§17.5). Content table — counts as config. `phase` = implementation phase. */
export type PowerCategory = 'gift' | 'nature' | 'terraform' | 'wrath' | 'miracle' | 'sandbox';
export type PowerTarget = 'point' | 'area' | 'goblin' | 'pair' | 'grave' | 'brush' | 'direction' | 'global';

export interface PowerDef {
  id: string; category: PowerCategory; target: PowerTarget; radius?: [number, number]; cost: number; costPerTile?: number;
  cooldownHours: number; alignment: number; lethal: boolean; phase: number; tier: number; fx: string;
}

const P = (id: string, category: PowerCategory, target: PowerTarget, cost: number, cooldownHours: number, phase: number, tier: number, extra: Partial<PowerDef> = {}): PowerDef => ({
  id, category, target, cost, cooldownHours, phase, tier, alignment: category === 'gift' ? 2 : category === 'wrath' ? -5 : 0, lethal: false, fx: id, ...extra,
});

export const POWER_DEFS: PowerDef[] = [
  P('gift_tray', 'gift', 'point', 0, 0, 1, 0),
  P('apple_shower', 'gift', 'area', 25, 6, 3, 2, { radius: [3, 6] }),
  P('bountiful_growth', 'gift', 'area', 30, 12, 3, 2, { radius: [3, 6] }),
  P('healing_touch', 'gift', 'goblin', 15, 2, 6, 1),
  P('warm_sun', 'gift', 'area', 20, 6, 3, 2, { radius: [6, 12] }),
  P('blessing', 'gift', 'goblin', 10, 1, 5, 0),
  P('inspiration', 'gift', 'goblin', 30, 24, 5, 3),
  P('fertility', 'gift', 'pair', 25, 48, 5, 3),
  P('shiny_gift', 'gift', 'goblin', 15, 3, 5, 3),
  P('rain', 'nature', 'area', 20, 4, 3, 1, { radius: [8, 16] }),
  P('clear_sky', 'nature', 'global', 20, 4, 3, 1),
  P('snowfall', 'nature', 'area', 20, 4, 3, 3, { radius: [8, 16] }),
  P('gust', 'nature', 'direction', 10, 1, 3, 3),
  P('fast_forward', 'nature', 'global', 15, 24, 3, 4),
  P('hasten_season', 'nature', 'global', 80, 64, 3, 4),
  P('raise_land', 'terraform', 'brush', 0, 0, 2, 1, { costPerTile: 2, radius: [1, 6] }),
  P('lower_land', 'terraform', 'brush', 0, 0, 2, 1, { costPerTile: 2, radius: [1, 6] }),
  P('smooth', 'terraform', 'brush', 0, 0, 2, 1, { costPerTile: 1, radius: [1, 6] }),
  P('create_water', 'terraform', 'brush', 0, 0, 2, 3, { costPerTile: 3, radius: [1, 6] }),
  P('fertile_soil', 'terraform', 'brush', 0, 0, 2, 2, { costPerTile: 2, radius: [1, 6] }),
  P('plant_forest', 'terraform', 'brush', 0, 0, 2, 2, { costPerTile: 3, radius: [1, 6] }),
  P('place_rock', 'terraform', 'point', 8, 0, 2, 2),
  P('lightning', 'wrath', 'point', 15, 1, 4, 0, { lethal: true, radius: [1, 1] }),
  P('swarm', 'wrath', 'area', 20, 12, 4, 2, { radius: [4, 8] }),
  P('curse', 'wrath', 'goblin', 20, 24, 4, 2),
  P('blight', 'wrath', 'area', 25, 24, 6, 3, { radius: [3, 6] }),
  P('summon_gnashers', 'wrath', 'point', 30, 24, 4, 3, { lethal: true }),
  P('plague', 'wrath', 'goblin', 40, 48, 6, 3, { lethal: true }),
  P('meteor', 'wrath', 'area', 60, 48, 4, 3, { lethal: true, radius: [4, 4] }),
  P('flood', 'wrath', 'area', 60, 48, 6, 3, { radius: [6, 14] }),
  P('earthquake', 'wrath', 'area', 70, 48, 6, 3, { radius: [15, 15] }),
  P('vision', 'miracle', 'global', 20, 24, 6, 4),
  P('revelation', 'miracle', 'goblin', 50, 48, 9, 4),
  P('sanctuary', 'miracle', 'area', 60, 48, 6, 4, { radius: [8, 8] }),
  P('bring_forth', 'miracle', 'point', 80, 72, 6, 4),
  P('resurrect', 'miracle', 'grave', 120, 96, 6, 5),
];
