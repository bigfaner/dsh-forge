---
status: "completed"
started: "2026-10-04 14:33"
completed: "2026-10-04 14:48"
time_spent: "~15m"
---

# Task Record: fix-27 Fix(P0): 重注册死锁——悬空引用行卡死 register（fix-18 home 翻转遗留 + 启动对账从未接线）：boot 接线 reconcileAtStartup + register 链按 ws_path 自愈/幂等

## Summary
重注册死锁修复：boot 链接线启动对账（main.ts forgeProjects 就绪分支 fire-and-forget 调 reconcileAtStartup，悬空引用启动即修）+ registerProject ① 前自愈防御（attachExistingRow：按 ws_path 查既有行——健康引用幂等返回既有项目、悬空引用复用对账单项修复 relink/recreate 后幂等返回，绝不撞 UNIQUE(ws_path)；失败降级现行链保 typed error 映射与补偿语义零变化）。UI 表单已注册标记同步幂等成功语义。③ 失败注入载体全仓迁移（ws_path 冲突行已被自愈面消费 → INSERT ABORT 触发器；挂接分支 ownership 面改 workspace_id 占位行），新增单测（悬空自愈×2/健康幂等/接线封装）与 e2e fix-27 专项（悬空夹具 → 双 boot 启动即修 → 重复注册幂等成功）。

## Changes

### Files Created
无

### Files Modified
- packages/core/src/forge/project-service.ts
- packages/core/src/forge/project-service.test.ts
- apps/host/src/ipc/projects-rpc.ts
- apps/host/src/ipc/projects-rpc.test.ts
- apps/host/src/main.ts
- apps/web/src/flows/add-project/RegisterForm.tsx
- apps/web/src/flows/add-project/RegisterForm.test.tsx
- e2e/specs/p1mvp/project-registration-compensation.spec.ts
- e2e/specs/p1mvp/project-registration.spec.ts
- tests/contract/pin-04-workspace-registry.test.ts

### Key Decisions
- boot 接线点裁决：main.ts forgeProjects 就绪分支（Reference Files 两候选之一）——+1 行至 108/110 行 pin 内，fire-and-forget 封装归 ipc 层 runStartupReconcile（报告入日志/异常吞掉），main 唯一入口使 dev/packaged/e2e 隔离态同径
- attachExistingRow 自愈面任何失败返 undefined 降级现行链：保 service-assembly dispose 型 ③ 失败仍走 ProjectWriteError 映射、补偿链四步语义逐字不变（边界「补偿语义零变化」）
- ③ 失败注入载体迁移：ws_path 冲突行已被自愈面消费（重注册=幂等成功），单测 AC3/AC4②/AC5、G1 pin ④-5、e2e 冒烟统一改 SQLite INSERT ABORT 触发器注入；e2e Step3c ownership 面改 workspace_id 占位行（唯一残余冲突面）
- 幂等返回口径：既有 projectId + attachedToExisting=true（悬空自愈与健康行同形）；修复复用 reconcileProjectRef——relink 记 warn 单条/recreated 成功不记（§交互三记账口径原样）
- e2e fix-27 专项取双 boot 形态（两次均 dismiss:false——「不收模态=复启正常」探针口径），boot2 轮询 forge:projects/get 锚定自动对账时序

## Test Results
- **Tests Executed**: Yes
- **Passed**: 976
- **Failed**: 0
- **Coverage**: 98.3%

## Acceptance Criteria
- [x] 走查人场景（悬空行+真 home）启动产品即自愈（对账日志/引用更新），项目恢复会话归属正常
- [x] 对同路径再次走注册向导：幂等成功（不炸、不删工作区、返回既有项目）
- [x] 全新路径注册现行不回归；补偿链（新建失败→registry.delete）AC4 幂等锚保持
- [x] e2e：悬空引用夹具（行指向不存在 workspaceId）→ boot 后引用修复；重复注册=幂等成功

## Notes
AC 证据：AC1/AC2/AC3 由单测实证（fix-27 describe 三例 + AC1/AC3/AC4②/AC5 + G1 pin ④-5 + ipc 接线封装测试；全量 976/976 绿，tsc -b 与 pnpm lint 全绿）；AC4 e2e 专项已落地并通过 collection（62 tests），执行归 submit 质量门（coding.fix 纪律：任务内不起 dev server/不跑 e2e）。走查人即刻解锁（Description 第 4 项，零代码）：本修复落地后重启产品即自愈；过渡期 devtools `await window.dshForge.invoke('forge:projects/reconcile')` 一句仍可用。Step5c/Step3b 留痕注记随 RECONCILE_NOT_AUTO_INVOKED fact 解除同步更新。fmt 门：本 worktree 无格式化器配置（N/A）。
