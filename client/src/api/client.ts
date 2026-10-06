import type {
  AuthorIdentity,
  AuthorInfo,
  AuthorMerge,
  CloneJob,
  CommitListItem,
  CommitSetFilter,
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

export interface AuthorsResponse {
  repo: RepoPublic;
  authors: AuthorInfo[];
  identities: AuthorIdentity[];
  merges: AuthorMerge[];
}

/** URLSearchParams for a commit-set filter (empty when nothing is set). */
function filterParams(filter: CommitSetFilter = {}): URLSearchParams {
  const qs = new URLSearchParams();
  if (filter.from !== undefined) qs.set('from', String(filter.from));
  if (filter.to !== undefined) qs.set('to', String(filter.to));
  if (filter.hashes && filter.hashes.length > 0) qs.set('commits', filter.hashes.join(','));
  if (filter.author) qs.set('author', filter.author);
  return qs;
}

/** Repo endpoint URL with the commit-set filter and any extra params merged. */
function repoUrl(
  id: string,
  action: string,
  filter: CommitSetFilter = {},
  extra: URLSearchParams = new URLSearchParams(),
): string {
  const qs = filterParams(filter);
  for (const [key, value] of extra) qs.set(key, value);
  const query = qs.toString();
  return `/repos/${id}/${action}${query ? `?${query}` : ''}`;
}

export const api = {
  listRepos: () => request<RepoPublic[]>('/repos'),

  uploadRepo: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<RepoPublic>('/repos/upload', { method: 'POST', body: form });
  },

  cloneRepo: (url: string) =>
    request<CloneJob>('/repos/clone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    }),

  getCloneJob: (jobId: string) => request<CloneJob>(`/repos/clone/${jobId}`),

  deleteRepo: (id: string) => request<void>(`/repos/${id}`, { method: 'DELETE' }),

  getSummary: (id: string, filter: CommitSetFilter = {}) =>
    request<SummaryResponse>(repoUrl(id, 'summary', filter)),

  getTree: (id: string) => request<TreeResponse>(`/repos/${id}/tree`),

  getAuthors: (id: string, params: { path?: string; filter?: CommitSetFilter } = {}) => {
    const extra = new URLSearchParams();
    if (params.path) extra.set('path', params.path);
    return request<AuthorsResponse>(repoUrl(id, 'authors', params.filter, extra));
  },

  mergeAuthors: (id: string, canonical: string, aliases: string[]) =>
    request<AuthorsResponse>(`/repos/${id}/authors/merge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ canonical, aliases }),
    }),

  clearAuthorMerges: (id: string) =>
    request<AuthorsResponse>(`/repos/${id}/authors/merge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clear: true }),
    }),

  getMetrics: (id: string, path: string, filter: CommitSetFilter = {}) =>
    request<MetricsResponse>(repoUrl(id, 'metrics', filter, new URLSearchParams({ path }))),

  getCommits: (
    id: string,
    params: { path?: string; limit?: number; offset?: number; filter?: CommitSetFilter } = {},
  ) => {
    const extra = new URLSearchParams();
    if (params.path) extra.set('path', params.path);
    if (params.limit !== undefined) extra.set('limit', String(params.limit));
    if (params.offset !== undefined) extra.set('offset', String(params.offset));
    return request<CommitsResponse>(repoUrl(id, 'commits', params.filter, extra));
  },
};
