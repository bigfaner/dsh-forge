---
journey: "update-awareness-crash-recovery"
step: "2"
step-action: "Jump to the release page"
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
# Contract: update-awareness-crash-recovery / Step 2: Jump to the release page

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- surface-required note: validation-error N/A and session-expired N/A — hint interaction is not a form and carries no session dependency. -->

## Outcome "success"
- Preconditions: "An update hint for a newer version is displayed and its release URL is whitelisted"
  fixture_spec:
    entities:
      - entity_type: "UpdateBanner"
        min_count: 1
        field_constraints:
          - field: "phase"
            value: "shown"
          - field: "releaseUrl"
            value: "matches RELEASE_HOST allowlist"
- Input: "User clicks the update hint"
- Output: "The user is guided to the release page for manual download (external browser open permitted only for URLs matching the RELEASE_HOST whitelist — Fact FT-009 github.com + /bigfaner/dsh-forge/releases); the app continues running normally afterward"
- State: "External browser opened to the whitelisted release page; app state unchanged and running"
- Side-effect: "External browser open via openExternal (allowlist-gated)"

## Outcome "feed-same-version"
- Preconditions: "The fake feed reports the currently installed version (no update)"
  fixture_spec:
    entities:
      - entity_type: "UpdateFeed"
        min_count: 1
        field_constraints:
          - field: "content"
            value: "version equal to installed"
- Input: "User launches the app and waits past 60 seconds"
- Output: "No update hint is shown; no misleading prompts"
- State: "Update banner remains hidden"
- Side-effect: "none"

## Outcome "dismiss-hint"
- Preconditions: "An update hint is currently displayed"
  fixture_spec:
    entities:
      - entity_type: "UpdateBanner"
        min_count: 1
        field_constraints:
          - field: "phase"
            value: "shown"
- Input: "User dismisses the hint without jumping to the release page"
- Output: "The hint closes cleanly and does not re-appear repeatedly within the same session (dismissed is terminal until restart — Fact FT-010)"
- State: "Banner phase dismissed; no re-show during this run"
- Side-effect: "none"

## Outcome "non-whitelisted-url-rejected"
- Preconditions: "The fake feed contains a newer version whose releaseUrl points outside the RELEASE_HOST = github.com + RELEASE_PATH_PREFIX whitelist (e.g., an attacker-controlled domain)"
  fixture_spec:
    entities:
      - entity_type: "UpdateFeed"
        min_count: 1
        field_constraints:
          - field: "content"
            value: "newer version with non-whitelisted releaseUrl"
- Input: "User clicks the update hint"
- Output: "The external open is rejected — no browser/page opens for the non-whitelisted URL; the rejection is logged; the app continues running normally without crash — Fact FT-005 ERR_UPDATE_URL_REJECTED"
- State: "No external navigation occurred; app in normal running state; rejection entry present in diagnostics"
- Side-effect: "openExternal attempted and rejected by allowlist; rejection logged"

## Journey Invariants

- The update check never blocks or breaks startup, in success or failure, at any point
- The only outbound network traffic is the read-only HTTPS access to the Releases feed — no listening ports are ever opened
- After any crash and restart path, the most recent session state recoverable from session persistence is restored and no persisted session data is destroyed
- At steady state after recovery, own process count returns to exactly 2 (shell main process + host subprocess)
