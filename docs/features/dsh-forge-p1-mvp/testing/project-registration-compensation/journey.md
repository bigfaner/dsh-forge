---
feature: "dsh-forge-p1-mvp"
journey: "project-registration-compensation"
risk_level: "High"
golden_path: false
surface_types: ["web"]
surface_keys: ["web"]
sources:
  - docs/features/dsh-forge-p1-mvp/prd/prd-user-stories.md
  - docs/features/dsh-forge-p1-mvp/prd/prd-spec.md
  - docs/features/dsh-forge-p1-mvp/prd/prd-ui-functions.md
  - docs/proposals/dsh-forge-p1-mvp/proposal.md
generated: "2026-10-03"
---

# Journey: project-registration-compensation

**Risk Level**: High

<!-- Risk Classification Criteria:
  High   = Workflow involves state mutation, data loss risk, or irreversible operations
  Medium = Workflow involves multi-step interaction without irreversible side effects
  Low    = Workflow is read-only or purely observational
-->

## Overview

注册链的应用库写入步骤失败（或流程窗口内取消）时，四步补偿链自动执行 `registry.delete` 补偿删除——保证 dsh 侧无孤儿注册、目录与会话日志保留、既有工作区（幂等命中）不被误删，补偿失败走记账日志与启动对账提示。

**PRD 溯源**: Story 1 第 3/4 条 AC（ownership 保护 / 补偿删除与幂等）；流程一补偿异常分支 + 创建补偿流 Mermaid（prd-spec）；UF-3 States「失败」；提案 Key Scenario「失败路径」、SC12（全量四断言）。

## Setup

- 存在一个未注册的目标目录（canonical path 不命中既有工作区，本次为新建路径）
- dsh workspace registry 可用；应用状态库写入步骤可被模拟失败（测试注入口就位）
- 存在一个已注册的既有工作区（canonical path 已命中 registry，供 ownership 保护断言）
- 应用可重启（供启动对账断言）

## Happy Path

### Step 1: 发起一次新建工作区注册

**User Action**: 打开添加项目流程，文件浏览器选定未注册目录，注册表单点「确认」

**Expected Result**: 四步链启动——① ownership 预检（registry.list 按 canonical path 匹配）未命中既有工作区，判定本次为「新建」而非「挂接」

### Step 2: dsh create 新建工作区并登记补偿

**User Action**: 注册执行继续（等待②步完成）

**Expected Result**: ② `registry.create(path)` 幂等执行成功，产出 workspaceId（uuid）；因属本次新建路径，补偿已登记（应用库写入失败时可回滚删除）

### Step 3: 第③步应用库写入失败触发补偿

**User Action**: 注册执行进行中，模拟注入使应用库事务写入 projects 行失败

**Expected Result**: ④ 补偿自动执行——`registry.delete(workspaceId)` 删除本次新建的工作区注册；目录与会话日志保留；流程不可交互中断的约束仍然成立

### Step 4: 失败反馈呈现

**User Action**: 查看注册流程反馈

**Expected Result**: 失败反馈呈现，含失败原因与补偿结果说明；dsh 侧无孤儿注册，应用侧无残留 projects 行

### Step 5: 补偿幂等（重复补偿为 no-op）

**User Action**: 对同一 workspaceId 再次触发补偿调用

**Expected Result**: 重复补偿为 no-op——不产生二次删除、不报错、不波及目录与会话日志

## Edge Cases

### Step 3b: 流程窗口内取消

**Precondition**: dsh create 已执行、应用库写入尚未完成（流程窗口内，取消点已过确认）

**User Action**: 在注册执行窗口内取消流程

**Expected Result**: 判定属本次新建 → `registry.delete` 补偿执行；工作区目录与会话日志保留；无孤儿注册

### Step 3c: 同路径既有工作区保护（ownership）

**Precondition**: 本次注册经①预检命中既有工作区（幂等挂接，非本次新建，未登记补偿）

**User Action**: 后续任一步骤失败（含应用库写入失败）

**Expected Result**: 既有工作区不被删除——幂等命中不是本次新建，不得误删；挂接分支本身不登记补偿

### Step 4b: 补偿失败走记账与对账提示

**Precondition**: `registry.delete` 补偿调用本身失败

**User Action**: 查看记账日志并重启应用

**Expected Result**: 补偿失败记入记账日志；下次启动呈现启动对账提示——孤儿工作区只提示不自动删

### Step 5b: 补偿后重试注册同一路径

**Precondition**: 上一次注册已完整补偿（dsh 侧无孤儿）

**User Action**: 重新走添加项目流程，注册同一工作区路径

**Expected Result**: 注册成功，dsh 侧与应用侧记录一致；全流程后孤儿注册 = 0

### Step 5c: 启动对账修复引用漂移

**Precondition**: 应用库 projects 记录的 workspace_id 与 registry 实际 canonical path 失配（引用漂移）

**User Action**: 重启应用

**Expected Result**: 启动对账校验 workspace_id 与 canonical path，失配按 path 找回（单向修引用），项目记录恢复一致

## Journey Invariants

- 全流程后 dsh 侧孤儿注册 = 0——补偿删除 / 防误删 / 补偿幂等 / 对账提示四断言零失败
- 补偿只删 registry 注册记录，工作区目录与会话日志一律保留
- 幂等命中（挂接既有工作区）永不登记补偿、任何失败路径下不被删除
- 补偿失败不自动删除孤儿——仅记账日志 + 启动对账提示
- 「确认」后的注册执行不可交互中断；失败反馈必须同时说明补偿结果
