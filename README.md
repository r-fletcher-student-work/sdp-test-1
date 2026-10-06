# sdp-test-1 — Repo Analysis Tool (RAT)

A web-app dashboard that ingests git repositories and measures per-author, per-file, per-directory, repository, and commit-set metrics, filterable by repository, author, path, and commit set.

- Project brief: [docs/BRIEF.md](docs/BRIEF.md) (transcription) · [docs/test_brief.pdf](docs/test_brief.pdf) (original)
- Build plan and tracked progress: [SPEC.md](SPEC.md) — phases in section 6, progress tracker in 6.0, agent rules in section 8
- Agent onboarding: [AGENTS.md](AGENTS.md)

## Status

**Phase 3 (filtering & commit sets) built** — awaiting user verification (see the progress tracker in SPEC.md section 6.0). Phases 1–2 are complete and verified. This README is kept up to date with everything a user needs to know as functionality lands (rule R-2 in SPEC.md section 8).

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

1. **Ingest a repository** — on the home page, upload a zip of a git repository that includes its `.git` folder. Cloning the repo locally and compressing the folder works well; archives without a `.git` inside (at the root or one folder down) are rejected with a clear error.
2. **Open the repository** from the list to explore it:
   - **Metrics tab** — overview stat cards (commits, authors, files, added/removed, growth, churn, modifications, η, ρ) and the cumulative growth/churn chart. Large histories are sampled to ~800 chart points; all totals stay exact.
   - **File tree sidebar** — every path ever touched in the history. Click a directory or file for its own stat cards (including |H|, η, ρ), path-scoped chart, children breakdown (directories) or per-commit deltas (files).
   - **Commits tab** — the non-merge commit list, newest first, paginated 100 per page. Tick rows to select commits for the filter.
3. **Filter everything** — the filter bar applies a date range, author, and/or a manual commit selection (it overrides the dates) to every metric, chart, and the commit list. Filter state lives in the URL; 'Reset filters' clears it.
4. **Manage repositories** — remove a repository from the list (its extracted data is deleted from the server).

### Known limits (by phase)

- The first analysis of a very large repository (e.g., ~100k commits, like Git) takes a little while; results are cached in memory per HEAD state. Persistent incremental caching and streaming analysis arrive in Phase 6.
- Only zip upload is available; remote URL ingestion arrives in Phase 5.
- Manual commit selections are capped at 5000 hashes per selection (URL length guard); unknown or ambiguous hash prefixes are rejected with a clear error.
- Author merging arrives in Phase 4; multi-repo comparison in Phase 5; visual polish (treemaps/heatmaps, top-volatile rankings) in Phase 6.

## Metrics

Metric definitions follow the brief exactly (added / removed / growth / churn, directory aggregation, commit-set metrics, author ownership) — see [SPEC.md section 4](SPEC.md) or [docs/BRIEF.md](docs/BRIEF.md).

## Project layout

- `client/` — React + Vite + TypeScript dashboard (Tailwind CSS, Recharts)
- `server/` — Express API + git analysis engine (ingested repos live under `server/data/`, gitignored)
- `docs/` — project brief
- `AGENTS.md` — onboarding guide for AI agents working on this repo
