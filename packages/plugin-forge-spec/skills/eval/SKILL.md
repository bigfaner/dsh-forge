---
name: eval
description: Score a Journey or Contract document set against its rubric — inline score-gate-revise loop with a report at testing/<journey>/.eval-report.md; below-target artifacts block the downstream pipeline stage.
user-invocable: false
---

<!--
  M3 eval survivor list (OQ#3 — decided in task 3.2, 2026-10-07):
  KEPT: journey, contract (task types eval-journey/eval-contract exist; gen-contracts and
        gen-test-scripts gate on this skill's report).
  CUT:   proposal / prd / design / ui (no M3 consumer — no task types, no auto-run config,
         chain does not wire them); consistency (prerequisite manifest.md is dead in M3);
         validate-code / validate-ux (validation-* dispatch templates are self-contained —
         M2/M3 precedent: template-driven, not skill-driven).
  Architecture trim: scorer/reviser subagent orchestration removed — worker tool faces
  deny delegation, so the loop runs inline in the invoking session. Rubrics inlined below.
-->

# Eval

Score document quality against the type's rubric, gate on the target score, revise when
allowed, and write the report. Two types survive in M3: `journey` and `contract`.

## Parameters

| Parameter | Default | Description |
|---|---|---|
| `--type` | required | `journey` or `contract` |
| `--target` | rubric target (journey 975 / contract 935) | pass threshold; dispatched templates pin 850 |
| `--iterations` | 1 | revise-loop bound; interactive use may raise to 3 |

## Required Documents

| Type | Target |
|---|---|
| `journey` | `testing/<journey>/journey.md` |
| `contract` | all of `testing/<journey>/contracts/step-<N>-<action>.md` |

Missing → report the missing artifact and stop; tell the user which skill produces it.

## Context Modes

- **Dispatched task (eval-journey / eval-contract)**: score-only — the dispatch brief
  forbids modifying the evaluated files. Score once, write the report, and if below
  target the TASK settles blocked with the findings (the fix chain carries rework);
  do not self-revise here.
- **Interactive session**: inline loop — score → gate → revise (the evaluated document
  only) → re-score, up to `--iterations`; stop early at/above target.

The loop always runs inline in the invoking session (worker tool faces deny delegation;
subagent orchestration is not assumed).

## Rubric: journey (1150 · target 975 · pass = total ≥ target AND every dimension ≥ min)

| Dimension | Points | Min | What is checked |
|---|---|---|---|
| Completeness | 200 | 120 | kebab-case name + valid justified risk; every step has action + ≥1 happy-path outcome in an ordered sequence; boundary/error outcomes beyond happy path as the surface requires |
| Semantic purity | 200 | 120 | natural-language outcomes (no regex/selectors/assertion calls); declarative preconditions (state, not setup procedure); no implementation coupling in steps |
| Precondition exclusivity | 150 | 90 | outcomes within a step distinguishable and non-overlapping via preconditions |
| Fact alignment | 150 | 90 | steps/expectations consistent with the PRD/user stories they cite; no invented behavior |
| Surface fitness | 150 | 90 | steps fit the declared surface types; surface conventions respected |
| Internal consistency | 150 | 90 | invariants hold against the steps; edge cases reference real happy-path steps; no contradictions |
| Workflow coverage | 150 | 90 | the user goal is achieved end-to-end; no unexplained gaps between steps |

## Rubric: contract (1100 · target 935 · pass = total ≥ target AND every dimension ≥ min)

| Dimension | Points | Min | What is checked |
|---|---|---|---|
| Completeness | 150 | 90 | six dimensions present per outcome; journey invariants section present |
| Semantic purity | 200 | 120 | descriptors are natural language; no regex/framework assertions leaked |
| Precondition exclusivity | 150 | 90 | per-step outcomes mutually exclusive |
| Fact alignment | 150 | 90 | anchors and expectations match the handbooks/source ground truth cited |
| Surface fitness | 100 | 60 | assertions phrased for the surface type (exit codes/stdout for cli, status/payload for api, visual for web/mobile) |
| Internal consistency | 150 | 90 | state dimensions compose; invariants consistent with the journey |
| Anchor integrity | 100 | 60 | anchors present when handbooks exist; matched to steps or explicitly empty — never guessed |
| Fixture specification | 100 | 60 | every outcome's preconditions carry a declarative fixture_spec with ≥1 entity |

Scoring honesty: award points per dimension from evidence in the documents; never round a
failing dimension up to reach the target — a below-min dimension fails the pass condition
regardless of total.

## Report

Write the report to `testing/<journey>/.eval-report.md` (this file IS the gate artifact
gen-contracts / gen-test-scripts check): final score with scale, per-dimension table
(points/min/status), findings with severity and document-location references, outcome
line (`PASSED` / `FAILED (below target|dimension <min>)`), and for revised runs the score
progression. Then state the outcome in the session/task output.

## Next Step

journey at/above target → `gen-contracts`; contract at/above target → `gen-test-scripts`.
Below target in interactive mode → revise and re-score per the loop; below target in task
mode → settle blocked with the findings.
