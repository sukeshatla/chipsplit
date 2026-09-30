import { useQuery } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../app/auth';
import { useData } from '../app/data';
import { isAppAdmin } from '../lib/admin';
import { formatDate } from '../lib/money';
import { Avatar, Card, CardHeader, PageHeader, Row, Spinner } from '../components/ui';
import type { AdminDailyActivity } from '../api/types';

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <p className="text-[12px] text-ink-2">{label}</p>
      <p className="mt-1 font-display text-2xl font-medium">{value}</p>
    </div>
  );
}

/** A small hand-rolled bar chart -- this is the only admin-facing page, so it's not worth a charting dependency. */
function DailyBars({ data, pick, color, label }: { data: AdminDailyActivity[]; pick(d: AdminDailyActivity): number; color: string; label: string }) {
  const max = Math.max(1, ...data.map(pick));
  return (
    <div>
      <p className="mb-1.5 text-[12px] font-semibold text-ink-2">{label}</p>
      <div className="flex h-20 gap-px">
        {data.map((d) => {
          const v = pick(d);
          return (
            <div key={d.day} className="relative flex-1" title={`${formatDate(d.day)}: ${v}`}>
              <div className={`absolute bottom-0 left-0 right-0 rounded-t ${color}`} style={{ height: `${Math.max(3, (v / max) * 100)}%` }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AdminPage() {
  const { me } = useData();
  const { api } = useAuth();
  const admin = isAppAdmin(me.email);

  const overview = useQuery({ queryKey: ['admin-overview'], queryFn: () => api.loadAdminOverview(), enabled: admin });
  const daily = useQuery({ queryKey: ['admin-daily'], queryFn: () => api.loadAdminDailyActivity(30), enabled: admin });
  const signups = useQuery({ queryKey: ['admin-signups'], queryFn: () => api.loadAdminRecentSignups(20), enabled: admin });

  if (!admin) {
    return (
      <Card className="p-8 text-center">
        <p className="font-display text-lg font-medium">Not available</p>
        <p className="mt-1 text-sm text-ink-2">This page isn't part of your account.</p>
      </Card>
    );
  }

  const loading = overview.isLoading || daily.isLoading || signups.isLoading;

  return (
    <>
      <PageHeader title="Admin" subtitle="Usage across everyone signed up for Chip n Split — visible only to you." />
      {loading ? <Spinner /> : (
        <div className="space-y-5">
          {overview.data && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <StatCard label="Total signed up" value={overview.data.total_users} />
              <StatCard label="New today" value={overview.data.new_today} />
              <StatCard label="New this week" value={overview.data.new_this_week} />
              <StatCard label="New this month" value={overview.data.new_this_month} />
              <StatCard label="Active today" value={overview.data.active_today} />
              <StatCard label="Active this week" value={overview.data.active_this_week} />
            </div>
          )}

          <Card className="p-4 md:p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-base font-medium">Last 30 days</h2>
              <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-2"><ShieldCheck size={13} aria-hidden="true" />Admin only</span>
            </div>
            {daily.data && daily.data.length > 0 ? (
              <div className="space-y-5">
                <DailyBars data={daily.data} pick={(d) => d.active_users} color="bg-felt/70" label="Active users" />
                <DailyBars data={daily.data} pick={(d) => d.new_users} color="bg-brass/70" label="New signups" />
                <div className="flex justify-between text-[11px] text-ink-2">
                  <span>{formatDate(daily.data[0]!.day)}</span>
                  <span>{formatDate(daily.data[daily.data.length - 1]!.day)}</span>
                </div>
              </div>
            ) : <p className="text-sm text-ink-2">No activity recorded yet — this fills in as people use the app from today onward.</p>}
          </Card>

          <Card>
            <CardHeader title="Recent signups" />
            <div className="mt-2">
              {signups.data && signups.data.length > 0 ? signups.data.map((s) => (
                <Row key={s.id}>
                  <Avatar name={s.display_name || s.email} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{s.display_name || 'Unnamed'}</p>
                    <p className="truncate text-[12px] text-ink-2">{s.email}</p>
                  </div>
                  <div className="shrink-0 text-right text-[12px] text-ink-2">
                    <p>Joined {formatDate(s.created_at)}</p>
                    <p>{s.last_seen_at ? `Seen ${formatDate(s.last_seen_at)}` : 'Never opened'}</p>
                  </div>
                </Row>
              )) : <p className="px-5 pb-5 pt-2 text-sm text-ink-2">No one's signed up yet.</p>}
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
