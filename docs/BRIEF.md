# Project Brief — COMS3011A Test: Repo Analysis Tool (RAT)

> This is an agent-readable transcription of the original brief at [`docs/test_brief.pdf`](./test_brief.pdf) (authoritative). Formulas are rendered in plain-text notation; semantics are unchanged. When this file and the PDF disagree, the PDF wins.

- **Course:** COMS3011A Test — University of the Witwatersrand
- **Author of brief:** Brendan Griffiths
- **Time:** 2.5 Hours
- **Submission:** URL to a public repository

---

## 1. Overview

Git repositories tend to be very opaque to understanding. Git does not make it easy to understand how a repo has evolved, who has had the most impact where, and what parts of the project are the most volatile.

Your project manager has asked you to build a **Repo Analysis Tool (RAT)** that measures specific metrics of a provided repository. You need to calculate these metrics for: each developer (called an **author**), each **file**, each **directory**, and the entire **repository**. These metrics are provided below.

The RAT should be a **web-app dashboard for multiple repositories**. This dashboard should be filterable by:

- A repository
- An author
- A file or directory
- Commits
  - a specified period of time
  - or a manually selected list of commits

It accepts a repository in two forms:

1. A zip file of the repo with the `.git` file or directory
2. A remote repository URL that is then deeply cloned

Not every commit will have the same author, even if they were made by the same person. To address this git provides a `.mailmap` to merge different email addresses; the RAT should be able to merge authors using the mailmap. If no mailmap is provided, a user should still be able to merge different authors manually.

The full list of features are:

- Repository Upload: Zip and Clone URL
- Multiple Repository Support
- Author Merging
- Metric Categories:
  - File Metrics
  - Directory Metrics
  - Repository Metrics
  - Commit Set Metrics

Note: Not all features are necessary. Please review the rubric to understand what is needed.

---

## 2. Metrics

A commit `h` has the following properties

- A single author `h.a` after author merging
- A previous commit `h.p`
  - The initial commit has `h.p = h∅`, an empty commit
- A committer date `h.committer-date`
- `h.F` is the set of all files
  - Binary files are not measured
  - Git provides a definition and detection of binary files
- `h.D` is the set of all directories
- An object `o ∈ h.F ∪ h.D` is identified by its path
  - Rename detection is enabled with a threshold of 50%, so just renaming a file should not change its metrics.
    - Making a change and renaming an object should only have the changes impact its associated metrics.
    - These changes are attributed to its new path
  - If an object is deleted (it does not exist in `h` but does in `h.p`), it should be recorded as a change in the necessary metrics (lines removed) on its path.

The set `H̄` is the set of **non-merge commits** reachable from a specified reference commit `h.r` (typically HEAD)

- A commit set `H` is a subset of `H̄`
- The commit set `H(t)` is the commit history from UNIX timestamp `t` to present:

```
H(t) := { h ∈ H̄ | t ≤ h.committer-date }
```

- The commit set `H(i,j)` is the commit history from timestamp `i` inclusive until timestamp `j` exclusive:

```
H(i,j) := { h ∈ H̄ | i ≤ h.committer-date < j }
```

- `H.F` is the set of all files in the repository:

```
H.F := ⋃ over h ∈ H of ( h.F ∪ h.p.F )
```

- `H.D` is the set of all directories (including the root) for the commit set:

```
H.D := ⋃ over h ∈ H of ( h.D ∪ h.p.D )
```

### 2.1 File Metrics

- **File Added Lines:** the number of lines added on file `f` from a commit `h` to the previous commit: `l+(h,f)`
- **File Removed Lines:** the number of lines removed on file `f` from a commit `h` to the previous commit: `l-(h,f)`
- **File Growth:** the change in number of lines on file `f` from a commit `h` to the previous commit:

```
δ(h,f) := l+(h,f) − l-(h,f)
```

- **File Churn:** the number of changed lines on file `f` from a commit `h` to the previous commit:

```
λ(h,f) := l+(h,f) + l-(h,f)
```

### 2.2 Directory Metrics

An **immediate object** is an object that is directly below the specified directory:

```
foo/
  bar.txt        -- immediate child of foo
  baz/           -- immediate child of foo
     beef.py     -- immediate child of baz
     dead.py     -- immediate child of baz
```

A file `f` is **in** a directory `d` at a commit `h` if it is in `h.F` or `h.p.F` and is an immediate child of `d`. Similarly for subdirectories `d'` and `h.D`, `h.p.D`.

