/**
 * Building tunables (§10, §11.1), reached as CFG.buildings: costs, footprints (tiles), hp, beds (`capacity`),
 * storage slots and `labor` (a work-rate multiplier: small things go up faster), and how sites are chosen.
 */
export const BUILDINGS = {
  defs: {
    hut: { cost: { wood: 6 } as Record<string, number>, footprint: 2, hp: 100, capacity: 2, storage: 6 },
    campfire: { cost: { wood: 2, stone: 1 } as Record<string, number>, footprint: 1, hp: 40, capacity: 0, storage: 0 },
    fence: { cost: { wood: 1 } as Record<string, number>, footprint: 1, hp: 40, capacity: 0, storage: 0, labor: 8 },
    stone_hut: { cost: { stone: 6 } as Record<string, number>, footprint: 2, hp: 220, capacity: 3, storage: 8, labor: 2.5 },
    // P5.6 preservation: storage = what the rack holds per batch / what the pit keeps cool
    grinding_stone: { cost: { stone: 3 } as Record<string, number>, footprint: 1, hp: 80, capacity: 0, storage: 0, labor: 3 },
    drying_rack: { cost: { wood: 3, rope: 2 } as Record<string, number>, footprint: 1, hp: 30, capacity: 0, storage: 12, labor: 3 },
    storage_pit: { cost: { stone: 2 } as Record<string, number>, footprint: 1, hp: 120, capacity: 0, storage: 160, labor: 1.2 },
    // P5.7 workbench, watchtower and gate (§11.1)
    workbench: { cost: { wood: 4, stone: 2 } as Record<string, number>, footprint: 1, hp: 60, capacity: 0, storage: 0, labor: 2 },
    watchtower: { cost: { wood: 8, rope: 2 } as Record<string, number>, footprint: 1, hp: 70, capacity: 0, storage: 0, labor: 1.2 },
    gate: { cost: { wood: 2, rope: 1 } as Record<string, number>, footprint: 1, hp: 50, capacity: 0, storage: 0, labor: 4 },
    // P7.2 kiln (§11.1): fires clay goods
    kiln: { cost: { clay: 6, stone: 4 } as Record<string, number>, footprint: 1, hp: 120, capacity: 0, storage: 0, labor: 2 },
    // P7.3 (§11.1): a hearth by a home, the longhouse (sleeps 8), a well, the nursery
    hearth: { cost: { stone: 4, clay: 2 } as Record<string, number>, footprint: 1, hp: 90, capacity: 0, storage: 0, labor: 2.5 },
    longhouse: { cost: { wood: 20, stone: 8, rope: 4 } as Record<string, number>, footprint: 3, hp: 260, capacity: 8, storage: 10, labor: 1.2 },
    well: { cost: { stone: 8, rope: 2, bucket: 1 } as Record<string, number>, footprint: 1, hp: 160, capacity: 0, storage: 0, labor: 1.5 },
    nursery: { cost: { wood: 6, fiber: 4 } as Record<string, number>, footprint: 2, hp: 70, capacity: 0, storage: 0, labor: 2 },
    // P7.4 (§11.1): a fenced 3×3 bed (the labor is the digging), a compost heap, one plank span of a bridge
    garden_plot: { cost: { wood: 2 } as Record<string, number>, footprint: 3, hp: 60, capacity: 0, storage: 0, labor: 1.5 },
    compost_heap: { cost: { wood: 3 } as Record<string, number>, footprint: 1, hp: 50, capacity: 0, storage: 12, labor: 3 },
    bridge: { cost: { wood: 4, rope: 1 } as Record<string, number>, footprint: 1, hp: 120, capacity: 0, storage: 0, labor: 2 },
    // P8.5 (§11.1): a ring of stones and log seats, the nightly gathering spot for music
    music_circle: { cost: { stone: 6 } as Record<string, number>, footprint: 3, hp: 200, capacity: 0, storage: 0, labor: 2.5 },
    // P8.6 (§11.1): the shrine (its trinket is an offering, not a material) and the totem
    shrine: { cost: { stone: 4 } as Record<string, number>, footprint: 1, hp: 120, capacity: 0, storage: 0, labor: 2.5 },
    totem: { cost: { wood: 3, war_paint: 1 } as Record<string, number>, footprint: 1, hp: 80, capacity: 0, storage: 0, labor: 2.5 },
    // P8.8 (§17.4): the temple (consecrated by two trinkets laid in it)
    temple: { cost: { stone: 12, wood: 6 } as Record<string, number>, footprint: 2, hp: 300, capacity: 0, storage: 0, labor: 6 },
  } as Record<string, { cost: Record<string, number>; footprint: number; hp: number; capacity: number; storage: number; labor?: number }>,
  buildRate: 0.002, skillBonus: 0.15, friendBonus: 1.3, workChunk: 300,
  siteRadius: 14, maxSlope: 0.06, waterPref: [4, 10] as [number, number], hutSpacing: [3.6, 7] as [number, number],
  occupiedCost: 4,
};
