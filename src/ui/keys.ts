import { loadPref, savePref } from './store';

/** Default keyboard shortcuts (§18.11); rebindable and stored under nibblets.ui.keys. */
export const DEFAULT_KEYS: Record<string, string> = {
  pause: 'Space', speed1: 'Digit1', speed2: 'Digit2', speed3: 'Digit3', speed4: 'Digit4', hand: 'KeyH', gifts: 'KeyG',
  follow: 'KeyF', lens: 'KeyL', cycle: 'Tab', quicksave: 'F5', quickload: 'F9', debug: 'Backquote', rotL: 'KeyQ', rotR: 'KeyE',
  help: 'F1', inspector: 'KeyI', feed: 'KeyN', terraform: 'KeyT', nature: 'KeyR', wrath: 'KeyZ', miracles: 'KeyM', village: 'KeyY', family: 'KeyK', sandbox: 'KeyB', stats: 'KeyO', prayers: 'KeyP', voice: 'KeyV', places: 'KeyX', journal: 'KeyJ',
};
// stored bindings from older versions lack newer actions: fill them from the defaults
let keys: Record<string, string> = { ...DEFAULT_KEYS, ...loadPref('keys', {} as Record<string, string>) };

export const getKeys = (): Record<string, string> => keys;
export function setKey(action: string, code: string): string | null {
  const clash = Object.keys(keys).find((a) => a !== action && keys[a] === code) ?? null;
  if (clash) keys = { ...keys, [clash]: keys[action]! };
  keys = { ...keys, [action]: code };
  savePref('keys', keys);
  return clash;
}
export function resetKeys(): void {
  keys = { ...DEFAULT_KEYS };
  savePref('keys', keys);
}
export const actionFor = (code: string): string | null => Object.keys(keys).find((a) => keys[a] === code) ?? null;
export const codeLabel = (code: string): string =>
  code.replace(/^Key/, '').replace(/^Digit/, '').replace('Backquote', '`').replace('Space', 'Space');
export const keyLabel = (action: string): string => codeLabel(keys[action] ?? '');
