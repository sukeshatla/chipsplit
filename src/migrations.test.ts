/// <reference types="node" />
// Checks on the SQL in supabase/migrations that a hostile client can't, but a fresh project can, break.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const dir = new URL('../supabase/migrations', import.meta.url).pathname;
const sql = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort().map((f) => readFileSync(join(dir, f), 'utf8')).join('\n').toLowerCase();

describe('migrations', () => {
  it('[PLAT-7] every table is granted to the Data API roles, not left to Supabase defaults', () => {
    const tables = [...sql.matchAll(/create table (?:if not exists )?public\.(\w+)/g)].map((m) => m[1]!);
    expect(tables.length).toBeGreaterThan(0);
    const missing = [...new Set(tables)].filter((t) =>
      ['anon', 'authenticated', 'service_role'].some((role) => !new RegExp(`grant [^;]* on (?:table )?[^;]*\\bpublic\\.${t}\\b[^;]* to [^;]*\\b${role}\\b`).test(sql)));
    expect(missing).toEqual([]);
  });
});
