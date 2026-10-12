import { useState } from 'react';
import { Trophy } from 'lucide-react';
import { memberShort, type LeaderRow } from '../lib/ledger';
import { formatMoney } from '../lib/money';
import { Amount, AvatarButton, Card, CardHeader, Row, useShowMore } from './ui';
import { MemberCardDialog } from './dialogs/MemberCardDialog';
import type { Group, Member } from '../lib/types';

/** All-time standings for a Poker or Rummy group (SPEC GAME-9, RUMMY-8): games, wins, best night,
 *  and money won or lost. Results only, not who owes what now. */
export function Leaderboard({ g, rows }: { g: Group; rows: LeaderRow[] }) {
  const list = useShowMore(rows);
  const [cardMember, setCardMember] = useState<Member | null>(null);
  return (
    <Card>
      <CardHeader title={<span className="inline-flex items-center gap-2"><Trophy size={16} className="text-brass" aria-hidden="true" />Leaderboard</span>} />
      <p className="px-4 pt-1 text-[13px] text-ink-2 md:px-5">All-time results, not who owes what now.</p>
      <div className="mt-2">
        {rows.length === 0 ? <p className="px-5 pb-5 text-sm text-ink-2">Finish a game to start the leaderboard.</p> :
          list.visible.map((r, i) => (
            <Row key={r.memberId}>
              <span className="amount w-5 text-center font-display text-sm text-ink-2">{i + 1}</span>
              <AvatarButton name={r.name} src={r.avatar_url} onClick={() => setCardMember(g.members.find((m) => m.id === r.memberId) ?? null)} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{memberShort(g, r.memberId)}</p>
                <p className="truncate text-[12px] text-ink-2">{r.games} game{r.games === 1 ? '' : 's'}, won {r.wins}{r.best > 0 ? `, best ${formatMoney(r.best, g.currency)}` : ''}</p>
              </div>
              <Amount cents={r.net} currency={g.currency} sign className="text-base" />
            </Row>
          ))}
      </div>
      {list.more}
      <MemberCardDialog member={cardMember} onClose={() => setCardMember(null)}
        extra={cardMember ? { label: 'All-time', node: <Amount cents={rows.find((b) => b.memberId === cardMember.id)?.net ?? 0} currency={g.currency} sign className="text-base" /> } : undefined} />
    </Card>
  );
}
