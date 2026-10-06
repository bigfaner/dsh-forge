---
name: run-tasks
description: Autonomous forge-pipeline dispatcher — loop claimTask, dispatch an executor subagent with the dispatch brief verbatim, verify via queryTask, continue. Carries the Z1 exit rule (task null means wait or finish), the fix-chain protocol (single entry), and the missing-record recovery brief.
---

# Run Tasks (dispatcher)

Auto-dispatch forge tasks: claim one ready task at a time, hand its dispatch brief
verbatim to an executor subagent, verify the settlement, loop. All state changes go
through the pipeline tools (`claimTask` / `queryTask` / `addTask` / `submitTask`) —
never through files, the database, or parallel state.

## Dispatcher Iron Laws

<EXTREMELY-IMPORTANT>
1. Only three actions per cycle: claim → dispatch (or execute in-session for
   main-session tasks) → verify. Then continue the loop.
2. NO code reading or writing by the dispatcher itself — except for main-session tasks,
   whose brief the dispatching session executes directly.
3. NO running tests directly — quality gates belong to executors and the submit-task
   skill.
4. 30-minute timeout per dispatched task.
5. 3 consecutive failed cycles → STOP (failure counter below).
6. Dispatch is a blocking call — no background execution, no result polling.
</EXTREMELY-IMPORTANT>

## Loop

### Step 1: Claim

Call `claimTask`. No arguments = blind claim over the ready pool; `feature_slug` scopes
the pool; a `slug` + `local_id` pair re-enters a known in-progress task explicitly.

Extract from the result: `task.slug` / `task.localId`, `dispatchPrompt`, `digest`,
`reclaimed`.

**Z1 exit rule** — `task: null` means nothing is ready. Exactly two lawful responses,
never a third (do not invent work):

| Situation | Action |
|---|---|
| Work still in flight can make tasks ready (a fix chain running in another session, prerequisites in progress) | Wait, then claim again — bounded: after 3 consecutive null claims with nothing new, finish |
| Nothing indicates future readiness | Finish: end the loop and print the dispatch summary |

### Step 2: Dispatch

Hand `dispatchPrompt` to an anonymous executor subagent **verbatim** — it is the payload,
not a summary to rewrite. The executor runs the brief (quality gates, commit via the
git-commit skill) and settles it itself via `submitTask`. Blocking call: wait for the
return. Timeout per task: 30 minutes.

`MARKERS: main-session` tasks are the exception — execute the brief in the dispatching
session itself (same settlement discipline: `submitTask`), do not spawn a subagent.

### Step 3: Verify

After the executor returns, call `queryTask` (`slug` + `local_id`, with
`include_records`) and read the current status:

| Status | Action |
|---|---|
| `completed` | Reset the failure counter, continue the loop |
| `blocked` | Fix chain (below): if the executor did not already spawn the fix task, spawn it now; continue the loop |
| `in_progress` (no submit record) | Missing-record recovery (below) |

### Step 4: Continue

Return to Step 1.

## Fix-Chain Protocol (single entry — lives here, not in a separate skill)

When a task settles blocked — or a dispatcher-side failure must be quarantined — spawn
one fix task that carries the blocked task as its source and blocks it:

`addTask` with `feature_slug` = the feature, `title` = "Fix: <reason>", `type` per the
table below, `source_slug` + `source_local_id` = the blocked task, `block_source: true`,
plus a `task_desc` and helpful `vars` entries (`SOURCE_FILES`, `TEST_SCRIPT`,
`TEST_RESULTS`).

- One transaction creates: the fix task (its local id is auto-prefixed `fix-N`), a
  `fix-chain` edge, and the source task set to `blocked` with an `auto-block` record.
- When the fix completes, the recovery hook restores the source automatically (all
  prerequisites satisfied → `blocked` back to `pending`; edges are never deleted). The
  `submitTask` result lists restored tasks — nothing further to do.
- Chain depth is capped at 6. At the cap, surface to the user instead of spawning a
  deeper fix.
- Fix type by source task category: `coding` / `test` / `validation` / `gate` →
  `coding-fix`; `doc` / `eval` → `doc`.
- A source reference **without** `block_source: true` creates a `disc-N` discrepancy
  follow-up that does not block its source — reserve it for out-of-scope findings, not
  for blocked work.

## Missing-Record Recovery (built-in recovery brief)

When verification shows the task still `in_progress` — the executor finished its run but
never called `submitTask` — recover the record without re-doing the work:

1. Re-claim explicitly with `slug` + `local_id` (idempotent re-entry: `reclaimed: true`,
   brief re-synthesized with a fresh digest).
2. Dispatch the executor once more with exactly this brief, followed by the
   re-synthesized `dispatchPrompt` verbatim:

> You are recovering a missing task record for `<slug>/<localId>`.
>
> The previous execution completed its implementation work but did NOT call `submitTask`.
> Recover the record without re-doing the implementation.
>
> 1. DO NOT re-implement — this is a VERIFY-ONLY run. If verification fails, submit
>    `result=blocked` with the failure in the reason; do not attempt to fix code.
> 2. Verify the implementation exists: the files the brief names are present and carry
>    the relevant changes. Missing or unchanged → `result=blocked`, reason "no
>    implementation found", stop.
> 3. Run the quality gate sequence in strict order — stop at the first failure:
>    `just compile` → `just fmt` → `just lint` → `just unit-test`.
> 4. All passed → settle via `submitTask result=success` with the summary, the four gate
>    results, the changed files, and the commit hash if one exists.

3. If the recovery run again ends without a submit record, count it as a failed cycle —
   do not loop recoveries.

## Failure Tracking

Keep `consecutive_failures` (starts at 0). Increment on: fix-task spawn, missing-record
dispatch, executor timeout. Reset to 0 when a verify shows `completed`. At 3: stop and
print the summary.

## Dispatch Summary

When the loop ends (Z1 finish or 3 consecutive failures):

```
## Dispatch Summary

- Claimed: <N> — completed <N>, blocked <N>, failed <N>
- Consecutive failures at stop: <N>

<one line per non-completed task: `<slug>/<localId> — <status> — <short reason>`>
```

If no `test-run` task was claimed during the loop and surface-level tests exist, suggest
invoking the run-tests skill — do not run them from here.

The dispatcher never edits files and never commits; those belong to executors and the
git-commit skill.
