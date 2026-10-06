---
name: submit-task
description: Settle a claimed forge task via the submitTask tool — success requires an honest summary plus the quality-gate results and the changed files; blocked requires the concrete reason and typically spawns a fix task. Use after executing a dispatch brief and passing the quality gates.
user-invocable: false
---

# Submit Task

Settle exactly the task you claimed, located by its natural key `slug` + `local_id`.
Settle once and settle honestly: `submitTask` is the only agent-reachable way out of
`in_progress`, and the record is an audit artifact.

## Fields (submitTask parameters)

| Param | Required | Meaning |
|---|---|---|
| `slug`, `local_id` | always | Natural key of the claimed task |
| `result` | always | `success` or `blocked` |
| `summary` | `success` | What was accomplished plus key decisions — empty is rejected |
| `reason` | `blocked` | The concrete blocking cause with the failure classified — empty is rejected |
| `gate_compile` / `gate_fmt` / `gate_lint` / `gate_test` | `success`, all four together | Quality-gate outcomes, honestly reported |
| `gate_coverage` | optional, only with all four gates | Coverage fraction 0–1 |
| `files` | `success` | Actually changed files, forward-slash paths |
| `commit_hash` | `success` when git is available | Hash of the commit carrying the change |

## Success Path

1. Run the quality gate sequence first — strict order, stop at the first unresolved
   failure: `just compile` → `just fmt` (fix drift only in files you touched) →
   `just lint` (self-fix, max 1 retry) → `just unit-test` (the task submit gate;
   surface-level e2e belongs to the run-tests skill and `test-run` tasks, not this gate).
2. Commit the change (git-commit skill), so the hash can be recorded.
3. `submitTask result=success` with `summary`, the four gate booleans (plus
   `gate_coverage` when measured), `files`, and `commit_hash`.

Never report a gate you did not run, never report a failed gate as passed, never invent a
coverage number.

**Git absent** — git is an optional environment dependency. If `git` is unavailable
(command not found, not a repository), do not fabricate `commit_hash`: submit
`result=blocked` with reason `git unavailable: <detail>`. The fix chain or the user
carries it; the state layer itself never requires git.

## Blocked Path

`submitTask result=blocked` with `reason` carrying the concrete cause, classified per the
failure triage:

- simple/transient (network timeout, missing dependency, single command failure) that
  survived ~3 inline fix attempts, or
- complex/recurring (persists after ~3 attempts, large compilation failure, cross-file
  refactor) — do not loop.

Typically spawn the fix task right after, per the fix-chain protocol (canonical text in
run-tasks): `addTask` with `feature_slug`, `title` "Fix: <reason>", `type` per source
category (`coding-fix` for coding/test/validation/gate, `doc` for doc/eval),
`source_slug` + `source_local_id`, `block_source: true`, and `vars` such as
`SOURCE_FILES` / `TEST_SCRIPT` / `TEST_RESULTS`.

When the fix completes, its blocked source restores automatically — the `submitTask`
result lists restored tasks; nothing further to do.

## Forbidden Operations

| Operation | Why |
|---|---|
| Submitting `success` with a failing or unrun gate | Falsified record |
| Editing state — database, task records, indexes — by hand | State changes only through the pipeline verbs |
| Re-submitting or transitioning an already-settled task | Terminal-state transitions are human-only |
| Submitting a task you did not claim | Settle exactly what you claimed |

## Recovery (the submitTask call itself fails)

Fix the inputs per the error and retry: `ERR_SUMMARY_REQUIRED` → add the summary;
`ERR_REASON_REQUIRED` → add the reason; the gate is all-or-none → give all four booleans
together. If the tool is unreachable, report to the dispatcher or the user — never
switch to file edits as a workaround.
