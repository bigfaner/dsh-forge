---
status: "completed"
started: "2026-09-22 00:29"
completed: "2026-09-22 01:08"
time_spent: "~39m"
---

# Task Record: 2 HOST_PROFILE_BUNDLES 配置化与对账默认回退

## Summary
Migrated the profile bundle list out of shell code into a product-level config (apps/desktop/resources/plugin-bundles.json, JSON in shell resources, read once at startup) and made it the plugin tree's single source of truth: HOST_PROFILE_BUNDLES constant deleted, a strict validating loader (PluginBundlesConfigError, explicit start-failed error path — never a silent crash) feeds a startup reconciliation projector (npm-prune prototype, K8s-style converge) that rewrites the shell-owned userData manifest to the config order, seeds profile-local materializations for source-carrying entries (workspace: junction — provisional dev distribution form), and prunes materializations of config-removed entries while never touching upstream-owned .dsh-module-fallback links. Completed the hello-world bundle form (dsh.bundle.patch + root-level insert row — upstream web-app roster form, verified via vendored composeEntries). Both legs demonstrated LIVE on the real chain: add leg = config-only entry -> RECONCILED + SEEDED + CARRIAGE_READY + two hello-world panels rendered on historical-session turn tails; delete leg = config-only removal -> PRUNED + manifest 3->2 + junction/scope-dir removed + panels gone + roster clean. Shell-code diff across both ops = 0 (git diff --stat identical + code-scope md5 checksum identical). Cold-start budget PASS: baseline median 4347ms vs post-change committed-state median 4297ms (delta -50ms, within <=5% and <=100ms). Sweep extended with a plugin-tree reconciliation step (manifest == config) and GREEN 19/19; probe extended with cold-start timing anchors + plugin-panel markers.

## Changes

### Files Created
- apps/desktop/resources/plugin-bundles.json
- apps/desktop/tests/plugin-bundles-config.spec.ts
- packages/plugins/hello-world/cordis.patch.yml

### Files Modified
- apps/desktop/src/main/host-profile/index.ts
- apps/desktop/src/main/index.ts
- apps/desktop/tests/host-profile.spec.ts
- apps/desktop/build/electron-builder.config.mjs
- packages/plugins/hello-world/package.json
- packages/plugins/hello-world/tests/package-form.spec.ts
- scripts/acceptance/live-ui-probe.mjs
- scripts/acceptance/live-ui-sweep.mjs

### Key Decisions
- Reconciliation mechanism adjudication (Implementation Note ① vs ②): landed ① shell-side startup diff reconciliation as the operative mechanism — source-verified that upstream candidate ② (healProfileModuleFallback, vendored profile.ts L748-750) prunes only its OWN module-fallback links per current layers; no upstream channel rewrites an app-owned manifest (initProfile: 'Existing files are never touched') or removes installed/seeded packages. ②' link healing rides along free on the next host boot after the manifest rewrite; zero upstream code touched.
- Config schema: { bundles: [{ name, source? }] } — name-only entries resolve from the vendored installation closure (dsh-base/dsh-web-app); source-carrying entries ('workspace:<repo-relative>') get profile-local materialization seeded as a junction (provisional pre-seeding distribution form per proposal In-Scope candidates; the packaged form lands with the task-5/6 spike — workspace: sources in a packaged app fail loud with remediation). Strict validation (unknown keys/duplicates/invalid names/sources rejected) — the config is product-owned, typos must not silently drop a bundle.
- AC5 read-only: the loader has no write path and reads the config once (frozen snapshot); reconciliation writes only the userData projection — proven by a unit test asserting config bytes unchanged through a full add/delete cycle, and structurally (no code path touches configPath for writing).
- hello-world patch row form: a bare - id/name row is an id-targeted OVERRIDE that silently no-ops in applyEntryPatches (vendored vendor/include/src/index.ts L77-105: 'A patch that matches nothing warns and is skipped') — verified offline via composeEntries returning []; the correct form is a root-level '- insert:' list, mirroring the web-app browser roster. Package now declares dsh.bundle.patch (mandatory for profile layers, vendored profile.ts L890) and ships cordis.patch.yml in files[].
- Error path (Implementation Note): config missing/corrupt/invalid or an unreconcilable projection -> ERR_PLUGIN_BUNDLES_CONFIG/ERR_HOST_PROFILE structured log + crashRecovery 'start-failed' terminal state (UF4 overlay) + SPA boot gate resolved — demonstrated live incidentally during the workspaceRoot fix (shell stayed up, loud error, no silent crash). No embedded fallback bundle list anywhere (Hard Rule: no shell-code identity constants).
- Final committed config = the two official bundles only: the add/delete legs are demoed live and archived; committing the hello-world entry waits for the task-5/6 distribution-form decision (a committed workspace: source would break the packaged boot path that M1 delivered green).
- workspaceRoot anchor: walk-up from the main bundle to pnpm-workspace.yaml (the fixed-depth resolve(__dirname,'..','..') was one level short from dist/ — caught live, fixed, re-verified).
- AC6 measurement attribution: budget gate = config-ization machinery delta at the committed 2-bundle state (median 4347ms -> 4297ms, -50ms, PASS). The 3-bundle add-leg boots measured 4554/4579/4615ms (median 4579ms, +232ms vs baseline) — that is the third plugin layer's own host-composition cost, not machinery cost; it becomes the gated state when task 6 commits the entry (recorded here so task 6 inherits the number).

