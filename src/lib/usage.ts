// Supabase free-plan usage for the Admin page (SPEC ADMIN-1). Only what Postgres can measure;
// egress and log ingestion live in Supabase's own Usage page.

export interface AdminUsage {
  database_bytes: number;
  storage_bytes: number;
  /** Distinct people who opened the app in the last 30 days: our stand-in for Supabase's MAU. */
  active_30d: number;
  tables?: { name: string; bytes: number; rows: number }[];
}

export type UsageLevel = 'ok' | 'warn' | 'over';

export interface UsageMeter {
  label: string;
  used: string;
  limit: string;
  percent: number;
  level: UsageLevel;
}

const MB = 1024 * 1024;
const GB = 1024 * MB;

/** Free plan limits, per project. */
export const FREE_PLAN = { databaseBytes: 500 * MB, storageBytes: GB, monthlyActiveUsers: 50_000 };

const UNITS = ['B', 'KB', 'MB', 'GB'];

export function formatBytes(bytes: number): string {
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < UNITS.length - 1) { v /= 1024; i++; }
  // One decimal place, dropped when it's .0, so "1 GB" and "27.7 MB".
  return `${i === 0 ? v : Number(v.toFixed(1))} ${UNITS[i]}`;
}

function meter(label: string, used: number, limit: number, show: (n: number) => string): UsageMeter {
  const percent = (used / limit) * 100;
  return { label, used: show(used), limit: show(limit), percent, level: percent >= 100 ? 'over' : percent >= 80 ? 'warn' : 'ok' };
}

export function usageMeters(u: AdminUsage): UsageMeter[] {
  const count = (n: number) => n.toLocaleString('en-US');
  return [
    meter('Database size', u.database_bytes, FREE_PLAN.databaseBytes, formatBytes),
    meter('File storage', u.storage_bytes, FREE_PLAN.storageBytes, formatBytes),
    meter('Active in 30 days', u.active_30d, FREE_PLAN.monthlyActiveUsers, count),
  ];
}
