---
status: "completed"
started: "2026-09-22 01:09"
completed: "2026-09-22 01:37"
time_spent: "~28m"
---

# Task Record: 3 官方 dsh web 装配验证与撞键 fixture 实证

## Summary
Verified the official-dsh-web assembly leg from the third-party perspective and empirically archived the ui-slots same-key collision behavior: (1) hello-world self-installed via `dsh plugin --profile web add <tarball>` (official npm launcher @deepseek-ai/dsh@0.1.6-alpha.2, real shared $DSH_HOME, zero vendored references, zero shell changes) entered the host boot graph and rendered its panel on a historical-session turn tail in the official `dsh web`; (2) created the collision-replica fixture package @dsh-forge/plugin-hello-world-collision (a structural replica of hello-world with a build-time MODE selector: replica/coexist/shadow/tie) and proved it assembles and runs independently; (3) ran the live collision matrix S0-S5 on the official web and archived all outcomes per the three-type taxonomy — same declared key and same-cell-same-priority both land in type 3 (startup-time explicit error: loud pageerror naming the first declarer/occupant, app stays up), same-cell-different-priority lands in type 2 (deterministic layered takeover with observable winner flip), distinct ids/keys land in type 1 (merge coexistence, both panels) — no scenario is a silent unobservable overwrite; (4) archived the two-anchor resolution (installation anchor boot graph + profile materialization) and version-alignment records (launcher exact 0.1.6-alpha.2 ≡ plugin peers ≡ UpstreamLock.desktopHostVersion; launcher-side dist-tag trap latest=0.1.5-rc.2; install-time peers are warnings by design) for task 5's spike report. All evidence, per-scenario repro steps, and observed UI results live in docs/features/ui-plugin-foundation/dsh-web-assembly-evidence.md; the profile was restored to its pre-task state afterward.

## Changes

### Files Created
- packages/plugins/hello-world-collision/package.json
- packages/plugins/hello-world-collision/tsconfig.json
- packages/plugins/hello-world-collision/tsdown.config.ts
- packages/plugins/hello-world-collision/cordis.patch.yml
- packages/plugins/hello-world-collision/src/index.ts
- packages/plugins/hello-world-collision/src/client/index.ts
- packages/plugins/hello-world-collision/src/client/contract.ts
- packages/plugins/hello-world-collision/src/client/mode.ts
- packages/plugins/hello-world-collision/src/client/ReplicaPanel.tsx
- packages/plugins/hello-world-collision/src/client/locales.ts
- packages/plugins/hello-world-collision/src/client/store.ts
- packages/plugins/hello-world-collision/tests/slots.spec.ts
- packages/plugins/hello-world-collision/tests/panel.spec.tsx
- packages/plugins/hello-world-collision/tests/package-form.spec.ts
- scripts/acceptance/dsh-web-probe.mjs
- docs/features/ui-plugin-foundation/dsh-web-assembly-evidence.md

### Files Modified
- pnpm-lock.yaml

### Key Decisions
- Collision-replica = structural replica with a build-time MODE constant (src/client/mode.ts: replica/coexist/shadow/tie) instead of four packages or runtime switches: one ui-goal-form tarball per probe keeps the third-party self-install form identical across the whole matrix while isolating exactly one collision axis per assembly (declared-key collision / cell shadow / cell tie / coexistence control); every archived scenario records its mode so each is independently reproducible via edit-constant -> build -> pack -> remove+add -> boot.
- Live environment = the real ~/.dsh with the official profile 'web' (the genuine third-party environment; real historical sessions are the only render target for assistant-actions since it renders only on completed assistant turns): additive-only writes sanctioned by the coexistence business rule, snapshot taken before, fully restored after (manifest back to [dsh-base, dsh-web-app], plugins removed, empty pnpm scope dir cleaned).
- Launcher pinned exact @deepseek-ai/dsh@0.1.6-alpha.2: the dist-tag trap also exists on the launcher side (npm latest=0.1.5-rc.2, alpha=0.1.6-alpha.2), so the official-web verification itself must pin the launcher to the alignment line.
- Panel factory replicaPanelFor(childKey) instantiates one component per declared child key: the register call's __renders phantom requires the component's render key set to be a subset of each mode's children declaration, which a single union-typed component cannot satisfy across all four modes.
- Evidence archive at docs/features/ui-plugin-foundation/dsh-web-assembly-evidence.md (task 5's input) with a privacy rule: only plugin markers, boot-roster ids, and error texts are archived — no screenshots and no session titles/content from the real home.
- Reusable probe scripts/acceptance/dsh-web-probe.mjs (Playwright on loopback against the official web, Edge/Chrome channel fallback to avoid browser downloads) captured boot roster, pageerrors, plugin DOM markers, and panel texts for every scenario.

## Test Results
- **Tests Executed**: Yes
- **Passed**: 282
- **Failed**: 0
- **Coverage**: 100.0%

## Acceptance Criteria
- [x] hello-world 以 profile 自装(dsh plugin add)在官方 dsh web 注入成功(第三方视角,零 vendored 引用、零壳修改)
- [x] 撞键复制品 fixture:第二个自装插件,声明与 hello-world 贡献子槽位同名的槽位键,可独立装配运行
- [x] 撞键行为实测并按「合并共存 / 分层覆盖 / 启动期显式报错」三型归档,含复现步骤与观察到的 UI 结果
- [x] 无论落哪一型,「静默后者覆盖且不可观察」视为未通过(结论须可观察、可复现)
- [x] 该侧两锚解析与版本对齐的验证记录归档(供任务 5 spike 报告引用)

## Notes
Live matrix (official web, 2026-09-22): S0 hello-world solo -> boot roster rev 63dab6c9ea1f contains @dsh-forge/plugin-hello-world among 59 entries, panel renders on turn tail, 0 pageerror/console-error; reconcile appended it as the third profile bundle and materialized the tarball at profiles/web/node_modules/@dsh-forge with install-time peer WARNINGS only (autoInstallPeers:false — peers resolve at runtime from the installation anchor, the two-anchor design working as intended). S1 fixture solo (replica mode) -> renders independently. S2 both installed (replica) -> pageerror 'slot "hello-world.panel" is already declared (by an entry in "conversation.chat.assistant-actions" (hello-world-collision))' at boot: type 3, first declarer (deterministic bundle order) keeps rendering, the latecomer throws loudly and its panel is absent, app stays up (webview pageerror, not a tree crash). S5 tie mode -> pageerror 'already has an entry with id "hello-world" at priority 0 ... register at a different priority to shadow it (lowest renders)': type 3 cell form with an inline remediation hint. S4 shadow mode (priority -1) -> 0 errors, deterministic takeover flip (only the fixture panel renders), loser stays on the ledger (unit-level SlotCore.entries evidence + roster): type 2. S3 coexist mode -> both panels render side by side: type 1. Unit matrix (21 tests) cross-checks all four modes plus order-dependence against the real npm SlotCore with the real hello-world apply as collision partner. Host behavior on a plugin registration throw recorded for M2: pageerror + contribution absent, boot continues — M2 must add its own gate if a mandatory-plugin failure must abort startup. Coverage: fixture package 100% lines (aggregate run shows 86.04% only because the fixture tests import hello-world sources cross-package; hello-world's own suite keeps those at 100%). Lint: 0 errors in new files; 44 pre-existing errors in apps/desktop/e2e (baseline failing since HEAD, tasks 1-2 records). No repo justfile exists; compile/lint run via repo equivalents (tsc --noEmit per package, oxlint), no fmt configuration in repo.
