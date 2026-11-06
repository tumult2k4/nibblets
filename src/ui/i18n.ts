/** All UI strings (§18.1 rule 6). `t(key, params)`; English + Deutsch. Split by language, with later phases in their own files (i18n.p6.ts …) for size. */
import { EN as EN0 } from './i18n.en';
import { DE as DE0 } from './i18n.de';
import { DE6, EN6 } from './i18n.p6';
import { DE7, EN7 } from './i18n.p7';
import { DE8, EN8 } from './i18n.p8';
import { DE8B, EN8B } from './i18n.p8b';
import { DE8C, EN8C } from './i18n.p8c';
import { DE9, EN9 } from './i18n.p9';
import { DE9B, EN9B } from './i18n.p9b';
import { DE9C, EN9C } from './i18n.p9c';
import { DE10, EN10 } from './i18n.p10';
import { DE11, EN11 } from './i18n.p11';
import { DEA, ENA } from './i18n.audio';

const EN = { ...EN0, ...EN6, ...EN7, ...EN8, ...EN8B, ...EN8C, ...EN9, ...EN9B, ...EN9C, ...EN10, ...EN11, ...ENA };
const DE: Record<string, string> = { ...DE0, ...DE6, ...DE7, ...DE8, ...DE8B, ...DE8C, ...DE9, ...DE9B, ...DE9C, ...DE10, ...DE11, ...DEA };

export type Lang = 'en' | 'de';
export type I18nKey = keyof typeof EN;
const TABLES: Record<Lang, Record<string, string>> = { en: EN, de: DE };
let lang: Lang = 'en';
const listeners: (() => void)[] = [];

export function setLang(l: Lang): void {
  lang = l;
  document.documentElement.lang = l;
  for (const f of listeners) f();
}
export const getLang = (): Lang => lang;
export const onLangChange = (f: () => void): void => {
  listeners.push(f);
};

export function t(key: I18nKey | string, params?: Record<string, string | number>): string {
  return tIn(lang, key, params);
}
/** `t` in a given language, whatever the UI shows (P9: prompts are written in the game's language setting). */
export function tIn(l: Lang, key: I18nKey | string, params?: Record<string, string | number>): string {
  let s = TABLES[l][key] ?? EN[key as I18nKey] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

/** Keys missing from German (used by a unit test). */
/** The god's name as the village says it: a template id (`@giver.kind`, P8.8) worded per language, or the Voice's own. */
export const godNameText = (name: string | null): string => (name?.startsWith('@') ? t(`godname.${name.slice(1)}`) : name ?? '');
/** The god's name as shown: the one a language model made the village's own (P9.7), else the shaman's, worded. */
export const godTitle = (s: { god: { godName: string | null }; llm?: { godName?: { name: string } } }): string => s.llm?.godName?.name ?? godNameText(s.god.godName);

export const missingGerman = (): string[] => Object.keys(EN).filter((k) => !(k in DE));
