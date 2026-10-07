---
name: tech-design
description: Produce the technical design from the PRD and UI design — architecture and interface decisions, plus the registered design artifacts (tech-design, ER diagram, SQL schema, page map) via upsertFeatureDoc.
---

# Tech Design

Resolve technical uncertainty during design, avoiding rework during implementation. The PRD
intentionally excludes technology selection — every technology decision starts here, driven
by the PRD's non-functional constraints and the current project state.

<HARD-GATE>
Do NOT write implementation code until the design is approved. The output of this skill is
design documents.
</HARD-GATE>

## Prerequisites

| Artifact | Missing? |
|---|---|
| `prd/prd-spec.md` (registered `prd-spec`) | Run `write-prd` first |
| `ui/ui-design.md` (when the feature has UI) | Run `ui-design` first |

## State-Layer Discipline

Design artifacts are written to disk AND registered — registration advances the feature
phase to `design` monotonically:

| Artifact | Path | Registration |
|---|---|---|
| Tech design | `docs/features/<slug>/design/tech-design.md` | `upsertFeatureDoc` `doc_kind: tech-design` |
| ER diagram | `docs/features/<slug>/design/er-diagram.md` | `upsertFeatureDoc` `doc_kind: er-diagram` |
| SQL schema | `docs/features/<slug>/design/schema.sql` | `upsertFeatureDoc` `doc_kind: sql-schema` |
| Page map (web surface) | `docs/features/<slug>/design/page-map.md` | `upsertFeatureDoc` `doc_kind: page-map` |

`api-handbook.md` / `cli-handbook.md` / `screen-map.md` (surface handbooks below) have **no
registry kind** — they are on-disk artifacts consumed by gen-contracts/gen-test-scripts; do
not fabricate registrations for them. Reworked documents are registered again (same kind,
refreshed summary).

## Intent Adjustments

Read `intent` from `docs/proposals/<slug>/proposal.md` when present; missing → `new-feature`.

- `new-feature`: full design — all sections; user stories read and used as the AC checklist.
- `enhancement`: internal-architecture focus; improvement goals replace user stories as the
  checklist; handbooks/ER only on override signal.
- `refactor` / `cleanup` / `fix`: internal architecture (module reorganization, dependency
  adjustment, behavioral invariants, regression risk); NO ER diagram, NO user stories; the
  PRD's Verification Criteria section is the AC checklist.
- `doc`: minimal — what changes and why; no architecture/interfaces/data sections.

## Workflow

1. **Read the PRD** (+ user stories or their intent-specific replacements). Note non-functional
   requirements — they are the input conditions for technology selection. Extract the
   `db-schema` frontmatter value for the DB branch below.
2. **Explore context** — existing architecture and decision docs (`docs/ARCHITECTURE.md`,
   `docs/decisions/`), business rules and conventions from prior features, package manager
   files for current dependencies, source directories for existing patterns.
3. **Identify decisions** — architecture fit, interfaces, data models, dependencies, error
   handling, testing strategy, security, local dev. Ask the user about genuinely uncertain
   areas; in dispatched task context decide from the brief and record the rationale.
4. **Draft section by section with approval per section** — Overview / Architecture
   (component diagram) / Interfaces / Data Models / Error Handling / Integration Specs /
   Testing / Security as applicable to the intent. Quality checks per section: every PRD AC
   maps to a design element; every section is ready for task breakdown; cross-layer data
   flows are mapped; integration points specified.
   - **DB schema branch** (`db-schema: "yes"`, new-feature): generate `er-diagram.md` +
     `schema.sql` alongside Data Models and present them as a standalone review unit — do
     not proceed until the schema is explicitly approved.
5. **Write documents and register** — `design/tech-design.md` always; ER + schema on the DB
   branch; handbooks by surface: `api-handbook.md` (api), `cli-handbook.md` (cli/tui),
   `page-map.md` (web), `screen-map.md` (mobile). Surface detection: read the repo's own
   surface configuration (testing conventions under `docs/conventions/testing/`, existing
   tasks' surface fields, UI functions' platform) — never guess; ask when ambiguous
   (interactive) or derive from the brief (task context). Handbooks carry a `created`
   frontmatter timestamp for freshness checks downstream.
6. **Decisions** — significant decisions live IN the design document. Archiving to
   `docs/decisions/` is a separate knowledge-sinking activity outside this skill; propose it
   to the user when warranted, do not perform it here.

## Next Step

After the design is approved and registered: the `breakdown-tasks` skill.
