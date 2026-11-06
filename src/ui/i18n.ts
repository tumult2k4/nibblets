/** All UI strings (§18.1 rule 6). `t(key, params)`; English + Deutsch. Split by language, with later phases in their own files (i18n.p6.ts …) for size. */
import { EN as EN0 } from './i18n.en';
import { DE as DE0 } from './i18n.de';
import { DE6, EN6 } from './i18n.p6';
import { DE7, EN7 } from './i18n.p7';
import { DE8, EN8 } from './i18n.p8';
import { DE8B, EN8B } from './i18n.p8b';
import { DE8C, EN8C } from './i18n.p8c';

const EN = { ...EN0, ...EN6, ...EN7, ...EN8, ...EN8B, ...EN8C };
const DE: Record<string, string> = { ...DE0, ...DE6, ...DE7, ...DE8, ...DE8B, ...DE8C };

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
  let s = TABLES[lang][key] ?? EN[key as I18nKey] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

/** Keys missing from German (used by a unit test). */
/** The god's name as the village says it: a template id (`@giver.kind`, P8.8) worded per language, or the Voice's own. */
export const godNameText = (name: string | null): string => (name?.startsWith('@') ? t(`godname.${name.slice(1)}`) : name ?? '');

export const missingGerman = (): string[] => Object.keys(EN).filter((k) => !(k in DE));
