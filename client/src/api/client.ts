import type {
  CommitListItem,
  PathMetrics,
  RepoPublic,
  RepoSummary,
  TreeNode,
} from './types';

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

export interface TreeResponse {
  repo: RepoPublic;
  tree: TreeNode;
}

export interface MetricsResponse {
  repo: RepoPublic;
  metrics: PathMetrics;
}

export interface CommitsResponse {
  total: number;
  commits: CommitListItem[];
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

  getTree: (id: string) => request<TreeResponse>(`/repos/${id}/tree`),

  getMetrics: (id: string, path: string) =>
    request<MetricsResponse>(`/repos/${id}/metrics?path=${encodeURIComponent(path)}`),

  getCommits: (id: string, params: { path?: string; limit?: number; offset?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.path) qs.set('path', params.path);
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    if (params.offset !== undefined) qs.set('offset', String(params.offset));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request<CommitsResponse>(`/repos/${id}/commits${suffix}`);
  },
};
