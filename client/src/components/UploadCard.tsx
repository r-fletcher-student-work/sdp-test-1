import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';

export function UploadCard() {
  const [mode, setMode] = useState<'zip' | 'url'>('zip');
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [cloneJobId, setCloneJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const upload = useMutation({
    mutationFn: (f: File) => api.uploadRepo(f),
    onSuccess: () => {
      setFile(null);
      setError(null);
      if (inputRef.current) inputRef.current.value = '';
      void queryClient.invalidateQueries({ queryKey: ['repos'] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const clone = useMutation({
    mutationFn: (repoUrl: string) => api.cloneRepo(repoUrl),
    onSuccess: (job) => {
      setCloneJobId(job.id);
      setError(null);
    },
    onError: (err: Error) => setError(err.message),
  });

  const cloneStatus = useQuery({
    queryKey: ['clone-job', cloneJobId],
    queryFn: () => api.getCloneJob(cloneJobId ?? ''),
    enabled: Boolean(cloneJobId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'complete' || status === 'failed' ? false : 1000;
    },
  });

  useEffect(() => {
    const job = cloneStatus.data;
    if (!job) return;
    if (job.status === 'complete') {
      setUrl('');
      void queryClient.invalidateQueries({ queryKey: ['repos'] });
    }
    if (job.status === 'failed') setError(job.error ?? job.message);
  }, [cloneStatus.data, queryClient]);

  const clonePending = clone.isPending || ['queued', 'running'].includes(cloneStatus.data?.status ?? '');

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Add a repository</h2>
          <p className="mt-1 text-sm text-slate-600">Upload a zip or clone a remote URL.</p>
        </div>
        <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1 text-sm">
          {(['zip', 'url'] as const).map((nextMode) => (
            <button
              key={nextMode}
              type="button"
              onClick={() => {
                setMode(nextMode);
                setError(null);
              }}
              className={`rounded-md px-3 py-1.5 font-medium uppercase ${
                mode === nextMode ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {nextMode}
            </button>
          ))}
        </div>
      </div>

      {mode === 'zip' ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            ref={inputRef}
            type="file"
            accept=".zip"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
          />
          <button
            type="button"
            disabled={!file || upload.isPending}
            onClick={() => file && upload.mutate(file)}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {upload.isPending ? 'Uploading...' : 'Upload'}
          </button>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://github.com/user/repo.git"
              className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              type="button"
              disabled={!url.trim() || clonePending}
              onClick={() => clone.mutate(url)}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {clonePending ? 'Cloning...' : 'Clone'}
            </button>
          </div>
          {cloneStatus.data && (
            <p className="rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-700">
              {cloneStatus.data.message}
            </p>
          )}
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      )}
    </section>
  );
}
