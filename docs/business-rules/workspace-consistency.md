---
title: "工作区注册一致性规则"
domains: [workspace, registry, compensation, idempotency, reconciliation, derivation, suspected-move]
---

# 工作区注册一致性规则

> 应用库（projects 表）与 dsh workspace registry 是两份事实源；本文件收敛两者一致性的全部业务规则（注册、补偿、对账、孤儿处置）。

## 注册补偿链

### BIZ-workspace-001: 项目注册四步补偿链

**Rule**: 项目注册内聚四步链——① ownership 预检（`registry.list()` 按 canonical path 匹配，命中既有工作区 = 本次「挂接」，`attachedToExisting=true`，不登记补偿）→ ② `registry.create(wsPath)`（幂等）→ ③ 应用库事务写入 `projects` 行（仅本次新建路径登记补偿）→ ④ 第 ③ 步失败或流程窗口内取消且属本次新建 → `registry.delete(workspaceId)` 补偿。
**Context**: 保证 dsh 侧孤儿注册 = 0（SC12），同时绝不误删既有工作区；补偿链内聚在 ProjectService（单一裁决点）。
**Source**: feature/dsh-forge-p1-mvp BIZ-001（prd-spec §Flow Description 流程一 / tech-design §Interface 1）

### BIZ-workspace-002: ownership 保护（幂等命中不得误删）

**Rule**: 同 canonical path 命中既有工作区（幂等挂接）时，任何失败路径都不得删除该既有工作区——幂等命中不是本次新建，无补偿资格。
**Context**: 「挂接既有」与「本次新建」的补偿资格区分是防误删的关键不变量（SC12 断言：任何失败不删既有）。
**Source**: feature/dsh-forge-p1-mvp BIZ-002（prd-user-stories Story 1 AC3 / proposal SC12）

### BIZ-workspace-003: 补偿语义（保数据 + 幂等）

**Rule**: `registry.delete` 补偿只删注册不删数据——保留工作区目录与会话日志；重复补偿为 no-op（幂等）。
**Context**: 补偿目标是清理「注册残留」而非销毁用户数据；dsh registry delete 语义 = 保目录保会话日志（契约面 pin 项）。
**Source**: feature/dsh-forge-p1-mvp BIZ-003（prd-spec §Flow Description 流程一 / tech-design §契约面清单第 4 项）

## 失败处置与对账

### BIZ-workspace-004: 补偿失败处置（记账 + 提示，不自动删）

**Rule**: 补偿调用失败 → app_key_logs 记账日志（warn/error）+ 启动对账提示；孤儿工作区只提示不自动删。
**Context**: 自动删孤儿会与 dsh 侧其他用途冲突；显式留痕 + 人工处置是运行期一致性监控的唯一形态（单机无服务端监控）。
**Source**: feature/dsh-forge-p1-mvp BIZ-004（prd-spec §Flow Description 流程一 / §Monitoring Requirements）

### BIZ-workspace-005: 启动对账（每次启动）

**Rule**: 每次启动校验 `projects.workspace_id` 与 dsh registry canonical path：匹配通过；失配按 path 找回并单向修引用（记账 warn）；找不回则 `registry.create(ws_path)` 幂等重建后修引用；dsh 有而应用无的孤儿 → 记账 + 提示（不自动删）。
**Context**: 应用库与 dsh 账本是两份事实，启动对账是唯一的周期性收敛点；「单向修引用」防双向覆盖。
**Source**: feature/dsh-forge-p1-mvp BIZ-005（prd-spec §Flow Description 流程一第 8 步 / tech-design §交互三）

## 任务库落位（M2 起）

### BIZ-workspace-006: 每工作区库派生单源与疑似移动保护

**Rule**: 任务库位置 = {dsh-forge-home}/{canonical-path 扁平化}@{hash8}（hash8 = 原路径 sha-256 前 8 hex 小写消歧后缀）；{dsh-forge-home} = env DSH_FORGE_TASKS_HOME > {userData}/forge-workspaces；派生函数落位 core 单源（deriveDir），注册表单展示串经 RPC 下发（与实际建库位置逐字一致——单源断言）；注册碰撞三态——正常新建 / 幂等复用（中央 ws_path 精确确认）/ 疑似移动拒绝（目标目录不存在 + 同扁平化主体异 hash8 → ERR_SUSPECTED_MOVE 于中央行落库之前抛出（拒绝零副作用）+ 手工指引：删孤儿目录或改回原名；不清理、不认领）。
**Context**: 表单不撒谎（SC2 单源断言锚）；裂库风险仅剩真实移动，注册时拒绝兜底（S10 实证全路径形态收敛）。
**Source**: feature/dsh-forge-m2-pipeline BIZ-013（prd-spec §In Scope ①·§Flow Description 流程五 / user-stories Story 7 / tech-design §Interface 5）
