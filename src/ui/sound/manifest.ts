/**
 * Every sound in Nibblets, and the prompt ElevenLabs made it from (`npm run audio:gen` → public/audio/).
 * The game only reads ids, variants and gains; the prompts stay here so a sound can be made again or retuned.
 * Pitch is never baked in: the engine varies every play (`spread`) and each goblin has its own voice pitch.
 */

export interface SfxDef {
  prompt: string;
  /** seconds (0.5–30); unset lets the model choose */
  dur?: number;
  /** how closely to follow the prompt, 0..1 (default 0.5) */
  influence?: number;
  /** how many takes to make; a play picks one at random */
  variants?: number;
  /** base gain, 0..1.5 (default 1) */
  gain?: number;
  /** random pitch spread per play, as a fraction (default 0.08 = ±8 %) */
  spread?: number;
  /** min ms between two plays of this cue (default 60) */
  gap?: number;
}

export interface LoopDef {
  prompt: string;
  dur: number;
  gain?: number;
}

export interface MusicDef {
  prompt: string;
  ms: number;
  gain?: number;
}

const S = (prompt: string, o: Omit<SfxDef, 'prompt'> = {}): SfxDef => ({ prompt, ...o });

/** One-shot effects. Cartoon fantasy, small creatures, cozy low-poly world. */
export const SFX = {
  // ---- interface and the god's hand ----
  ui_click: S('Soft wooden UI click, short and cozy, a small wooden bead tapped', { dur: 0.5, influence: 0.8, gain: 0.5, spread: 0.05 }),
  ui_open: S('Gentle paper page flip whoosh, soft UI panel opening', { dur: 0.6, influence: 0.7, gain: 0.45 }),
  power_denied: S('Short low dull wooden thunk with a disappointed buzz, game error sound', { dur: 0.6, influence: 0.8, gain: 0.6 }),
  hand_grab: S('Quick airy whoosh as a giant hand scoops something up, light and magical', { dur: 0.6, influence: 0.6, variants: 2, gain: 0.6 }),
  hand_drop: S('Soft thud of a small creature set down on grass', { dur: 0.6, influence: 0.6, variants: 2, gain: 0.7 }),
  throw_whoosh: S('Fast whistling whoosh of something small flung through the air', { dur: 0.8, influence: 0.6, variants: 2, gain: 0.6 }),
  land_thud: S('Cartoon bonk and tumble of a small creature landing on dirt', { dur: 0.8, influence: 0.6, variants: 2 }),
  splash: S('Small creature splashing into a pond, cartoon splash', { dur: 1, influence: 0.6, variants: 2 }),
  apple_bonk: S('Apple bouncing off a small head, cartoon bonk', { dur: 0.6, influence: 0.7, gain: 0.7 }),
  gift_drop: S('Soft magical sparkle as a gift appears and lands in the grass', { dur: 0.8, influence: 0.6, gain: 0.6 }),
  poke: S('Tiny cartoon boop, a finger poking a squishy belly', { dur: 0.5, influence: 0.8, gain: 0.6 }),
  // ---- divine powers and signs ----
  thunder: S('Close lightning strike crack followed by rolling thunder', { dur: 4, influence: 0.5, variants: 2, spread: 0.12 }),
  sign_rumble: S('Deep magical rumble as glowing words appear in the sky, ethereal', { dur: 3, influence: 0.5, gain: 0.8 }),
  voice_boom: S('Deep divine echoing boom, a god clearing its throat across the land', { dur: 2.5, influence: 0.5, gain: 0.8 }),
  prayer_ding: S('Small clear temple bell ding with a soft shimmer', { dur: 1.5, influence: 0.7, gain: 0.55, spread: 0.06 }),
  miracle: S('Warm angelic choir swell with sparkling chimes, a miracle happening', { dur: 3, influence: 0.5, gain: 0.8, spread: 0.04 }),
  wrath: S('Dark ominous magical whoosh and crackle, a curse being cast', { dur: 2, influence: 0.5, gain: 0.8 }),
  earthquake: S('Deep earthquake rumble with rocks cracking and ground shaking', { dur: 5, influence: 0.5 }),
  flood_surge: S('Rushing surge of water flooding over a meadow', { dur: 4, influence: 0.5, gain: 0.8 }),
  shooting_star: S('Magical twinkling shooting star streak across the night sky', { dur: 2, influence: 0.6, gain: 0.6 }),
  power_unlocked: S('Short bright magical fanfare with chimes and harp, a new power unlocked', { dur: 2.5, influence: 0.6, gain: 0.7, spread: 0 }),
  tier_up: S('Rising heavenly choir and bells, divine power growing', { dur: 3, influence: 0.6, gain: 0.7, spread: 0 }),
  // ---- feed toasts ----
  toast_notable: S('Gentle wooden marimba two-note notification chime', { dur: 0.8, influence: 0.8, gain: 0.45, spread: 0.02, gap: 400 }),
  toast_critical: S('Urgent low wooden drum hit with a tense horn note, alert', { dur: 1.2, influence: 0.8, gain: 0.6, spread: 0.02, gap: 600 }),
  // ---- goblin work ----
  footstep: S('Small bare feet pattering on grass, a few quick steps', { dur: 0.6, influence: 0.6, variants: 2, gain: 0.25, spread: 0.15 }),
  chop: S('Small axe chopping into a log, one solid wooden thunk', { dur: 0.5, influence: 0.7, variants: 2, gain: 0.7, spread: 0.12 }),
  tree_fall: S('Small tree creaking and crashing down into leaves', { dur: 2.5, influence: 0.6, gain: 0.9 }),
  mine: S('Stone pick striking rock, sharp clink with small chips', { dur: 0.5, influence: 0.7, variants: 2, gain: 0.7, spread: 0.12 }),
  rock_crumble: S('Rock cracking and crumbling into pebbles', { dur: 1.2, influence: 0.6 }),
  dig: S('Small shovel digging into soft earth, scoop of dirt', { dur: 0.8, influence: 0.6, variants: 2, gain: 0.6 }),
  rustle: S('Rustling through a leafy bush, plucking berries', { dur: 0.8, influence: 0.6, variants: 2, gain: 0.55 }),
  pluck: S('Plucking an apple off a branch, leafy snap', { dur: 0.6, influence: 0.7, gain: 0.6 }),
  pickup: S('Picking up a small object from the ground, light rustle and tap', { dur: 0.5, influence: 0.6, gain: 0.45 }),
  store: S('Putting things into a wooden crate, hollow wooden clunk', { dur: 0.6, influence: 0.7, gain: 0.55 }),
  water_pour: S('Pouring water from a small wooden bucket onto soil', { dur: 1.2, influence: 0.6, gain: 0.55 }),
  plant_seed: S('Pressing a seed into soft soil, gentle pat pat', { dur: 0.7, influence: 0.6, gain: 0.5 }),
  hammer: S('Small wooden mallet hammering a peg into a wooden beam', { dur: 0.6, influence: 0.7, variants: 2, gain: 0.65, spread: 0.12 }),
  build_done: S('Wooden structure settling with a satisfying creak and a final hammer tap', { dur: 1.5, influence: 0.6, gain: 0.8 }),
  build_crash: S('Small wooden hut collapsing, planks breaking and falling', { dur: 2, influence: 0.6 }),
  craft: S('Tinkering at a workbench, small tools tapping and scraping wood and stone', { dur: 1.2, influence: 0.6, variants: 2, gain: 0.55 }),
  saw: S('Small hand saw cutting through a branch, a few strokes', { dur: 1, influence: 0.6, gain: 0.55 }),
  sizzle: S('Fish sizzling on a hot stone over a campfire', { dur: 1.5, influence: 0.6, gain: 0.6 }),
  stew: S('Thick stew bubbling in a clay pot, a wooden spoon stirring', { dur: 1.5, influence: 0.6, gain: 0.55 }),
  fire_whoosh: S('Campfire flaring up as wood is added, whoosh and crackle', { dur: 1.2, influence: 0.6, gain: 0.6 }),
  fire_out: S('Campfire dying out with a hiss and a puff of smoke', { dur: 1.2, influence: 0.6, gain: 0.55 }),
  fire_stomp: S('Small feet stomping out flames, hiss and thumps', { dur: 1, influence: 0.6, gain: 0.6 }),
  ignite: S('Dry grass catching fire, a sudden whoosh of flames', { dur: 1.5, influence: 0.6 }),
  fish_cast: S('Fishing line whipping out and a bobber plopping into water', { dur: 1.2, influence: 0.6, gain: 0.5 }),
  fish_catch: S('A small fish pulled out of water, splash and flapping', { dur: 1, influence: 0.6, gain: 0.6 }),
  sling: S('Leather sling whirling and releasing a stone, whip and whoosh', { dur: 0.8, influence: 0.6, gain: 0.6 }),
  clay: S('Squelchy wet clay being scooped by hand', { dur: 0.8, influence: 0.6, gain: 0.55 }),
  pave: S('Flat stones scraped and set into the ground, stone on stone', { dur: 0.8, influence: 0.6, gain: 0.55 }),
  compost: S('Squishy compost being turned with a stick, wet and earthy', { dur: 0.8, influence: 0.6, gain: 0.45 }),
  quill: S('Quill pen scratching on rough paper', { dur: 1.2, influence: 0.7, gain: 0.4 }),
  page_turn: S('Turning an old book page', { dur: 0.6, influence: 0.7, gain: 0.4 }),
  coins: S('Handful of small shiny pebbles and trinkets clinking, a trade', { dur: 0.8, influence: 0.6, gain: 0.55 }),
  sparkle: S('Tiny magical glint sparkle, something shiny found', { dur: 0.8, influence: 0.7, gain: 0.5 }),
  ding_skill: S('Bright cheerful two-tone xylophone ding, level up', { dur: 0.8, influence: 0.8, gain: 0.45, spread: 0.03 }),
  eureka: S('Whimsical rising harp glissando with a pop, an idea discovered', { dur: 1.2, influence: 0.7, gain: 0.5, spread: 0.03 }),
  tool_snap: S('Small wooden tool handle snapping in two', { dur: 0.6, influence: 0.7, gain: 0.6 }),
  eat: S('Small creature munching and crunching an apple', { dur: 1, influence: 0.6, variants: 2, gain: 0.55 }),
  drink: S('Small creature gulping water, two gulps', { dur: 0.8, influence: 0.6, gain: 0.5 }),
  // ---- goblin life ----
  drum: S('Small hand drum, a short playful tribal rhythm', { dur: 2, influence: 0.6, variants: 2, gain: 0.5, spread: 0.04 }),
  flute: S('Short whimsical wooden flute melody, three or four notes', { dur: 2, influence: 0.6, variants: 2, gain: 0.45, spread: 0.06 }),
  dance: S('Small feet stomping and hands clapping in rhythm, a merry dance', { dur: 1.5, influence: 0.6, gain: 0.45 }),
  brawl: S('Cartoon scuffle, a dust-cloud fight with bonks, slaps and squeaks', { dur: 1.5, influence: 0.6, variants: 2, gain: 0.7 }),
  hit: S('Short cartoon thwack of a small club hitting', { dur: 0.5, influence: 0.7, variants: 2, gain: 0.7, spread: 0.12 }),
  prank: S('Cartoon boing spring and slide whistle, a prank', { dur: 1, influence: 0.7, gain: 0.6 }),
  sneak: S('Sneaky tiptoe pizzicato, three plucked notes', { dur: 1, influence: 0.7, gain: 0.45 }),
  kiss: S('Tiny cartoon smooch with a soft warm chime', { dur: 0.8, influence: 0.7, gain: 0.5 }),
  egg_laid: S('Soft plop of an egg settling into a straw nest', { dur: 0.7, influence: 0.7, gain: 0.5 }),
  egg_hatch: S('Small eggshell cracking open, tiny squeak', { dur: 1.2, influence: 0.6, gain: 0.7 }),
  egg_lost: S('Fragile eggshell breaking, sad soft crack', { dur: 0.8, influence: 0.7, gain: 0.5 }),
  bury: S('Dirt shoveled onto a small grave, quiet and solemn', { dur: 1.5, influence: 0.6, gain: 0.55 }),
  death_toll: S('Single soft low wooden bell toll, sad and gentle', { dur: 2.5, influence: 0.7, gain: 0.6, spread: 0.02 }),
  cough: S('Small creature coughing, sickly', { dur: 0.8, influence: 0.6, gain: 0.45 }),
  heal: S('Soft magical healing shimmer', { dur: 1, influence: 0.7, gain: 0.45 }),
  bell_alarm: S('Wooden watchtower alarm bell clanging urgently', { dur: 2, influence: 0.6, gain: 0.8, spread: 0.02 }),
  horn: S('Distant small horn call announcing visitors', { dur: 2, influence: 0.6, gain: 0.6, spread: 0.02 }),
  war_horn: S('Low menacing war horn blast in the distance', { dur: 2.5, influence: 0.6, gain: 0.8, spread: 0.02 }),
  cheer: S('Small crowd of little creatures cheering and clapping', { dur: 2, influence: 0.6, gain: 0.6 }),
  // ---- creatures and enemies ----
  gnasher: S('Small vicious beast snarling and snapping its teeth', { dur: 1.2, influence: 0.6, variants: 2, gain: 0.7 }),
  bramble: S('Large plant monster creaking and growling, branches groaning', { dur: 2, influence: 0.6, gain: 0.8 }),
  wisp: S('Eerie ghostly whisper and wind chime shimmer', { dur: 2, influence: 0.6, gain: 0.5 }),
  enemy_down: S('Beast yelping and fleeing, cartoon defeat', { dur: 1, influence: 0.6, gain: 0.6 }),
  critter: S('Small rabbit-like critter squeak and hop', { dur: 0.6, influence: 0.6, gain: 0.4 }),
  // ---- the world ----
  rooster: S('Gentle morning birdsong chorus rising at dawn', { dur: 3, influence: 0.6, gain: 0.5, spread: 0.03 }),
  season: S('Soft magical wind chime cascade, the season turning', { dur: 2.5, influence: 0.7, gain: 0.5, spread: 0 }),
  blight: S('Leaves withering and crackling, sickly rot', { dur: 1.5, influence: 0.6, gain: 0.5 }),
  grow: S('Tiny magical pop of a sprout bursting from the soil', { dur: 0.5, influence: 0.7, gain: 0.35 }),
} satisfies Record<string, SfxDef>;
export type SfxId = keyof typeof SFX;

