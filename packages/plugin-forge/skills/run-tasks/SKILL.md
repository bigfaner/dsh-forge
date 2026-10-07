---
name: run-tasks
description: Forge dispatch loop — call dispatchTask once per round, read the returned settlement and pool snapshot, decide continue / wrap up / surface; carries the mode-mismatch guard line and the canonical fix-chain protocol.
---

# Run Tasks (dispatcher)

Drive the forge task pool: one `dispatchTask` call per round. The tool claims the next
ready task, spawns a worker with the dispatch briefing, and returns the settlement with
a live pool snapshot — the briefing itself never enters this session's context. State
changes only through the pipeline verbs (`dispatchTask` / `queryTask` / `addTask` /
`submitTask`), never through files, the database, or parallel state.

Works identically in both modes: containers may be features (expedition chain) or
proposals with directly attached tasks (blitz chain). Selection is DAG readiness over
the pool — there is no way to pick a specific task, by design.

## Dispatcher Iron Laws

<EXTREMELY-IMPORTANT>
1. One `dispatchTask` call per round; read the return; decide; repeat. Nothing else
   drives the pool.
2. NO code reading or writing by the dispatcher itself — workers execute; this session
   orchestrates.
3. NO running tests directly — quality gates belong to workers and the run-tests skill.
4. Do not invent work: when no task is ready, follow the pool verdict below — never
   fabricate tasks to keep the loop busy.
</EXTREMELY-IMPORTANT>

## Container Context (context_slug)

When invoked as `/run-tasks <container-slug>` (the dispatch entry sends exactly that),
pass the slug as `context_slug` on every call. It attributes no-task events to that
container's log (`logs/<slug>.jsonl`) — nothing more: claim selection stays pool-wide
DAG readiness and is NOT filtered by the context. Omit it only when no container is
identified.

## Loop — the four dispatchTask exits

### 1. `spawned` · success

The worker settled the task: natural key, type, mode lineage, summary, commit hash if
any, plus the pool snapshot. Note it and call `dispatchTask` again.

### 2. `spawned` · blocked

The worker settled blocked with a reason; a follow-up fix task is listed when one was
spawned (it is dispatchable — just continue the loop). If the settlement shows no
follow-up and the failure warrants a fix chain, spawn it yourself per the fix-chain
protocol below, then continue.

### 3. `no-task` — read the pool verdict

The return carries the pool snapshot (`pending` / `in_progress` / `blocked` /
`unmetPending`) and a verdict:

| Verdict | Meaning | Action |
|---|---|---|
| pool all settled — wrap up | Everything terminal | End the loop, print the dispatch summary |
| work in flight or prerequisites unmet | Tasks may become ready later | Bounded patience: retry after a pause; if repeated rounds show no movement, wrap up and suggest re-dispatching later |
| suspected deadlock (blocked with no pending path) | Blocked tasks, nothing can become ready | Surface to the user with the blocked keys — human or diagnostic attention needed; do not keep looping |

### 4. `halted` — session-sticky spawn guard

Three consecutive worker-spawn failures stick this session: every further `dispatchTask`
returns `halted` immediately. The guard has no self-unlock — the reset is a **new
dispatch session** (cold start clears the counter). Report the reason to the user and
stop; recommend re-entering via the dispatch entry, which opens a fresh session in the
container's mode. Do not attempt workarounds from this session.

### Spawn failure (`✗ ERR_SPAWN_FAILED`)

The claimed task stays `in_progress`; re-calling `dispatchTask` re-enters it
idempotently (the briefing is re-synthesized). Retry the same call; repeated failures
trip the `halted` guard. If the environment itself is broken, surface it for manual
transition instead of looping.

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
- Mechanical parts are tool-carried and need no supervision: the `fix-N` local id, the
  same-transaction blocking of the source, automatic restoration when the fix completes
  (the `submitTask` result lists restored tasks), and the depth cap (≤6 — deeper spawns
  are rejected; at the cap surface to the user instead).
- A source reference **without** `block_source: true` creates a `disc-N` discrepancy
  follow-up that does not block its source — reserve it for out-of-scope findings, not
  blocked work.

## Dispatch Summary

When the loop ends (pool settled, bounded patience exhausted, deadlock surfaced, or
halted), report:

```
## Dispatch Summary

- Rounds: <N> — completed <N>, blocked <N>
- Pool at stop: <pending / in_progress / blocked / unmetPending from the last snapshot>

<one line per non-completed task: `<slug>/<localId> — <status> — <short reason>`>
<one line for surfaced deadlocks / halt reason / mismatch notes>
```

The dispatcher never edits files and never commits; those belong to workers.
