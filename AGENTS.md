# AGENTS.md — Guide for AI agents working on this repo

This file orients any AI agent (Qoder or otherwise) working in this repository. Read it fully before making changes.

## What this project is

**RAT — Repo Analysis Tool**: a web-app dashboard that ingests git repositories (zip with `.git`, or remote URL — URL lands in Phase 5) and measures metrics per author, file, directory, repository, and commit set, filterable by repository, author, path, and commit set. Built for the COMS3011A test brief; metric correctness is checked against the cJSON, Redis, and Git repositories (the latter ~100k commits — a performance target).

## Mandatory reading order (before any work)

1. **[SPEC.md](SPEC.md)** — the operational spec. In particular:
   - **Section 8 "User Rules"** — binding rules from the user. Agents MUST check this section before starting/resuming work, before each commit, and before starting any new phase. If SPEC section 8 and this file ever disagree, section 8 wins.
   - **Section 6.0 "Progress tracker"** — current phase status. Never start or continue work without knowing which phase is active.
   - **Section 6** — the active phase's goal, tasks, checklist, and exit criteria.
   - **Section 4** — metric definitions (implement the brief's formulas exactly).
   - **Section 5** — functional requirements (FR-1…FR-18) and their tracking checkboxes.
2. **[docs/BRIEF.md](docs/BRIEF.md)** — the project brief (transcription; `docs/test_brief.pdf` is the authoritative original).
3. **[README.md](README.md)** — what users/cloners currently need to know.

## Binding rules (summary — full text in SPEC.md section 8)

- **R-1 — User verification gate:** after a phase's exit criteria are met and it is pushed, STOP and ask the user to test and verify. The next phase starts only after explicit user approval.
- **R-2 — README accuracy:** update README.md in the same phase whenever user-facing behavior, commands, or requirements change.

## Workflow rules (SPEC.md section 7)

- Small, conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`) after each working unit — never in bulk at phase end.
- **Green-only commits:** before every commit, `npm run build` (root, builds client + server) must pass and the Vitest suite must pass. No broken code is ever committed.
- Push to `origin main` at the end of each phase.
- Keep the SPEC checklists up to date: tick items in section 5 (FRs), section 6.0 (tracker), and the per-phase checklists as soon as they are done.

## Tech stack (confirmed with the user)

- **Frontend:** React 18 + Vite + TypeScript, Tailwind CSS, Recharts, React Router, TanStack Query (`client/`)
- **Backend:** Node.js >= 18 + Express + TypeScript (`server/`)
- **Analysis:** git CLI via `child_process` (`git log --no-merges --numstat --find-renames=50%`); zip ingestion via `adm-zip`
- **Tests:** Vitest (server: parser + metric engine, tested against a synthetic fixture repo)

## Repo layout

```
client/            React SPA (dashboard)
server/            Express API + metric engine
  src/             app code (ESM; local imports use .js extensions — NodeNext)
  test/            Vitest suite (fixture git repo created on the fly)
  data/            RUNTIME ONLY — ingested repos + registry (gitignored)
docs/              project brief (BRIEF.md transcription + original PDF)
SPEC.md            operational spec: phases, checklists, user rules
README.md          user-facing usage docs
```

## Commands

```bash
npm install        # installs both workspaces (run at repo root)
npm run dev        # API on http://localhost:4000 + web app on http://localhost:5173 (Vite proxies /api)
npm run build      # typechecks + builds server then client
npm test           # Vitest suite (server workspace)
```

## Architecture in one paragraph

Ingest (unzip upload into `server/data/repos/<id>/`, validate `.git` present) → extract history in one pass with `git log --no-merges --numstat --find-renames=50%` → parse into a per-commit, per-file added/removed model (binary files skipped, renames attributed to the new path, deletions counted as removals) → aggregate metrics on demand per SPEC section 4 → serve JSON over `/api/repos/*` → render in the React dashboard.

## Guardrails

- Do not commit anything under `server/data/` (runtime data) — it is gitignored.
- Do not modify or delete the `.git` of ingested repositories; do not run destructive git commands in this repo (see the workflow rules for the commit/push policy).
- Do not weaken or delete user rules in SPEC section 8; append new rules with the next `R-n` id when the user specifies them.
- Node 18 is the runtime — keep dependency choices compatible (Vite 5, Vitest 1.x era).
- Metric math must match SPEC section 4 exactly; when in doubt, the brief (`docs/BRIEF.md` / `docs/test_brief.pdf`) is the source of truth.
