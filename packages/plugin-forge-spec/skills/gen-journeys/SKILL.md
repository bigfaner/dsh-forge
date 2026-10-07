---
name: gen-journeys
description: Extract Journey narratives (user workflows with High/Medium/Low risk classification) from PRD user stories or the proposal — one journey.md per Journey under testing/, the input for gen-contracts.
---

# Gen Journeys

Pure narrative extraction — no code reconnaissance. Each user workflow becomes one Journey
document describing happy path + edge cases + invariants.

<HARD-GATE>
This skill ONLY generates Journey narrative documents. Contracts, test scripts, and code
belong to the downstream skills `gen-contracts` and `gen-test-scripts`.
</HARD-GATE>

## State-Layer Discipline (boundary)

Journey documents are on-disk artifacts under the feature's testing tree — the document
registry vocabulary (seven phase kinds) has **no journey kind**, so journeys are NOT
registered via `upsertFeatureDoc`. Their pipeline position is carried by the task domain:
the `test-gen-journeys` / `eval-journey` / `test-gen-contracts` task types and their
dependencies. Do not write task files or indexes — tasks live in the state layer via
`addTask` (created at breakdown time, not here).

## Pipeline Position

```
gen-journeys → eval (journey) → gen-contracts → eval (contract) → gen-test-scripts → run-tests
 (narrative)                   (technical)                      (code gen)         (execution)
```

## Input Modes (auto-detected by file existence — never ask which mode)

**PRD mode** (default; `prd/prd-user-stories.md` + `prd/prd-spec.md` exist): one user story =
one Journey candidate; merge stories that are sequential steps toward the same goal; every
Journey traces back to specific story IDs. `prd/prd-ui-functions.md` (if present) maps UI
interactions to steps.

**Proposal mode** (PRD files absent, `docs/proposals/<slug>/proposal.md` exists): Scope and
Success Criteria sections are **mandatory** — either missing → abort with a diagnostic, do
not generate. One Key Scenario = one Journey candidate; without Key Scenarios derive from
Success Criteria/Scope as smoke-level Journeys and annotate `quality: low` in frontmatter
with a quality notice in the body. Every Journey traces back to proposal sections.

Neither source exists → abort listing the missing files.

## Core Concepts

- **Journey**: kebab-case name (`task-lifecycle`), Risk, ordered Steps (user action +
  expected outcome), Invariants (cross-step constraints).
- **Risk**: `High` (state mutation / data loss / irreversible — edge case count MUST be ≥
  happy path step count), `Medium` (multi-step, no irreversible side effects — edge cases
  per branching precondition), `Low` (read-only — happy path + critical errors only).
  Infer from the PRD: create/delete/update → High; view/list/search → Low.
- **Golden Path** (mandatory): every feature has ≥1 Journey covering the primary story's
  core domain action sequence, ≥3 steps, domain terminology (not API terminology). Complex
  features (≥2 entity types with parent-child relations) require ≥5 cross-entity steps.

## Surface Handling

There is no surface-registry CLI in this environment. Detect surfaces from the repo itself:
`docs/conventions/testing/` structure (per-surface convention dirs), `surface_types` of
existing journeys, and the surface fields of the feature's tasks. Supported types: `web`,
`api`, `cli`, `tui`, `mobile`. Never guess — ambiguous and interactive → ask the user;
dispatched task context → derive from the task brief and record the choice. Each Journey
declares `surface_types` + `surface_keys`; the union across all Journeys must cover every
configured surface type and key.

## Workflow

1. **Read input sources** per the detected mode. Do not read source code — extraction is
   narrative only.
2. **Identify workflows** (incl. the Golden Path) and structure each: name, happy path
   steps, edge cases (divergent preconditions referencing happy path steps), expected
   results, setup preconditions.
3. **Classify risk** per the table above; enforce High-risk edge density by generating
   additional edge cases (invalid inputs, missing preconditions, concurrent operations,
   boundaries) when extraction yields too few.
4. **Generate per-Journey files** — one directory per Journey at
   `docs/features/<slug>/testing/<journey-name>/journey.md` with frontmatter:

   ```yaml
   ---
   feature: "<slug>"
   journey: "<name>"
   risk_level: "High|Medium|Low"
   quality: low          # proposal mode without Key Scenarios only
   surface_types: ["web"]
   surface_keys: ["<key>"]
   sources: ["<input doc paths>"]
   generated: "YYYY-MM-DD"
   ---
   ```

   Body: setup preconditions → numbered happy path steps (each: user action + expected
   result) → edge cases (referenced step + divergent precondition + action + result) →
   Journey Invariants. One Journey = one cohesive document; batch internally when content
   is large, never split across files.
5. **Validate every Journey**: name present; risk valid; surface fields non-empty and
   matching detected surfaces; ≥1 happy path step; ≥1 edge case; High-risk density met; ≥1
   invariant; every step has action + expected result; PRD/proposal traceability; surface
   coverage complete. Fix failures before finishing.
6. **Report** — present the generated Journeys (interactive) or summarize in the task output
   (dispatched). Quality gate: the `eval` skill with `--type journey` scores each Journey;
   below-target Journeys block `gen-contracts` (their gate, not this skill's).

## Next Step

`eval --type journey`, then `gen-contracts`.
