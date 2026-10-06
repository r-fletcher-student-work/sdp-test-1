# SPEC — Repo Analysis Tool (RAT)

- **Source brief:** `docs/test_brief.pdf` (original PDF) with agent-readable transcription in `docs/BRIEF.md` (COMS3011A Test — Repo Analysis Tool). Read the brief before implementing; this spec operationalizes it.
- **Status:** Approved by the user; implementation in progress — track progress in section 6.0.
- **Repo:** this repository (`main` branch, remote `origin`). The app will be built in-place following the phases and commit policy in section 7.
- **Agents (Qoder included):** before starting or resuming any work, read [AGENTS.md](AGENTS.md), `docs/BRIEF.md` (the project brief), and section 8 "User Rules", and follow them. Keep the section 5 FR checklist, the 6.0 progress tracker, and the per-phase checklists up to date — tick items as done immediately when they are done.

---

## 1. Overview

Git repositories are opaque: it is hard to see how a repo evolved, who had the most impact where, and which parts are the most volatile.

RAT is a **web-app dashboard for multiple repositories** that measures a defined set of metrics **per author, per file, per directory, and for the entire repository**, computed from the git history of an ingested repository.

**Ingestion forms (both required):**
1. A zip file of the repo including its `.git` file/directory.
2. A remote repository URL, which is then deeply (fully) cloned.

**Dashboard filtering by:**
- A repository
- An author
- A file or directory
- A commit set: either a specified time period, or a manually selected list of commits

**Correctness targets:** metrics are validated against the brief's sample open-source repositories — cJSON, Redis, and Git (the latter ~100k commits, a performance target).

---

## 2. Tech Stack (confirmed)

| Concern | Choice |
| --- | --- |
| Frontend | React 18 + Vite + TypeScript |
| Styling | Tailwind CSS |
| Charts | Recharts |
| Routing | React Router |
| Server state / data fetching | TanStack Query |
| Backend | Node.js (>=18) + Express + TypeScript |
| Git analysis | git CLI invoked via `child_process` |
| Zip extraction | `adm-zip` (pure Node, no system dependency) |
| Unit tests | Vitest (parser + metric engine) |
| Repo layout | npm workspaces: `client/` (SPA) and `server/` (API + engine) |

> Chosen with the user: React + Vite + TypeScript; Node backend (git analysis server-side); Tailwind + Recharts delegated to implementer. Vitest is included to guard metric correctness; flag now if unwanted.

---

## 3. Architecture

```
┌──────────────┐  zip upload /        ┌──────────────────┐   git log/numstat    ┌─────────────────┐
│  Browser     │  clone URL (Ph.5)    │  Express API     │ ───────────────────► │ ingested repos  │
│  (React SPA) │ ───────────────────► │  + Metric engine │                      │ (server data /) │
│              │ ◄─────────────────── │  (server/)       │ ◄─────────────────── │ .git on disk    │
└──────────────┘       REST/JSON      └──────────────────┘    parsed history    └─────────────────┘
```

**Data flow:**

1. **Ingest** — unzip upload into `server/data/repos/<id>/` (must contain `.git`), or `git clone <url>` (Phase 5).
2. **Extract history** — one streaming pass of:
   `git log --no-merges --numstat --find-renames=50% --date-order` with a custom pretty format (hash, parent hash, author name + email, committer timestamp), newest-first, reversed to chronological order.
3. **Build model** — per commit, per file: added/removed line counts.
   - Binary files skipped (numstat reports `-`).
   - Rename syntax `old => new` resolved so changes are attributed to the **new** path (50% rename detection).
   - Deletions appear as `0 / N` entries and count as removed lines on that path.
   - Merge commits excluded (`--no-merges`).
4. **Aggregate & filter on demand** — build commit sets (`H`) from time range or manual selection, apply author/path filters, compute metrics (section 4).
5. **Serve JSON** to the SPA; the SPA renders filterable dashboard views.

**API sketch (evolves per phase):**

```
POST   /api/repos/upload            multipart zip -> { repoId }
GET    /api/repos                   list ingested repos
GET    /api/repos/:id/summary       repository-level metrics (+ filters later)
GET    /api/repos/:id/commits       commit list (hash, author, date, deltas)
GET    /api/repos/:id/tree          file/directory tree
GET    /api/repos/:id/metrics       metrics for ?path= &author= &from= &to= &commits=
GET    /api/repos/:id/authors       author list + identities
POST   /api/repos/:id/authors/merge manual author merge (Phase 4)
POST   /api/repos/clone             { url } deep clone ingestion (Phase 5)
DELETE /api/repos/:id               remove ingested repo
```

