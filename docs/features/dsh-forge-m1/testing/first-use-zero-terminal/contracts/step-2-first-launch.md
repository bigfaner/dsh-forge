---
journey: "first-use-zero-terminal"
step: "2"
step-action: "Launch the app for the first time"
generated: "2026-09-20"
sources:
  - docs/features/dsh-forge-m1/testing/first-use-zero-terminal/journey.md
anchors:
  web:
    page: "主窗口 (inherited upstream GUI)"
    route: "dsh-app://"
    requires_auth: false
    layout: "上游 client UI 插件族"
last_anchor_sync: "2026-09-20T12:00:00Z"
---
# Contract: first-use-zero-terminal / Step 2: Launch the app for the first time

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- surface-required note: validation-error N/A — no form submission; session-expired N/A — no session dependency yet. -->
<!-- fixture entity mapping: RunningInstance ≙ UpstreamLock (tech-design §Data Models) observed at the OS-process level — the design struct is the single-instance lock; the fixture declares the observable running process it gates -->

## Outcome "success"
- Preconditions: "App is installed and no prior dsh-forge instance is running; shared $DSH_HOME may contain upstream product data"
  fixture_spec:
    entities:
      - entity_type: "Installation"
        min_count: 1
        field_constraints:
          - field: "state"
            value: "installed, bundled runtime present"
      - entity_type: "ProfileDirectory"
        min_count: 1
        field_constraints:
          - field: "name"
            value: "dsh-forge (absent, will be initialized)"
- Input: "User double-clicks the installed app icon"
- Output: "Single-instance check passes; the independent profile directory dsh-forge is initialized distinct from upstream desktop; shared $DSH_HOME product data is read compatibly; the host subprocess is spawned with the bundled runtime"
- State: "dsh-forge profile directory created; host subprocess running; shared $DSH_HOME read without migration"
- Side-effect: "none"

## Outcome "second-launch-window-open"
- Preconditions: "Another dsh-forge instance is already running with its main window open"
  fixture_spec:
    entities:
      - entity_type: "RunningInstance"
        min_count: 1
        field_constraints:
          - field: "window"
            value: "main window open"
- Input: "User launches the app a second time"
- Output: "The existing window is focused instead of spawning a new instance; no second host subprocess or profile contention (Fact FT-006 ERR_SINGLE_INSTANCE flow)"
- State: "Exactly one dsh-forge instance and one host subprocess remain"
- Side-effect: "none"

## Outcome "second-launch-tray-resident"
<!-- source: tech-design F1 single-instance flow (Fact FT-006) -->
- Preconditions: "dsh-forge is already running but its main window is closed (tray-resident)"
  fixture_spec:
    entities:
      - entity_type: "RunningInstance"
        min_count: 1
        field_constraints:
          - field: "window"
            value: "closed, tray-resident"
- Input: "User launches the app a second time"
- Output: "The single-instance lock routes the launch to the running instance and the main window is restored from the tray (focused on the last-active session); no second instance or host subprocess is spawned"
- State: "Exactly one dsh-forge instance and one host subprocess remain; window restored"
- Side-effect: "none"

## Outcome "host-start-failed"
- Preconditions: "The bundled runtime binary is corrupted or missing so the host subprocess spawn/handshake deterministically fails on launch"
  fixture_spec:
    entities:
      - entity_type: "Installation"
        min_count: 1
        field_constraints:
          - field: "runtime"
            value: "corrupted or missing bundled runtime"
- Input: "User launches the app"
- Output: "The shell stays alive and enters the failed state with an ERR_HOST_START_FAILED-shaped error message; troubleshooting guidance is visible in-app; the app does not crash or hang silently (Fact FT-003)"
- State: "Shell main process alive in failed state; no host subprocess running; no crash dump or silent exit"
- Side-effect: "none"

## Journey Invariants

- The entire journey uses zero terminal commands — every interaction happens inside the app UI or the OS installer flow
- The app opens no listening ports at any point; all traffic is carried over the dsh-app:// carrier
- The dsh-forge profile directory remains independent of (and never overwrites) the upstream desktop profile
- Shared $DSH_HOME data (sessions, settings, credentials) is only read/written in the upstream existing format
