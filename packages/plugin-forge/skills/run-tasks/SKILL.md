---
name: run-tasks
description: Forge dispatch loop — background-dispatch until no-task, drain each in-flight job's settlement via job_output, then keep dispatching; carries the mode-mismatch guard line and the canonical fix-chain protocol.
---

# Run Tasks (dispatcher)

Drive the forge task pool: one `dispatchTask` call per round, `run_in_background: true`.
The tool claims the next ready task, spawns a worker with the dispatch briefing, and
returns a dispatched receipt immediately (taskRef / workerSessionId / jobId / pool
snapshot) — the settlement is not in the return, and the briefing never enters this
session's context. Keep dispatching until `no-task`; a wait verdict (work still in
flight) is the drain point — read each in-flight job's settlement with `job_output`,
then keep dispatching whatever the settlements made ready. When a worker settles, a
completion notification is pushed structurally — collect on the push or at the drain
point; with the push as the first defense and the drain point as the second, a mid-round
job read is never needed. State changes only through the pipeline verbs (`dispatchTask` /
`queryTask` / `addTask` / `submitTask`), never through files, the database, or parallel
state.

Works identically in both modes: containers may be features (expedition chain) or
proposals with directly attached tasks (blitz chain). Selection is DAG readiness —
`/run-tasks <slug>` binds the loop to that one container (below); inside a container
there is still no way to pick a specific task, by design.

## Container Binding (source_kind + source_slug)

When invoked as `/run-tasks <container-slug>` (the dispatch entry sends exactly that),
the slug binds the whole loop to that single container:

1. Resolve the container kind once, up front, and carry it on every call: `feature`
   when the slug is a feature directory, `proposal` when it is a proposal slug (a
   queryTask on any task of the container reports the container kind). If the kind
   cannot be resolved, ask the user — never guess.
2. Pass `source_kind` + `source_slug` (both or neither) on EVERY dispatchTask call of
   the loop. Scoped claim: only that container's ready tasks are selected, and session
   re-entry only resumes same-container in_progress tasks — a foreign-container task
   this session claimed pool-wide earlier is NOT resumed by a scoped loop.
3. There is no separate attribution parameter: when no task is ready, the no-task event
   attributes to `source_slug` automatically (`logs/<slug>.jsonl`); without the source
   pair it falls back to `logs/_pool.jsonl`.

Absent the source pair, dispatchTask claims pool-wide (programmatic/RPC callers, and
loops genuinely not bound to a container) and its pool snapshot stays pool-wide. With
the source pair carried, the snapshot four counts cover only that container — the
verdicts above judge THAT container, and foreign work never appears in the numbers. A
scoped loop that gets `no-task` with an all-settled container snapshot is done with
the container even when pending work exists elsewhere in the pool; report the container
as settled, not the whole pool.

## Dispatcher Iron Laws

<EXTREMELY-IMPORTANT>
1. One `dispatchTask` call per round; dispatch until `no-task`, drain the in-flight
   jobs via `job_output`, dispatch again. Decide on receipts, drained settlements, and
   pool snapshots — never on mid-round job reads. Nothing else drives the pool.
2. One worker per task: a receipt marked `re-entered` means a dispatch for that task is
   already unresolved for this session — NEVER call `dispatchTask` again for it; wait
   for that job's settlement (the completion notification, or `job_output` at the drain
   point) and only then continue the loop.
3. NO code reading or writing by the dispatcher itself — workers execute; this session
   orchestrates.
4. NO running tests directly — quality gates belong to workers and the run-tests skill.
5. Do not invent work: when no task is ready, follow the pool verdict below — never
   fabricate tasks to keep the loop busy.
</EXTREMELY-IMPORTANT>

## Loop — the four dispatchTask exits

### 1. `dispatched` · background receipt

The call returns at once — no settlement in it: the receipt line (`▸ dispatched
<slug>/<localId> — job <id>`), the standing collect line (`collect the settlement when
the worker settles: job_output <id>`), and the pool snapshot. Note the jobId and call
`dispatchTask` again. The settlement itself (natural key, type, mode lineage, summary,
commit hash if any) is delivered later — the completion notification tells you the
worker settled, and the drained `job_output <id>` read carries the block.

A receipt headed `▸ re-entered dispatched <slug>/<localId> — job <id>` is the
duplicate-spawn tripwire: the claimed task was already `in_progress` for this session,
so an earlier dispatch was still unresolved when this round fired — parallel workers on
one task are exactly the failure shape this warns about. Per Iron Law 2, do NOT call
`dispatchTask` again for that task — wait for the in-flight job's settlement
(completion notification / `job_output`) and resume dispatching from there; the
receipt's own guidance lines say the same. A well-paced loop never sees this receipt:
it appears only when a round dispatched while the previous round's job for the same
task was still live.

### 2. `spawned` · blocked

