export interface Balance { id: string; cents: number }
export interface Transfer { from: string; to: string; cents: number }

/**
 * Greedy minimum-cash-flow settlement.
 * Positive cents = the member is owed money, negative = the member owes.
 * Matches the largest debtor with the largest creditor until everyone is at zero.
 * Produces at most (n - 1) transfers. Input must sum to zero.
 */
export function settle(balances: Balance[]): Transfer[] {
  const byAmount = (a: Balance, b: Balance) => b.cents - a.cents || a.id.localeCompare(b.id);
  const debtors = balances.filter((b) => b.cents < 0).map((b) => ({ id: b.id, cents: -b.cents })).sort(byAmount);
  const creditors = balances.filter((b) => b.cents > 0).map((b) => ({ ...b })).sort(byAmount);
  const transfers: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const cents = Math.min(debtors[i].cents, creditors[j].cents);
    if (cents > 0) transfers.push({ from: debtors[i].id, to: creditors[j].id, cents });
    debtors[i].cents -= cents;
    creditors[j].cents -= cents;
    if (debtors[i].cents === 0) i++;
    if (creditors[j].cents === 0) j++;
  }
  return transfers;
}
