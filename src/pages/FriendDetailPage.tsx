import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { HandCoins, UserX } from 'lucide-react';
import { useData, useAction } from '../app/data';
import { friendsList, STATUS_LABEL } from '../lib/ledger';
import { formatMoney } from '../lib/money';
import { Avatar, BackLink, Badge, BalanceText, Button, Card, CardHeader, EmptyState, Row } from '../components/ui';
import { GroupIcon } from './GroupsPage';
import { SettleDialog, type SettleDraft } from '../components/dialogs/SettleDialog';
import type { Group } from '../lib/types';

export function FriendDetailPage() {
  const { key } = useParams();
  const navigate = useNavigate();
  const data = useData();
  const { run, busy } = useAction();
  const f = friendsList(data).find((x) => x.key === decodeURIComponent(key ?? ''));
  const [settle, setSettle] = useState<{ group: Group; draft: SettleDraft } | null>(null);
  if (!f) return <Navigate to="/friends" replace />;
  const currency = data.me.default_currency || 'USD';

  const removeFriend = async () => {
    if (!f.contactId) return;
    const ok = await run((api) => api.deleteContact(f.contactId!), `${f.name} removed from your friends`);
    if (ok) navigate('/friends');
  };

  return (
    <>
      <BackLink to="/friends" label="Friends" />
      <section className="mb-5 flex flex-wrap items-center gap-4">
        <Avatar name={f.name} src={f.avatar_url} size={64} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate font-display text-[22px] font-medium md:text-[28px] leading-tight">{f.name}</h1>
            <Badge tone={f.status === 'friend' ? 'felt' : f.status === 'invited' ? 'brass' : 'neutral'}>{STATUS_LABEL[f.status]}</Badge>
          </div>
          <p className="text-sm text-ink-2">{f.email ?? 'No email on file'}</p>
        </div>
        <div className="rounded-2xl bg-surface-2 px-5 py-3 text-right">
          <p className="text-[13px] text-ink-2">{f.net === 0 ? 'All square' : f.net > 0 ? `${f.name} owes you` : `You owe ${f.name}`}</p>
          <p className={`amount font-display text-2xl font-medium md:text-3xl ${f.net > 0 ? 'text-gain' : f.net < 0 ? 'text-loss' : ''}`}>{formatMoney(Math.abs(f.net), currency)}</p>
        </div>
      </section>

      <Card>
        <CardHeader title="By group" />
        {f.groups.length === 0 ? (
          <EmptyState icon={<HandCoins size={28} />} title="No shared group yet" body="Add them to a group and balances will show up here." />
        ) : (
          <>
            <p className="px-4 pt-1 text-[13px] text-ink-2 md:px-5">Based on each group's simplified payments.</p>
            <div className="mt-2">
              {f.groups.map((fg) => (
                <Row key={fg.group.id}>
                  <GroupIcon kind={fg.group.kind} />
                  <Link to={`/groups/${fg.group.id}?tab=balances`} className="min-w-0 flex-1 truncate text-sm font-semibold hover:underline">{fg.group.name}</Link>
                  <BalanceText cents={fg.cents} currency={fg.group.currency} />
                  {fg.cents !== 0 && (
                    <Button size="sm" onClick={() => setSettle({
                      group: fg.group,
                      draft: fg.cents > 0
                        ? { from: fg.memberId, to: fg.myMemberId, cents: fg.cents }
                        : { from: fg.myMemberId, to: fg.memberId, cents: -fg.cents },
                    })}><HandCoins size={14} aria-hidden="true" />Settle</Button>
                  )}
                </Row>
              ))}
            </div>
          </>
        )}
      </Card>
      {f.contactId && f.groups.length === 0 && (
        <Button variant="danger" className="mt-4" loading={busy} onClick={removeFriend}><UserX size={16} aria-hidden="true" />Remove friend</Button>
      )}
      {settle && <SettleDialog group={settle.group} draft={settle.draft} onClose={() => setSettle(null)} />}
    </>
  );
}
