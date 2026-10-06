---
feature: "dsh-forge-m2-pipeline"
journey: "task-session-linkage"
risk_level: "Low"
golden_path: false
surface_types: ["web"]
surface_keys: ["web"]
sources:
  - docs/features/dsh-forge-m2-pipeline/prd/prd-user-stories.md
  - docs/features/dsh-forge-m2-pipeline/prd/prd-spec.md
  - docs/features/dsh-forge-m2-pipeline/prd/prd-ui-functions.md
  - docs/features/dsh-forge-m2-pipeline/design/tech-design.md
  - docs/features/dsh-forge-m2-pipeline/design/schema.sql
generated: "2026-10-07"
---

# Journey: task-session-linkage

**Risk Level**: Low

<!-- Risk Classification Criteria:
  High   = Workflow involves state mutation, data loss risk, or irreversible operations
  Medium = Workflow involves multi-step interaction without irreversible side effects
  Low    = Workflow is read-only or purely observational
-->

## Overview

单人开发者双侧看见任务与会话的挂接——会话头部看到该会话挂接的任务、任务行看到挂接的会话，执行痕迹可追溯（哪个任务在哪个会话里做过一目了然）。（PRD Story 6；业务流程四；SC6③；UI Function 3；S8 实证子会话 id 与主会话相异可判）

## Setup

- 一次完整派发已发生：dispatcher 主会话 claim 任务（挂接表落行）+ executor 匿名子会话 submit（审计行记执行会话 id）——两侧会话 id 相异可判
- 另有一个从未 claim 过任何任务的会话在场（供无挂接场景）
- 挂接表 task_session_links 与审计 task_records 已在每工作区库

## Happy Path

### Step 1: 查看任务列表副行的挂接计数

**User Action**: 在概览任务子 tab 列表视图查看该任务行的副行

**Expected Result**: 副行呈现该任务的挂接计数（挂接会话数汇总——副行承重为计数，不含分型明细）

### Step 2: 打开任务详情抽屉查看挂接会话分型

**User Action**: 点击任务行打开详情抽屉，查看挂接区

**Expected Result**: 挂接区呈现两类分型展示——派发类与执行类；两类各自与其来源库记录一致（派发类对应挂接表行、执行类对应审计行会话 id——SC6③ 双数据源口径）；两侧会话 id 相异可判，不混示为同一会话

### Step 3: 查看 dispatcher 会话头部的挂接 pill

**User Action**: 切换到 dispatcher 主会话查看会话头部

**Expected Result**: 头部展示挂接任务且与库中挂接行一致；pill 分型标识为派发（该会话的挂接来源 = claim 写入的挂接表行）

### Step 4: 从挂接 pill 定位任务

**User Action**: 点击会话头挂接 pill

**Expected Result**: dock 开概览 tab + 切到任务子 tab + 选中该任务所属 feature（即使概览当前停在另一 feature 亦切至该任务的 feature）+ 任务抽屉打开

### Step 5: 切换到 executor 子会话查看头部

**User Action**: 切换到 executor 匿名子会话查看会话头部

**Expected Result**: 头部展示挂接任务，pill 分型标识为执行（该会话的挂接来源 = submit 落审计行的会话 id）；pill 随 session id 即时变化（不残留上一会话的派发类展示）

## Edge Cases

### Step 3b: 挂接数超限溢出与溢出菜单交互

**Precondition**: dispatcher 会话挂接任务数 >2（含跨任务多次 claim 累积）

**User Action**: 查看会话头部 pills，并打开 +N 溢出菜单、点击其中一条挂接条目

**Expected Result**: ≤2 个 pill 并排显示，其余以 +N 溢出菜单呈现；打开菜单可见全部其余挂接任务；菜单内条目点击后与 Step 4 同一导航（dock 开概览 + 任务子 tab + 选中 feature + 任务抽屉打开）［source: inferred——依据 UF-3 item 2「>2 显示 +N 溢出菜单」承装同类挂接条目 + item 3 pill 点击导航语义］

### Step 3c: 恰好两个挂接的边界

**Precondition**: dispatcher 会话挂接任务数恰好 =2

**User Action**: 查看会话头部 pills

**Expected Result**: 两个 pill 并排全量展示，无 +N 溢出菜单（≤2 并排的 off-by-one 边界——依据 UF-3 item 2「≤2 并排；>2 显示 +N」边界值）

### Step 3d: 同会话重领同任务的去重展示

**Precondition**: dispatcher 会话已挂接任务 T（首 claim 已写挂接行），同会话对 T 二次 claim（幂等重入，挂接表 UNIQUE 约束不增行）

**User Action**: 查看该会话头部 pills

**Expected Result**: 任务 T 仍呈单一 pill，无重复 pill（同一「任务 × 会话」恒单一展示）［source: inferred——依据 schema UNIQUE(task_id, session_id) 幂等 + 挂接读面为库行直读映射］

### Step 3e: 新 claim 落在已渲染会话头

**Precondition**: dispatcher 会话头部已渲染且尚未挂接任务 X；该会话随后完成对 X 的一次 claim

**User Action**: 停留在该会话头部观察（不切换会话、不重开页签）

**Expected Result**: 任务 X 的 pill 在当前头部出现（事件订阅驱动的即时刷新——写入返回后单次重取即见新值，时延有界）

### Step 5b: 无挂接会话

**Precondition**: 会话从未 claim 过任何任务，亦无以其为执行会话的审计行（无挂接数据）

**User Action**: 查看该会话头部

**Expected Result**: 无挂接 pill 展示，不渲染空占位［source: inferred——依据挂接读面 = links ∪ records.session_id 库行直读，无匹配行即无展示元素；UF-3 item 4 pill 随 session id 变化］

## Derived Outcomes 裁决（web surface 规则）

依 gen-journeys surface-web 规则 Required Outcome Reference（每条 Web Journey 必须考虑以下派生 Outcome），逐项裁决：

- **validation-error**: N/A（已考虑）。本旅程全部用户动作为查看与导航点击，挂接双侧均为只读浏览面（见不变量），无表单、无输入、无提交路径——不存在可产生无效输入的交互面。
- **session-expired**: N/A（已考虑）。产品为本地单人工作台，无登录态与服务端会话凭据；「会话」= dsh 对话会话（账本在 dsh 本体），挂接读面直读本地每工作区库——不存在会话过期后的重定向或未保存数据警示路径。最邻近的可用性边界（工作区库不可达 → 概览错误态）不在本旅程面内。

## Journey Invariants

- 双侧展示与库记录一致：双数据源口径（挂接表行 = 派发会话；审计行 session_id = 执行会话），两类各自比对（SC6③）
- 挂接双侧为只读浏览面（不写库、不造挂接；本旅程一切 claim/submit 均为前置状态而非用户动作）
- 挂接展示随 session id 变化（无跨会话残留）
- 挂接数据直读每工作区库（无第二来源）
- 同一「任务 × 会话」挂接恒单一展示（库 UNIQUE 约束 + 读面直读映射——重领不产生重复 pill）
