import type { RepoPublic, RepoSummary } from './types';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, init);
  if (res.status === 204) return undefined as T;
  if (!res.ok) {
    let message = `Request failed with status ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body && typeof body.error === 'string') message = body.error;
    } catch {
      // non-JSON error body
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export interface SummaryResponse {
  repo: RepoPublic;
  summary: RepoSummary;
}

export const api = {
  listRepos: () => request<RepoPublic[]>('/repos'),

  uploadRepo: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<RepoPublic>('/repos/upload', { method: 'POST', body: form });
  },

  deleteRepo: (id: string) => request<void>(`/repos/${id}`, { method: 'DELETE' }),

  getSummary: (id: string) => request<SummaryResponse>(`/repos/${id}/summary`),
};
