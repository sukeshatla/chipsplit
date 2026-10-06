import { useQuery } from '@tanstack/react-query';
import { History, RotateCcw } from 'lucide-react';
import { useAuth } from '../app/auth';
import { useAction, useData } from '../app/data';
import { isGameHost, myMemberId } from '../lib/ledger';
import { formatDate } from '../lib/money';
import { Button, Card, CardHeader, EmptyState, Row, Spinner } from './ui';
import type { ChangeLogEntry, Group } from '../lib/types';

/** Who to show for an entry: "You", the acting member's current name in this group, or a fallback. */
function actorName(g: Group, meId: string, entry: ChangeLogEntry) {
  if (entry.actor_id === meId) return 'You';
  const m = g.members.find((x) => x.user_id === entry.actor_id);
  return m?.name ?? 'Someone';
}

/** The lightweight activity log for a group, optionally filtered to one entity (e.g. a single game). */
export function HistoryList({ g, entityId }: { g: Group; entityId?: string }) {
  const { api } = useAuth();
  const { me } = useData();
  const { run, busy } = useAction();
  const { data, isLoading, refetch } = useQuery({ queryKey: ['history', g.id], queryFn: () => api.loadHistory(g.id) });
  const member = !!myMemberId(g, me.id);

  if (isLoading) return <Spinner />;
  const filtered = (data ?? []).filter((e) => !entityId || e.entity_id === entityId);
  // An expense or game that's still deleted can be restored from its newest "Deleted" entry (one
  // deleted, restored, then deleted again only offers it once). Newest entries come first.
  // Any member can restore an expense; only a game's host can restore that game (0025).
  const deletedIds = new Set([
    ...(member ? (g.deleted_expenses ?? []).map((e) => e.id) : []),
    ...(g.deleted_sessions ?? []).filter((s) => isGameHost(g, s, me.id)).map((s) => s.id),
  ]);
  const restorable = new Set<string>();
  for (const e of filtered) {
    if ((e.entity_type === 'expense' || e.entity_type === 'session') && e.entity_id && deletedIds.has(e.entity_id) && e.summary.startsWith('Deleted')) {
      restorable.add(e.id);
      deletedIds.delete(e.entity_id);
    }
  }
  const restore = async (entry: ChangeLogEntry) => {
    const id = entry.entity_id!;
    const ok = entry.entity_type === 'session'
      ? await run((api) => api.restoreSession(id), 'Game restored')
      : await run((api) => api.restoreExpense(id), 'Expense restored');
    if (ok !== undefined) refetch();
  };
  if (filtered.length === 0) {
    return <Card><EmptyState icon={<History size={28} />} title="No activity yet" body="Changes here show up as they happen." /></Card>;
  }
  return (
    <Card>
      <CardHeader title="History" />
      <div className="mt-2">
        {filtered.map((e) => (
          <Row key={e.id}>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm"><b className="font-semibold">{actorName(g, me.id, e)}</b> {lowerFirst(e.summary)}</p>
              <p className="text-[12px] text-ink-2">
                {formatDate(e.created_at, { month: 'short', day: 'numeric' })} at {new Date(e.created_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
              </p>
            </div>
            {restorable.has(e.id) && (
              <Button size="sm" disabled={busy} onClick={() => restore(e)}><RotateCcw size={14} aria-hidden="true" />Restore</Button>
            )}
          </Row>
        ))}
      </div>
    </Card>
  );
}

function lowerFirst(s: string) {
  return s.length ? s[0]!.toLowerCase() + s.slice(1) : s;
}
