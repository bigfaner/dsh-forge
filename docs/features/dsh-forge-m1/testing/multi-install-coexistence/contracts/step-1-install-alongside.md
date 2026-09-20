---
journey: "multi-install-coexistence"
step: "1"
step-action: "Install dsh-forge alongside existing installs"
generated: "2026-09-20"
sources:
  - docs/features/dsh-forge-m1/testing/multi-install-coexistence/journey.md
anchors:
  web:
    page: "主窗口 (inherited upstream GUI)"
    route: "dsh-app://"
    requires_auth: false
    layout: "上游 client UI 插件族"
last_anchor_sync: "2026-09-20T12:00:00Z"
---
# Contract: multi-install-coexistence / Step 1: Install dsh-forge alongside existing installs

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- surface-required note: validation-error N/A and session-expired N/A — installer-level step with no form submission and no session dependency. -->
<!-- fixture entity mapping: RunningInstance ≙ UpstreamLock (tech-design §Data Models) observed at the OS-process level; for the official desktop app the lock is the upstream app's own single-instance mechanism, mirrored here as an observable process -->

## Outcome "success"
<!-- coexistence verified at app level: pre-existing upstream state present, and the dsh-forge profile path is uninitialized (first install on this machine) -->
- Preconditions: "Machine already runs dsh CLI and the official upstream desktop app with pre-existing sessions and credentials in $DSH_HOME; dsh-forge has never been installed, so its profile path is uninitialized; verification focus is app-level coexistence"
  fixture_spec:
    entities:
      - entity_type: "Installation"
        min_count: 1
        field_constraints:
          - field: "name"
            value: "dsh CLI"
      - entity_type: "Installation"
        min_count: 1
        field_constraints:
          - field: "name"
            value: "official upstream desktop"
      - entity_type: "ProfileDirectory"
        min_count: 1
        field_constraints:
          - field: "name"
            value: "upstream desktop profile (exists)"
- Input: "User installs and launches dsh-forge on the machine that already runs CLI and the official desktop"
- Output: "Installation succeeds; the dsh-forge profile directory is created and is distinct from the upstream desktop profile; both desktop apps coexist without conflict"
- State: "dsh-forge profile directory created; upstream installations and their profiles unmodified"
- Side-effect: "none"

## Outcome "profile-directory-collision"
<!-- distinguishing system state vs success: collision-watch mode engaged at the profile-root level (filesystem verification focus), not app-level coexistence -->
- Preconditions: "Upstream desktop profile directory already exists and is populated on the machine before dsh-forge is installed; the harness is in collision-watch mode with verification focus on the profile-root directory level rather than app coexistence"
  fixture_spec:
    entities:
      - entity_type: "ProfileDirectory"
        min_count: 1
        field_constraints:
          - field: "name"
            value: "upstream desktop (pre-existing)"
- Input: "User installs and launches dsh-forge, then inspects the profile directories"
- Output: "dsh-forge profile is an independent directory (not equal to upstream desktop); the official desktop profile is not modified or overwritten"
- State: "Two distinct profile directories coexist; upstream profile content byte-identical to before install"
  <!-- OS-surface qualifier: the byte-identical check is a filesystem-level assertion owned by the journey-level OS/desktop smoke, not the web surface; declared here for traceability -->
- Side-effect: "none"

## Outcome "install-while-official-desktop-running"
<!-- source: inferred -->
<!-- reasoning: Journey setup names coexistence as the core risk; installing while the other desktop is live is the most adversarial yet unspecified-by-journey ordering — Fact FT-013 isolation makes it decidable -->
- Preconditions: "The official upstream desktop app is currently running while dsh-forge is being installed and launched"
  fixture_spec:
    entities:
      - entity_type: "RunningInstance"
        min_count: 1
        field_constraints:
          - field: "app"
            value: "official upstream desktop"
      - entity_type: "Installation"
        min_count: 1
        field_constraints:
          - field: "name"
            value: "dsh-forge installer"
- Input: "User installs and launches dsh-forge while the official desktop app is open"
- Output: "dsh-forge installs and launches successfully; the official desktop app keeps running unaffected; the two apps' single-instance locks do not interfere with each other"
- State: "Both apps running; each owns exactly one instance of itself"
- Side-effect: "none"

## Journey Invariants

- The dsh-forge profile directory is never equal to, and never overwrites, the upstream desktop profile directory at any point
- All reads/writes to $DSH_HOME use the upstream existing format — no data migration or schema change ever occurs
- After every alternation step, shared sessions and credentials remain readable by all installed forms
- A single-instance lock ensures at most one dsh-forge instance runs at any time
