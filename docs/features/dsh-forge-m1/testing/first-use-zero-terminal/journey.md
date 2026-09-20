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

### Step 2b: App already running (single-instance lock)

**Precondition**: Another instance of the app is already running on the machine.

**User Action**: Launch the app a second time.

**Expected Result**: The existing window is focused instead of spawning a new instance; no second host subprocess or profile contention occurs.

### Step 2c: Host subprocess fails to start

**Precondition**: The host subprocess cannot start (e.g., corrupted runtime or environmental interference).

**User Action**: Launch the app.

**Expected Result**: The shell stays alive and shows an error message with troubleshooting guidance; the app does not crash or hang silently.

### Step 3b: Invalid API key

**Precondition**: The user enters an invalid or rejected API key.

**User Action**: Submit the credential configuration.

**Expected Result**: Upstream validation feedback is shown in-app; the user can correct the key without restarting; no partial/corrupt credential state is persisted.

### Step 4b: No workspace exists yet

**Precondition**: Fresh profile with no existing workspaces.

**User Action**: Create a new workspace when prompted.

**Expected Result**: Workspace creation succeeds and the session UI becomes ready.

### Step 5b: Session waits for user input mid-tool-use

**Precondition**: The session enters a "waiting for user input" state while the window is open.

**User Action**: Continue interacting with the session.

**Expected Result**: The session state is presented in the GUI and the user can respond in-app to resume the workflow.

## Journey Invariants

- The entire journey uses zero terminal commands — every interaction happens inside the app UI or the OS installer flow
- The app opens no listening ports at any point; all traffic is carried over the `dsh-app://` carrier
- The `dsh-forge` profile directory remains independent of (and never overwrites) the upstream `desktop` profile
- Shared `$DSH_HOME` data (sessions, settings, credentials) is only read/written in the upstream existing format