/** Seamless ambience beds. */
export const LOOPS = {
  day: { prompt: 'Peaceful meadow ambience, gentle breeze in grass, songbirds and distant insects, no music', dur: 22 },
  night: { prompt: 'Calm night ambience, crickets chirping, an occasional distant owl, soft breeze, no music', dur: 22 },
  rain: { prompt: 'Steady gentle rain falling on leaves and grass, no thunder', dur: 20 },
  storm: { prompt: 'Heavy rainstorm with strong gusting wind, no thunder', dur: 20 },
  wind: { prompt: 'Cold howling winter wind, blizzard snow blowing', dur: 20 },
  heat: { prompt: 'Hot summer afternoon, loud cicadas buzzing, still air', dur: 20, gain: 0.7 },
  fog: { prompt: 'Eerie quiet foggy morning, faint dripping and a low airy hum', dur: 20, gain: 0.7 },
  fire: { prompt: 'Close crackling campfire, wood popping', dur: 15, gain: 0.8 },
  wildfire: { prompt: 'Raging wildfire roaring through dry brush and trees', dur: 15 },
  water: { prompt: 'Gentle stream babbling over pebbles', dur: 20, gain: 0.7 },
  crowd: { prompt: 'Small festive crowd of little creatures chattering, laughing and clapping outdoors', dur: 20, gain: 0.6 },
} satisfies Record<string, LoopDef> as Record<'day' | 'night' | 'rain' | 'storm' | 'wind' | 'heat' | 'fog' | 'fire' | 'wildfire' | 'water' | 'crowd', LoopDef>;
export type LoopId = keyof typeof LOOPS;

