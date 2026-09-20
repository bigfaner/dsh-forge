---
feature: "dsh-forge-m1"
journey: "update-awareness-crash-recovery"
risk_level: "High"
golden_path: false
surface_types: ["web"]
surface_keys: ["web"]
sources:
  - docs/features/dsh-forge-m1/prd/prd-user-stories.md
  - docs/features/dsh-forge-m1/prd/prd-spec.md
generated: "2026-09-20"
---

# Journey: update-awareness-crash-recovery

**Risk Level**: High

<!-- Risk: host subprocess crash risks in-flight session data loss; recovery depends on state mutation (subprocess restart, session persistence restore). -->

## Overview

A continuous user gets an in-app update hint when a new version exists (and can jump to the release page), is never blocked when the update feed is unreachable, and — when the host subprocess is force-killed mid-session — keeps the shell alive, is informed, restarts the subprocess, and recovers the most recent session state from session persistence.

## Setup

- dsh-forge app installed and running with an active session
- A fake GitHub Releases feed configured containing a newer version number (for update detection scenarios)
- Ability to force-kill the host subprocess (verified once per platform)

## Happy Path

### Step 1: Detect a new version at startup

**User Action**: Launch the app with the fake Releases feed configured.

**Expected Result**: An in-app update hint appears within 60 seconds of startup.

### Step 2: Jump to the release page

**User Action**: Click the update hint.

**Expected Result**: The user is guided to the release page for manual download; the app continues running normally afterward.

### Step 3: Force-kill the host subprocess mid-session

**User Action**: While a session is in progress, force-kill the host subprocess.

**Expected Result**: The shell main process stays alive and shows a crash-recovery notice; the app does not silently exit or hang.

### Step 4: Restart the host subprocess and recover the session

**User Action**: Trigger (or accept) the host subprocess restart from the recovery notice.

**Expected Result**: The host subprocess restarts with the bundled runtime, and the most recent session state is restored from session persistence so the user can continue where they left off.

## Edge Cases

### Step 1b: Update feed unreachable (offline)

**Precondition**: No network connectivity at launch.

**User Action**: Start the app.

**Expected Result**: The update check fails silently — no error dialog, no retry storm, startup is not blocked; the app enters normally.

### Step 2b: Feed reports the same version

**Precondition**: The fake feed reports the currently installed version (no update).

**User Action**: Launch the app and wait past 60 seconds.

**Expected Result**: No update hint is shown; no misleading prompts.

### Step 2c: User dismisses the update hint

**Precondition**: An update hint is displayed.

**User Action**: Dismiss the hint without jumping to the release page.

**Expected Result**: The hint closes cleanly and does not re-appear repeatedly within the same session.

### Step 3b: Shell main process itself crashes

**Precondition**: The shell main process (not just the host subprocess) terminates abnormally.

**User Action**: Relaunch the app.

**Expected Result**: The app starts normally and the most recent session state is restored from session persistence — no work is lost.

### Step 4b: Session persistence incomplete at crash moment

**Precondition**: The host was killed before the latest session events were fully flushed.

**User Action**: Restart the host subprocess.

**Expected Result**: Recovery restores the last consistently persisted session state; the app does not crash on a partially written event stream.

### Step 4c: Crash recovery with window closed (tray resident)

**Precondition**: The main window is closed and the app is tray-resident when the host subprocess is killed.

**User Action**: Restore the window after the crash.

**Expected Result**: The crash-recovery notice is visible after restore and the recovery flow works identically.

## Journey Invariants

- The update check never blocks or breaks startup, in success or failure, at any point
- The only outbound network traffic is the read-only HTTPS access to the Releases feed — no listening ports are ever opened
- After any crash and restart path, the most recent session state recoverable from session persistence is restored and no persisted session data is destroyed
- At steady state after recovery, own process count returns to exactly 2 (shell main process + host subprocess)
