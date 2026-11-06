/**
 * Local LLM proxy (§19.2): `ANTHROPIC_API_KEY=… NIBBLETS_MODEL=<model> npm run llm-proxy`. Listens on port 8787
 * (`PORT` to change), takes `{system, prompt, maxTokens, temperature}` at POST /complete from the game on
 * localhost:5173, forwards it to the Anthropic Messages API and answers `{ text }`. The key never reaches the browser.
 */
import { createServer } from 'node:http';

const KEY = process.env.ANTHROPIC_API_KEY, MODEL = process.env.NIBBLETS_MODEL, PORT = Number(process.env.PORT ?? 8787);
const ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];
if (!KEY || !MODEL) {
  console.error('Set ANTHROPIC_API_KEY and NIBBLETS_MODEL (the model to ask), e.g. ANTHROPIC_API_KEY=… NIBBLETS_MODEL=… npm run llm-proxy');
  process.exit(1);
}

createServer((req, res) => {
  const origin = req.headers.origin ?? '';
  res.setHeader('Access-Control-Allow-Origin', ORIGINS.includes(origin) ? origin : ORIGINS[0]!);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  const send = (code: number, body: object) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
  if (req.method === 'OPTIONS') return void res.writeHead(204).end();
  if (req.method !== 'POST' || req.url !== '/complete') return send(404, { error: 'POST /complete' });
  let raw = '';
  req.on('data', (c: Buffer) => { raw += c; if (raw.length > 200_000) req.destroy(); });
  req.on('end', async () => {
    try {
      const { system, prompt, maxTokens, temperature } = JSON.parse(raw) as { system?: string; prompt?: string; maxTokens?: number; temperature?: number };
      if (typeof prompt !== 'string') return send(400, { error: 'no prompt' });
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: MODEL, max_tokens: Math.min(1024, Math.max(1, maxTokens ?? 200)), system: system ?? '', messages: [{ role: 'user', content: prompt }], ...(typeof temperature === 'number' ? { temperature } : {}) }),
      });
      const data = (await r.json()) as { content?: { type: string; text?: string }[]; error?: { message?: string } };
      if (!r.ok) return send(r.status, { error: data.error?.message ?? `upstream ${r.status}` });
      send(200, { text: (data.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('') });
    } catch (e) {
      send(500, { error: (e as Error).message });
    }
  });
}).listen(PORT, () => console.log(`llm-proxy on http://localhost:${PORT}/complete`));
