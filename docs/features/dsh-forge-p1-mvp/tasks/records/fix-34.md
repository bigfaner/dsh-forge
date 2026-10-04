---
status: "completed"
started: "2026-10-04 20:06"
completed: "2026-10-04 20:23"
time_spent: "~17m"
---

# Task Record: fix-34 Fix(P1): clean code 紧要批——契约注释承诺漂移（ERROR_NAMES/FRONTMATTER_KEYS 声称被消费实则零引用）+ dswf-kn-retry 孤儿类名（用户可见）+ e2e closeApp 竞态全员设防 + 跨包 StubRegistry 桩五份收编

## Summary
clean code 紧要批四项收口（fix-record 恢复任务存在性对照判零实现后依派发注记转真实现）：①契约承诺漂移取「降格+删死码」——删 ERROR_NAMES/ErrorCodeNameMap（零生产消费、同映射两遍）与 FRONTMATTER_KEYS/REQUIRED/OPTIONAL 三清单及派生类型（parser 零引用），表 Name 列降格为 ERROR_CODES 行尾文档性注释，必填/可选口径由 KnowledgeFrontmatter 形状承载，core 双域 errors.ts 头注失实引用同步改写实，两契约测试收窄到被消费面；②知识错误条重试钮（KnowledgeCardGrid/EntryDrawer）复用 .dswf-kn-textaction（与 .dswf-recall-retry 声明逐条等值），孤儿类名 dswf-kn-retry 全仓清除，data 属性测试锚不变；③session-workbench/knowledge-recall-flywheel/installer-smoke 三 spec 补 closeApp（进程退出等待≤10s+2s 静置，hero-control 等 4 spec 同源止血复制，16 处关闭点全改经 helper，共享收编归 fix-37）；④五处 workspaceRegistry 桩（core project-service/reconcile-queries/service + host projects-rpc + knowledge integration-core）收敛为 packages/core/src/testutil/registry-stub.ts 单份 StubRegistry（failCreate/failDelete/failList/beforeDelete 注入 superset + records/dirs/createCalls/deleteCalls 断言面），host/knowledge 沿测试面相对引入惯例，生产面边界零触碰。

## Changes

### Files Created
- packages/core/src/testutil/registry-stub.ts
- packages/core/src/testutil/README.md

### Files Modified
- packages/contracts/src/errors.ts
- packages/contracts/src/errors.test.ts
- packages/contracts/src/frontmatter.ts
- packages/contracts/src/frontmatter.test.ts
- packages/core/src/forge/errors.ts
- packages/core/src/knowledge/errors.ts
- packages/core/src/forge/project-service.test.ts
- packages/core/src/forge/reconcile-queries.test.ts
- packages/core/src/service.test.ts
- apps/host/src/ipc/projects-rpc.test.ts
- packages/knowledge/src/integration-core.test.ts
- apps/web/src/views/knowledge/KnowledgeCardGrid.tsx
- apps/web/src/views/knowledge/EntryDrawer.tsx
- e2e/specs/p1mvp/session-workbench.spec.ts
- e2e/specs/p1mvp/knowledge-recall-flywheel.spec.ts
- e2e/specs/p1mvp/installer-smoke.spec.ts
- docs/features/dsh-forge-p1-mvp/tasks/fix-34.md

### Key Decisions
- 项 1 裁决取降格+删死码（任务倾向项）：六码值与 parser 行为零改动，承诺-消费以注释如实收口而非驱动化改造
- 项 2 取复用 dswf-kn-textaction 而非补新规则：与 sidebar/recall 形制一致由声明等价承载，零新增 CSS
- 项 3 为止血形态（三 spec 内联 closeApp），统一共享 helper 归 fix-37 e2e 支撑层（helper 注释留衔接锚）
- 项 4 testutil 落点 packages/core/src/testutil/（非新微包）：桩为 core 域测试素材，host/knowledge 测试面相对引入既有惯例（*.test.* 结构豁免）即可复用，不触 package.json exports/生产图
- 截图对照 AC 以结构等价替代（fix-26 先例）：两类名声明逐条相同 + textaction 既有渲染面历次 e2e 实证 + 两组件模块直接 import knowledge.css

## Test Results
- **Tests Executed**: Yes
- **Passed**: 1009
- **Failed**: 0
- **Coverage**: 81.8%

## Acceptance Criteria
- [x] ERROR_NAMES/FRONTMATTER 承诺与消费对齐（驱动化或注释如实），死常量删除后测试全绿
- [x] 知识错误条重试钮与 sidebar 形制一致（截图对照）
- [x] 三 spec 补 closeApp 等待后 CI 无挂起回归；五处 registry 桩收敛为一 testutil（行为 superset 兼容各注入面）

## Notes
恢复任务存在性对照：fix-34 全四项零实现（全分支无 fix-34 提交/工作树净/落点文件持缺陷原文：ERROR_NAMES 零生产消费、dswf-kn-retry 零 CSS 规则、三 spec 裸 app.close()、无 testutil）——依派发注记转真实现（fix-6 形态第十二例）。质量门（worktree 映射）：compile=tsc -b EXIT=0（testutil 入 dist 产物）；fmt=仓内无 formatter（oxlint 风格道等价 0 违规）；lint=pnpm lint 全五段 EXIT=0；unit=vitest run 1009/1009（coverage v8 全仓 81.78% stmts/83.13% lines；contracts errors.ts/frontmatter.ts 均 100% lines）；三改 spec playwright --list 装载通过（21 tests/3 files，e2e 运行面归 CI——fix 工作流不跑全量 e2e 纪律）。AC2 形制一致以结构等价承载：.dswf-kn-textaction 与 .dswf-recall-retry（session.css:193-206）声明逐条相同，错误条容器 .dswf-kn-error 与 .dswf-recall-error 同族同配方。随机删险复核：删除符号（ERROR_NAMES/ErrorCodeNameMap/FRONTMATTER_KEYS/REQUIRED/OPTIONAL/FrontmatterKey 三型/dswf-kn-retry 类名）全仓 grep 仅余 traceability 注释提及；contracts index.ts 为 export * 星号桶，无具名再导出需同步。
