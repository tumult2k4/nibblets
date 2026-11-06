/** Sum a V8 `.cpuprofile` (from `node --cpu-prof`) by function: self time and the top callers' share. `npx tsx tools/profsum.ts file.cpuprofile [N]` */
import { readFileSync } from 'node:fs';

interface Node { id: number; callFrame: { functionName: string; url: string; lineNumber: number }; children?: number[] }
const prof = JSON.parse(readFileSync(process.argv[2]!, 'utf8')) as { nodes: Node[]; samples: number[]; timeDeltas: number[] };
const N = Number(process.argv[3] ?? 40);
const self = new Map<number, number>();
prof.samples.forEach((id, i) => self.set(id, (self.get(id) ?? 0) + (prof.timeDeltas[i] ?? 0)));
const byNode = new Map(prof.nodes.map((n) => [n.id, n]));
const parent = new Map<number, number>();
for (const n of prof.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const key = (n: Node) => `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.replace(/^.*\/src\//, '').replace(/^file:\/\//, '')}:${n.callFrame.lineNumber + 1}`;
const selfBy = new Map<string, number>(), totalBy = new Map<string, number>();
let total = 0;
for (const [id, t] of self) {
  total += t;
  const n = byNode.get(id)!;
  selfBy.set(key(n), (selfBy.get(key(n)) ?? 0) + t);
  const seen = new Set<string>();
  for (let x: number | undefined = id; x !== undefined; x = parent.get(x)) {
    const k = key(byNode.get(x)!);
    if (!seen.has(k)) { seen.add(k); totalBy.set(k, (totalBy.get(k) ?? 0) + t); }
  }
}
const pct = (t: number) => ((100 * t) / total).toFixed(1).padStart(5);
console.log(`total ${(total / 1000).toFixed(0)} ms\n-- self --`);
for (const [k, t] of [...selfBy].sort((a, b) => b[1] - a[1]).slice(0, N)) console.log(pct(t), k);
console.log('-- inclusive (sim only) --');
for (const [k, t] of [...totalBy].filter(([k]) => /sim\//.test(k)).sort((a, b) => b[1] - a[1]).slice(0, N)) console.log(pct(t), k);
// `--callers name`: who spends time in `name` (its inclusive time, by the caller's function)
if (process.argv.includes('--callers')) {
  const want = process.argv[process.argv.indexOf('--callers') + 1]!;
  const by = new Map<string, number>();
  for (const [id, t] of self) {
    for (let x: number | undefined = id; x !== undefined; x = parent.get(x)) {
      const n = byNode.get(x)!;
      if (n.callFrame.functionName !== want) continue;
      const p = parent.get(x), k = p !== undefined ? key(byNode.get(p)!) : '(root)';
      by.set(k, (by.get(k) ?? 0) + t);
      break;
    }
  }
  console.log(`-- callers of ${want} --`);
  for (const [k, t] of [...by].sort((a, b) => b[1] - a[1]).slice(0, N)) console.log(pct(t), k);
}
// `--callees name`: where the time inside `name` goes (inclusive, by the function it calls directly)
if (process.argv.includes('--callees')) {
  const want = process.argv[process.argv.indexOf('--callees') + 1]!;
  const by = new Map<string, number>();
  for (const [id, t] of self) {
    let child: number | undefined;
    for (let x: number | undefined = id; x !== undefined; child = x, x = parent.get(x)) {
      if (byNode.get(x)!.callFrame.functionName !== want) continue;
      const k = child !== undefined ? key(byNode.get(child)!) : '(self)';
      by.set(k, (by.get(k) ?? 0) + t);
      break;
    }
  }
  console.log(`-- callees of ${want} --`);
  for (const [k, t] of [...by].sort((a, b) => b[1] - a[1]).slice(0, N)) console.log(pct(t), k);
}
