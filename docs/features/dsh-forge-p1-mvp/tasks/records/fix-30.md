---
status: "completed"
started: "2026-10-04 19:13"
completed: "2026-10-04 19:37"
time_spent: "~24m"
---

# Task Record: fix-30 Fix(P1): 注册链「本次新建」判定可被路径拼写变体击穿——BINARY 精确匹配不归一输入，变体径误删健康工作区注册（补偿链语义破坏）+ attachedToExisting 误报：core 边界统一路径归一

## Summary
注册链「本次新建」判定拼写变体击穿收口：fix-record 前提为假（零实现三查皆空——落点文件持缺陷原文/全分支无 fix-30 提交/无归一器符号），依派发注记转真实现。交付三件：(1) core 边界统一归一——registerProject 入口 canonicalizeDir（可达 realpath、fail-soft 回退原拼写）归一 workspaceDir/forgeDir/knowledgeDir，① 预检与 fix-27 自愈查询改 normalizeFsPath 归一键比对（原 BINARY 精确匹配）；(2) 兜底双保险并行——「本次新建」改 create 前后 registry.list() id 快照差集结构判据（attachedToExisting 恒真值，免疫拼写变体），③ 撞 UNIQUE(ws_path) 时按撞键 ws_path 重入一次 attachExistingRow 自愈幂等成功而非进补偿；(3) 归一器单点导出——新零依赖包 @dsh-forge/path-key（contracts 零逻辑铁律与 knowledge 生产面禁 import core 边界之间的唯一合法同源位），knowledge 绑定表解析收编同源消费消口径分裂。补偿链语义零变化：真新建失败补偿删除不变，挂接/既有实体绝不被补偿删除（现有测试锚全数保持原样通过）。

## Changes

### Files Created
- packages/path-key/package.json
- packages/path-key/tsconfig.json
- packages/path-key/src/index.ts
- packages/path-key/src/index.test.ts

### Files Modified
- packages/core/src/forge/project-service.ts
- packages/core/src/forge/project-service.test.ts
- packages/core/package.json
- packages/core/tsconfig.json
- packages/knowledge/src/tools/session.ts
- packages/knowledge/src/tools/session.test.ts
- packages/knowledge/package.json
- packages/knowledge/tsconfig.json
- tests/structure/scaffold.test.ts
- tsconfig.json
- vitest.config.ts
- pnpm-lock.yaml

### Key Decisions
- 比对归一与落库形态分离：normalizeFsPath 只做纯字符串比对键（反斜杠→正斜杠/去尾分隔符/win32 折大小写，与 knowledge 原 session.ts 私有实现逐字等价=同源收编），落库 ws_path 恒以 ② registry 返回 canonical 为准——现有测试锚（createCalls 原始拼写/ws_path 存储/forge_dir 断言）零修改保持通过
- registry.create 收原始拼写（canonical 化属 dsh 官方面职责，不改官方面——任务边界）；入口 realpath 实测保输入大小写不折叠（win32 快速路径），大小写防御全落在 normalizeFsPath 键、symlink/8.3 展开落在 realpath——两层正交互补
- 同源包选址：contracts 零逻辑铁律（package description 明文）禁放函数、knowledge boundaries.test.ts 硬钉生产面禁 import core（且会拉入 better-sqlite3 原生面）、core 逆向依赖插件包倒置分层——新微包 @dsh-forge/path-key 是三铁律下唯一字面满足「单点导出+同源消费」的落点
- attachExistingRow 行查找由 WHERE ws_path=? BINARY 改全量行 JS 侧归一键比对（projects 行级小表）；isUniqueWsPathViolation 判据 = SQLITE_CONSTRAINT_UNIQUE + message 指名 projects.ws_path 列（workspace_id 列冲突仍走挂接保护分支，AC2-3 锚不回归）
- 「..」不做 lexical 折叠进归一键（对 symlink 父级不安全；权威归 realpath）——该留白恰构成结构判据/UNIQUE 重入两夹具的可构造穿透载体（canonical+\sub+.. 变体）
- 结构 pin 连带：tests/structure/scaffold.test.ts 五工件拓扑钉随新包升六工件（fix-17 教训——改拓扑先同步 structure 钉）

## Test Results
- **Tests Executed**: Yes
- **Passed**: 1009
- **Failed**: 0
- **Coverage**: 81.6%

## Acceptance Criteria
- [x] 已注册 Z:\learn 后以 z:\learn\（或大小写变体）再注册 → 幂等成功返回既有项目，工作区 id 不变，无补偿删除
- [x] 变体径 registry.list 无身份 churn（id 稳定）；绑定表口径与 core 归一一致
- [x] 现有 register/reconcile/补偿测试全绿（池不回归）

## Notes
质量门（worktree 映射）：compile=tsc -b EXIT=0（含新包 composite 联通）；fmt=仓内无 formatter（oxlint 风格道等价，0 违规）；lint=pnpm lint 全五段 EXIT=0；unit=1009/1009（新增 5 夹具：真实目录盘符大小写+尾分隔符幂等径/无盘面归一键命中/结构判据 ③ 失败不补偿删除既有/UNIQUE(ws_path) 重入自愈/symlink junction 可行平台径——含 1 跳过位）+ path-key 3 pin + knowledge 同源口径 1 pin。coverage 81.6% = vitest --coverage(v8) 全仓语句面实测；触达面 project-service.ts 100% lines（98.44% stmts）、session.ts 100% lines、path-key index.ts 100% stmts/lines（branch 50% = posix 分支 win32 机不达，posix 敏感断言平台条件化）。e2e 不跑（fix 工作流纪律；注册链 e2e 面 fix-28 已钉，语义对 canonical 输入零变化）。环境注记：本机 Node realpath 保留输入大小写（c:\uSERS 实测）——夹具断言只钉结果收敛（幂等/id 稳定/零补偿删除）不钉中间路径形态，subst/直挂两类环境均收敛。
