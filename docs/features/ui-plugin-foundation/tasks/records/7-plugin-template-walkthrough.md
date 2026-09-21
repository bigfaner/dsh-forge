---
status: "completed"
started: "2026-09-22 02:04"
completed: "2026-09-22 02:23"
time_spent: "~19m"
---

# Task Record: 7 插件包工程模板与第三方走查演示

## Summary
Distilled hello-world into the reusable plugin engineering template packages/templates/plugin (documented-reference + copyable directory, rationale archived), with npm-form exact peers (alignment line 0.1.6-alpha.2), an engines-style host declaration (engines["@deepseek-ai/dsh"]), and a required version stamp from the task-4 same-source mechanism; extended the plugin foundation gate with a template leg (required stamp, engines check, template manifest under version-alignment + manifest-sources, no artifact demand) plus 18 regression tests; proved SC5 live: from-zero plugin (copy template -> rename -> pnpm install -> build -> pack) into a fresh official web profile, boot roster contains it, panel renders with 0 pageerror, zero vendored references, zero shell-code changes; evidence archived.

## Changes

### Files Created
- packages/templates/plugin/package.json
- packages/templates/plugin/version-stamp.json
- packages/templates/plugin/tsconfig.json
- packages/templates/plugin/tsdown.config.ts
- packages/templates/plugin/cordis.patch.yml
- packages/templates/plugin/src/index.ts
- packages/templates/plugin/src/client/index.ts
- packages/templates/plugin/src/client/contract.ts
- packages/templates/plugin/src/client/TemplatePanel.tsx
- packages/templates/plugin/src/client/locales.ts
- packages/templates/plugin/src/client/store.ts
- packages/templates/plugin/README.md
- docs/features/ui-plugin-foundation/template-walkthrough-evidence.md

### Files Modified
- scripts/verify-plugins.mjs
- tests/verify-plugins.spec.ts

### Key Decisions
- Production method: documented reference + copyable template directory (primary) with degit recorded as the post-open-source channel — GitHub remote is not anonymously reachable today (ls-remote reset; repo private), and a scaffold script would require npm publishing infrastructure (marketplace is M2+ out of scope)
- Template placed at packages/templates/plugin: inside no pnpm workspace glob (packages/* matches one level only), so it stays a pristine copy source with no node_modules/lib and is outside the build:plugins filter; the gate's artifacts-missing red deliberately does not apply (source scaffold; hello-world remains the built reference)
- Gate template leg: template version stamps are REQUIRED (plugins may omit, templates may not — outflow-side sync must be assertable); engines["@deepseek-ai/dsh"] must be exact and == desktopHostVersion (VS Code engines.vscode analog); template manifests join the existing version-alignment and manifest-sources checks — single source of truth preserved (same module, vitest + CLI dual form, CI via the existing pnpm verify:plugins step)
- Reference pointer drift: the task file names tests/smoke.spec.ts as the stamp-assertion hook point, but task 4 materialized stamp assertions in tests/verify-plugins.spec.ts (single-source-of-truth discipline forbids a second implementation) — template coverage extended there, smoke.spec.ts untouched
- Walkthrough used a dedicated fresh profile (sc5-demo) initialized via --from-default-profile web instead of mutating the real web profile; fully deleted afterwards (zero footprint)

## Test Results
- **Tests Executed**: Yes
- **Passed**: 336
- **Failed**: 0
- **Coverage**: 88.8%

## Acceptance Criteria
- [x] hello-world 沉淀为可复用模板(产出方式定夺留档),内建槽位消费/贡献标准姿势与 dsh UI 组件复用约定
- [x] 模板 peer 声明为 npm 形态(禁 workspace:^ 照抄),对齐线依赖 exact 0.1.6-alpha.2
- [x] 模板含 engines 式宿主版本兼容声明,且经任务 4 同源机制盖版本戳(流出侧版本同步可见、可断言)
- [x] 模板文档面向第三方用户,不要求读者接触 vendored 树;明示禁裸包名/^(dist-tag 陷阱)
- [x] SC5 走查:按模板文档从零新建插件包 → 官方 dsh web 注入成功,覆盖两处第一步,零 vendored 引用、零壳代码修改,演示记录归档

## Notes
Hard Rule held: template manifest carries no workspace: and no in-repo file: specs (gate-enforced, red-light tests). Live evidence: boot graph rev 61ea64a54ead (59 entries incl. dsh-walkthrough-demo), panel text rendered on a historical session (consume+contribute faces), 0 pageerror / 0 console-error; same-source scan over the demo bundle: specifiers = [@deepseek-ai/dsh-client-store, react/jsx-runtime] (module-table baseline words), 0 vendor violations; git status apps/ = 0. Full suite 336/336 (32 files); targeted spec 54/54; coverage on scripts/verify-plugins.mjs: 88.85% statements / 82.24% branches / 90.87% lines. Pre-existing oxlint failures (44 error lines) are confined to apps/desktop e2e files, identical with and without this task's changes. Upstream-bump duty: template peers + engines + stamp + README examples bump in the same diff (gate reds each unsynced item).