- **Directory Added Lines:** the number of added lines across all immediate subdirectories `d'` and files `f` in directory `d`:

```
l+(h,d) := Σ over f ∈ d of l+(h,f)  +  Σ over d' ∈ d of l+(h,d')
```

- **Directory Removed Lines:** the number of removed lines across all immediate subdirectories `d'` and files `f` in directory `d`:

```
l-(h,d) := Σ over f ∈ d of l-(h,f)  +  Σ over d' ∈ d of l-(h,d')
```

- **Directory Growth:** the net growth across all immediate subdirectories `d'` and files `f` in directory `d`:

```
δ(h,d) := Σ over f ∈ d of δ(h,f)  +  Σ over d' ∈ d of δ(h,d')
```

- **Directory Churn:** the churn across all immediate subdirectories `d'` and files `f` in directory `d`:

```
λ(h,d) := Σ over f ∈ d of λ(h,f)  +  Σ over d' ∈ d of λ(h,d')
```

### 2.3 Repository Metrics

Repository metrics are directory metrics on the **root** of the commit tree.

### 2.4 Commit Set Metrics

For `o ∈ H.F ∪ H.D`:

- **Added lines** over a commit set `H`:

```
l+(H,o) := Σ over h ∈ H of l+(h,o)
```

- **Removed lines** over a commit set `H`:

```
l-(H,o) := Σ over h ∈ H of l-(h,o)
```

- **Growth** over a commit set `H`:

```
δ(H,o) := Σ over h ∈ H of δ(h,o)
```

- **Churn** over a commit set `H`:

```
λ(H,o) := Σ over h ∈ H of λ(h,o)
```

- **Modifications:** the number of commits that have at least some change on file or directory `o`:

```
1n(h,o) := 1 if λ(h,o) > 0, else 0

n(H,o) := Σ over h ∈ H of 1n(h,o)
```

- **Modification frequency** over a file or directory `o`:

```
η(H,o) := n(H,o) / |H|   if |H| ≠ 0, else 0
```

- **Churn rate** over a file or directory `o`:

```
ρ(H,o) := λ(H,o) / |H|   if |H| ≠ 0, else 0
```

### 2.5 Author Metrics

Authorship test:

```
1(a,h) := 1 if a = h.a, else 0
```

- **Author Modifications** on a file or directory `o ∈ H.F ∪ H.D`:

```
n(H,o,a) := Σ over h ∈ H of 1(a,h) · 1n(h,o)
```

- **Author Churn** on a file or directory `o ∈ H.F ∪ H.D`:

```
λ(H,o,a) := Σ over h ∈ H of λ(h,o) · 1(a,h)
```

- **Author Ownership:** the fraction of churn on file or directory `o ∈ H.F ∪ H.D` from an author `a`:

```
ω(H,o,a) := λ(H,o,a) / λ(H,o)   if λ(H,o) ≠ 0, else 0
```

---

## 3. Rubric

Requirements are **cumulative**. You can only reach a tier if the previous tier is satisfied. Each tier is judged holistically.

Metric correctness is determined against a set of test repositories. Sample metrics from each of these repos will be provided from a specific commit hash. These repos are open source.

Provided repositories:

- cJSON — https://github.com/DaveGamble/cJSON.git
- Redis — https://github.com/redis/redis.git
- Git — https://github.com/git/git.git

| Criteria | Weight | ≤ 25% | ≤ 50% | ≤ 75% | ≤ 100% |
| --- | --- | --- | --- | --- | --- |
| Requirements | 50% | Implemented and correct for some categories (repo, file, directory, set, author) of metrics. Either: zip file or remote URL ingestion | Implemented and correct for all metrics. Both: zip file and remote URL ingestion | Implemented either: Filtering, Author Merge, Multi-repo support | Implemented all: Filtering, Author Merge, Multi-repo support |
| Architectural & UI Design | 25% | Redundant & slow metric computation, poor visualisation of metrics | Reasonable metric computation, okay visualisation of metrics | Efficient algorithms for metric computation, good visualisation of metrics | Efficient algorithms and architecture for metric computation, inspired visualisation of metrics |
| Usability | 25% | Poor navigation, no error handling, slow performance on small (~1000 commits) repositories, no QoL features | Okay navigation, minimal error handling, okay performance on small repositories, slow performance on medium (~10000 commits) repos, minimal to none QoL features | Good navigation, error handling, good performance on medium repositories, QoL features | Excellent navigation, good performance on large (~100000 commits) repos |

AI Declaration: Claude Web (Opus 5.5) - reviewed
