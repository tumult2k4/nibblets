/** Window dock strings: short names for the windows that otherwise only open by a key. Merged by i18n.ts. */
export const ENDOCK = {
  'dock.inspector': 'Inspector', 'dock.feed': 'Feed', 'dock.village': 'Village', 'dock.stats': 'Stats', 'dock.prayers': 'Prayers', 'dock.sandbox': 'Sandbox drawer',
};

export const DEDOCK: Record<keyof typeof ENDOCK, string> = {
  'dock.inspector': 'Inspektor', 'dock.feed': 'Neuigkeiten', 'dock.village': 'Dorf', 'dock.stats': 'Statistik', 'dock.prayers': 'Gebete', 'dock.sandbox': 'Sandbox-Schublade',
};
