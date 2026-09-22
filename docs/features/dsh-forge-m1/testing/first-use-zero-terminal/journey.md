---
feature: "dsh-forge-m1"
journey: "first-use-zero-terminal"
risk_level: "High"
golden_path: true
surface_types: ["web"]
surface_keys: ["web"]
sources:
  - docs/features/dsh-forge-m1/prd/prd-user-stories.md
  - docs/features/dsh-forge-m1/prd/prd-spec.md
  - docs/features/dsh-forge-m1/design/tech-design.md
generated: "2026-09-20"
---

# Journey: first-use-zero-terminal

**Risk Level**: High

<!-- Risk: workflow mutates persistent state (API key credentials, workspace, session data) and creates the independent profile directory; mis-configuration risks data corruption in shared $DSH_HOME. -->

## Overview

A community developer on a clean machine (no Node/git/pnpm) downloads the installer from GitHub Releases, installs and launches the app with zero terminal commands, configures an API key in-app, and completes a real session with at least one shell tool call and one approval interaction.

## Setup

- Clean machine (no Node/git/pnpm preinstalled) on Windows, macOS, or Linux
- Network access to GitHub Releases for the initial download (afterwards the install runs offline)
- The installer package downloaded from GitHub Releases

## Happy Path

### Step 1: Download and install the app

**User Action**: Download the platform installer from GitHub Releases and run the offline installation, accepting the one-time OS security prompt.

**Expected Result**: Installation completes fully offline with zero terminal commands; no runtime components are downloaded; only the platform security mechanism's one-time guidance appears.

### Step 2: Launch the app for the first time

**User Action**: Double-click the installed app icon.

**Expected Result**: The single-instance check passes (no prior instance), the independent profile directory `dsh-forge` is initialized (distinct from upstream `desktop`), shared `$DSH_HOME` product data is read compatibly, and the host subprocess is spawned with the bundled runtime.

### Step 3: Complete API key configuration in-app

**User Action**: In the main window (upstream session GUI), follow the in-app credential configuration flow to enter the API key.

**Expected Result**: The API key is stored via the upstream `$DSH_HOME` credential mechanism without leaving the app; sensitive values are masked in the UI.

### Step 4: Select or create a workspace

**User Action**: Choose an existing workspace or create a new one from the workspace switcher.

**Expected Result**: The workspace is selected/created and the session UI is ready to start a conversation.

### Step 5: Start a session and exercise the shell tool

**User Action**: Send a message that triggers a shell tool call in the running session.

**Expected Result**: At least one shell tool call executes successfully and its result is visible in the session UI.

### Step 6: Complete an approval interaction

**User Action**: Respond to a pending approval prompt raised by the session.

**Expected Result**: At least one approval interaction completes; the session proceeds according to the approval decision.

## Edge Cases

### Step 1b: Fully offline installation

**Precondition**: The machine has no network connectivity at all after obtaining the installer.

**User Action**: Run the installer and launch the app.

**Expected Result**: Installation and first launch succeed; the update check fails silently — no error dialog, no blocking of startup.

### Step 2b: App already running with window open (single-instance lock)

**Precondition**: Another instance of dsh-forge is already running with its main window open.

**User Action**: Launch the app a second time.

**Expected Result**: The existing window is focused instead of spawning a new instance; no second host subprocess or profile contention occurs. (source: tech-design F1 single-instance flow — "已运行 → 恢复既有窗口")

### Step 2b′: App already running tray-resident (second launch restores from tray)

**Precondition**: dsh-forge is already running but its main window is closed (tray-resident).

**User Action**: Launch the app a second time.

**Expected Result**: The single-instance lock routes the launch to the running instance and the main window is restored from the tray (focused on the last-active session); no second instance or host subprocess is spawned. (source: tech-design F1 — "已关窗驻留则从托盘还原")

### Step 2c: Host subprocess fails to start

**Precondition**: The bundled runtime binary is corrupted or missing (e.g., the installed runtime file was deleted or truncated), so the host subprocess spawn/handshake deterministically fails on launch.

**User Action**: Launch the app.

**Expected Result**: The shell stays alive and enters the failed state with an `ERR_HOST_START_FAILED`-shaped error message (troubleshooting guidance visible in-app); the app does not crash or hang silently. (source: tech-design F1 / error-code table — `ERR_HOST_START_FAILED`, UF4 failed state)

### Step 3b: Invalid API key

**Precondition**: The user enters an invalid or rejected API key.

**User Action**: Submit the credential configuration.

**Expected Result**: Upstream validation feedback is shown in-app; the user can correct the key without restarting; no partial/corrupt credential state is persisted. (required_outcomes: `validation-error` per surface-web rule)

### Step 4b: No workspace exists yet

**Precondition**: Fresh profile with no existing workspaces.

**User Action**: Create a new workspace when prompted.

**Expected Result**: Workspace creation succeeds and the session UI becomes ready.

### Step 5b: Session waits for user input mid-tool-use

**Precondition**: The session enters a "waiting for user input" state while the window is open.

**User Action**: Continue interacting with the session.

**Expected Result**: The session state is presented in the GUI and the user can respond in-app to resume the workflow.

### Step 5c: Session expires during first session (surface rule coverage)

**Precondition**: The upstream session/auth token lapses while the user is mid-workflow in the first session (e.g., extended idle after the shell tool call in Step 5).

**User Action**: Send the next message / trigger the next approval.

**Expected Result**: The user is shown session-expired feedback in-app and can re-establish the session (re-authenticate/restart the session) without restarting the app; no silent data loss. (required_outcomes: `session-expired` per surface-web rule; source: inferred)

## Journey Invariants

- The entire journey uses zero terminal commands — every interaction happens inside the app UI or the OS installer flow
- The app opens no listening ports at any point; all traffic is carried over the `dsh-app://` carrier
- The `dsh-forge` profile directory remains independent of (and never overwrites) the upstream `desktop` profile
- Shared `$DSH_HOME` data (sessions, settings, credentials) is only read/written in the upstream existing format
