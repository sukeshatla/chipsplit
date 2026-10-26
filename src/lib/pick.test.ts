import { describe, expect, it } from 'vitest';
import { isAllPicked, toggleAll } from './pick';

describe('the All checkbox', () => {
  it('[PLAT-8] picks everyone, then clears them on the next tap', () => {
    const all = toggleAll(['b'], ['a', 'b', 'c']);
    expect(all.sort()).toEqual(['a', 'b', 'c']);
    expect(isAllPicked(all, ['a', 'b', 'c'])).toBe(true);
    expect(toggleAll(all, ['a', 'b', 'c'])).toEqual([]);
  });

  it('[PLAT-8] acts only on the people shown, so a search keeps other picks', () => {
    expect(toggleAll(['x'], ['a', 'b']).sort()).toEqual(['a', 'b', 'x']);
    expect(toggleAll(['a', 'b', 'x'], ['a', 'b'])).toEqual(['x']);
  });

  it('[PLAT-8] an empty list is never "all picked"', () => {
    expect(isAllPicked([], [])).toBe(false);
  });

  it('[PLAT-8] with a cap, fills the seats left (keeping who is picked) and counts a full table as all', () => {
    const ids = ['a', 'b', 'c', 'd'];
    expect(toggleAll(['d'], ids, 3)).toEqual(['d', 'a', 'b']);
    expect(isAllPicked(['d', 'a', 'b'], ids, 3)).toBe(true);
    expect(toggleAll(['d', 'a', 'b'], ids, 3)).toEqual([]);
  });
});
