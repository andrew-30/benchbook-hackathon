import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { UserProfile } from '../lib/types';

export interface ProfileFetch {
  profile: UserProfile | null;
}

async function fetchProfile(): Promise<ProfileFetch> {
  try {
    const profile = await api<UserProfile>('/api/users/profile');
    return { profile };
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('API 404')) {
      return { profile: null };
    }
    throw err;
  }
}

export function useProfile() {
  return useQuery({
    queryKey: ['profile'],
    queryFn: fetchProfile,
    staleTime: 60_000,
  });
}

export interface ProfileInput {
  name: string;
  institution?: string | null;
  research_area?: string | null;
}

export function useCreateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ProfileInput) =>
      api<UserProfile>('/api/users/profile', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: (profile) => {
      qc.setQueryData(['profile'], { profile });
    },
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<ProfileInput>) =>
      api<UserProfile>('/api/users/profile', {
        method: 'PUT',
        body: JSON.stringify(input),
      }),
    onSuccess: (profile) => {
      qc.setQueryData(['profile'], { profile });
      qc.invalidateQueries({ queryKey: ['usage'] });
    },
  });
}
