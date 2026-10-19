import { describe, expect, it } from 'vitest';
import { formatBytes, usageMeters } from './usage';

const MB = 1024 * 1024;

describe('admin usage', () => {
  it('[ADMIN-1] shows database, storage, and active people against the free-plan limits', () => {
    const meters = usageMeters({ database_bytes: 27.72 * MB, storage_bytes: 31 * 1024, active_30d: 27 });
    expect(meters.map((m) => [m.label, m.used, m.limit, m.level])).toEqual([
      ['Database size', '27.7 MB', '500 MB', 'ok'],
      ['File storage', '31 KB', '1 GB', 'ok'],
      ['Active in 30 days', '27', '50,000', 'ok'],
    ]);
    expect(meters[0]!.percent).toBeCloseTo(5.5, 1);
  });

  it('[ADMIN-1] turns amber from 80% and red at 100%', () => {
    const level = (bytes: number) => usageMeters({ database_bytes: bytes, storage_bytes: 0, active_30d: 0 })[0]!.level;
    expect(level(399 * MB)).toBe('ok');
    expect(level(400 * MB)).toBe('warn');
    expect(level(500 * MB)).toBe('over');
  });

  it('[ADMIN-1] formats sizes in binary units', () => {
    expect([formatBytes(0), formatBytes(512), formatBytes(1536), formatBytes(27.72 * MB), formatBytes(1024 * MB)])
      .toEqual(['0 B', '512 B', '1.5 KB', '27.7 MB', '1 GB']);
  });
});
