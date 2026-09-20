---
journey: "first-use-zero-terminal"
step: "1"
step-action: "Download and install the app"
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
# Contract: first-use-zero-terminal / Step 1: Download and install the app

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- surface-required note: validation-error N/A and session-expired N/A — installer-level step with no form submission and no session dependency. Per-step Outcome count is 2 (below High target of 3): the installer surface exposes no further fact-backed boundary; density is met at journey level (17 total). -->

## Outcome "success"
- Preconditions: "Clean machine with no Node/git/pnpm preinstalled; installer package already downloaded from GitHub Releases"
  fixture_spec:
    entities:
      - entity_type: "InstallerPackage"
        min_count: 1
        field_constraints:
          - field: "source"
            value: "GitHub Releases download for the current platform"
- Input: "User runs the offline installation, accepting the one-time OS security prompt"
- Output: "Installation completes fully offline with zero terminal commands; no runtime components are downloaded; only the platform security mechanism's one-time guidance appears"
- State: "Application installed on the machine with its bundled runtime"
- Side-effect: "none"

## Outcome "fully-offline-install"
- Preconditions: "The machine has no network connectivity at all after obtaining the installer"
  fixture_spec:
    entities:
      - entity_type: "InstallerPackage"
        min_count: 1
        field_constraints:
          - field: "network"
            value: "no connectivity after download"
- Input: "User runs the installer and launches the app with no network"
- Output: "Installation and first launch succeed; the update check fails silently — no error dialog, no blocking of startup (Fact FT-004 ERR_UPDATE_FEED_UNREACHABLE semantics)"
- State: "Application installed and launched; update state left as unchecked/failed-silent"
- Side-effect: "none"

## Journey Invariants

- The entire journey uses zero terminal commands — every interaction happens inside the app UI or the OS installer flow
- The app opens no listening ports at any point; all traffic is carried over the dsh-app:// carrier
- The dsh-forge profile directory remains independent of (and never overwrites) the upstream desktop profile
- Shared $DSH_HOME data (sessions, settings, credentials) is only read/written in the upstream existing format
