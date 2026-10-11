import { describe, expect, it } from 'vitest';
import { imageBanner, imageParts } from './summaryImage';
import { gameTableData, summaryData } from './ledger';
import { game, group, member } from '../test/fixtures';

const players = [member('a', { name: 'Ana' }), member('b', { name: 'Bo' })];
const finished = game('s', { a: [2000, 4000], b: [2000, 0] }, { played_on: '2026-10-03', location: "Teja's place", default_buy_in_cents: 2000 });
const club = group({ name: 'Poker Pals', kind: 'club', members: players, sessions: [finished] });
const live = { ...finished, status: 'open' as const };

describe('share image banner', () => {
  it('[SHARE-7] group balances: labelled, with the group name and "As of" today', () => {
    const b = imageBanner(summaryData(club), 'both');
    expect(b.label).toBe('Group balances');
    expect(b.title).toBe('Poker Pals');
    expect(b.details[0]).toMatch(/^As of [A-Z][a-z]{2} \d{1,2}, \d{4}$/);
  });

  it('[SHARE-7] a finished game: "Final game" with its date, place, and buy-in', () => {
    const b = imageBanner(gameTableData(club, finished, finished.results), 'table');
    expect(b.label).toBe('Final game');
    expect(b.title).toBe('Poker Pals');
    expect(b.details).toEqual(['Sat, Oct 3, 2026', "📍 Teja's place", '$20 buy-in']);
  });

  it('[SHARE-7] a game in progress says so, with the same details', () => {
    const b = imageBanner(gameTableData(club, live, live.results), 'table');
    expect(b.label).toBe('In progress');
    expect(b.details).toEqual(['Sat, Oct 3, 2026', "📍 Teja's place", '$20 buy-in']);
  });

  it("[SHARE-7] a finished game's settle up is labelled Settle up and names the game", () => {
    const b = imageBanner(gameTableData(club, finished, finished.results), 'settle');
    expect(b.label).toBe('Settle up');
    expect(b.details).toEqual(['Final game', 'Sat, Oct 3, 2026', "📍 Teja's place"]);
  });

  it('[SHARE-7] a big group split in two says which picture is which', () => {
    expect(imageBanner(summaryData(club), 'stands').details.at(-1)).toBe('1 of 2');
    expect(imageBanner(summaryData(club), 'settle').details.at(-1)).toBe('2 of 2');
  });
});

describe('which pictures to share', () => {
  it('[SHARE-8] a finished game: the table, then settle up, as separate pictures', () => {
    expect(imageParts(gameTableData(club, finished, finished.results))).toEqual(['table', 'settle']);
  });

  it('[SHARE-8] a game in progress: only its table', () => {
    expect(imageParts(gameTableData(club, live, live.results))).toEqual(['table']);
  });

  it('[SHARE-8] group balances: one picture with both, or two past 20 rows', () => {
    expect(imageParts(summaryData(club))).toEqual(['both']);
    const many = Array.from({ length: 22 }, (_, i) => member(`m${i}`, { name: `P${i}` }));
    const big = group({ members: many, expenses: many.slice(1).map((m, i) => ({
      id: `e${i}`, group_id: 'g', description: 'x', category: 'general', amount_cents: 100, spent_on: '2026-01-01', created_by: null, created_at: '',
      payers: [{ member_id: 'm0', amount_cents: 100 }], shares: [{ member_id: m.id, amount_cents: 100 }] })) });
    expect(imageParts(summaryData(big))).toEqual(['stands', 'settle']);
  });
});
