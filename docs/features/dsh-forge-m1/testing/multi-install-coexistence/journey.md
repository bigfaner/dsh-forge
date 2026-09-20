---
feature: "dsh-forge-m1"
journey: "multi-install-coexistence"
risk_level: "High"
golden_path: false
surface_types: ["web"]
surface_keys: ["web"]
sources:
  - docs/features/dsh-forge-m1/prd/prd-user-stories.md
  - docs/features/dsh-forge-m1/prd/prd-spec.md
  - docs/features/dsh-forge-m1/design/tech-design.md
generated: "2026-09-20"
---

# Journey: multi-install-coexistence

**Risk Level**: High

<!-- Risk: three runtimes alternately read/write the same shared $DSH_HOME sessions and credentials — data corruption risk if isolation or format compatibility fails. -->

## Overview

A user who already has the dsh CLI and the official desktop app installed also installs dsh-forge, and alternates among all three forms, verifying they share `$DSH_HOME` sessions and credentials without corrupting each other and that each keeps its own independent profile directory.

## Setup

- Machine with dsh CLI already installed and used
- Official upstream desktop app installed (if applicable) with its `desktop` profile
- Pre-existing sessions and credentials in `$DSH_HOME` created via CLI/official desktop
- dsh-forge installer available

## Happy Path

### Step 1: Install dsh-forge alongside existing installs

**User Action**: Install and launch dsh-forge on a machine that already runs CLI and the official desktop.

**Expected Result**: Installation succeeds; the `dsh-forge` profile directory is created and is distinct from the upstream `desktop` profile; both desktop apps coexist without conflict.

### Step 2: Read shared data from dsh-forge

**User Action**: Open dsh-forge and browse sessions and credentials created earlier by CLI/official desktop.

**Expected Result**: Shared `$DSH_HOME` sessions and credentials are read correctly in the upstream existing format.

### Step 3: Mutate shared data from dsh-forge

**User Action**: Create a new session and update settings/credentials inside dsh-forge.

**Expected Result**: Writes persist to `$DSH_HOME` in the upstream existing format with no schema change or migration.

### Step 4: Alternate back to CLI and official desktop

**User Action**: Exit dsh-forge, then use the CLI and the official desktop app against the same `$DSH_HOME`.

**Expected Result**: All three forms read the sessions and credentials — including those created by dsh-forge — normally, with zero data corruption.

## Edge Cases

### Step 1b: Profile directory collision check

**Precondition**: Upstream `desktop` profile directory already exists on the machine.

**User Action**: Install and launch dsh-forge, then inspect the profile directories.

**Expected Result**: `dsh-forge` profile is an independent directory (≠ upstream `desktop`); the official desktop profile is not modified or overwritten.

### Step 2b: Second dsh-forge launch while dsh-forge and official desktop both run

**Precondition**: dsh-forge is running and the official upstream desktop app is also running (two different apps, one instance each).

**User Action**: Launch a second dsh-forge instance while both apps are running.

**Expected Result**: The dsh-forge single-instance lock prevents the second dsh-forge instance (existing window focused or restored from tray); the official desktop app is unaffected; no second dsh-forge host subprocess or profile contention occurs. (source: tech-design F1 single-instance flow)

**Note**: Simultaneous *cross-form concurrent writes* (dsh-forge writing to `$DSH_HOME` at the exact moment the official desktop writes) is not specified by PRD or tech-design — concurrent-access safety is UNKNOWN; this journey only asserts alternating access (see Step 4c).

### Step 3b: Credential updated by CLI between dsh-forge sessions

**Precondition**: While dsh-forge is resident in tray, the user updates the API key via CLI.

**User Action**: Resume dsh-forge and start a new session.

**Expected Result**: dsh-forge picks up the externally updated credential without stale-state failure; no credential file corruption.

### Step 4b: Uninstall dsh-forge

**Precondition**: dsh-forge has created sessions and settings in `$DSH_HOME`.

**User Action**: Uninstall dsh-forge, then use CLI again.

**Expected Result**: Shared `$DSH_HOME` data remains intact and usable by CLI. Whether the uninstaller removes only the `dsh-forge` profile directory (and never touches upstream `desktop` profile or shared `$DSH_HOME` data) is UNKNOWN — uninstall semantics are not specified by PRD or tech-design; observed uninstaller behavior must be recorded and any destructive effect on shared data is a defect.

### Step 4c: Alternating rapidly across forms

**Precondition**: Sessions exist from all three forms; each form is used one at a time (no simultaneous writes).

**User Action**: Rapidly alternate CLI → dsh-forge → official desktop → CLI, each reading the shared data.

**Expected Result**: All reads succeed each time; no data corruption from rapid *alternating* access (source: PRD/tech-design DF003/SC8 — "交替读写互不损坏"). Absence of torn writes or lock residue under *simultaneous* access is not asserted — that is UNKNOWN (see Step 2b note).

### Step 4d: Session expires between form switches (surface rule coverage)

**Precondition**: While working in CLI, the upstream session/auth token created in the dsh-forge session lapses.

**User Action**: Switch back to dsh-forge and attempt to continue the session.

**Expected Result**: The user is shown session-expired feedback in-app and can re-establish the session; shared `$DSH_HOME` data is not corrupted by the expiry. (required_outcomes: `session-expired` per surface-web rule; source: inferred)

## Journey Invariants

- The `dsh-forge` profile directory is never equal to, and never overwrites, the upstream `desktop` profile directory at any point
- All reads/writes to `$DSH_HOME` use the upstream existing format — no data migration or schema change ever occurs
- After every alternation step, shared sessions and credentials remain readable by all installed forms
- A single-instance lock ensures at most one dsh-forge instance runs at any time
