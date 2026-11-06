/**
 * LLM mode (§19, P9), reached as CFG.llm. Nothing in the sim reads it: these are the defaults of the player's LLM
 * settings and the scheduler's limits, kept with the other tunables.
 */
export const LLM = {
  /** per in-game day: the token budget for everything (§19.6), the Voice's own sub-cap (§19.4), and how many of each
   * product may be asked for */
  budgets: { tokensPerDay: 12000, voiceTokens: 4000, diaries: 3, dialogues: 4, barks: 6, books: 2 },
  temperature: 0.8,
  /** the scheduler (§19.6): concurrency, requests a minute, a request's timeout and retries; after `pauseAfter`
   * errors in a row LLM mode rests `pauseTicks` (10 in-game minutes) */
  scheduler: { concurrency: 2, perMinute: 10, timeoutMs: 20000, retries: 1, pauseAfter: 3, pauseTicks: 25 },
  /** products (§19.4, P9.4): a dialogue needs both chatters to have had a day worth a line of `minScore` or one to
   * feel strongly (`minOpinion`) about the other; barks cool down an hour a goblin and are stale after `barkStale`
   * ticks; texts are clamped to these lengths */
  products: { minScore: 5, minOpinion: 50, dialogueStale: 300, barkStale: 100, diaryChars: 800, barkChars: 90, lineChars: 80 },
  /** where the providers listen by default */
  endpoints: { proxy: 'http://localhost:8787/complete', ollama: 'http://localhost:11434/api/generate', anthropic: 'https://api.anthropic.com/v1/messages' },
};
