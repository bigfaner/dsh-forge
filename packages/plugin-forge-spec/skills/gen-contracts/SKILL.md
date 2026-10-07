---
name: gen-contracts
description: Generate Contract specifications from Journey documents and code reconnaissance — six dimensions with semantic descriptors, risk-driven Outcome density, and handbook-derived technical anchors, one file per Step under contracts/.
---

# Gen Contracts

Every Journey Step gets a Contract: six-dimension declarations with **semantic descriptors**
(natural language expressing business intent — regex and framework assertions are deferred to
`gen-test-scripts`). When design handbooks exist, Contract frontmatter carries **technical
anchors** (endpoint / command / page / screen) bridging design intent to test code.

<HARD-GATE>
This skill ONLY writes to `docs/features/<slug>/testing/<journey>/contracts/`. No test
scripts, no execution, no other paths.
</HARD-GATE>

## Prerequisites

| Artifact | Missing? |
|---|---|
| ≥1 Journey dir with `journey.md` under `testing/` | Run `gen-journeys` first |
| Journey eval report `testing/<journey>/.eval-report.md`, all at/above target | Run `eval --type journey` first — **blocker** |

**SKIP_EVAL_GATE**: when the task vars carry `SKIP_EVAL_GATE=true` (quick-mode pipeline),
the eval-report prerequisite is waived; every Contract file then carries frontmatter
`skip_eval: true` plus a body note "generated without eval-journey verification — review
with extra scrutiny". Without the flag the blocker is mandatory.

## State-Layer Discipline (boundary)

Contract files are on-disk artifacts under `testing/<journey>/contracts/` — the registry
vocabulary has **no contract kind**; do NOT register them via `upsertFeatureDoc`. Pipeline
position is carried by the task domain (`test-gen-contracts` / `eval-contract` / `test-gen-scripts`).

## Workflow

1. **Read Journeys** — every Journey directory under `testing/`; never skip one by risk or
   size. Parse name, risk level, happy path steps, edge cases, invariants.
2. **Code reconnaissance (Fact Table)** — read source to extract ground-truth values
   (signatures, output formats, error codes, side effects, preconditions) with source
   citations. Write/merge the Fact Table to `.forge/fact-table.json` (`source: "static"`,
   `confidence: "inferred"`; merge by `fact_id`, never delete runtime entries).
3. **Load handbooks + anchors** — per surface: `design/api-handbook.md` (api),
   `design/cli-handbook.md` (cli/tui), `design/page-map.md` (web), `design/screen-map.md`
   (mobile). Missing handbook → skip anchor filling for that surface with a hint, never
   abort. Stale handbook (generated before the current tech-design) → warn, proceed.
   Anchors come ONLY from handbooks — never reverse-engineer from code; unmatched Steps
   leave anchors empty rather than guessed. Set `last_anchor_sync` (ISO-8601) when any
   anchor is filled.
4. **Generate Contracts** — one file per Step: `step-<N>-<action-slug>.md`. All Outcomes of
   a Step share its file; happy path steps become the `success` Outcome, edge cases become
   additional Outcomes with divergent Preconditions.
   - **Six dimensions per Outcome**: Preconditions, Input, Output, State (mandatory);
     Side-effect, Invariants (optional, default `none` / none).
   - **fixture_spec is mandatory** inside Preconditions: declarative pre-existing data
     state (entities, relationships, minimum counts). A Contract without it is invalid.
   - **Preconditions mutual exclusivity**: at most one Outcome's Preconditions can hold for
     any system state; >5 Outcomes per Step triggers review.
   - **Risk-driven density** (from `risk_level`): High 3-5 Outcomes/Step, 13-20/Journey;
     Medium 2-3, 8-12; Low 1-2, 4-7. Generation priority: happy path → surface-required →
     Fact-Table-informed boundary (annotate `source: inferred` + reasoning) → LLM-inferred
     edge cases (High/Medium only). Surface-required Outcomes are mandatory for matching
     Steps: cli `not-found`/`already-exists`; api `unauthorized` (authenticated endpoints);
     web `validation-error` (forms) / `session-expired` (session-dependent).
   - Every Contract file ends with a `## Journey Invariants` section (≥1 entry).
5. **Validate** — schema checks: mandatory dimensions non-empty; fixture_spec present; no
   regex in descriptors; Outcome names unique; exclusivity; invariants section; side-effect
   default; anchor frontmatter structure + sync timestamp. On failure regenerate the
   offending files ONCE with the errors fed back; still failing → stop and report the
   non-compliance list for manual correction (never continue with invalid Contracts).
6. **Write output** to `testing/<journey>/contracts/`; keep the Fact Table current.

## Next Step

`eval --type contract`, then `gen-test-scripts`.
