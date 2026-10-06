# sdp-test-1 — Repo Analysis Tool (RAT)

A web-app dashboard that ingests git repositories and measures per-author, per-file, per-directory, repository, and commit-set metrics, filterable by repository, author, path, and commit set.

- Project brief: [docs/BRIEF.md](docs/BRIEF.md) (transcription) · [docs/test_brief.pdf](docs/test_brief.pdf) (original)
- Build plan and tracked progress: [SPEC.md](SPEC.md) — phases in section 6, progress tracker in 6.0, agent rules in section 8
- Agent onboarding: [AGENTS.md](AGENTS.md)

## Status

**Phase 5 (remote URL ingestion & multi-repo) complete and verified.** Phase 6 remains. This README is kept up to date with everything a user needs to know as functionality lands (rule R-2 in SPEC.md section 8).

## Requirements

- Node.js >= 18
- git available on the PATH (the analysis engine shells out to the git CLI)
- npm >= 9

## Getting started (development)

```bash
git clone <this-repo-url>
cd sdp-test-1
npm install
npm run dev     # API server on http://localhost:4000 + web app on http://localhost:5173
```

Then open http://localhost:5173 in your browser.

Other commands:

```bash
npm run build   # typecheck + build server and client
npm test        # Vitest suite (parser + metric engine)
```

## Using the app

1. **Ingest a repository** — upload a zip including `.git`, or clone a remote URL. Clone progress appears on the add card; failures show a clear error.
2. **Compare repositories** — with two or more repos, the home page shows headline commits, authors, files, growth, and churn.
3. **Open the repository** from the list to explore it:
   - **Metrics tab** — overview stat cards (commits, authors, files, added/removed, growth, churn, modifications, η, ρ) and the cumulative growth/churn chart. Large histories are sampled to ~800 chart points; all totals stay exact.
   - **File tree sidebar** — every path ever touched in the history. Click a directory or file for its own stat cards (including |H|, η, ρ), path-scoped chart, children breakdown (directories) or per-commit deltas (files).
   - **Commits tab** — the non-merge commit list, newest first, paginated 100 per page. Tick rows to select commits for the filter.
4. **Filter everything** — the filter bar applies a date range, author, and/or a manual commit selection (it overrides the dates) to every metric, chart, and the commit list. Filter state lives in the URL; 'Reset filters' clears it.
5. **Review authors** — use the Authors tab for sortable, paginated commits, modifications, churn, and ownership.
6. **Merge identities** — tick identities, choose the canonical author, and merge. `.mailmap` is applied automatically; manual merges persist per repo.
7. **Manage repositories** — remove a repository from the list (its extracted data is deleted from the server).

### Known limits (by phase)

- The first analysis of a very large repository (e.g., ~100k commits, like Git) takes a little while; results are cached in memory per HEAD state. Persistent incremental caching and streaming analysis arrive in Phase 6.
- Remote URL clones are full clones and run as local background jobs with polling progress.
- Manual commit selections are capped at 5000 hashes per selection (URL length guard); unknown or ambiguous hash prefixes are rejected with a clear error.
- Visual polish (treemaps/heatmaps, top-volatile rankings) arrives in Phase 6.

## Metrics

Metric definitions follow the brief exactly (added / removed / growth / churn, directory aggregation, commit-set metrics, author ownership) — see [SPEC.md section 4](SPEC.md) or [docs/BRIEF.md](docs/BRIEF.md).

## Project layout

- `client/` — React + Vite + TypeScript dashboard (Tailwind CSS, Recharts)
- `server/` — Express API + git analysis engine (ingested repos live under `server/data/`, gitignored)
- `docs/` — project brief
- `AGENTS.md` — onboarding guide for AI agents working on this repo
