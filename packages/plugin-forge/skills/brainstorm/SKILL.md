---
name: brainstorm
description: Expedition structured exploration — turn a vague idea into a user-approved proposal.md through challenge-driven dialogue, then register it into the proposal domain with mode=expedition lineage.
---

# Brainstorm

From vague idea to structured proposal, through relentless collaborative dialogue. The
goal is shared understanding — not filtering ideas, but making implicit assumptions
explicit so the right path becomes obvious. Pseudo-requirements die naturally when the
thinking is clear. This is the expedition entry: the accepted proposal chains into a
feature container and the full SDD pipeline (write-prd → design → breakdown) beyond it.

<HARD-GATE>
Do NOT write code or take implementation action — this skill produces a proposal
document and its proposal-domain row only.
</HARD-GATE>

<HARD-RULE>
**No technology selection; constraints only.** Describe "what effect to achieve"
(performance, platform, security) — not "what tool to implement with" (frameworks,
languages, databases, patterns). Technology selection belongs to tech-design.
</HARD-RULE>

## Process Flow

```
Analyze context → Walk the design tree → Propose approaches → Define scope →
Infer intent → Write proposal → Consistency check → User approval → Register
```

### Step 1: Analyze Context

Before asking anything, search the codebase for related features, docs, proposals, and
recent history. Synthesize findings internally — do not show this analysis to the user;
it drives informed questioning.

### Step 2: Walk the Design Tree

Interview the user until genuine shared understanding — not surface agreement. Ask one
question at a time; **lead with your recommended answer**; if a question could be
answered by exploring the codebase, explore instead of asking. Resolve parent decisions
before sub-branches (if B depends on A, resolve A first); backtrack when a branch
reveals an earlier assumption was wrong.

Challenge is part of every decision point, not a separate phase: every challenge must
cite codebase facts, logical consistency, or domain common sense — state observation →
present evidence → pose the question. Rationally prudent, never hostile.

**Need Gate** — before diving into *how* for each crystallized feature, check in order:
(1) *simpler alternative?* existing tooling/composition that already solves it → propose
that path; (2) *the real need?* hypothesize the underlying goal and confirm it before
assessing whether this is the best path to it; (3) *why now?* low cost of deferral →
suggest deferring. If the user overrides the gate, accept and record
`Challenge Override: user chose to proceed. Reason: <reason or "not stated">` in the
proposal — do not keep challenging after an override.

### Step 3: Propose Approaches

Propose 2–3 **business approaches** (not technical implementations). Lead with your
recommendation, include honest trade-offs, and always include "do nothing" as one
alternative. Let the user decide.

### Step 4: Define Scope

Propose in-scope / out-of-scope boundaries at deliverable level. Get explicit
agreement; if too large, suggest decomposing.

### Step 5: Infer Intent

From the Proposed Solution and Scope (not the title), infer the frontmatter `intent`:
any new externally observable behavior → `new-feature`; pure internal reorganization →
`refactor`; otherwise `enhancement` / `cleanup` / `fix` / `doc` by the closest match.
Present the inference with its reasoning — the user may override.

### Step 6: Write the Proposal

Write `docs/proposals/<slug>/proposal.md` through the file tools, with frontmatter
(`created`, `author` from git config or the user, `status: Draft`, `intent`). Quality
standards — each is a hard bar:

| Section | Standard | Red flag |
|---|---|---|
| Problem | Specific statement + evidence + urgency | "We need to improve X" |
| Solution | Concrete user-facing behavior | "Build a system that..." |
| Alternatives | Honest trade-offs including "do nothing" | Straw-man alternatives with only pros |
| Scope | Deliverable-level items, bounded | Vague areas, open-ended |
| Risks | 3+ specific risks with actionable mitigations | "We'll handle it" |
| Success Criteria | Measurable, testable, covering all scope | "Works well" |

**Consistency check (mandatory before approval)**: after writing Success Criteria and
In Scope, check both directions — every SC is satisfied by some in-scope item, and every
in-scope item feeds some SC; no two SCs contradict. Present any conflict found to the
user and resolve it before proceeding; record the check result in the proposal.

Do not auto-commit; present the proposal and wait for explicit user approval.

### Step 7: Register with Expedition Lineage

Register the approved proposal into the state layer — the row, not the file tree, is
the pipeline's truth:

```
createProposal { slug: "<slug>", title: "<title>",
                 rel_path: "proposals/<slug>/proposal.md", mode: "expedition" }
```

`mode: "expedition"` is written here, at creation — that lineage is what makes the
accepted proposal chain into a feature container (same slug, one atomic transaction)
instead of going straight to tasks. Draft status is the default; verdicts happen only
when the user decides.

## Handoff

On acceptance (user decision, recorded via the proposal UI or in-session), the
expedition chain continues automatically: feature row created → `/write-prd` →
`/ui-design` / `/tech-design` → `/breakdown-tasks` → run-tasks dispatch. This skill
ends at the registered proposal.