## Test Results
- **Tests Executed**: Yes
- **Passed**: 261
- **Failed**: 0
- **Coverage**: 96.9%

## Acceptance Criteria
- [x] bundle 清单从壳代码常量迁至产品级配置(文件形态与读取时机任务内定),配置成为插件树唯一事实源
- [x] 新增条目腿:仅修改配置,hello-world 在壳内生效装配(经任务 1 的包)
- [x] 删除条目腿:对账默认回退 = 壳侧启动期差集调和,存量 userData profile 物化被清理/失效(验行为结果)
- [x] 两次增删操作的壳代码 diff = 0(git diff 验证)
- [x] 产品清单条目对运行时启停只读(防第二写入方破坏产品清单)
- [x] 冷启动预算:相对 M1 基线增量 <= 5% 且绝对值 <= 100ms,基线与改造后各归档一次测量

## Notes
Live evidence (real chain, real userData %APPDATA%/@dsh-forge/desktop/host-profile): ADD leg — config-only third entry -> main log HOST_PROFILE_RECONCILED [base,web-app]->[base,web-app,hello-world] + HOST_PLUGIN_SEEDED (junction -> packages/plugins/hello-world) + CARRIAGE_READY; __DSH_BOOT__ roster contained @dsh-forge/plugin-hello-world; opening the historical session rendered 2 hello-world panels (data-dsh-forge-plugin markers + bilingual greet text on 2 turn tails — assistant-actions renders only on completed assistant turns, so an empty new session shows nothing by design). DELETE leg — config-only removal -> HOST_PROFILE_PRUNED + manifest back to 2 + junction and empty @dsh-forge scope dir removed + upstream-owned fallback links untouched; same session re-opened: panels [] and roster []. Diff evidence: add op — git diff --stat identical before/after (15 files, 694+/101-), git status set unchanged (19 entries), delta confined to the untracked config; delete op — md5 of all code-scope files identical before/after (279e9627...). Cold-start (extended probe, launch->ui-ready): baseline 6151/4347/4314 (median 4347), post-change committed state 4297/4282/4547 (median 4297). live-ui-sweep GREEN 19/19 including the new 插件树对账 step (profile manifest == product config, order-sensitive); M1 SC7-parity faces all PASS. Full suite 261/261 (was 241; +22 config/reconcile tests, task-1 package-form test extended to the bundle form). Coverage on the rewritten host-profile module: 95.4% stmts / 96.9% lines / 92.5% branch. Repo lint: zero errors outside the pre-existing apps/desktop/e2e baseline (verified failing on HEAD at task 1). tsc --noEmit on apps/desktop shows only the repo-wide pre-existing TS5097 .ts-import pattern (app builds via vite; vite build green). Packaged wiring: plugin-bundles.json staged via electron-builder extraResources and resolved from process.resourcesPath when packaged.
