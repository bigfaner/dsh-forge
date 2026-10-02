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
- dsh workspace registry 与应用状态库可用；故障注入 = 宿主测试开关（env 或调试 RPC，如 `test.setFault("appdb.write"|"registry.delete","fail")`，仅测试构建生效；5c 漂移预置同经此）（source: inferred，测试基建契约——PRD 未定义）
- 非 UI 断言的观察通道：dsh 注册态 =「已注册」标记（UF-3 预检可视化）或 registry 探针；应用侧记录 = 左栏项目树或应用库直读；记账日志 = 测试侧日志探针（P1 无对账 UI）；workspaceId = registry 按 path 反查
- 场景隔离：各场景用专属新建路径（互不重叠）从基线启动；唯 Step 5b 衔接 Step 3–4 同场景终态（补偿已成功）；4b 孤儿因路径不重叠不外溢
- 存在一个已注册的既有工作区（canonical path 已命中 registry，供 ownership 保护断言）
- 应用可重启（供启动对账断言）

## Happy Path

### Step 1: 发起一次新建工作区注册

**User Action**: 打开添加项目流程，文件浏览器选定未注册目录，注册表单点「确认」

**Expected Result**: 四步链启动——① ownership 预检（registry.list 按 canonical path 匹配）未命中既有工作区，判定本次为「新建」而非「挂接」

### Step 2: dsh create 新建工作区并登记补偿

**User Action**: 注册执行继续（等待②步完成）

**Expected Result**: ②步（dsh create，幂等）完成——dsh 侧出现本次新建的工作区注册：该 canonical path 命中新注册（workspaceId，uuid，即应用库外键）；因属本次新建路径，补偿已登记（写入失败可回滚删除）

### Step 3: 第③步应用库写入失败触发补偿

**User Action**: 注册执行进行中（②已完成），系统级触发故障——经注入开关令③步应用库写入失败

**Expected Result**: ④ 补偿自动执行，终态：本次新建的工作区注册已删除（④=registry.delete 补偿）——观察通道断言该路径无注册、应用侧无残留；工作区目录与会话日志原样保留；「确认」后 UI 内无取消点的约束不受影响

### Step 4: 失败反馈呈现

**User Action**: 查看注册流程反馈

**Expected Result**: 失败反馈呈现，含失败原因与补偿结果说明（UF-3「失败」态）；dsh 侧无孤儿、应用侧无残留——观察通道断言（registry 探针；左栏项目树无该项目）

### Step 5: 补偿幂等（重复补偿为 no-op）

**User Action**: 系统级重放——经测试开关对同一 workspaceId（②后经 registry 探针捕获）再触发一次补偿（模拟补偿重入）

**Expected Result**: 重复补偿为 no-op——不产生二次删除、不报错、不波及目录与会话日志

## Edge Cases

### Step 3b: 流程窗口内取消

**Precondition**: ②步已执行、③应用库写入尚未完成（流程窗口内，「确认」后的 UI 取消点已过）

**User Action**: 关闭应用窗口/终止宿主进程——「确认」后 UI 内无取消点，「流程窗口内取消」唯一形态 = 宿主级中断（不违「不可交互中断」：该约束限定 UI 交互面）

**Expected Result**: 判定属本次新建 → ④补偿执行删除该注册；重启后经观察通道断言：目录与会话日志保留、该路径无孤儿注册

### Step 3c: 同路径既有工作区保护（ownership）

**Precondition**: 本次注册经①预检命中既有工作区（幂等挂接，非本次新建，未登记补偿）

**User Action**: 后续任一步骤失败（含应用库写入失败）

**Expected Result**: 既有工作区不被删除——幂等命中不是本次新建，不得误删；挂接分支本身不登记补偿

### Step 4b: 补偿失败走记账与对账提示

**Precondition**: ④补偿调用本身失败（经注入开关触发）

**User Action**: 重启应用并查看启动对账提示

**Expected Result**: 补偿失败记入记账日志（测试侧日志探针）；下次启动呈现启动对账提示——孤儿工作区只提示不自动删（该孤儿为设计终态，口径见 Invariants）

### Step 5b: 补偿后重试注册同一路径

**Precondition**: 上一次注册已完整补偿（衔接 Step 3–4 同场景终态：dsh 侧无孤儿）

**User Action**: 重新走添加项目流程，注册同一工作区路径

**Expected Result**: 注册成功，dsh 侧与应用侧记录一致（观察通道断言：注册存在、左栏出现项目、外键一致）；本场景全流程后孤儿注册 = 0（source: inferred——重试成功非 PRD 原文，派生自①按 canonical path 匹配 + ②幂等：补偿删除后重注册不再命中既有、重走新建分支成功；「孤儿=0」为 SC12/PRD Goal 原文）

### Step 5c: 启动对账修复引用漂移

**Precondition**: 应用库 projects 记录的 workspace_id 与 registry 实际 canonical path 失配（引用漂移；漂移态经注入契约预置）

**User Action**: 重启应用

**Expected Result**: 启动对账校验 workspace_id 与 canonical path，失配按 path 找回（单向修引用），项目记录恢复一致

## Derived Outcomes（Web Surface 必察项）

- **validation-error** — N/A：失败窗口自「确认」后开启，非法路径已在表单态拦截（UF-3 Validation Rules），进不了四步链；由兄弟 Journey project-registration Step 3d 承载（source: inferred——必察项 × UF-3 校验时序）
- **session-expired** — N/A：单机产品无登录会话/过期概念（PRD Security 单机边界）；最近邻 = 执行窗口内宿主中断，已由 Step 3b 覆盖并断言补偿终态（source: inferred——必察项 × PRD 安全边界，映射至 Step 3b）

## Journey Invariants

- 补偿成功路径（Step 3/3b/3c/5/5b/5c 终态）dsh 侧孤儿注册 = 0——SC12 四断言零失败（补偿删除/防误删/补偿幂等/对账提示）；唯一例外 = Step 4b：孤儿按设计保留（只提示不自动删），不计入「孤儿=0」口径
- 补偿只删 registry 注册记录，工作区目录与会话日志一律保留
- 幂等命中（挂接既有工作区）永不登记补偿、任何失败路径下不被删除
- 补偿失败不自动删除孤儿——仅记账日志 + 启动对账提示
- 「确认」后的注册执行 UI 内不可交互中断；宿主级中断（Step 3b 形态）不属交互中断；失败反馈必须同时说明补偿结果