**Core data model (server):**

```ts
interface FileChange { path: string; added: number; removed: number; }
interface Commit {
  hash: string;
  parent: string | null;        // null for initial commit (empty commit h∅)
  authorName: string;           // after mailmap/manual merging
  authorEmail: string;
  committerDate: number;        // unix seconds
  changes: FileChange[];        // files touched; binary files excluded
}
```

All metrics derive from `Commit[]` plus path/author derivations — no additional git queries per view.

---

## 4. Metric Definitions (implement the brief exactly)

Notation: `h` = commit, `f` = file, `d` = directory, `a` = author, `H` = commit set, `o` ∈ files ∪ directories.

**Commit-set algebra**
- `H̄` = all **non-merge** commits reachable from reference commit `hr` (default `HEAD`).
- `H ⊆ H̄`; time-period set `H(t..now) = { h ∈ H̄ | t ≤ h.committerDate }`; range set `H(i,j) = { h ∈ H̄ | i ≤ h.committerDate < j }`.
- `H.files = ⋃ (h.files ∪ h.parent.files)` over `h ∈ H`; `H.dirs` likewise, **including the root**.

**File metrics (per commit `h`, file `f`)**
- Added lines: `l+(h,f)` — Removed lines: `l-(h,f)`
- Growth: `δ(h,f) = l+(h,f) − l-(h,f)`
- Churn: `λ(h,f) = l+(h,f) + l-(h,f)`

**Directory metrics (per commit `h`, dir `d`)**
Aggregated over **immediate child files** `f ∈ d` and **immediate subdirectories** `d′ ∈ d` (then recursive):

```
l+(h,d) = Σ l+(h,f) + Σ l+(h,d′)
l-(h,d) = Σ l-(h,f) + Σ l-(h,d′)
δ(h,d)  = Σ δ(h,f)  + Σ δ(h,d′)
λ(h,d)  = Σ λ(h,f)  + Σ λ(h,d′)
```

**Repository metrics** — directory metrics computed on the root `/` of the commit tree.

**Commit-set metrics (object `o` over set `H`)**
- Added: `l+(H,o) = Σ l+(h,o)`; Removed, Growth, Churn analogous (sum over `h ∈ H`).
- Modifications: `n(H,o) = Σ 1[ λ(h,o) > 0 ]` (commits that changed `o` at all)
- Modification frequency: `η(H,o) = n(H,o) / |H|`, or `0` if `|H| = 0`
- Churn rate: `ρ(H,o) = λ(H,o) / |H|`, or `0` if `|H| = 0`

**Author metrics (author `a`, object `o`, set `H`)**
- Authorship: `1(a,h) = 1` if `a = h.author` else `0`
- Author modifications: `n(H,o,a) = Σ 1(a,h) · 1[ λ(h,o) > 0 ]`
- Author churn: `λ(H,o,a) = Σ λ(h,o) · 1(a,h)`
- Author ownership: `ω(H,o,a) = λ(H,o,a) / λ(H,o)` if `λ(H,o) ≠ 0`, else `0`

**Author identity & merging**
- `.mailmap` in the repo merges identities: parser runs git with mailmap applied so `h.author` is the canonical identity.
- Manual merging: the user may group arbitrary raw identities into one canonical author when no mailmap exists (or in addition to it). Merges persist per repo and all author-dependent metrics re-aggregate.

---

## 5. Functional Requirements

**Tracking:** the checkboxes below are the authoritative feature checklist for the whole build. Tick each FR as soon as the phase implementing it is complete and user-verified (rule R-1).

**Ingestion**
- [x] FR-1 Upload a zip containing the repository **including `.git`**; validate and reject invalid archives with a clear error.
- [x] FR-2 Ingest via remote URL using a full (deep) clone; surface progress and clone failures clearly.
- [x] FR-3 Multiple repository support: add, list, remove, and switch between repos.

**Filters (composable, apply to all metric views)**
- [x] FR-4 Filter by repository (repo selector).
- [x] FR-5 Filter by author (merged identity).
- [x] FR-6 Filter by file or directory path.
- [x] FR-7 Filter by commit set: a specified time period **or** a manually selected list of commits.

