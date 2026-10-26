/** The All checkbox on tap-to-pick lists (SPEC PLAT-8). `ids` is the list as shown, so a search
 *  narrows it; picks outside it are left alone. */

/** Everyone shown is picked, or (with a cap) the table is full. */
export function isAllPicked(picked: string[], ids: string[], max = Infinity): boolean {
  if (ids.length === 0) return false;
  return ids.every((id) => picked.includes(id)) || picked.length >= max;
}

/** Picks everyone shown (up to `max` in total, keeping who's already picked), or clears them all if they already are. */
export function toggleAll(picked: string[], ids: string[], max = Infinity): string[] {
  if (isAllPicked(picked, ids, max)) return picked.filter((id) => !ids.includes(id));
  const out = [...picked];
  for (const id of ids) {
    if (out.length >= max) break;
    if (!out.includes(id)) out.push(id);
  }
  return out;
}
