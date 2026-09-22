---
status: "completed"
started: "2026-09-22 01:39"
completed: "2026-09-22 01:52"
time_spent: "~13m"
---

# Task Record: 4 版本一致性自动断言与产物级 vendored 扫描

## Summary
Built the plugin foundation gate: version-consistency assertion (alignment line @deepseek-ai/dsh-client-* exact == vendor/upstream.lock.json desktopHostVersion across all dependency fields; @deepseek-ai/cordis independent version line, exactness-only) joined with an artifact-level vendored scan (any module source resolving into vendor/ or packages/desktop-host-vendor/, carrying a vendor path segment, or using file: into the repo = red; manifest file:/link:/workspace:/path specs into the repo = red; missing build artifacts = explicit red, no silent skip). Dual form sharing one module: tests/verify-plugins.spec.ts (auto-joins CI via pnpm test) + scripts/verify-plugins.mjs CLI (wired as pnpm verify:plugins = build + gate, added as a lint-unit CI step before vitest; --stamp mechanism stamps template version stamps from the same lock baseline, hello-world stamped as reference). Red-light reproduction archived (10 violations, exit 1) in docs/features/ui-plugin-foundation/version-gate-evidence.md along with the vehicle-decision rationale and upstream-bump procedure.

## Changes

### Files Created
- scripts/verify-plugins.mjs
- tests/verify-plugins.spec.ts
- docs/features/ui-plugin-foundation/version-gate-evidence.md
- packages/plugins/hello-world/version-stamp.json

### Files Modified
- package.json
- .github/workflows/ci.yml

### Key Decisions
- Implementation vehicle (was a tech-design open question): vitest spec + package.json script dual form, both backed by scripts/verify-plugins.mjs as the single source of truth — spec form enters the existing CI quality gate with zero extra wiring, script form supports standalone red-light reproduction and template stamping; rationale archived in version-gate-evidence.md section 1
- Comparison set enumerated as the @deepseek-ai/dsh-client-* family prefix + cordis single entry; NOT lock-package-membership, because the desktop-host closure does not enumerate the full client contract family (e.g. @deepseek-ai/dsh-client-store and dsh-client-ui-slots are absent from the lock packages list — they are Webview-side runtime graph packages), so membership enumeration would false-red the current green state
- cordis (independent version line) checks exactness only and is deliberately never compared with desktopHostVersion, per AC-1; a same-family exact-but-different cordis version therefore stays green by design
- Missing plugin build artifacts are an explicit red violation with remediation guidance (run pnpm verify:plugins) rather than a silent skip; the CI step order (verify:plugins before pnpm test) guarantees artifacts exist when the vitest gate spec runs
- version-stamp.json is optional per plugin; when present, all three fields (pinnedSha, desktopHostVersion, cordisVersion) must match the lock — stale stamps red-light, making template outflow version sync visible (git diff) and assertable (gate) for task 7

## Test Results
- **Tests Executed**: Yes
- **Passed**: 316
- **Failed**: 0
- **Coverage**: 88.8%

## Acceptance Criteria
- [x] 断言显式枚举比对集:对齐线依赖(@deepseek-ai/dsh-client-* 宿主契约族)exact ≡ UpstreamLock.desktopHostVersion;cordis peer 单列为独立版本线(仅校验 exact 锁定,不参与对齐比对)
- [x] 红灯复现并归档:人为错配对齐线依赖版本 → 断言失败(测试或脚本输出留档)
- [x] 绿灯:当前对齐线依赖 exact 0.1.6-alpha.2 == desktopHostVersion 且 cordis 不误报
- [x] 产物级 vendored 扫描并入同一门禁:扫描插件构建产物的模块来源,任何模块解析至 vendor/ 前缀或 file: 协议指向仓内即红灯
- [x] 断言接入既有 CI/质量门;同源机制为工程模板(任务 7)盖版本戳,模板流出侧版本同步可见、可断言

## Notes
Coverage measured scoped to scripts/verify-plugins.mjs via vitest --coverage.include (88.84% statements / 81.87% branches, 34 new tests). Full workspace suite: 316 passed / 0 failed. Pre-existing branch lint failures (44 errors in apps/desktop/e2e and apps/desktop/tests) verified present on HEAD with task changes stashed — not introduced by this task; new files lint clean. Hard Rule compliance: comparison set never widened; alpha dist-tag specs red-light with resolve-to-exact remediation.
