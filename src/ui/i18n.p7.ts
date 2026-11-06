/** Phase 7 strings (wildlife, fishing, the wider economy), merged into the main tables by i18n.ts. */
export const EN7 = {
  'item.meat': 'Meat', 'item.cooked_meat': 'Roast meat', 'item.bone': 'Bone', 'item.feather': 'Feather', 'item.pelt': 'Pelt', 'item.sling': 'Sling',
  'recipe.sling': 'Sling',
  'act.hunt': 'Hunting with a sling',
  'ev.hunted': '{name} brought down a hopper with a sling.',
  'critter.hopper': 'Hopper', 'critter.chirp': 'Chirp', 'critter.fish': 'Fish', 'critter.glimmerfly': 'Glimmerfly',
  'item.cooked_fish': 'Grilled fish', 'item.fishing_rod': 'Fishing rod', 'item.bucket': 'Bucket', 'item.pot': 'Clay pot',
  'recipe.fishing_rod': 'Fishing rod', 'recipe.kiln': 'Kiln', 'recipe.bucket': 'Bucket', 'recipe.pot': 'Clay pot', 'bld.kiln': 'Kiln',
  'act.fish': 'Fishing', 'act.dig_clay': 'Digging clay',
  'ev.first_fish': '{name} caught the village\'s first fish.',
  'recipe.hearth': 'Hearth', 'recipe.longhouse': 'Longhouse', 'recipe.well': 'Well', 'recipe.nursery': 'Nursery',
  'bld.hearth': 'Hearth', 'bld.longhouse': 'Longhouse', 'bld.well': 'Well', 'bld.nursery': 'Nursery', 'act.cook_stew': 'Cooking stew',
  'ev.hearth_built': '{name}\'s home has a hearth now.', 'ev.longhouse_built': 'The village raised a longhouse. Eight can sleep under its roof.',
  'ev.first_stew': '{name} cooked the village\'s first stew.',
};

export const DE7: Record<keyof typeof EN7, string> = {
  'item.meat': 'Fleisch', 'item.cooked_meat': 'Gebratenes Fleisch', 'item.bone': 'Knochen', 'item.feather': 'Feder', 'item.pelt': 'Fell', 'item.sling': 'Schleuder',
  'recipe.sling': 'Schleuder',
  'act.hunt': 'Jagt mit der Schleuder',
  'ev.hunted': '{name} hat mit der Schleuder einen Hoppler erlegt.',
  'critter.hopper': 'Hoppler', 'critter.chirp': 'Zwitscher', 'critter.fish': 'Fisch', 'critter.glimmerfly': 'Glimmerfliege',
  'item.cooked_fish': 'Gegrillter Fisch', 'item.fishing_rod': 'Angel', 'item.bucket': 'Eimer', 'item.pot': 'Tontopf',
  'recipe.fishing_rod': 'Angel', 'recipe.kiln': 'Brennofen', 'recipe.bucket': 'Eimer', 'recipe.pot': 'Tontopf', 'bld.kiln': 'Brennofen',
  'act.fish': 'Angelt', 'act.dig_clay': 'Gräbt Lehm',
  'ev.first_fish': '{name} hat den ersten Fisch des Dorfes gefangen.',
  'recipe.hearth': 'Herd', 'recipe.longhouse': 'Langhaus', 'recipe.well': 'Brunnen', 'recipe.nursery': 'Kinderstube',
  'bld.hearth': 'Herd', 'bld.longhouse': 'Langhaus', 'bld.well': 'Brunnen', 'bld.nursery': 'Kinderstube', 'act.cook_stew': 'Kocht Eintopf',
  'ev.hearth_built': '{name}s Heim hat jetzt einen Herd.', 'ev.longhouse_built': 'Das Dorf hat ein Langhaus errichtet. Acht finden darin Platz zum Schlafen.',
  'ev.first_stew': '{name} hat den ersten Eintopf des Dorfes gekocht.',
};
