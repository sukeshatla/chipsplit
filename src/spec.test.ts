/// <reference types="node" />
// Keeps SPEC.md and the tests in step (see CLAUDE.md § Workflow). Every rule marked `test` needs
// at least one test named with its ID, like it('[FRIEND-6] ...'), and every ID a test names must
// be a rule in SPEC.md.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = new URL('..', import.meta.url).pathname;
const ID = /^[A-Z]+-\d+$/;

interface Rule { id: string; verified: string; where: string }

/** Rule rows from SPEC.md's tables: | ID | Rule | Verified by | Where |. Struck-through rows are retired. */
function rules(): Rule[] {
  return readFileSync(join(root, 'SPEC.md'), 'utf8').split('\n')
    .map((line) => line.split('|').map((c) => c.trim()))
    .filter((cells) => cells.length >= 6 && ID.test(cells[1]!))
    .map((cells) => ({ id: cells[1]!, verified: cells[3]!, where: cells[4]! }));
}

function testFiles(dir = join(root, 'src')): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return testFiles(path);
    return name.endsWith('.test.ts') && name !== 'spec.test.ts' ? [path] : [];
  });
}

/** Every [AREA-n] tag used in a test or describe name. */
function taggedIds(): Set<string> {
  const ids = new Set<string>();
  for (const file of testFiles()) {
    for (const m of readFileSync(file, 'utf8').matchAll(/\[([A-Z]+-\d+)\]/g)) ids.add(m[1]!);
  }
  return ids;
}

describe('SPEC.md', () => {
  const all = rules();
  const tagged = taggedIds();

  it('has rules, each with a unique ID and a known way of being verified', () => {
    expect(all.length).toBeGreaterThan(50);
    const ids = all.map((r) => r.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
    expect(all.filter((r) => !['test', 'db', 'manual'].includes(r.verified)).map((r) => r.id)).toEqual([]);
  });

  it('every rule verified by `test` has a test tagged with its ID', () => {
    expect(all.filter((r) => r.verified === 'test' && !tagged.has(r.id)).map((r) => r.id)).toEqual([]);
  });

  it('every ID a test is tagged with is a rule in SPEC.md', () => {
    const known = new Set(all.map((r) => r.id));
    expect([...tagged].filter((id) => !known.has(id))).toEqual([]);
  });

  it('`db` rules name what enforces them, and `manual` rules say how to check', () => {
    expect(all.filter((r) => r.verified === 'db' && !/\d{4}|\(\)/.test(r.where)).map((r) => r.id)).toEqual([]);
    expect(all.filter((r) => r.verified === 'manual' && !r.where.includes('—')).map((r) => r.id)).toEqual([]);
  });
});
