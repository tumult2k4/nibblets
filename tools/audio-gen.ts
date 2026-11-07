/**
 * Makes the game's audio with ElevenLabs (sound effects, ambience loops, music, goblin voices) into public/audio/.
 * `npm run audio:gen [-- --only sfx,loops,music,voices --ids chop,day --force --dry]`
 * The key is read from ELEVENLABS_API_KEY (the npm script loads .env.local); it never reaches the game.
 * Existing files are kept, so a rerun only makes what is missing (or what --force names).
 */
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  BARKS, LOOPS, MUSIC, SFX, VOICES, barkFile, loopFile, musicFile, sfxFile,
  type BarkId, type LoopId, type MusicId, type SfxId, type VoiceId,
} from '../src/ui/sound/manifest';

const ROOT = join(import.meta.dirname, '..');
const OUT = join(ROOT, 'public');
const VOICE_IDS = join(ROOT, 'tools', 'audio-voices.json');
const args = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const only = new Set((opt('only') ?? 'sfx,loops,music,voices').split(','));
const ids = opt('ids') ? new Set(opt('ids')!.split(',')) : null;
const force = args.includes('--force');
const dry = args.includes('--dry');
const want = (id: string) => !ids || ids.has(id);

if (!process.env.ELEVENLABS_API_KEY && !dry) {
  console.error('Set ELEVENLABS_API_KEY (put it in .env.local; `npm run audio:gen` loads it).');
  process.exit(1);
}
const client = new ElevenLabsClient();

type Job = { file: string; label: string; make: () => Promise<Buffer> };
const jobs: Job[] = [];
const add = (file: string, label: string, make: () => Promise<Buffer>) => {
  if (!force && existsSync(join(OUT, file))) return;
  jobs.push({ file, label, make });
};
const bytes = async (stream: ReadableStream<Uint8Array>): Promise<Buffer> => Buffer.from(await new Response(stream).arrayBuffer());

if (only.has('sfx'))
  for (const [id, d] of Object.entries(SFX) as [SfxId, (typeof SFX)[SfxId]][]) {
    if (!want(id)) continue;
    const n = 'variants' in d ? d.variants ?? 1 : 1;
    for (let v = 0; v < n; v++)
      add(sfxFile(id, v), `sfx ${id}#${v}`, async () =>
        bytes(await client.textToSoundEffects.convert({
          text: d.prompt, modelId: 'eleven_text_to_sound_v3', outputFormat: 'mp3_44100_128',
          durationSeconds: 'dur' in d ? d.dur : undefined, promptInfluence: 'influence' in d ? d.influence : 0.5,
        })));
  }

if (only.has('loops'))
  for (const [id, d] of Object.entries(LOOPS) as [LoopId, (typeof LOOPS)[LoopId]][]) {
    if (!want(id)) continue;
    add(loopFile(id), `loop ${id}`, async () =>
      bytes(await client.textToSoundEffects.convert({
        text: d.prompt, modelId: 'eleven_text_to_sound_v3', outputFormat: 'mp3_44100_128',
        durationSeconds: d.dur, promptInfluence: 0.5, loop: true,
      })));
  }

if (only.has('music'))
  for (const [id, d] of Object.entries(MUSIC) as [MusicId, (typeof MUSIC)[MusicId]][]) {
    if (!want(id)) continue;
    add(musicFile(id), `music ${id}`, async () =>
      bytes(await client.music.compose({ prompt: d.prompt, musicLengthMs: d.ms, modelId: 'music_v2_5', forceInstrumental: true, outputFormat: 'mp3_44100_128' })));
  }

/** Voice Design → a saved voice per goblin voice; the ids are kept so a rerun reuses them. */
async function voiceIds(): Promise<Record<VoiceId, string>> {
  const saved: Partial<Record<VoiceId, string>> = existsSync(VOICE_IDS) ? JSON.parse(readFileSync(VOICE_IDS, 'utf8')) : {};
  for (const [id, description] of Object.entries(VOICES) as [VoiceId, string][]) {
    if (saved[id]) continue;
    if (dry) { saved[id] = '(new)'; continue; }
    console.log(`designing voice ${id}…`);
    const design = await client.textToVoice.design({
      voiceDescription: description, modelId: 'eleven_ttv_v3', guidanceScale: 5, seed: 7,
      text: 'Hehehe! Oi, you there! Big shiny Hand in the sky, is that you? We found an apple, a whole apple, and a pebble that sparkles. Mine, mine, all mine!',
    });
    const pick = design.previews[0]!;
    const voice = await client.textToVoice.create({ voiceName: `Nibblets goblin ${id}`, voiceDescription: description, generatedVoiceId: pick.generatedVoiceId });
    saved[id] = voice.voiceId;
    writeFileSync(VOICE_IDS, JSON.stringify(saved, null, 2) + '\n');
  }
  return saved as Record<VoiceId, string>;
}

if (only.has('voices')) {
  const vids = await voiceIds();
  for (const voice of Object.keys(VOICES) as VoiceId[])
    for (const [bark, lines] of Object.entries(BARKS) as [BarkId, readonly string[]][]) {
      if (!want(bark) && !want(voice)) continue;
      lines.forEach((text, v) =>
        add(barkFile(voice, bark, v), `voice ${voice}/${bark}#${v}`, async () =>
          bytes(await client.textToSpeech.convert(vids[voice], {
            text, modelId: 'eleven_v3', outputFormat: 'mp3_44100_96',
            voiceSettings: { stability: 0.3, similarityBoost: 0.75 },
          }))));
    }
}

console.log(`${jobs.length} file(s) to make${dry ? ' (dry run)' : ''}`);
if (dry) {
  for (const j of jobs) console.log('  ', j.file);
  process.exit(0);
}

const before = (await client.user.subscription.get()).characterCount;
let done = 0, failed = 0;
async function worker(): Promise<void> {
  for (let j = jobs.shift(); j; j = jobs.shift()) {
    for (let attempt = 1; ; attempt++) {
      try {
        const buf = await j.make();
        const path = join(OUT, j.file);
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, buf);
        console.log(`✓ ${j.label} (${(buf.length / 1024).toFixed(0)} KB)`);
        done++;
        break;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (attempt < 4 && (code === 429 || code === undefined || code >= 500)) {
          await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
          continue;
        }
        console.error(`✗ ${j.label}: ${code ?? ''} ${(e as Error).message.slice(0, 300)}`);
        failed++;
        break;
      }
    }
  }
}
await Promise.all([worker(), worker(), worker()]);
const after = (await client.user.subscription.get()).characterCount;
console.log(`made ${done}, failed ${failed}; credits used ≈ ${after - before}`);
if (failed) process.exitCode = 1;
