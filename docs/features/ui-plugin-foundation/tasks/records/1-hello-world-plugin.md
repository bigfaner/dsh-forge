---
status: "completed"
started: "2026-09-22 00:06"
completed: "2026-09-22 00:28"
time_spent: "~22m"
---

# Task Record: 1 hello-world 双向扩展插件包

## Summary
Created the repo's first own dsh client plugin @dsh-forge/plugin-hello-world at packages/plugins/hello-world: pure npm-dependency package (zero vendored references), ui-goal form (empty host half via exports["."] + client half via exports["./client"]), consuming the ui-chat core slot conversation.chat.assistant-actions and contributing an own hello-world.panel sub-slot + exclusive store seat through one register call, with bilingual locale dictionaries and a click-driven store/re-render interaction loop. 18 tests against the real npm SlotCore/store engine, 100% line coverage.

## Changes

### Files Created
- packages/plugins/hello-world/package.json
- packages/plugins/hello-world/tsconfig.json
- packages/plugins/hello-world/tsdown.config.ts
- packages/plugins/hello-world/src/index.ts
- packages/plugins/hello-world/src/client/index.ts
- packages/plugins/hello-world/src/client/contract.ts
- packages/plugins/hello-world/src/client/HelloWorldPanel.tsx
- packages/plugins/hello-world/src/client/locales.ts
- packages/plugins/hello-world/src/client/store.ts
- packages/plugins/hello-world/tests/package-form.spec.ts
- packages/plugins/hello-world/tests/slots.spec.ts
- packages/plugins/hello-world/tests/panel.spec.tsx

### Files Modified
- pnpm-workspace.yaml
- vitest.config.ts
- package.json
- .gitignore
- pnpm-lock.yaml

### Key Decisions
- Workspace location packages/plugins/hello-world/ (task Implementation Note suggestion, decided in-task per quick mode): a dedicated packages/plugins/* namespace physically isolates the own-plugin tree from the vendored projection (different lifecycles: npm-dep plugins vs pinned-SHA upstream projection), leaves room for the M2 plugin family and the task-7 template, and gives task 4's vendor-free artifact scan a clean boundary. Cost: two 2-line config additions (pnpm-workspace.yaml glob + vitest include glob).
- Target stable slot = conversation.chat.assistant-actions (ui-chat core slot): additive list kind (coexists with upstream, no shadowing), session scope (demonstrates per-session store seat), minimal owner coupling ({messageId} ignored by the demo). Alternatives rejected: conversation.chat.node (keyed by ChatNodeKind, chat-data coupled), conversation.message.images (single = replaces shipped gallery, coexistence-hostile). dsh.client.inject minimal stable subset = [dsh-client-locale, dsh-client-ui-chat, dsh-client-ui-renderer] (3 edges vs ui-goal's 7) — legality to be confirmed by task 5 spike with the documented fallback to the full set.
- Build replicated upstream's clientBundle contract in a package-local tsdown.config.ts (the upstream preset is not vendored): CJS closure-factory artifact with __ModuleLoader__.load banner/intro/footer, externals = the apps/web module-table baseline (react family, cordis, dsh-client-store/ui-slots/ui-primitives/ui-dockkit — extracted from the vendored web dist seed), everything else inlines. Verified output requires only react/jsx-runtime + @deepseek-ai/dsh-client-store (both baseline words); bundle 5KB.
- Dependency layout: alignment-line @deepseek-ai/dsh-client-* contract family declared in peerDependencies at exact 0.1.6-alpha.2 (npm-form peers, per the template-first-step rule; upstream's workspace:^ form is forbidden to copy) and mirrored in devDependencies for building; cordis peer exact 4.0.2 as an independent version line. Two upstream packaging quirks handled: dsh-client-store's runtime deps zustand/immer ship as its devDependencies only, so the plugin supplies them (exact 4.4.7 / 10.1.3); @deepseek-ai/dsh-llm added as devDep for the MessageId type resolution behind ui-chat's d.ts.
- No CSS pipeline: the panel uses inline styles — keeps the demo bundle minimal and avoids porting the upstream lightningcss CSS-modules preset; recorded as a template simplification choice for task 7 to revisit.

## Test Results
- **Tests Executed**: Yes
- **Passed**: 18
- **Failed**: 0
- **Coverage**: 100.0%

## Acceptance Criteria
- [x] npm 起包:对齐线依赖 exact 0.1.6-alpha.2(禁裸包名与 ^),cordis peer 独立版本线单列
- [x] 零 vendored 文件引用:依赖全部指向 npm registry,无 vendor/ 前缀、无 file: 协议
- [x] client 半身经 exports["./client"] 暴露,空宿主半身,包形态参照上游 ui-goal(小包)
- [x] 注入既有稳定槽位(ui-chat 核心槽),面板渲染进既有界面区域
- [x] 经 register 贡献自有子槽位 + store 席位(声明合并),子槽位渲染默认内容
- [x] 交互闭环:点击面板 → store 席位更新 → 刷新渲染

## Notes
AC4/AC5 proven against the real npm SlotCore (0.1.6-alpha.2): registration waits for the slot declaration, contributes the child slot + exclusive store factory, third-party registration into the sub-slot accepted, same-cell collision throws loud, parent-declaration collapse cascades. AC6 proven at component level with the real defineStore engine + RTL (click -> action -> useSyncExternalStore re-render, Hellos 0->1->2); the full in-browser leg belongs to tasks 3/6 by design. Verified: tsc --noEmit clean, build produces ui-goal-form artifacts (lib/index.js empty host, lib/client.js __ModuleLoader__ registration), oxlint clean on the plugin, full repo suite 241/241 across 27 files (was 223/23 before). Repo-wide pnpm lint still fails on pre-existing apps/desktop/e2e style errors — verified failing on HEAD before this task's changes (not caused by this task). dist-tag trap re-confirmed live on npm (latest=0.1.2-alpha.2, alpha=0.1.6-alpha.2), validating the exact-pin Hard Rule. Added @vitest/coverage-v8@4.1.11 to root devDeps (upstream parity) for coverage measurement.
