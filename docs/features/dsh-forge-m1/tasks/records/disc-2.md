---
status: "completed"
started: "2026-09-20 21:55"
completed: "2026-09-20 23:27"
time_spent: "~1h 32m"
---

# Task Record: disc-2 Host dependency closure and upstream web dist assembly (Spike 2 landing)

## Summary
Landed Spike 2 host dependency closure: fixed the supervisor argv contract (argv[2]=runtimeDir = vendored apps/desktop-host carrying the node_modules install anchor, argv[3]=projectDir, argv[4]=office payload source, plus --experimental-strip-types for the TS entry), added an app-owned host-profile projector (apps/desktop/src/main/host-profile — manifest with [dsh-base, dsh-web-app] bundles + office-skills payload under <userData>/host-payload, SC8-safe: runProfile with resolvedProfile writes only into the profile dir, $DSH_HOME/profiles untouched), repaired the vendored closure (removed 309 dangling link-mode fallback links from an earlier manual run, re-linked via install-host-closure.mjs which now also projects the office-skills assets from the upstream checkout), and updated assemble-app-resources closureNotes for the now-real closure. Dev launch verified end to end: HOST_STARTED (IPC ready handshake with authenticated URL) + CARRIAGE_READY (dsh-app:// carriage bound to the live upstream host serving vendored apps/web/dist); disc-1 fallback e2e still passes. Staging: 131.4MB staged (within the 250MB half-budget; on-disk closure 512.4MB — .pnpm dereference remains the SC1/SC9 follow-up, documented in closureNotes).

## Changes

### Files Created
- apps/desktop/src/main/host-profile/index.ts
- apps/desktop/tests/host-profile.spec.ts

### Files Modified
- apps/desktop/src/main/host-supervisor/index.ts
- apps/desktop/src/main/index.ts
- apps/desktop/tests/host-supervisor.spec.ts
- packages/desktop-host-vendor/src/index.ts
- scripts/install-host-closure.mjs
- scripts/assemble-app-resources.mjs
- .gitignore

### Key Decisions
- runtimeDir (argv[2]) is the vendored apps/desktop-host dir itself — the host resolves its install anchor from its node_modules; the profile project (argv[3]) materializes its OWN node_modules in link mode, so the shell never pre-links node_modules into the profile dir (the earlier junction approach was removed)
- office-skills assets (20K) are projected from the upstream checkout by install-host-closure.mjs into the gitignored vendored assets/ dir (same build-artifact pattern as the workspace lib/ projections); the primary-runtime interpreter bundle installs lazily on first tool use, so a stub payload dir satisfies the boot/handshake bar
- packaged wiring resolves DSH_FORGE_HOST_RUNTIME_DIR/DSH_FORGE_OFFICE_SKILLS/DSH_FORGE_HOST_ENTRY from process.resourcesPath before the projector and supervisor consume them
- runProfile profile:'desktop' with resolvedProfile is application-owned: loadProfileDirectory reads only the project dir we pass and writes only there (.cordis.yml root config + materialized node_modules) — no coexistence violation with the upstream $DSH_HOME/profiles/desktop

## Test Results
- **Tests Executed**: Yes
- **Passed**: 215
- **Failed**: 0
- **Coverage**: 0.0%

## Acceptance Criteria
- [x] dev launch (pnpm dev:desktop) reaches host IPC ready handshake — no ERR_HOST_START_FAILED, authenticated URL in logs
- [x] dsh-app:// serves the real upstream SPA from vendored apps/web/dist with boot gate + shell-ui overlay path intact
- [x] disc-1 fallback still works when host/boot fails (shell-fallback e2e)
- [x] argv-contract unit tests extended (supervisor) and projector unit tests added (host-profile)
- [x] assemble-app-resources closureNotes reflect the now-real closure; staging size impact recorded
- [x] SC8 coexistence: our writes stay out of $DSH_HOME/profiles; profile lives app-owned under userData

## Notes
Coverage field: project runs vitest without coverage reporting — no runner-reported percentage available (0 = not reported, not measured). Live verification log codes: SHELL_READY → HOST_PROFILE_INITIALIZED → HOST_PAYLOAD_LINKED → HOST_STARTED (~8s) → CARRIAGE_READY; host exit code 143 was the test harness SIGTERM. Vendored closure repair was required: an earlier manual run had let dsh-app-boot link mode write module-fallback junctions into vendored apps/desktop-host/node_modules pointing at a deleted temp profile (309 dangling links broke the install anchor); pnpm self-heal does not cover this — documented in agent memory. Remaining known follow-ups: SC1/SC9 packaged boot needs the dereferenced .pnpm closure; the full interpreter primary-runtime payload (prepare-host-primary-runtime.mjs) is only needed for Office tool execution, out of scope.