The worker settled blocked with a reason; a follow-up fix task is listed when one was
spawned (it is dispatchable — just continue the loop). If the settlement shows no
follow-up and the failure warrants a fix chain, spawn it yourself per the fix-chain
protocol below, then continue.

One blocked shape is NOT fix-chain material: a reason that waits on another
container's task ("same files, not landed yet"). A fix task cannot make someone
else's work land — surface the blocked key plus the external container key to the
user for a merge-or-sequence decision, and settle this container as waiting on the
external one when nothing else is ready.

### 3. `no-task` — read the pool verdict

The return carries the pool snapshot (`pending` / `in_progress` / `blocked` /
`unmetPending`) — scoped to the bound container when the source pair is carried
(pool-wide only for unscoped calls) — and a verdict judged on that same scope:

| Verdict | Meaning | Action |
|---|---|---|
| pool all settled — wrap up | Everything terminal | End the loop, print the dispatch summary |
| work in flight or prerequisites unmet | Tasks may become ready later | Bounded patience: retry after a pause; if repeated rounds show no movement, wrap up and suggest re-dispatching later |
| suspected deadlock (blocked with no pending path) | Blocked tasks, nothing can become ready | Surface to the user with the blocked keys — human or diagnostic attention needed; do not keep looping |

### 4. `halted` — session-sticky spawn guard

Three consecutive worker-spawn failures stick this session: the next `dispatchTask` entry
returns `halted` immediately. Failures settle inside the worker's job, so the guard counts
them in settlement order — a drained success clears the streak, and job kills never count.
The guard has no self-unlock — the reset is a **new dispatch session** (cold start
clears the counter). Report the reason to the user and
stop; recommend re-entering via the dispatch entry, which opens a fresh session in the
container's mode. Do not attempt workarounds from this session.

### Spawn failure (`✗ ERR_SPAWN_FAILED`)

A failed spawn — or a job that ends without a settlement — leaves the claimed task
`in_progress`; re-calling `dispatchTask` re-enters it idempotently (the briefing is
re-synthesized). A killed run (`job_kill`) is the same shape: task `in_progress`, and
the kill itself never counts toward the guard. Retry the same call; repeated failures
trip the `halted` guard at the next dispatch entry. If the environment itself is
broken, surface it for manual transition instead of looping.

## Mode-Mismatch Guard (visibility, never a block)

Settlements carry the container's mode lineage (`expedition` / `blitz`). If a dispatched
container's mode differs from this session's preset (e.g. an expedition session
dispatching a blitz proposal's tasks), print one visible line in that round — for
example:

> Mode mismatch: container `<slug>` is `blitz`, this session runs the `expedition`
> preset — proceeding without blocking. The platform locks the preset after the first
> turn, so opening a session aligned with the container's mode is the user's call.

Then continue normally. The mismatch affects which skill catalog a *new* session would
inherit, not execution; never halt, skip, or reorder work because of it.

## Fix-Chain Protocol (single entry — canonical text lives here)

When a task settles blocked and no worker-spawned fix exists, quarantine it with one fix
task that carries the blocked task as its source and blocks it:

```
addTask { source_kind: "<feature|proposal>", source_slug: "<container slug>",
          title: "Fix: <reason>", type: "<coding-fix|doc>",
          source_task_slug: "<blocked task slug>", source_task_local_id: "<blocked task local id>",
          block_source: true, task_desc: "<cause>",
          vars: ["SOURCE_FILES=<paths>", "TEST_SCRIPT=<test>", "TEST_RESULTS=<output>"] }
```

- Fix type by source category: `coding` / `test` / `validation` / `gate` → `coding-fix`;
  `doc` / `eval` → `doc`.
- The `vars` you attach reach the fix worker as the `VARS:` line of its dispatch brief —
  put everything the fixer needs (`SOURCE_FILES`, `TEST_SCRIPT`, `TEST_RESULTS`) there;
  context that never rides a var never arrives.
- Mechanical parts are tool-carried and need no supervision: the `fix-N` local id, the
  same-transaction blocking of the source, automatic restoration when the fix completes
  (the `submitTask` result lists restored tasks), and the depth cap (≤6 — deeper spawns
  are rejected; at the cap surface to the user instead).
- A source reference **without** `block_source: true` creates a `disc-N` discrepancy
  follow-up that does not block its source — reserve it for out-of-scope findings, not
  blocked work.

## Dispatch Summary

When the loop ends (pool settled, bounded patience exhausted, deadlock surfaced, or
halted), drain first — read the settlement of every job still in flight; a wrap-up with
undrained jobs would report counts that do not exist yet. Then report:

```
## Dispatch Summary

- Rounds: <N> — dispatched <N>; drained settlements: completed <N>, blocked <N>
- Pool at stop: <pending / in_progress / blocked / unmetPending from the last snapshot>

<one line per non-completed task: `<slug>/<localId> — <status> — <short reason>`>
<one line for surfaced deadlocks / halt reason / mismatch notes>
```

The dispatcher never edits files and never commits; those belong to workers.