const STYLE = 'whimsical fantasy village, cozy hand-made folk instruments, instrumental';
/** Background music by occasion; the soundscape crossfades between them. */
export const MUSIC = {
  day: { prompt: `Peaceful sunny day theme for a ${STYLE}: plucked lute, wooden flute, soft hand percussion, light and playful, gentle steady groove`, ms: 90_000 },
  night: { prompt: `Calm night lullaby for a ${STYLE}: soft music box, warm low strings, slow and dreamy, very gentle`, ms: 80_000 },
  winter: { prompt: `Cold quiet winter theme for a ${STYLE}: celesta, sparse harp, soft breathy flute, hushed and wistful`, ms: 80_000 },
  festival: { prompt: `Joyful festival dance for a ${STYLE}: fast frame drums, fiddle and pennywhistle jig, clapping, lively and merry`, ms: 70_000 },
  danger: { prompt: `Tense battle music for a ${STYLE} under attack: driving tribal war drums, low urgent strings, staccato brass stabs, menacing but not too dark`, ms: 70_000 },
  sorrow: { prompt: `Sad mourning theme for a ${STYLE}: solo cello and soft wooden flute, slow, tender and grieving`, ms: 60_000 },
  title: { prompt: `Main title theme for a ${STYLE} god game: warm orchestral folk, curious and magical, mischievous goblin melody on bassoon and pizzicato strings, rising to a hopeful swell`, ms: 75_000 },
} satisfies Record<string, MusicDef> as Record<'day' | 'night' | 'winter' | 'festival' | 'danger' | 'sorrow' | 'title', MusicDef>;
export type MusicId = keyof typeof MUSIC;

