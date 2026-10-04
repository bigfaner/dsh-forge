---
id: "fix-30"
title: "Fix(P1): 注册链「本次新建」判定可被路径拼写变体击穿——BINARY 精确匹配不归一输入，变体径误删健康工作区注册（补偿链语义破坏）+ attachedToExisting 误报：core 边界统一路径归一"
priority: "P1"
estimated_time: "3h"
complexity: "medium"
dependencies: []
surface-key: ""
surface-type: "web"
breaking: false
type: "coding.fix"
mainSession: false
---

# Fix(P1): 注册链路径归一化（评审 fix 来源）

> 来源：四路 subagent 架构评审之 core/knowledge 路（2026-10-04，HEAD=daef204）P1 发现。

## 根因（评审实证）

[project-service.ts](../../../packages/core/src/forge/project-service.ts) ① 预检与 fix-27 自愈查询均为 **BINARY 精确匹配**（不归一输入路径）；dsh `registry.create` 按 `fs.realpath` 规范化后，可返回一个因**拼写变体**（盘符大小写/8.3 短名/symlink/尾分隔符）未被 ① 命中的**既有实体**。此时：

- 库内已有同 canonical ws_path 行（正是 fix-27 目标场景）→ ③ INSERT 撞 UNIQUE(ws_path) → `attachedToExisting=false` → ④ 把**流程前就存在的健康工作区 delete 掉**（下次对账重建但 id 换新——身份 churn，绑定表/引用链随漂）；
- 成功径也误报 `attachedToExisting=false`；
- host 侧 canonical 化用 `path.resolve`（fs-rpc.ts:17）**不纠大小写**，防线不闭合。

关联口径分裂：knowledge 绑定表解析（tools/session.ts:34-39）win32 折大小写/斜杠 vs core BINARY——同源数据两种归一口径。

## Description

1. **core 边界统一归一**：注册输入（workspaceDir/forgeDir/knowledgeDir）在 registerProject 入口归一（win32 折叠大小写 + 分隔符规整 + 可达则 realpath）后再做 ① 预检/自愈查询/落库；归一器单点导出，knowledge 绑定表解析同源消费（消口径分裂）；
2. **兜底双保险**（择一或并行）：
   - ③ 捕获 UNIQUE(ws_path) 后**重入一次** attachExistingRow（自愈径）而非直接进补偿；
   - 「真新建」判定改为 create 前后 `registry.list()` id 快照差集（结构判据，免疫拼写变体）；
3. 补偿链语义保持：真新建失败 → registry.delete 补偿不变；挂接/既有实体绝不被补偿删除（现有测试锚保持）；
4. 测试：盘符大小写变体、尾分隔符、symlink（可行平台）三夹具——断言既有工作区不被删、attachedToExisting 真值、幂等径不回归。

## 验收

1. 已注册 `Z:\learn` 后以 `z:\learn\`（或大小写变体）再注册 → 幂等成功返回既有项目，工作区 id 不变，无补偿删除；
2. 变体径 registry.list 无身份 churn（id 稳定）；绑定表口径与 core 归一一致；
3. 现有 register/reconcile/补偿测试全绿（194 池不回归）。

## Reference Files

- packages/core/src/forge/project-service.ts:75-88（①预检）/:111-118（④补偿判定）/:170-171（自愈查询）；packages/knowledge/src/tools/session.ts:34-39（绑定表归一口径）；apps/host/src/ipc/fs-rpc.ts:17（path.resolve 不闭口）；评审记录：本会话 2026-10-04 四路评审 core 路报告
- 关联：fix-27（自愈径——被击穿面）、fix-24（title 对齐同链）

## 边界与不做

- 不改 dsh registry 官方面（realpath 归一属我方边界责任）；
- 归一器不做网络盘特判（可达 realpath 失败回退规整值即可，fail-soft）。
