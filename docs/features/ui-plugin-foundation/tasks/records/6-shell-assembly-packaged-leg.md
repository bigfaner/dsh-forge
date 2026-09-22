---
status: "completed"
started: "2026-09-22 02:23"
completed: "2026-09-22 02:50"
time_spent: "~27m"
---

# Task Record: 6 壳内双环境装配与打包/闭包验收腿

## Summary
Landed the packaged distribution form per spike §4.1 (tarball built-in + shell-side pre-seeding) and closed both acceptance environments: the committed product config gained the hello-world entry as `tarball:plugin-tarballs/…tgz` (single source of truth, zero plugin identity in shell code — enforced by a new static-scan spec); the projector learned the tarball source form (zero-dependency strict tar reader — node:tar does not exist on this toolchain; validate-then-write, links/traversal/checksums/caps rejected loud; write-once seed marker carrying the artifact sha256 so version drift converges and marker-less dirs stay package-manager owned); staging is config-driven on the build side too (pnpm stage:plugin-tarballs packs exactly the config-declared plugins next to plugin-bundles.json, embedded by electron-builder extraResources, closure-checked by an extended verify-package). Live evidence archived in shell-assembly-packaged-evidence.md: dev-shell leg reconciled the existing userData projection 2→3 and pre-seeded from the staged artifact (marker sha identical), boot roster carries the plugin, panel + sub-slot default content render with a working click→store→re-render loop and 0 pageerror; official dsh web leg re-run with the new --click-panel probe shows byte-identical panel text and identical 0→1 counter behavior (profile web restored afterwards); packaged leg built dist:dir, verify-package selfContained:true (config + tarball embedded), and the packaged exe launched under a dead proxy (offline) completed projection + pre-seed from embedded resources in its own userData. Offline-NFR compatibility table + cold-start attribution archived (steady-state median 4278ms vs M1 baseline 4347ms — pre-seeding machinery delta within the ≤5%/≤100ms budget; packaged host boot remains the pre-existing M1 dereferenced-closure deferral, attributed and out of scope). Sweep 19/19 GREEN incl. plugin-tree reconciliation at the committed 3-bundle state.

## Changes

### Files Created
- apps/desktop/src/main/host-profile/tarball.ts
- apps/desktop/tests/host-profile-tarball.spec.ts
- apps/desktop/tests/shell-plugin-identity.spec.ts
- apps/desktop/tests/helpers/tarball-fixture.ts
- scripts/stage-plugin-tarballs.mjs
- tests/stage-plugin-tarballs.spec.ts
- docs/features/ui-plugin-foundation/shell-assembly-packaged-evidence.md
- docs/features/ui-plugin-foundation/artifacts/SHELL-S0-panel-before-click.png
- docs/features/ui-plugin-foundation/artifacts/SHELL-S0-panel-after-click.png

### Files Modified
- apps/desktop/src/main/host-profile/index.ts
- apps/desktop/src/main/index.ts
- apps/desktop/resources/plugin-bundles.json
- apps/desktop/build/electron-builder.config.mjs
- apps/desktop/tests/host-profile.spec.ts
- apps/desktop/tests/plugin-bundles-config.spec.ts
- scripts/acceptance/live-ui-probe.mjs
- scripts/acceptance/dsh-web-probe.mjs
- scripts/verify-package.mjs
- package.json
- .gitignore

### Key Decisions
- Distribution form executed exactly per spike §4.1: `tarball:<resources-relative .tgz>` source vocabulary + shell-side unpack into profile node_modules as a real directory (resolveBundleDir second anchor accepts real dirs); dev inner loop keeps the workspace: junction form — both forms now reject `..` segments
- Hand-rolled strict tar reader instead of node:tar (builtin absent on Node 24.9 and Electron's node) — npm-pack shape only, pax/GNU-longname supported, two-phase validate-then-write, size/entry caps, links and traversal rejected loud
- Write-once pre-seed marker `.dsh-forge-seed.json` (bundle/source/sha256): steady-state re-runs are stat+compare no-ops (cold-start budget intact), artifact version bumps converge by re-materialization, marker-less real dirs are treated as package-manager owned and never touched (pnpm-authority discipline preserved)
- Build-side Hard Rule: staging derives WHICH plugins and WHERE they land from the product config (planStaging), failing loud when the pnpm-pack output name diverges from the config-declared basename — no hardcoded staging list mirroring the shell rule
- Packaged leg scope honestly bounded: config+tarball embedding, verify-package closure checks, and packaged offline pre-seed are verified live; full packaged SPA/host boot is the pre-existing M1 dereferenced-closure deferral (SC1/SC9 packaging re-verification), evidenced and attributed, not a task-6 regression
- Offline simulation = Chromium --proxy-server=http://127.0.0.1.9 dead proxy on the packaged exe: dsh-app:// custom protocol is proxy-immune so the in-shell chain runs while all external HTTP is dead — update-checker silently degraded per BIZ-resilience

## Test Results
- **Tests Executed**: Yes
- **Passed**: 359
- **Failed**: 0
- **Coverage**: 87.5%

## Acceptance Criteria
- [x] 同一 hello-world 插件在 dsh-forge 壳内经产品级配置装配成功,不引入新的壳内硬编码
- [x] 注入的基座槽位与贡献的自有子槽位在两侧环境均可见渲染,以扩展后的 live-ui-probe 采集 DOM/截图证据归档
- [x] 两侧环境呈现一致:面板渲染、子槽位默认内容、点击 → store 更新 → 刷新交互行为一致
- [x] 打包/闭包形态验收腿按 spike 分发形态结论执行并留档(npm 物化 / tarball 内置 / 预播种之一)
- [x] 该腿与离线自足 NFR 的兼容性结论显式落档(打包态离线运行验证)

## Notes
Coverage: task modules host-profile/index.ts 97.4% lines / tarball.ts 96.6% lines; repo-wide 87.47% lines (v8). Lint clean outside the pre-existing apps/desktop/e2e baseline. Cold-start (launch→ui-ready): committed 3-bundle tarball steady state 4548/4278/4260 (median 4278) vs M1 baseline median 4347 and task-2 3-bundle junction median 4579 — machinery delta within budget, third-bundle composition cost attributed per task-2 discipline; first-boot (reconcile+unpack) 4342ms inside the steady distribution. Dev-shell probe userData is %APPDATA%/Electron (_electron.launch without app package.json) while electron ./packaged exe use %APPDATA%/@dsh-forge/desktop — both projections verified. Official web profile restored to [dsh-base, dsh-web-app] after the interaction leg; web server stopped; no leftover processes.
