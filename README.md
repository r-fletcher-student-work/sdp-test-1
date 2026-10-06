# sdp-test-1 — Repo Analysis Tool (RAT)

A web-app dashboard that ingests git repositories and measures per-author, per-file, per-directory, repository, and commit-set metrics, filterable by repository, author, path, and commit set.

- Project brief: [docs/BRIEF.md](docs/BRIEF.md) (transcription) · [docs/test_brief.pdf](docs/test_brief.pdf) (original)
- Build plan and tracked progress: [SPEC.md](SPEC.md) — phases in section 6, progress tracker in 6.0, agent rules in section 8
- Agent onboarding: [AGENTS.md](AGENTS.md)

## Status

Under active development — **Phase 1 (core foundation & repository metrics) in progress** (see the progress tracker in SPEC.md section 6.0). This README is kept up to date with everything a user needs to know as functionality lands (rule R-2 in SPEC.md section 8).

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

> Note: the dev scripts become available once the Phase 1 scaffold lands (imminent — see SPEC.md section 6).

## Using the app

1. **Ingest a repository** — upload a zip of a git repository that includes its `.git` folder (clone the repo locally, then compress the folder so the archive contains `.git`). Ingestion by remote URL arrives in Phase 5.
2. **Open the repository** from the dashboard to see its metrics: totals (added / removed / growth / churn), commit / author / file counts, and cumulative growth & churn over time.
3. Filters (author, path, time period, commit selection) arrive in Phase 3; author merging in Phase 4; multi-repo comparison in Phase 5.

## Metrics

Metric definitions follow the brief exactly (added / removed / growth / churn, directory aggregation, commit-set metrics, author ownership) — see [SPEC.md section 4](SPEC.md) or [docs/BRIEF.md](docs/BRIEF.md).

## Project layout

- `client/` — React + Vite + TypeScript dashboard (Tailwind CSS, Recharts)
- `server/` — Express API + git analysis engine (ingested repos live under `server/data/`, gitignored)
- `docs/` — project brief
- `AGENTS.md` — onboarding guide for AI agents working on this repo
