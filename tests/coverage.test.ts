import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
// Every rule id in the spec has a test named by it (KB rule 2).
const ids = (file: string): string[] => [...readFileSync(file, 'utf8').matchAll(/^- \*\*([A-Z]+-\d+)\*\*/gm)].map((m) => m[1]!);
it('every spec rule id has a test', () => {
  const spec = ids('docs/spec/10-rules.md');
  const tests = readFileSync('tests/rules.test.ts', 'utf8');
  const missing = spec.filter((id) => !tests.includes(`'${id} `));
  expect(spec.length).toBeGreaterThan(30);
  expect(missing).toEqual([]);
});
// Combat v2 ids (spec 15) are pending (it.todo) until their slice lands; each must still be named in tests/v2.test.ts.
it('every combat v2 rule id has a test or a pending test', () => {
  const spec = ids('docs/spec/15-combat-v2.md');
  const tests = readFileSync('tests/v2.test.ts', 'utf8');
  const missing = spec.filter((id) => !tests.includes(`'${id} `));
  expect(spec.length).toBeGreaterThan(50);
  expect(missing).toEqual([]);
  const v1 = new Set(ids('docs/spec/10-rules.md'));
  expect(spec.filter((id) => v1.has(id))).toEqual([]);
});
