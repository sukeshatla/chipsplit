import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from './auth';
import { useToast } from './toast';
import type { AppData } from '../lib/types';
import type { DataApi } from '../api/types';

/** All of the signed-in user's groups load in one query; every screen derives from it. */
export function useAppQuery() {
  const { api, mode } = useAuth();
  return useQuery({ queryKey: ['all', mode], queryFn: () => api.loadAll() });
}

const DataCtx = createContext<AppData | null>(null);
export function DataProvider({ data, children }: { data: AppData; children: ReactNode }) {
  return <DataCtx.Provider value={data}>{children}</DataCtx.Provider>;
}
export function useData() {
  const d = useContext(DataCtx);
  if (!d) throw new Error('useData must be inside DataProvider');
  return d;
}

/**
 * Run a write, refresh data, and show a toast.
 * Resolves to the action's value (or `true` for actions that return nothing) on success, and `undefined` on failure.
 */
export function useAction() {
  const { api } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(async <T,>(fn: (api: DataApi) => Promise<T>, success?: string): Promise<(T extends void ? true : T) | undefined> => {
    setBusy(true);
    try {
      const r = await fn(api);
      await qc.invalidateQueries({ queryKey: ['all'] });
      if (success) toast.push(success);
      return (r === undefined ? true : r) as T extends void ? true : T;
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'Something went wrong. Try again.', 'error');
      return undefined;
    } finally {
      setBusy(false);
    }
  }, [api, qc, toast]);
  return { run, busy };
}
