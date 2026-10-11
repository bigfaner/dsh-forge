---
name: submit-task
description: Settle the task you executed via submitTask — an honest summary organized for audit, test evidence cited for AC-bearing tasks, and a commit hash under the workspace's commit conventions (AGENTS.md) or common-sense Conventional Commits. Use after executing a task brief and passing its quality gates.
user-invocable: false
---

# Submit Task

Settle exactly the task you executed, located by its container `slug` + `local_id`.
Settle once and settle honestly: `submitTask` is the only agent-reachable way out of
`in_progress`, and the record is an audit artifact. The tool enforces the mechanics —
which fields are required per path, the all-or-none gate booleans, the AC evidence gate,
and the gate-task summary — so this skill is about the judgment the tool cannot do for
you: what goes *in* those fields.

## Success Path — organizing the record

The quality-gate sequence and failure triage live in your dispatch brief; run them
there. When settling, the record is structured — split it into its fields, do not
cram everything into free text:

- **`summary`** — one sentence stating the outcome. It is the first and result line of
  the record: compare it against the task's `GOAL` ("what was to be achieved") and say
  whether and how the goal was met — a reviewer trusts this line without opening the
  diff. A summary that only restates the task title is a failed summary.
- **`key_decisions`** — the decisions that shaped the result, as a separate array (≤3
  items: approach chosen over alternative, constraint honored, boundary drawn). Keep
  them out of `summary`.
- **`files_created` / `files_modified`** — the files actually changed, forward-slash
  paths, grouped by created vs modified (flat `files` is the union form; supply the
  grouping, not the union). Include test fixtures, generated artifacts — this is the
  diff inventory for later audits.
- **`gate_*`** — report what ran, as it ran. Never report a gate you did not run, never
  report a failed gate as passed, never invent a coverage number.

### AC evidence — per criterion, not prose

Tasks created with `acceptance_criteria` pass the submit evidence gate only with
`gate_test: true` standing on a real test run you can name. Submit each criterion as a
triple in the paired arrays `ac_criteria` / `ac_met` / `ac_evidence`:

- `ac_criteria` — the criterion strings, same order and wording as the task definition
  (the tool cross-checks the mirror with the definition side);
- `ac_met` — one boolean per criterion (`success` with any `false` is rejected);
- `ac_evidence` — one line of proof per criterion: covering case/command + its result
  ("AC-2 covered by `dispatch-task.test.ts` describe block 'pool verdict' — pass"). If
  the proof output is long, archive it under the artifact convention and reference only
  the subfolder path. If an AC item has no covering test, that is not success — either
  add the test or settle `blocked` naming the uncovered criterion.

### Settle checklist

1. **todo all `completed`** before `submitTask` — no open todo item survives a submit
   (trivial two-step tasks may skip the todo discipline entirely).
2. Artifact convention applied: screenshots, long command output, probe artifacts →
   `logs/<slug>/<taskKey>/<seq>-<event-type>/` (one folder per task, one subfolder per
   event) — and the record's narrative (summary/evidence/notes) carries **only the
   subfolder path**, never pasted blobs.
3. `TASK_ID` is `slug/local_id` — split on the slash to fill the two locating fields.
4. Type-family record fields populated where the brief lists them (doc family:
   `referencedDocs` / `reviewStatus` / `docMetrics`; test family: `casesGenerated` /
   `casesEvaluated` / `scriptsCreated` / `testResults`; validation family:
   `validationPassed` / `issuesFound`; gate family: `gateChecks`).

## Commit Conventions (two states)

Commit before settling so `commit_hash` records the change. Which conventions apply
depends on the workspace:

1. **`AGENTS.md` present with commit conventions** → follow them — message format,
   scope vocabulary, staging rules, everything it pins down.
2. **No such conventions** → fall back to common-sense Conventional Commits:
   `<type>(<scope>): <subject>` — lowercase imperative subject under 72 chars, type
   from `feat` / `fix` / `docs` / `test` / `refactor` / `chore`, scope from the package
   or layer touched.

Either way: stage **explicit file paths only** — never `git add -A` / `git add .` /
`git add --all` (broad staging sweeps unrelated changes into the commit); commit only
files related to this task, never unrelated pre-existing changes.

**Git absent** — if `git` is unavailable (command not found, not a repository), do not
fabricate a `commit_hash`: settle `result=blocked` with reason `git unavailable:
<detail>` and let the fix chain or the user carry it. The state layer itself never
requires git.

## Blocked Path

`result=blocked` with a `reason` that carries the concrete cause, classified per the
brief's failure triage (simple/transient that survived ~3 inline attempts, or
complex/recurring — do not loop). Organize it as: what you attempted, what failed, with
which evidence (command output excerpt, error text). Typically spawn the fix task right
after — the canonical fix-chain protocol lives in the run-tasks skill.

When the fix completes, its blocked source restores automatically — the `submitTask`
result lists restored tasks; nothing further to do.

## Forbidden Operations

| Operation | Why |
|---|---|
| Submitting `success` with a failing, unrun, or unbacked gate | Falsified record |
| Editing state — database, task records, indexes — by hand | State changes only through the pipeline verbs |
| Re-submitting or transitioning an already-settled task | Terminal-state transitions are human-only |
| Submitting a task you did not execute | Settle exactly what you ran |

## If the submitTask call itself fails

The error text carries the violated expectations (missing summary, criterion/AC
evidence mismatch, half-given gates). Fix the inputs per what it lists and retry. If
the tool is unreachable, report to the dispatcher or the user — never switch to file
edits as a workaround.
