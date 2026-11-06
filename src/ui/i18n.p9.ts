/** Phase 9 strings (LLM mode, written culture), merged by i18n.ts. */
export const EN9 = {
  'set.llm': 'Voices (LLM)', 'llm.enabled': 'LLM mode', 'llm.enabledHint': 'Off: no text is asked for anywhere. The world runs the same either way.',
  'llm.provider': 'Provider', 'llm.p.mock': 'Built-in (offline templates)', 'llm.p.proxy': 'Local proxy (recommended)', 'llm.p.ollama': 'Ollama (local model)',
  'llm.p.anthropic': 'Anthropic API, direct (developers only)', 'llm.model': 'Model', 'llm.modelHint': 'The model name your provider knows.',
  'llm.endpoint': 'Address', 'llm.endpointHint': 'Empty: {url}', 'llm.apiKey': 'API key',
  'llm.keyWarn': 'Developer only: the key is kept in this browser and sent from the page, where anything running in it can read it. The local proxy keeps it out of the browser: ANTHROPIC_API_KEY=… NIBBLETS_MODEL=… npm run llm-proxy',
  'llm.proxyHint': 'Start the proxy with: ANTHROPIC_API_KEY=… NIBBLETS_MODEL=… npm run llm-proxy',
  'llm.temperature': 'Temperature', 'llm.budgets': 'Per in-game day', 'llm.b.tokensPerDay': 'Tokens', 'llm.b.voiceTokens': 'Tokens for the Voice',
  'llm.b.diaries': 'Diary entries', 'llm.b.dialogues': 'Conversations', 'llm.b.barks': 'Shouts', 'llm.b.books': 'Books',
  'llm.test': 'Test', 'llm.testing': 'Asking…', 'llm.testOk': 'Answer: {text}', 'llm.testFail': 'Failed: {err}', 'llm.testPrompt': 'Greet the god of the goblins in one short line.',
  'llm.local': 'Kept in this browser, never in saves.',
  'mm.places': 'Names', 'key.places': 'Place names on the map', 'ev.place_named': 'The village calls this place {name}.',
  'ev.place_named_after': 'The village calls this place {name}, after {who}.',
};

export const DE9: Record<keyof typeof EN9, string> = {
  'set.llm': 'Stimmen (KI)', 'llm.enabled': 'KI-Modus', 'llm.enabledHint': 'Aus: nirgends wird Text erfragt. Die Welt läuft so oder so gleich.',
  'llm.provider': 'Anbieter', 'llm.p.mock': 'Eingebaut (Vorlagen, offline)', 'llm.p.proxy': 'Lokaler Proxy (empfohlen)', 'llm.p.ollama': 'Ollama (lokales Modell)',
  'llm.p.anthropic': 'Anthropic-API direkt (nur für Entwickler)', 'llm.model': 'Modell', 'llm.modelHint': 'Der Modellname, den dein Anbieter kennt.',
  'llm.endpoint': 'Adresse', 'llm.endpointHint': 'Leer: {url}', 'llm.apiKey': 'API-Schlüssel',
  'llm.keyWarn': 'Nur für Entwickler: Der Schlüssel liegt in diesem Browser und wird von der Seite gesendet, wo alles, was darin läuft, ihn lesen kann. Der lokale Proxy hält ihn aus dem Browser: ANTHROPIC_API_KEY=… NIBBLETS_MODEL=… npm run llm-proxy',
  'llm.proxyHint': 'Starte den Proxy mit: ANTHROPIC_API_KEY=… NIBBLETS_MODEL=… npm run llm-proxy',
  'llm.temperature': 'Temperatur', 'llm.budgets': 'Pro Spieltag', 'llm.b.tokensPerDay': 'Tokens', 'llm.b.voiceTokens': 'Tokens für die Stimme',
  'llm.b.diaries': 'Tagebucheinträge', 'llm.b.dialogues': 'Gespräche', 'llm.b.barks': 'Ausrufe', 'llm.b.books': 'Bücher',
  'llm.test': 'Testen', 'llm.testing': 'Frage…', 'llm.testOk': 'Antwort: {text}', 'llm.testFail': 'Fehlgeschlagen: {err}', 'llm.testPrompt': 'Grüße den Gott der Goblins in einer kurzen Zeile.',
  'llm.local': 'Liegt in diesem Browser, nie in Spielständen.',
  'mm.places': 'Namen', 'key.places': 'Ortsnamen auf der Karte', 'ev.place_named': 'Das Dorf nennt diesen Ort {name}.',
  'ev.place_named_after': 'Das Dorf nennt diesen Ort {name}, nach {who}.',
};
