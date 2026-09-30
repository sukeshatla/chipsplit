import { useQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { useAuth } from '../app/auth';
import { useData } from '../app/data';
import { formatDate } from '../lib/money';
import { Card, CardHeader, EmptyState, Row, Spinner } from './ui';
import type { ChangeLogEntry, Group } from '../lib/types';

/** Who to show for an entry: "You", the acting member's current name in this group, or a fallback. */
function actorName(g: Group, meId: string, entry: ChangeLogEntry) {
  if (entry.actor_id === meId) return 'You';
  const m = g.members.find((x) => x.user_id === entry.actor_id);
  return m?.name ?? 'Someone';
}

/** The lightweight activity log for a group, optionally filtered to one entity (e.g. a single game day). */
export function HistoryList({ g, entityId }: { g: Group; entityId?: string }) {
  const { api } = useAuth();
  const { me } = useData();
  const { data, isLoading } = useQuery({ queryKey: ['history', g.id], queryFn: () => api.loadHistory(g.id) });

  if (isLoading) return <Spinner />;
  const filtered = (data ?? []).filter((e) => !entityId || e.entity_id === entityId);
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
          </Row>
        ))}
      </div>
    </Card>
  );
}

function lowerFirst(s: string) {
  return s.length ? s[0]!.toLowerCase() + s.slice(1) : s;
}
