---
feature: "dsh-forge-m1"
journey: "tray-residence-notification-recall"
risk_level: "Medium"
golden_path: false
surface_types: ["web"]
surface_keys: ["web"]
sources:
  - docs/features/dsh-forge-m1/prd/prd-user-stories.md
  - docs/features/dsh-forge-m1/prd/prd-spec.md
  - docs/features/dsh-forge-m1/design/tech-design.md
generated: "2026-09-20"
---

# Journey: tray-residence-notification-recall

**Risk Level**: Medium

<!-- Risk: multi-step interaction without irreversible side effects; window close is non-destructive since the app stays resident. -->

## Overview

A long-session user closes the main window to work on other things; the app stays resident in the system tray, and when a session waits for input or completes a turn, a system notification recalls the user directly to the relevant session.

## Setup

- dsh-forge app running with at least one active session on Windows/macOS/Linux
- OS notification permission granted to the app (one-time OS-level prompt allowed)
- System tray available in the desktop environment

## Happy Path

### Step 1: Close the main window and verify tray residence

**User Action**: Close the main window while a session is running.

**Expected Result**: The app stays resident in the system tray (does not exit); both the shell process and host subprocess remain alive.

### Step 2: Receive a "waiting for user input" notification

**User Action**: Let the session reach a state where it waits for user input while the window is closed.

**Expected Result**: A system notification fires (verified on each of the three platforms at least once) identifying the waiting session.

### Step 3: Click the notification to focus the session

**User Action**: Click the "waiting for user input" notification.

**Expected Result**: The main window reopens/restores and focuses the corresponding session.

### Step 4: Receive a "turn completed" notification and return

**User Action**: Trigger another turn, close the window again, wait for turn completion, then click that notification.

**Expected Result**: The "turn completed" notification fires (each platform at least once) and clicking it focuses the corresponding session window. (source: tech-design F3 notification flow)

### Step 5: Restore or exit from the tray menu

**User Action**: Open the tray menu and choose "restore window", then later choose "fully exit".

**Expected Result**: Restore reopens the main window with session state intact; fully exit cleanly terminates the app and its child processes.

## Edge Cases

### Step 1b: Fully exit via tray instead of staying resident

**Precondition**: The user chooses "fully exit" from the tray menu while a session is running.

**User Action**: Confirm full exit.

**Expected Result**: The app and host subprocess terminate cleanly; session data remains persisted and available on next launch.

### Step 2b: Notification permission denied at OS level

**Precondition**: The OS notification permission for the app is denied.

**User Action**: Let a session reach a waiting state.

**Expected Result**: No crash or error loop; the app degrades gracefully (session state still visible on manual window restore).

### Step 3b: Session already focused when notification clicked

**Precondition**: The user has already restored the window and focused the session before clicking the notification.

**User Action**: Click the notification anyway.

**Expected Result**: No duplicate window or broken focus; the existing window/session is simply brought to front.

### Step 4b: Multiple concurrent waiting sessions

**Precondition**: Two sessions are both waiting for user input while the window is closed.

**User Action**: Receive notifications and click the one for the second session.

**Expected Result**: Each notification focuses its own corresponding session, with no cross-session misdirection.

### Step 4c: Repeated same-session notifications within the 10s dedup window

**Precondition**: The same session emits the same event type repeatedly within 10 seconds (e.g., two "waiting for user input" events for one session in quick succession) while the window is closed.

**User Action**: Let both events fire; observe the system notification area; then click the merged notification.

**Expected Result**: The events are merged into a single notification whose content reflects the latest event (no duplicate notification stack); clicking it still focuses the corresponding session. (source: tech-design F3 / Interface 4 notifier — "10s 窗口内同会话同事件 → 合并·更新既有通知内容")

### Step 4d: Session expires while window closed and tray-resident (surface rule coverage)

**Precondition**: The app has been tray-resident with a waiting session long enough that the upstream session/auth token lapses.

**User Action**: Click the recall notification (or restore the window from the tray) and attempt to resume the session.

**Expected Result**: The user is shown session-expired feedback in-app and can re-establish the session without app restart; the tray/notification system does not enter an error loop. (required_outcomes: `session-expired` per surface-web rule; source: inferred)

### Step 5b: Tray unavailable in the desktop environment (Linux)

**Precondition**: No system tray is present in the Linux desktop environment.

**User Action**: Close the main window.

**Expected Result**: The app does not become unreachable — behavior degrades predictably (e.g., window close behavior falls back without orphaning a resident process).

## Journey Invariants

- While resident, the app never spawns extra own processes beyond the shell main process plus host subprocess (idle steady-state own process count = 2)
- Every notification click always focuses the specific session the notification refers to
- Notification and tray texts are bilingual per the upstream locale mechanism
