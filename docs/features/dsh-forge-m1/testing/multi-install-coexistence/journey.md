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

### Step 2b: Simultaneous run of two desktop forms

**Precondition**: The official upstream desktop app is running at the same time as dsh-forge.

**User Action**: Use both apps against the shared `$DSH_HOME` concurrently.

**Expected Result**: The single-instance lock prevents two dsh-forge instances; cross-form concurrent access does not corrupt shared data (each profile's writes respect upstream format rules).

### Step 3b: Credential updated by CLI between dsh-forge sessions

**Precondition**: While dsh-forge is resident in tray, the user updates the API key via CLI.

**User Action**: Resume dsh-forge and start a new session.

**Expected Result**: dsh-forge picks up the externally updated credential without stale-state failure; no credential file corruption.

### Step 4b: Uninstall dsh-forge

**Precondition**: dsh-forge has created sessions and settings in `$DSH_HOME`.

**User Action**: Uninstall dsh-forge, then use CLI again.

**Expected Result**: Shared `$DSH_HOME` data remains intact and usable by CLI; only the `dsh-forge` profile directory is removed.

### Step 4c: Alternating rapidly across forms

**Precondition**: Sessions exist from all three forms.

**User Action**: Rapidly alternate CLI → dsh-forge → official desktop → CLI, each reading the shared data.

**Expected Result**: All reads succeed each time; no torn writes or lock residue from rapid alternation.

## Journey Invariants

- The `dsh-forge` profile directory is never equal to, and never overwrites, the upstream `desktop` profile directory at any point
- All reads/writes to `$DSH_HOME` use the upstream existing format — no data migration or schema change ever occurs
- After every alternation step, shared sessions and credentials remain readable by all installed forms
- A single-instance lock ensures at most one dsh-forge instance runs at any time
