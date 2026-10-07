---
name: breakdown-tasks
description: Break the finalized technical design into an executable task graph via addTask — phased business tasks with dependencies, per-phase summary and gate tasks, and the trailing test pipeline chain, validated with validateFeatureTasks.
---

# Breakdown Tasks

Decompose a technical design into executable tasks (1-4h each, clear dependencies,
testable acceptance criteria) — entirely through the `addTask` tool against the feature
container. Tasks live in the state layer.

<HARD-RULE>
Do NOT create task files, `index.json`, stage-gate files, or any per-task markdown — that
is the old file-based form. Every task, dependency, and gate is a state-layer row created
with `addTask`. The feature phase advances automatically once tasks exist.
</HARD-RULE>

## Prerequisites

| Artifact | Missing? |
|---|---|
| `prd/prd-spec.md` (registered `prd-spec`) | Run `write-prd` first |
| `design/tech-design.md` (registered `tech-design`) | Run `tech-design` first |

`registerFeature` is NOT called here — this skill breaks down an existing feature container
(expedition chain registered it at proposal acceptance; the two explicit-linking boundaries
— NULL-mode proposal after mode setting, and an already-accepted upgrade — are handled in
the session that owns the proposal decision, not during breakdown).

## Task Creation Protocol (addTask)

Create tasks in dependency order — each `addTask` returns the natural key
(`slug`/`local_id`); capture every returned `local_id` to wire later `depends_on`. All
calls carry the container pair:

```
addTask { source_kind: "feature", source_slug: "<slug>", title: "...", type: "...",
          priority: "P0|P1|P2", estimated_time: "...", task_desc: "...",
          acceptance_criteria: ["...", "..."], depends_on: ["<prior local_id>"],
          vars: ["KEY=VALUE"], complexity: "low|medium|high",
          surface_key: "...", surface_type: "...", breaking: true|false }
```

- `title` = action-first business phrasing; `task_desc` = the working description.
- `acceptance_criteria` = objectively verifiable checklist items (the submit-time AC
  evidence gate judges against this list — every item must be checkable).
- `depends_on` = natural-key localIds of same-container prerequisites (same-feature edges
  only; cycles are rejected server-side).
- `breaking: true` when modifying shared interfaces/models/contracts (additive interface
  changes count).
- `vars` carry structured context (`SOURCE_FILES`, `TEST_SCRIPT`, ...) as KEY=VALUE
  entries.
- File-scope boundaries: tasks touching multiple files enumerate exact paths in
  `task_desc`/`vars` — never "all files". When >8 files share one pattern, split by file
  group; a split task adds a scope-constraint var listing its files.

### Type vocabulary (closed — `type` must be exactly one)

`coding-feature` (new runtime behavior/capability/files) · `coding-enhancement` ·
`coding-cleanup` · `coding-refactor` · `code-quality-simplify` · `coding-fix` (only for
fix-chain spawn, never manual) · `gate` · `doc` (non-compilable output only — `.md`,
`.yaml`, `.json`, `.sql`...; classify by OUTPUT artifact, not intent) · `doc-consolidate`
· `doc-drift` · `doc-review` · `doc-summary` · `test-run` · `test-gen-contracts` ·
`test-gen-journeys` · `test-gen-scripts` · `validation-code` · `validation-ux` ·
`eval-contract` · `eval-journey`.

Priority: P0 core mechanism or blocks others; P1 maps to a PRD AC or core flow; P2 polish.

## Workflow

1. **Read all feature documents** — prd-spec, tech-design, user stories, ui-functions,
   ui-design, ER diagram, schema.sql as available. UI docs contribute UI-component task
   rows; ER/schema contribute a schema task; tech-design interfaces/data models/error
   types each map to a task; PRD flow gates map to gate verification tasks.
2. **PRD coverage verification** — read the tech-design's PRD Coverage Map (fallback: user
   stories' AC directly). Every AC maps to ≥1 task; a gap means a missing task or a
   design hole — resolve before creating.
3. **Derive phases & dependencies** — number phases sequentially (1.x, 2.x, ...); prefer
   PRD-declared phase structure, otherwise group by dependency depth. Same phase =
   parallel (unless conflicting); cross-phase = depend on the prior phase's gate. Split
   rules in priority order: (1) independently verifiable outcomes → separate tasks;
   (2) multi-verb titles → split by functional boundary; (3) >8 same-pattern files →
   split by file group. Docs-only features (every output non-compilable) skip language
   resolution and use `doc` types throughout.
4. **Create business tasks** per phase via `addTask` (protocol above). Complexity at
   creation: `low` = ≤3 AC and no hard constraints; `high` = ≥5 AC or hard constraints;
   `medium` otherwise.
5. **Create per-phase summary + gate** — after each phase's business tasks: one `doc-summary`
   task (deps = that phase's business task localIds), then one `gate` task (deps = the
   summary's localId). Gates are the phase boundary; the next phase's first task depends
   on the prior gate.
6. **Create the test pipeline chain** after the last phase's gate, wired in order —
   review-doc (`doc-review`) → gen-journeys (`test-gen-journeys`) → eval-journey
   (`eval-journey`) → gen-contracts (`test-gen-contracts`) → eval-contract
   (`eval-contract`) → gen-scripts (`test-gen-scripts`) → run-tests (`test-run`). Each
   task depends on its predecessor; the first (review-doc) depends on the final phase
   gate. Give each a title naming its skill/purpose; dispatch briefs for these types
   already invoke the skills.
7. **Sizing audit** — re-check every task: multi-verb titles split; AC crossing unrelated
   domains split; operational ceiling respected; **≤6 acceptance criteria per task**
   (more = scope too large, split further).
8. **Validate the container** — `validateFeatureTasks { feature_slug: "<slug>" }`: every
   reported violation names the offending task key; fix (via task state transitions the
   tool surface allows — never direct writes) until the subgraph is healthy.

## Output

Report the created graph: phase structure, task count per phase with natural keys, the
gate chain, and the test pipeline chain. Dispatchable execution (run-tasks) consumes the
pool by DAG readiness — no further wiring needed here.
