---
name: quick-tasks
description: Blitz direct-attach intake — turn a one-line requirement into a proposal (createProposal mode=blitz) plus a dispatchable task list (addTask source=proposal) in one pass; no PRD, no design, no stage-gates, eval-exempt.
---

# Quick Tasks

One-shot blitz planning: from a one-line requirement to a registered proposal plus a
task list hanging directly off it — in a single pass, through the pipeline tools. This
is the expedition pipeline's opposite: no PRD, no design documents, no phase gates.
Gate discipline at execution time is NOT skipped — workers still compile/lint/test and
settle honestly; what is skipped is the specification ceremony.

<HARD-GATE>
Blitz semantics — all three are hard, and they are recorded at creation:
- **`mode: "blitz"` always.** This skill writes the lineage when creating the proposal;
  it never leaves the mode undecided.
- **Integer local ids, no stage-gates.** Tasks get plain numeric ids auto-assigned by
  `addTask` — do NOT create per-phase `doc-summary` or `gate` tasks (that is the
  expedition breakdown shape), and do not invent `T-*`/phase-prefixed ids.
- **Eval-exempt.** No `eval-journey` / `eval-contract` tasks and no test-pipeline chain
  (gen/eval stages are expedition-only). A plain `test-run` task is allowed when the
  work needs surface-level verification.
- **No feature row, ever.** When the user accepts this proposal it goes straight to the
  task stage — never call `registerFeature` from here.
</HARD-GATE>

## Step 1: Read the Request

Take the one-liner plus whatever context the user gives. Judge the fit honestly: blitz
is for bounded, well-understood needs. If the request needs a PRD, a design, or
specification assets to be decidable, say so and recommend the expedition route
(brainstorm) instead — the user decides; do not silently absorb oversized scope.

## Step 2: Create the Proposal

```
createProposal { slug: "<kebab-slug>", title: "<short title>", mode: "blitz" }
```

Status starts `draft` (the default). `rel_path` is optional — attach it only when a
proposal document already exists or the user asked for one; a one-liner does not need a
`proposal.md` to proceed.

## Step 3: Derive Tasks

From the request, derive a flat task list:

- One task per independently verifiable outcome; 1–2h sizing; **≤6 acceptance criteria
  per task** (more = split by functional boundary).
- `acceptance_criteria` = objectively checkable items — they become the submit-time
  evidence gate, so every item must be verifiable by a real run.
- Type from the closed vocabulary, classified by **output artifact**: compilable or
  runnable output → `coding-feature` / `coding-enhancement` / `coding-cleanup` /
  `coding-refactor`; non-compilable output only (`.md`, `.yaml`, `.json`, `.sql`, ...)
  → `doc`. Surface-level verification → `test-run`. Never assign `coding-fix` manually
  (fix-chain spawn only) and never the eval/gen types (exempt above).
- `depends_on` = local ids of same-proposal prerequisites; capture each `addTask`
  return's `local_id` to wire later tasks. Linear unless parallel work is clearly
  implied.
- Priority: P0 blocks the rest; P1 maps to the core ask; P2 polish.

## Step 4: Create the Task List

Every call carries the proposal container pair:

```
addTask { source_kind: "proposal", source_slug: "<proposal slug>",
          title: "...", type: "...", priority: "P1", estimated_time: "1-2h",
          task_desc: "...", acceptance_criteria: ["...", "..."],
          depends_on: ["<prior local_id>"], vars: ["KEY=VALUE"] }
```

Sizing audit after creation: multi-verb titles split, AC crossing unrelated domains
split, every acceptance point of the request covered by ≥1 task.

## Step 5: Report and Hand Off

Report the created graph (task keys, types, dependencies) and the proposal's natural
identity. The verdict is the user's: when they accept (via the proposal UI or by saying
so in-session), `transitionProposal` records it — after acceptance the tasks are
directly dispatchable via run-tasks; there is no feature stage in between.

## Output Checklist

- [ ] Proposal registered with `mode: "blitz"` (draft)
- [ ] Every task created with `source_kind: "proposal"` + the proposal slug
- [ ] Integer ids only; zero `doc-summary` / `gate` / eval / gen tasks
- [ ] Every task ≤6 AC; every AC objectively checkable
- [ ] Dependencies form a DAG (cycles are rejected server-side)
- [ ] No feature row created or implied
