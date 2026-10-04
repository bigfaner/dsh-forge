---
status: "completed"
started: "2026-10-04 23:41"
completed: "2026-10-04 23:57"
time_spent: "~16m"
---

# Task Record: fix-39 Fix: 注册链目录自愈——知识/forge 目录（及工作区目录）不存在时注册自动创建，消除 ERR_INVALID_KNOWLEDGE_DIR / ERR_WORKSPACE_CREATE 面的用户可避错误

## Summary
注册链目录自愈：registerProject ② registry.create 前插「目录确保」步（ensureRegistrationDirs——workspaceDir/forgeDir/knowledgeDir 三目录缺则递归 mkdir，幂等；仅新建径，挂接/自愈径零盘副作用），消除「选定后被删」竞态的 ERR_WORKSPACE_CREATE 与知识面迟到的 ERR_INVALID_KNOWLEDGE_DIR；rebuildIndex 增扫描前置门（knowledge_dir 缺失 → mkdir 自愈后继续，真非法仍走现行六码——语义收窄为「存在但非法/不可达」，不扩码不回收）；RegisterForm 两目录字段 hint 增「目录不存在时将自动创建」；e2e project-registration 增「无 .knowledge 注册即用例」。新建径受影响测试套（project-service/pin-04/host projects-rpc 实层）WS 基座由 C: 常量迁临时根防真实盘污染，「目录不可达」类用例载体由缺失目录改普通文件（recall/browse/host knowledge-rpc）。

## Changes

### Files Created
无

### Files Modified
- packages/core/src/forge/project-service.ts
- packages/core/src/knowledge/index-service.ts
- packages/core/src/knowledge/scan.ts
- packages/core/src/knowledge/errors.ts
- apps/web/src/flows/add-project/RegisterForm.tsx
- packages/core/src/forge/project-service.test.ts
- packages/core/src/knowledge/index-service.test.ts
- packages/core/src/knowledge/recall-service.test.ts
- packages/core/src/knowledge/browse-service.test.ts
- apps/host/src/ipc/knowledge-rpc.test.ts
- apps/host/src/ipc/projects-rpc.test.ts
- tests/contract/pin-04-workspace-registry.test.ts
- e2e/specs/p1mvp/project-registration.spec.ts

### Key Decisions
- 六码不扩码裁决：目录确保建失败沿现行 typed 面——workspaceDir → WorkspaceCreateError（create 前置失败同面）、forge/knowledge → ProjectWriteError（写入面前置）；三 mkdir 全部在 ② 之前完成，任何建失败时 dsh 侧零变更、补偿链零涉入
- 目录确保步仅新建径（① 预检未命中的 else 分支）——挂接径（① 命中）与自愈径（attachExistingRow）零建目录（Hard Rule：挂接/幂等语义零盘副作用不变）；创建后 canonicalizeDir 语义不变（归一在链头 fail-soft，canonical 化仍归 ② 官方面，落库口径零变化）
- rebuildIndex 前置门 mkdir 失败静默交还 scanKnowledgeDir 收口（scan 保持错误唯一权威 + 只读件零建目录）；ERR_INVALID_KNOWLEDGE_DIR 六码不回收，语义收窄为「路径存在但非法/不可达」，缺失态不再触达用户
- 测试迁移：新建径用例 mkdir 真实落盘 → WS 基座 C: 常量迁临时根（project-service.test / pin-04 / host projects-rpc AC2 实层，后者 direct/replay 间 rmSync 清场保 canonicalize fail-soft 口径）；「目录不可达 → 六码」类用例载体由 rmSync 缺失目录改「同路径普通文件」（index-service/recall/browse/host knowledge-rpc）
- e2e「无 .knowledge 注册即用例」已写入 spec 未运行（任务规程：修复执行面不起 dev server 不跑 e2e）

## Test Results
- **Tests Executed**: Yes
- **Passed**: 454
- **Failed**: 0
- **Coverage**: 93.9%

## Acceptance Criteria
- [x] 验收① 全新空目录（无 .knowledge/.forge）注册 → 成功且两目录已在盘上落位；知识视图即扫即用（空索引不报错）
- [x] 验收② 直输多级缺失知识/forge 路径 → 注册成功，目录递归创建
- [x] 验收③ 存量行（knowledge_dir 缺失）触发知识视图 → 自动重建目录不再 ERR_INVALID_KNOWLEDGE_DIR；指向普通文件仍报现行错误（语义收窄验证）
- [x] 验收④ workspaceDir 选定后被删再注册 → 注册成功（目录自愈）而非 ERR_WORKSPACE_CREATE
- [x] 验收⑤ 单测（project-service 新建/挂接两径目录副作用断言·挂接径零 mkdir；index-service 缺失自愈/文件仍抛；scan 契约收窄）+ e2e 增「无 .knowledge 注册即用例」

## Notes
验证：tsc -b 零错；pnpm lint 全绿（ox/imports/tokens/selftest/types/test-types）；vitest 目标套 156 + 邻接（knowledge 插件集成+core 冒烟 5 / web add-project 175 / contract 池 118）全过；scoped coverage（v8，changed 模块）93.92% stmts / 95.12% lines。fmt：worktree 无 justfile/fmt 脚本（跳过，非阻塞）。中途一处自新增用例笔误（rmSync 目录未带 recursive）首轮红，修复后全绿。盘污染自证：C: 根无 dsh-* 残留。
