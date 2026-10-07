---
name: write-prd
description: Formalize user requirements into a structured PRD through collaborative dialogue — prd-spec plus user stories and UI functions as applicable, each document registered into the state layer via upsertFeatureDoc.
---

# Write PRD

From vague requirements to a clear PRD (Product Requirements Document) through collaborative
dialogue. Works on an existing feature container (expedition chain: the feature row exists;
typically registered automatically when the proposal was accepted).

**Core principle**: clarify "what to build" and "why" before coding.

## State-Layer Discipline

Every document produced here is written to disk AND registered — the registry, not the file
tree, is the source of truth for what exists. Registering advances the feature phase
monotonically (never regresses).

| Document | Path | Registration |
|---|---|---|
| PRD spec | `docs/features/<slug>/prd/prd-spec.md` | `upsertFeatureDoc` `doc_kind: prd-spec` |
| User stories | `docs/features/<slug>/prd/prd-user-stories.md` | `upsertFeatureDoc` `doc_kind: user-stories` |
| UI functions | `docs/features/<slug>/prd/prd-ui-functions.md` | `upsertFeatureDoc` `doc_kind: ui-functions` |

Registration call shape (params snake_case; `rel_path` repo-relative, forward slashes):

```
upsertFeatureDoc { feature_slug: "<slug>", doc_kind: "prd-spec",
                   rel_path: "docs/features/<slug>/prd/prd-spec.md", summary: "<one line>" }
```

Write the file first, then register it (or register first and write promptly — the row may
dangle briefly, but never leave a produced document unregistered). There is no manifest file
and no index to maintain — the state layer replaced both.

<HARD-GATE>
Do NOT write any code, scaffold any project, or take implementation action until the PRD is
finalized and approved by the user. Present the PRD and get approval first.
</HARD-GATE>

<HARD-RULE>
No technology selection: describing non-functional constraints (performance, platform,
compatibility, security/compliance) is allowed; naming frameworks, languages, databases,
libraries, or architectural patterns is forbidden — those belong to the tech-design skill.
Test: "what effect to achieve" is allowed; "what tool to implement with" is not.
</HARD-RULE>

## Intent Pipeline

If a brainstorm proposal exists at `docs/proposals/<slug>/proposal.md`, read its `intent`
frontmatter; missing or empty → treat as `new-feature`. Intent selects the format:

| Intent | PRD format | User stories | UI functions |
|---|---|---|---|
| `new-feature` | Full | Yes | Yes (UI surface only) |
| `enhancement` | Background + Goals + Test Pipeline | No | If signal |
| `refactor` / `cleanup` / `fix` | Spec-only (three mandatory fields below) | No | No |
| `doc` | Minimal (title + goals + scope) | No | No |

**Override signals** detected during content generation only ADD steps, never remove, and
stack independently: "用户可见行为"/UI-change signals enable user stories + UI functions;
skip signals in negated context. When a signal triggers, note it in the document
(`<!-- Override: ... enabled by signal "..." -->`).

**Spec-only mandatory fields** (refactor/cleanup/fix) — replace user stories as the
information carrier for tech-design:

- **Change Scope**: affected modules/files/packages (concrete paths)
- **Constraints**: behavioral invariants that must not break
- **Verification Criteria**: regression acceptance — how to verify success without regressions

## Workflow

1. **Explore context** — read the proposal (optional input), related feature documents, and
   recent work. If the repo keeps a web sitemap (`docs/sitemap/sitemap.json`) and the request
   touches existing pages, read it as the business-level page inventory. Do NOT read
   architecture or decision docs to steer requirements — technical constraints do not belong
   in a PRD.
2. **Assess scope** — multiple independent subsystems → ask the user to decompose first.
3. **Ask clarifying questions** — one at a time, multiple choice preferred; focus varies by
   intent (roles/purpose/constraints for new-feature; change scope/invariants/verification
   for spec-only). In dispatched task context (no interactive user), decide from the task
   brief and record assumptions in the document instead of blocking.
4. **Propose approaches** (`new-feature` only) — 2-3 business approaches with trade-offs and
   a recommendation; no technology selection.
5. **Present sections incrementally** — Background (reason, users, stakeholders) → Goals
   (quantified) → Scope (In/Out) → Flow (business flow; a Mermaid flowchart is required for
   new-feature) → Functional specs (reference the ui-functions file) → Non-functional notes.
   Get approval per section.
6. **Write the documents** per the intent table above.
   - User stories: only for new-feature (or 用户可见行为 override; skip when every In Scope
     item targets non-compilable artifacts — doc-only features have nothing testable to
     story). Every Background role gets ≥1 story; actions concrete; each story carries
     Given/When/Then acceptance criteria that are objectively verifiable.
   - UI functions: only when the feature has a UI surface. Include placement per function
     (`new-page` vs `existing-page:<route>`) and a Navigation Architecture section.
7. **Register every produced document** via `upsertFeatureDoc` (table above). When a
   document is reworked after review, register the updated file again — same kind, refreshed
   summary; the registry row is updated in place.
8. **Self-check** — every Background dimension covered; goals quantified where possible;
     scope boundaries explicit; ACs verifiable; override signals annotated; nothing outside
     scope crept in.

## Next Step

After PRD approval: UI-surface features → the `ui-design` skill; everything else → the
`tech-design` skill.
