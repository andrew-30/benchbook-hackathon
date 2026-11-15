import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { supabase } from '../lib/supabase';
import type { StatisticsData } from '../lib/types';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export function useStatistics(protocolId: string | undefined) {
  return useQuery({
    queryKey: ['statistics', protocolId],
    queryFn: () => api<StatisticsData>(`/api/protocols/${protocolId}/statistics`),
    enabled: !!protocolId,
    staleTime: 30_000,
  });
}

export async function downloadProtocolCsv(
  protocolId: string,
  protocolName: string,
): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not signed in');
  const res = await fetch(`${API_URL}/api/protocols/${protocolId}/export/csv`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`CSV ${res.status}: ${text}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${protocolName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}-data.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