**Author merging**
- [x] FR-8 Apply the repository's `.mailmap` when parsing history.
- [x] FR-9 Manual author-merge UI: group identities into a canonical author; merges persist and re-aggregate all views.

**Metric views**
- [x] FR-10 Repository overview: repo-level metrics (totals + trends over time).
- [x] FR-11 Directory view: directory metrics with drill-down into subdirectories.
- [x] FR-12 File view: per-file metrics and per-commit deltas (added/removed/growth/churn).
- [x] FR-13 Commit-set metrics: added/removed/growth/churn, modifications `n`, modification frequency `η`, churn rate `ρ` for the active selection.
- [x] FR-14 Author view: author modifications `n(H,o,a)`, author churn `λ(H,o,a)`, ownership `ω(H,o,a)` per file/directory.

**Visualization & UX**
- [x] FR-15 Charts: growth/churn trend lines, top-volatile/hottest files ranking, directory drill-down (e.g., treemap/heatmap where useful).
- [x] FR-16 Error handling: invalid zip, missing `.git`, failed clone, parse errors — all surfaced with actionable messages (no silent failures).
- [x] FR-17 Loading/progress states for upload, clone, and analysis of large repos.
- [x] FR-18 Clear navigation: repo → directory → file drill-down; fast on ~100k-commit repositories.

---

## 6. Build Phases (prioritized, cumulative)

Rules: phases are built in order; **every commit must be working** (builds and runs); **each phase is tested and verified by the user first** (rule R-1, section 8) and **only then pushed to `origin main`** (rule R-3, section 8) — the push closes the phase and opens the next. Priority maps onto the brief's cumulative rubric tiers (see 6.7).

### 6.0 Progress tracker (update as work completes)

- [x] Phase 1 — Core foundation & repository metrics — built, user-verified, pushed
- [x] Phase 2 — Directory metrics & file drill-down — built, user-verified, pushed
- [x] Phase 3 — Filtering & commit sets — built, user-verified, pushed
- [x] Phase 4 — Authors & merging — built, user-verified, pushed
- [x] Phase 5 — Remote URL ingestion & multi-repo — built, user-verified, pushed
- [ ] Phase 6 — Performance & polish — built, user-verified, pushed

### Phase 1 — Core foundation & repository metrics
**Goal:** upload a zip → see correct repository-level metrics in a minimal dashboard.
- [x] 1. Scaffold monorepo: `client/` (Vite React-TS + Tailwind + Router + TanStack Query), `server/` (Express TS), root workspaces + build/dev/test scripts, `.gitignore`.
- [x] 2. Zip ingestion endpoint: save upload, extract with `adm-zip` to `server/data/repos/<id>/`, validate `.git` present, register repo; `GET /api/repos`.
- [x] 3. Git history extractor: streaming `git log --no-merges --numstat --find-renames=50%` parse into the `Commit[]` model (binary skip, rename resolution, deletion-as-removal, parent linkage).
- [x] 4. Metric engine v1: file metrics per commit; repository metrics = root aggregation; totals over the full history commit set.
- [x] 5. `GET /api/repos/:id/summary` endpoint.
- [x] 6. Dashboard v1: upload form, repo list, overview stat cards (commits, authors, total added/removed/growth/churn), churn/growth-over-time line chart.
- [x] 7. Vitest unit tests for parser and metric engine against a small fixture repo.
- [x] 8. Large-repo chart guard (added during user verification): summary timeseries sampled server-side to ≤ 800 points — first/last points kept, cumulative values exact at every plotted point — so Git/Redis-scale histories render the growth/churn chart. The full per-commit series moves behind the commits endpoint in Phase 2; deep optimization (persistent incremental cache, streaming parse, progress states) stays in Phase 6.

**Phase checklist:**
- [x] Exit criteria met: `npm run build` green at root; upload → dashboard works end-to-end; tests pass
- [x] Tested and verified by the user — required before the phase is pushed (rules R-1 and R-3, section 8)
- [x] Pushed to `origin main`