/** The goblin voices: designed once with ElevenLabs Voice Design, then saved to the account. */
export const VOICES = {
  grub: 'A small mischievous goblin with a raspy, nasal, high-pitched voice, cheeky and giggly, cartoonish fantasy creature',
  mog: 'A stocky gruff goblin with a low gravelly croak, grumbly but friendly, cartoonish fantasy creature',
  pip: 'A tiny squeaky young goblin with a bright excitable voice, very high and fast, cartoonish fantasy creature',
  nan: 'An old wrinkly goblin with a crackly wheezy voice, slow and wise but silly, cartoonish fantasy creature',
} as const;
export type VoiceId = keyof typeof VOICES;

/** What every goblin can say; each line is made in every voice. Mostly goblin noises, a few words. */
export const BARKS = {
  greet: ['Oi oi!', 'Heh! Hullo!'],
  laugh: ['[laughs] Hehehehe!', '[giggles] Nyehehe!'],
  happy: ['Wheee! [laughs]', 'Ooh, yesss!'],
  hungry: ['Hnnng... [sighs] food?', 'Tummy... rumbly.'],
  tired: ['[yawns] Hwaaaah...', 'Mmmh... sleepy.'],
  snore: ['[snoring] Hnnnk... shhh... hnnnk... mimimi...'],
  hurt: ['Ow! Owowow!', 'Yeep!'],
  scared: ['[screams] Aaaah! Run!', 'Eek! Eek!'],
  angry: ['Grrr! Mine!', 'Hmph! Bah!'],
  sad: ['[sobs] Hoo... hoo...', 'Waaah... [sniffs]'],
  cheer: ['Wahoo! Hooray!', 'Yay yay yay!'],
  effort: ['Hup! Hngh!', 'Hrrngh!'],
  curious: ['Ooh? Shiny!', 'Hmm? Wassat?'],
  pray: ['[whispers] Oh great Hand... hear us...', 'Mmmmm... ommm... bless us...'],
  grab: ['Whoa whoa whoa!', 'Eep! Put me down!'],
  giggle: ['[giggles] Hehe! Tickles!', '[laughs] Hihihi!'],
  poked: ['Hey!', 'Oof!'],
  chatter: ['Blah blah, gibber gabber!', 'Nyeh, and then, and then!', 'Mm-hm, mm-hm. Yuh.'],
  sing: ['[sings] La la laa, dee dum dee!'],
  baby: ['[giggles] Goo! Gah!'],
} as const satisfies Record<string, readonly string[]>;
export type BarkId = keyof typeof BARKS;

export const sfxFile = (id: SfxId, v: number): string => `audio/sfx/${id}${v ? `_${v}` : ''}.mp3`;
export const loopFile = (id: LoopId): string => `audio/amb/${id}.mp3`;
export const musicFile = (id: MusicId): string => `audio/music/${id}.mp3`;
export const barkFile = (voice: VoiceId, id: BarkId, v: number): string => `audio/voice/${voice}/${id}${v ? `_${v}` : ''}.mp3`;
