---
journey: "update-awareness-crash-recovery"
step: "1"
step-action: "Detect a new version at startup"
generated: "2026-09-20"
sources:
  - docs/features/dsh-forge-m1/testing/update-awareness-crash-recovery/journey.md
anchors:
  web:
    page: "主窗口 (inherited upstream GUI)"
    route: "dsh-app://"
    requires_auth: false
    layout: "上游 client UI 插件族"
last_anchor_sync: "2026-09-20T12:00:00Z"
---
# Contract: update-awareness-crash-recovery / Step 1: Detect a new version at startup

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- surface-required note: validation-error N/A and session-expired N/A — no form submission; session dependency exercised at Step 5a. -->

## Outcome "success"
- Preconditions: "App installed and running with an active session; fake GitHub Releases feed configured with a newer version number"
  fixture_spec:
    entities:
      - entity_type: "UpdateFeed"
        min_count: 1
        field_constraints:
          - field: "content"
            value: "version newer than installed"
      - entity_type: "Session"
        min_count: 1
        field_constraints:
          - field: "state"
            value: "active"
- Input: "User launches the app with the fake Releases feed configured"
<!-- source: inferred — the 60-second upper bound is a test-observation window for the asynchronous update check, not a value from the fact table or tech-design -->
- Output: "An in-app update hint appears within 60 seconds of startup"
- State: "Update banner state shown; app otherwise in normal running state"
- Side-effect: "none"

## Outcome "feed-unreachable-offline"
- Preconditions: "No network connectivity at launch"
  fixture_spec:
    entities:
      - entity_type: "UpdateFeed"
        min_count: 1
        field_constraints:
          - field: "network"
            value: "unreachable"
- Input: "User starts the app with no network"
- Output: "The update check fails silently — no error dialog, no retry storm, startup is not blocked; the app enters normally (Fact FT-004 ERR_UPDATE_FEED_UNREACHABLE semantics)"
- State: "App in normal running state; update check marked failed-silent"
- Side-effect: "none"

## Outcome "banner-queued-under-recovery-mask"
<!-- source: inferred -->
<!-- reasoning: residual eval attack point (mask×banner queueing edge) mapped to the update-detection step; Fact FT-010 defines the exact queueing semantics in update-banner-state -->
- Preconditions: "The UF4 crash-recovery mask is active (recovery in progress) when the update hint fires"
  fixture_spec:
    entities:
      - entity_type: "RecoveryState"
        min_count: 1
        field_constraints:
          - field: "state"
            value: "UF4 mask active"
      - entity_type: "UpdateBanner"
        min_count: 1
        field_constraints:
          - field: "phase"
            value: "pending arrival during mask"
- Input: "The update-check result arrives while the recovery mask is displayed; the mask then exits with recovery completed"
- Output: "The banner is queued while the mask is active (not shown over the mask); when the mask exits, the queued banner transitions to shown — Fact FT-010 UpdateBannerPhase hidden→queued→shown; an already-shown banner stays shown under the mask"
- State: "Banner phase ends as shown after mask exit (or dismissed if user dismisses); no banner lost"
- Side-effect: "none"

## Journey Invariants

- The update check never blocks or breaks startup, in success or failure, at any point
- The only outbound network traffic is the read-only HTTPS access to the Releases feed — no listening ports are ever opened
- After any crash and restart path, the most recent session state recoverable from session persistence is restored and no persisted session data is destroyed
- At steady state after recovery, own process count returns to exactly 2 (shell main process + host subprocess)
