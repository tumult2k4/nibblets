import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });
}

describe('architecture (§3.1, §2.3)', () => {
  const simFiles = files(join(__dirname, '..')).filter((f) => !f.includes('__tests__'));
  it('no sim file imports three, render, ui or llm', () => {
    for (const f of simFiles) {
      const src = readFileSync(f, 'utf8');
      const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]!);
      for (const imp of imports) {
        expect(imp, f).not.toMatch(/^three/);
        expect(imp, f).not.toMatch(/\/(render|ui|llm)\//);
      }
    }
  });
  it('no Math.random / Date.now / DOM globals in sim', () => {
    for (const f of simFiles) {
      const src = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(src, f).not.toMatch(/Math\.random|Date\.now|\bwindow\.|\bdocument\.|localStorage/);
    }
  });
  it('no source file over ~300 lines', () => {
    for (const f of files(join(__dirname, '..', '..'))) {
      const lines = readFileSync(f, 'utf8').split('\n').length;
      expect(lines, f).toBeLessThanOrEqual(320);
    }
  });
});
