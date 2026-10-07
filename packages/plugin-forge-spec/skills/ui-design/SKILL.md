---
name: ui-design
description: Produce the UI design specification and HTML prototype from the PRD's ui-functions document — design style selection, per-function layout/states/interactions, and a reviewable prototype.
---

# UI Design

Define HOW the interface looks and behaves, separated from the PRD's WHAT.

<HARD-GATE>
Do NOT write implementation code (HTML prototypes are the only exception). This skill
produces the design specification document and prototype files.
</HARD-GATE>

## Prerequisites

| Artifact | Missing? |
|---|---|
| `docs/features/<slug>/prd/prd-ui-functions.md` (registered as `ui-functions`) | Run `write-prd` first and add UI function definitions |

## State-Layer Discipline (boundary)

The document registry vocabulary is closed at seven kinds and has **no ui-design kind** —
`ui-design.md` and the prototype files are on-disk artifacts and are NOT registered. Do not
fabricate registrations under a mismatched kind (`ui-functions` already names
`prd/prd-ui-functions.md`; re-pointing it at `ui-design.md` would lose the PRD row).

The one state touch this skill owns: whenever this skill **writes back into
`prd/prd-ui-functions.md`** (navigation architecture backfill in Step 2, PRD reconcile in
Step 7), re-register it:

```
upsertFeatureDoc { feature_slug: "<slug>", doc_kind: "ui-functions",
                   rel_path: "docs/features/<slug>/prd/prd-ui-functions.md", summary: "<one line>" }
```

## Workflow

1. **Read UI functions** — for each UI function note its Placement: `new-page` (design the
   complete page) vs `existing-page:<route>` (design only the embedded components; the
   Position field constrains layout, e.g. width must match the existing content area).
2. **Extract navigation architecture** — read the `## Navigation Architecture` section of
   `prd-ui-functions.md`. If absent, collect it from the user (platform, primary entries,
   secondary pages, navigation rules) and **write it back** into `prd-ui-functions.md`, then
   re-register the document (see boundary above).
3. **Select design style** — priority: user-provided DESIGN.md (project root or feature
   directory) → user choice among built-in styles → clone from external style repos when
   built-ins are insufficient. Multi-platform features select one style per platform. Inline
   the selected tokens as the Design System section of the design doc (no external file
   references).
4. **Draft the design** — for each UI function define: layout structure (component
   hierarchy), states (loading/empty/error/populated), interactions (triggers, actions,
   feedback), data binding (element → data field). `existing-page` functions MUST carry a
   Placement subsection refined with discovered layout constraints. TUI platforms: every
   panel includes ASCII mockup, dimensions, character palette, color mapping, and edge-case
   rendering.
5. **Write the design document** — `ui/ui-design.md` (web), `ui/ui-design-tui.md` (TUI),
   `ui/ui-design-mobile.md` (mobile); multi-platform features get one file per platform.
   Not registered (see boundary).
6. **Generate the prototype** — HTML from the design doc + selected style: shared CSS/JS +
   per-page HTML + `index.html` navigation; all four states implemented; navigation, modals,
   and tabs interactive; responsive. TUI: a single `index.html` simulating a terminal window
   (dark monospace, box-drawing via CSS, key-button bar to switch panels, toggleable panel
   states). Save under `ui/prototype/` (per-platform subdirectories for multi-platform).
7. **Human review gate** — present the prototype (open `index.html` in a browser) and wait
   for explicit approval before proceeding. In dispatched task context, record the
   prototype location and highlights in the output instead of blocking.
8. **Reconcile the PRD (after approval)** — compare prototype vs `prd-ui-functions.md`:
   pages/interactions/data fields/navigation present in the prototype but not the PRD →
   propose writing them back. On user approval, update `prd-ui-functions.md` and
   re-register it (the prototype is the source of truth for what was designed); on decline,
   note the discrepancies inside `ui-design.md`.

## Next Step

After the prototype is approved or skipped: the `tech-design` skill.
