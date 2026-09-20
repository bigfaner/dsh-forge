---
feature: "dsh-forge-m1"
journey: "desktop-ui-parity"
risk_level: "Medium"
golden_path: false
surface_types: ["web"]
surface_keys: ["web"]
sources:
  - docs/features/dsh-forge-m1/prd/prd-user-stories.md
  - docs/features/dsh-forge-m1/prd/prd-spec.md
generated: "2026-09-20"
---

# Journey: desktop-ui-parity

**Risk Level**: Medium

<!-- Risk: multi-step interaction across all functional surfaces without irreversible side effects; verifies parity, not mutation. -->

## Overview

An existing dsh web GUI user verifies that the desktop carrier provides 100% of the web GUI's functional surfaces (sessions, chat, approvals, plan, settings, file tree, workspace switching) with no capability loss.

## Setup

- dsh-forge desktop app installed and launched with a configured API key
- At least one existing workspace with a prior session in `$DSH_HOME`
- Reference knowledge of the existing web GUI functional surfaces

## Happy Path

### Step 1: Use the session and chat surfaces

**User Action**: Open an existing session and exchange chat messages with the assistant.

**Expected Result**: Sessions list, session history, and chat interaction behave identically to the existing web GUI; message flow renders correctly in the desktop carrier.

### Step 2: Exercise the approval surface

**User Action**: Trigger and respond to an approval prompt during a chat turn.

**Expected Result**: The approval prompt appears and resolves exactly as in the web GUI.

### Step 3: Exercise the plan and settings surfaces

**User Action**: Open the plan view and review/modify settings pages.

**Expected Result**: Plan display and settings read/write work identically to the web GUI, including API key masking behavior.

### Step 4: Exercise the file tree and workspace switching

**User Action**: Browse the workspace file tree and switch to another workspace.

**Expected Result**: File tree navigation and workspace switching work identically to the web GUI with no state loss.

## Edge Cases

### Step 1b: Prior web GUI session opened in desktop

**Precondition**: Sessions were created earlier via the web GUI (or CLI) in the shared `$DSH_HOME`.

**User Action**: Open those sessions in the desktop carrier.

**Expected Result**: Prior sessions and their history are fully readable and continuable — no format mismatch or data loss.

### Step 2b: Rapid surface switching during an active turn

**Precondition**: A chat turn is actively streaming a response.

**User Action**: Switch between chat, plan, and settings surfaces mid-turn.

**Expected Result**: No surface breaks state; the streaming turn continues correctly when returning to chat.

### Step 3b: Settings change requires confirmation

**Precondition**: A settings change triggers an upstream confirmation dialog.

**User Action**: Confirm the dialog inside the desktop carrier.

**Expected Result**: The dialog renders and behaves the same as in the web GUI.

### Step 4b: Workspace with no sessions yet

**Precondition**: The selected workspace contains no sessions.

**User Action**: Switch to that workspace.

**Expected Result**: An appropriate empty state is shown, matching web GUI behavior.

## Journey Invariants

- Every web GUI functional surface exercised in this journey remains 100% usable in the desktop carrier (equivalent carrier-level tests pass)
- The desktop carrier introduces no UI rewrite artifacts — behavior matches upstream web GUI semantics
- No listening port is opened while using any surface
