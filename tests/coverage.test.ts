import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
// Every rule id in a spec has a test named by it (KB rule 2): spec 10 in rules.test.ts, spec 15 in v2.test.ts,
// spec 20 in kerrow.test.ts. Pending ids (it.todo) count until their slice lands. No id may appear in two specs.
const ids = (file: string): string[] => [...readFileSync(file, 'utf8').matchAll(/^- \*\*([A-Z]+-\d+)\*\*/gm)].map((m) => m[1]!);
const SPECS: [string, string, number][] = [
  ['docs/spec/10-rules.md', 'tests/rules.test.ts', 30],
  ['docs/spec/15-combat-v2.md', 'tests/v2.test.ts', 50],
  ['docs/spec/20-kerrow.md', 'tests/kerrow.test.ts', 8],
];
for (const [spec, test, min] of SPECS) {
  it(`every rule id in ${spec} has a test in ${test}`, () => {
    const list = ids(spec);
    const tests = readFileSync(test, 'utf8');
    expect(list.length).toBeGreaterThan(min);
    expect(list.filter((id) => !tests.includes(`'${id} `))).toEqual([]);
  });
}
it('no rule id appears in two specs', () => {
  const all = SPECS.flatMap(([spec]) => ids(spec));
  expect(all.filter((id, i) => all.indexOf(id) !== i)).toEqual([]);
});