### Phase 2 — Directory metrics & file drill-down
**Goal:** explore any directory or file and see correct metrics.
- [x] 1. Directory metrics in engine (immediate-children recursion, memoized per commit).
- [x] 2. `GET /api/repos/:id/tree` and `GET /api/repos/:id/metrics?path=`.
- [x] 3. File tree browser (collapsible directories).
- [x] 4. Directory view (own + children aggregates) and file view (history, per-commit deltas).
- [x] 5. Commit list view: hash, author, date, per-commit added/removed.

**Phase checklist:**
- [x] Exit criteria met: repo → directory → file navigation shows consistent, correct numbers
- [x] Tested and verified by the user — required before the phase is pushed (rules R-1 and R-3, section 8)
- [x] Pushed to `origin main`

### Phase 3 — Filtering & commit sets
**Goal:** every metric view respects a composable filter set.
- [x] 1. Commit-set selection: time range (`from`–`to`) and manual commit multi-select.
- [x] 2. Filters: author and path; compose into a single `H` definition.
- [x] 3. Commit-set metrics: added/removed/growth/churn plus modifications `n`, frequency `η`, churn rate `ρ`.
- [x] 4. API filter params on metrics/summary endpoints; UI filter bar wiring all views.

**Phase checklist:**
- [x] Exit criteria met: filters combine correctly (e.g., author + path + period) across views
- [x] Tested and verified by the user — required before the phase is pushed (rules R-1 and R-3, section 8)
- [x] Pushed to `origin main`

> Implementation notes: `H` = (manual hash selection **or** time range, `from` inclusive / `to` exclusive) ∩ author; the path query scopes the measured object `o` and does **not** shrink `H` (otherwise `η ≡ 1`). Manual hashes may be full SHA-1s or unique prefixes (unknown/ambiguous → HTTP 400), capped at 5000 per selection (URL length guard). Filter state lives in the URL (`from`, `to`, `author`, `commits`) so views stay shareable; the commits table's checkboxes build the manual selection, and the dashboard-wide filter bar (dates with inclusive-day 'To', author dropdown from `GET /api/repos/:id/authors`) applies to summary, path metrics, charts, and the commit list alike.

### Phase 4 — Authors & merging
**Goal:** author-centric analytics with identity merging.
- [x] 1. `.mailmap` support: parse with mailmap-applied identities.
- [x] 2. `GET /api/repos/:id/authors`; author table with their metrics (modifications, churn, ownership) per selected object/set.
- [x] 3. Manual merge UI: select identities → merge into canonical author; mapping persisted per repo; all views re-aggregate.
- [x] 4. Author ownership visualization (e.g., ownership bars per file/directory).

**Phase checklist:**
- [x] Exit criteria met: mailmap + manual merges change author metrics everywhere consistently
- [x] Tested and verified by the user — required before the phase is pushed (rules R-1 and R-3, section 8)
- [x] Pushed to `origin main`

> Implementation notes: `git log` uses `.mailmap`-aware `%aN/%aE` identities with `--use-mailmap`. Manual merges are persisted per repo under `server/data/author-merges/` and applied to all metric endpoints at read time; raw/mailmapped identities remain available for future merge edits. The Metrics area has Files/Authors tabs; Authors is paginated and respects the active author filter.

### Phase 5 — Remote URL ingestion & multi-repo
**Goal:** both ingestion forms and multi-repo workflows complete.
- [x] 1. `POST /api/repos/clone { url }`: full `git clone`, progress feedback, timeout and error handling.
- [x] 2. Repo manager UI: add (zip or URL), remove, switch.
- [x] 3. Multi-repo dashboard: headline metrics compared across repos.

**Phase checklist:**
- [x] Exit criteria met: can clone cJSON/Redis/Git URLs, switch between repos, compare
- [x] Tested and verified by the user — required before the phase is pushed (rules R-1 and R-3, section 8)
- [x] Pushed to `origin main`

> Implementation notes: remote clone ingestion uses `POST /api/repos/clone` to start an in-process `git clone --progress` job, plus `GET /api/repos/clone/:jobId` for polling status. Clone URLs are validated before invoking git, prompts are disabled, jobs clean partial directories on failure, and cloned repos are registered with source metadata. The home page supports zip/URL add modes, repository removal/switching, and a concise comparison table for multiple repos.

