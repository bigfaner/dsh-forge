---
feature: "dsh-forge-m2-pipeline"
journey: "task-overview-review"
risk_level: "High"
golden_path: false
surface_types: ["web"]
surface_keys: ["web"]
sources:
  - docs/features/dsh-forge-m2-pipeline/prd/prd-user-stories.md
  - docs/features/dsh-forge-m2-pipeline/prd/prd-spec.md
  - docs/features/dsh-forge-m2-pipeline/prd/prd-ui-functions.md
generated: "2026-10-07"
---

# Journey: task-overview-review

**Risk Level**: High

<!-- Risk Classification Criteria:
  High   = Workflow involves state mutation, data loss risk, or irreversible operations
  Medium = Workflow involves multi-step interaction without irreversible side effects
  Low    = Workflow is read-only or purely observational
-->

## Overview

单人开发者在概览页签按 feature 绑定浏览任务列表、用七态 chips 过滤并在三视图间切换查看，随后在任务行直接做人工状态决策（跳过 / 否决 / 挂起 / 重开，需填原因）——不开终端也能掌握任务域全貌并纠偏。（PRD Story 1；业务流程二；UI Function 1 + 任务详情抽屉）

## Setup

- 已注册工作区，其每工作区任务库中有某 feature 的多态任务（覆盖多个状态）
- 概览首屏可加载（压力数据集 500 条任务用于性能判据场景）

## Happy Path

### Step 1: 打开项目概览页签

**User Action**: 单人开发者点击 dock 开始页「项目概览」入口卡（或会话头挂接 pill）

**Expected Result**: dock 原位开出概览 tab；ov-head 呈现项目名 + 状态摘要一行（默认折叠）

### Step 2: 选择 feature 绑定

**User Action**: 在任务子 tab 点击 feature pill 选择目标 feature

**Expected Result**: 任务列表切换为该 feature 的任务集；数据全部直读每工作区库（数据来源断言，无第二来源）

### Step 3: 用七态 chips 过滤任务

**User Action**: 点击某状态 chip（如 in_progress）

**Expected Result**: 列表（及 DAG / 泳道）仅显示该 feature 该状态的任务；过滤三视图统一生效

### Step 4: 切换三视图浏览任务全貌

**User Action**: 在列表 | DAG | 泳道三视图间切换浏览

**Expected Result**: 列表两行布局（主行 ID + 标题 + 中文状态 tag；副行类型 / 优先级 / 前置 / 挂接）；DAG 呈现 SVG 贝塞尔连线（完成边绿）；泳道七态横向列；过滤与排序统一生效

### Step 5: 在任务行做人工状态决策

**User Action**: 从抽屉或 ⋯ 菜单发起转移，选择目标态（from≠to，目标态仅列允许集）并填写原因后确认

**Expected Result**: 状态转移落库 + 审计记录（reason 必带）；与 agent 写入同门（core 动词）；概览列表即时反映新状态

### Step 6: 查看模块化任务详情

**User Action**: 点击任务行 / DAG 节点 / 泳道卡片打开详情抽屉

**Expected Result**: 右侧滑入抽屉呈现通用区（类别彩色 chip + 优先级 + 复杂度）+ 状态条件区（blocked → 阻塞原因）+ 按类型条件区（fix 链 / 覆盖率 / 测试面 / 质量门 / 评估结果）+ 执行时间线 + 挂接 + 转移入口

## Edge Cases

### Step 1b: 500 任务压力数据集首屏性能

**Precondition**: 概览首屏含 500 条任务的压力数据集

**User Action**: 打开概览页签

**Expected Result**: 首屏呈现 ≤2s（机械判据）；列表无 watch / 回流 / 快照同步模块（代码审计 0 个）

### Step 2b: 中英双语搜索（IME 安全）

**Precondition**: 任务标题 / key / 类型 / 状态含中英文混合数据

**User Action**: 在搜索栏输入关键词（含中文组合输入过程）

**Expected Result**: 仅更新内容区（IME 安全——中文组合态不被打断）；中英双语匹配过滤生效；切换子 tab 自动清空搜索

### Step 3b: 0 计数状态 chip 禁用

**Precondition**: 当前 feature 下某状态任务计数为 0

**User Action**: 尝试点击该状态 chip

**Expected Result**: chip disabled（禁用淡化），不可触发过滤

### Step 4b: 排序切换

**Precondition**: 列表中存在多个不同状态与创建时间的任务

**User Action**: 点击排序 pill 在「活跃优先 ↔ 最新创建」间切换

**Expected Result**: 全列表重排（活跃优先：in_progress→blocked→pending→…→completed；最新创建：created_at 降序）；排序三子 tab 共用

### Step 5b: 人工转移原因缺席

**Precondition**: 转移对话框中 reason 留空

**User Action**: 确认提交转移

**Expected Result**: 拒绝提交（reason 必带），对话框留场可修正；无状态写入、无审计行

### Step 5c: from=to 或目标态不在允许集

**Precondition**: 所选目标态与当前态相同，或不在状态机允许集

**User Action**: 尝试提交转移

**Expected Result**: 拒绝（from≠to 校验；目标态仅列允许集——所见即所得，用户点不到非法目标）

## Journey Invariants

- 概览数据全部直读每工作区库（无第二来源、无 watch / 回流 / 快照同步模块）
- 人工转移与 agent 写入同门（core 动词 API），每次转移必带 reason 且落审计
- 七态 chips 过滤与排序对三视图统一生效
- 转移目标态所见即所得：抽屉与菜单仅列状态机允许集（allowedTransitions 纯函数，服务端同源提前校验）
- 首屏性能判据恒成立：≤2s @500 任务
