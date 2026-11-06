/**
 * Cleaning text on its way in and out of the LLM (§19.5, §19.6, P9.3). In: anything the player can type (a renamed
 * goblin, the village's or god's name, words to the sky) becomes one plain line without braces or line breaks, so
 * it cannot turn into instructions inside a prompt. Out: markdown and wrapping quotes go, whitespace folds, the text
 * is clamped at a sentence (else a word) boundary, and a reply that names a goblin outside the scene is refused, so
 * the caller falls back to the Mock's text. Pure.
 */

/** One plain line of at most `max` characters, for player-typed text inside a prompt. */
export function cleanInput(s: string, max = 40): string {
  const one = s.replace(/\p{Cc}+/gu, ' ').replace(/[{}<>`]/g, '').replace(/\s+/g, ' ').trim();
  return one.length > max ? one.slice(0, max).trimEnd() : one;
}

/** Strip markdown, list marks and quotes around the whole text; fold whitespace (keeping line breaks if asked). */
export function stripMarkdown(s: string, keepLines = false): string {
  let t = s.replace(/\r/g, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm, '')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(^|[^\w*])[*_]([^*_\n]+)[*_](?=[^\w*]|$)/g, '$1$2')
    .replace(/`([^`]*)`/g, '$1');
  t = keepLines ? t.split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n') : t.replace(/\s+/g, ' ').trim();
  const q = t.match(/^["“„«'](.*)["”“»']$/s);
  return q && !/["“”„«»]/.test(q[1]!) ? q[1]!.trim() : t;
}

/** At most `max` characters: cut after the last full sentence that fits, else at a word, with an ellipsis. */
export function clamp(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '), /[.!?]$/.test(cut) ? cut.length - 1 : -1);
  if (end >= max * 0.5) return cut.slice(0, end + 1).trim();
  const sp = cut.lastIndexOf(' ');
  return `${(sp > max * 0.5 ? cut.slice(0, sp) : cut).replace(/[\s,;:–—-]+$/, '')}…`;
}

/** Whole-word, case-sensitive test for a name in a text (goblin names are capitalized words such as "Krikwick"). */
export const mentions = (text: string, name: string): boolean =>
  !!name && new RegExp(`(^|[^\\p{L}])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\p{L}])`, 'u').test(text);

export interface OutputRules {
  /** characters at most (after cleaning) */
  maxChars: number;
  /** every goblin name in the world, living and dead */
  known?: readonly string[];
  /** the names this text may use (the scene's goblins and the dead it may remember) */
  allowed?: readonly string[];
  keepLines?: boolean;
}

/** A model's answer made fit to show, or null if it is empty or names a goblin outside the scene. */
export function cleanOutput(text: string, r: OutputRules): string | null {
  const t = stripMarkdown(text, r.keepLines);
  if (!t) return null;
  const allowed = new Set(r.allowed ?? []);
  for (const n of r.known ?? []) if (!allowed.has(n) && mentions(t, n)) return null;
  return r.keepLines ? t.split('\n').map((l) => clamp(l, r.maxChars)).join('\n') : clamp(t, r.maxChars);
}

export interface DialogueLine { speaker: 0 | 1; text: string }

/** "NAME: text" lines from a dialogue answer: lines by anyone else are dropped, 6 lines and 80 characters at most. */
export function parseDialogue(text: string, names: readonly [string, string], maxLines = 6, maxChars = 80): DialogueLine[] {
  const out: DialogueLine[] = [];
  for (const raw of stripMarkdown(text, true).split('\n')) {
    const m = raw.match(/^\s*\**([^:*]{1,40}?)\**\s*:\s*(.+)$/);
    if (!m) continue;
    const who = m[1]!.trim(), say = stripMarkdown(m[2]!);
    const speaker = who === names[0] ? 0 : who === names[1] ? 1 : -1;
    if (speaker === -1 || !say) continue;
    out.push({ speaker: speaker as 0 | 1, text: clamp(say, maxChars) });
    if (out.length >= maxLines) break;
  }
  return out;
}