### Phase 6 — Performance & polish
**Goal:** fast on ~100k-commit repos; polished, inspired UX.
- [x] 1. Analysis cache per repo keyed by `HEAD` hash + merge-map version; incremental log parsing (only new commits).
- [x] 2. Streaming parse with batched aggregation; constant-memory pass where feasible; no redundant git invocations per view.
- [x] 3. Visualization upgrade: trend lines everywhere, directory churn treemap/heatmap, top-modified files, author ownership.
- [x] 4. QoL: toasts, skeletons/empty states, helpful errors, README with run instructions.

**Phase checklist:**
- [x] Exit criteria met: Git repo (~100k commits) analyzes and browses without long freezes; all FRs checked
- [ ] Tested and verified by the user — final gate; required before the phase is pushed (rules R-1 and R-3, section 8)
- [ ] Pushed to `origin main`

> Implementation notes: `git log` is parsed from stdout as a stream, raw parsed histories are persisted under `server/data/cache/` by repo and `HEAD`, and cache misses can extend an ancestor cache with only new commits. Merged history is cached separately by `HEAD` plus author-merge file version. The client adds empty states, toasts, a per-commit churn trend, directory heatmap tiles, and top-modified child rankings without adding frontend dependencies.

### 6.7 Rubric traceability

| Rubric tier | Covered by |
| --- | --- |
| ≤ 25%: some metric categories + one ingestion form | Phase 1 (zip + repo metrics) |
| ≤ 50%: all metrics correct + both ingestion forms | Phases 1–3 (metrics), 5 (URL) |
| ≤ 75%: + filtering, author merge, multi-repo | Phases 3, 4, 5 |
| ≤ 100%: + efficient algorithms, inspired visualization, QoL on large repos | Phase 6 (architecture 25% + usability 25%) |

---

## 7. Workflow & Commit Policy

- **Commits:** small, conventional (`feat:`, `fix:`, `chore:`, `docs:`, `test:`), one logical unit per commit, committed after each working unit — never in bulk at phase end.
- **Green-only commits:** before every commit, the root build (`npm run build` for client + server) must pass and the app must start; Vitest suite must pass. No broken or partially-working code is ever committed.
- **User verification (R-1):** after the phase's exit criteria are met, the agent stops and the user tests and verifies the phase; only explicit user approval opens the next phase (see section 8).
- **Pushes (R-3):** `git push` to `origin main` happens **only after the user has tested and verified the phase** — never before verification. The push closes the phase and opens the next.
- **Docs (R-2):** README.md is updated in the same phase whenever user-facing behavior, commands, or requirements change.
- **SPEC.md** itself is committed as the first commit before Phase 1 work begins.
- If a unit turns out larger than one green commit, split it; if it can't be finished green, it is finished before moving on.

---

## 8. User Rules (agents MUST check this section)

Any agent working in this repository (Qoder or otherwise) MUST read this section before starting or resuming any work, MUST re-check it before each commit and before starting any new phase, and MUST follow every rule below. Rules in this section take precedence over the spec's default workflow. When the user specifies a new rule, append it here with the next `R-n` id; never delete or silently weaken an existing rule.

- **R-1 — User verification gate:** Each phase must be tested and verified by the user before moving on to the next phase. After a phase's exit criteria are met, the agent must stop and ask the user to test and verify; the phase is pushed to `origin main` only after the user explicitly approves (see R-3), and the next phase may only start after that push. Record approval by ticking the phase's "Tested and verified by the user" checkbox and the phase entry in the progress tracker (6.0).

- **R-2 — README accuracy:** README.md must always describe what a cloner/user needs to know to run and use the app correctly. Update it in the same phase whenever user-facing behavior, commands, or requirements change.

- **R-3 — Push only after verification:** a phase is pushed to `origin main` only after the user has tested and verified it. Never push a phase that has not passed user verification; the push happens immediately after the user's explicit approval and marks the phase complete.

## 9. Assumptions & Non-Goals

- Single-user, locally-run tool: no authentication, no multi-tenancy, no cloud deployment.
- Analysis runs server-side on demand; ingested repos persist on disk under `server/data/repos/`.
- Only non-merge commits are measured; default reference commit is `HEAD` (selecting another reference is out of scope).
- Initial commit's parent is the empty commit `h∅` — no special-casing beyond a zero baseline.
- Committers date (`committer-date`) is the timestamp used for all time filtering, per the brief.
- Out of scope: scheduled refresh, GitHub/GitLab API integration, editing repository contents, concurrent users.
