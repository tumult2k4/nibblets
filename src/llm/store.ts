/**
 * Where LLM text lives (§19.1, P9.3): `world.llm`, saved with the world but outside its hash, and never read by the
 * sim. Diaries, eulogies, chronicles and book pages go in the journals (at most 48 diaries a goblin, a season's
 * worth six times over, and 1000 entries in all, the oldest diaries going first); dialogue and barks in a short
 * list of recent speech for the bubbles.
 */
import type { ID, JournalEntry, SpeechEntry } from '../shared/types';
import type { LlmAnnotations, WorldState } from '../sim/state';

const DIARIES_PER_GOBLIN = 48, JOURNALS = 1000, SPEECH = 60;

/** The annotations, with the lists an older save may lack. */
export function llmOf(s: WorldState): LlmAnnotations & { speech: SpeechEntry[] } {
  const l = (s.llm ??= { journals: [], speechText: {} });
  l.journals ??= [];
  l.speech ??= [];
  return l as LlmAnnotations & { speech: SpeechEntry[] };
}

export function addJournal(s: WorldState, e: JournalEntry): void {
  const js = llmOf(s).journals;
  js.push(e);
  if (e.kind === 'diary') {
    const mine = js.filter((j) => j.kind === 'diary' && j.goblinId === e.goblinId);
    if (mine.length > DIARIES_PER_GOBLIN) js.splice(js.indexOf(mine[0]!), 1);
  }
  while (js.length > JOURNALS) {
    const i = js.findIndex((j) => j.kind === 'diary');
    js.splice(i >= 0 ? i : 0, 1);
  }
}

/** A goblin's entries (or everyone's, for `null`), oldest first. */
export const journalsOf = (s: WorldState, id: ID | null, kind?: JournalEntry['kind']): JournalEntry[] =>
  llmOf(s).journals.filter((j) => (id === null || j.goblinId === id) && (!kind || j.kind === kind));

export function addSpeech(s: WorldState, e: SpeechEntry): void {
  const sp = llmOf(s).speech;
  sp.push(e);
  if (sp.length > SPEECH) sp.splice(0, sp.length - SPEECH);
}

/** What was said since `tick`, oldest first. */
export const speechSince = (s: WorldState, tick: number): SpeechEntry[] => llmOf(s).speech.filter((e) => e.tick >= tick);
