---
feature: "dsh-forge-m3-bootstrap-presets"
journey: "proposal-review-mode-transition"
risk_level: "High"
golden_path: false
surface_types: ["web"]
surface_keys: ["web"]
sources:
  - docs/features/dsh-forge-m3-bootstrap-presets/prd/prd-user-stories.md
  - docs/features/dsh-forge-m3-bootstrap-presets/prd/prd-spec.md
  - docs/proposals/dsh-forge-m3-bootstrap-presets/proposal.md
generated: "2026-10-08"
---

# Journey: proposal-review-mode-transition

**Risk Level**: High

<!-- Risk Classification Criteria:
  High   = Workflow involves state mutation, data loss risk, or irreversible operations
  Medium = Workflow involves multi-step interaction without irreversible side effects
  Low    = Workflow is read-only or purely observational
-->

## Overview

单人开发者在提案子 tab 按五态过滤、点文档跳转、做人工裁决（接受/打回/否决），并在目标膨胀时把突击提案升级为远征——评审工作流有家，模式变更走唯一正门且不破坏在途任务（快照不回溯）。（PRD Story 4；关键场景 3/7；业务流程五；SC3/SC6）

## Setup

- 库中存在多态提案（draft / under-review / accepted / rejected / superseded 各有代表；含带与不带 mode 溯源）
- 某 blitz 提案已建任务且在途（任务未终态）
- 概览提案子 tab 可达；agent 会话可调 transitionProposal tool

## Happy Path

### Step 1: 五态 chips 过滤与 mode chip 核查

**User Action**: 单人开发者打开概览提案子 tab 并点击某状态 chip

**Expected Result**: 仅显示该态提案；提案行名称右侧 **mode chip 与库中溯源字段一致**（远征蓝 / 突击琥珀）；无溯源（扫描吸收的旧提案）显示缺省占位（断言）

### Step 2: 人工裁决流转（UI 按钮）

**User Action**: 在某提案行 ⋯ 菜单点「评审流转…」，选目标态并填 reason 提交

**Expected Result**: 对话框目标态仅列五态机允许集 + reason 必填；流转写库（同门动词）；提案行状态即时更新

### Step 3: agent 经 transitionProposal tool 流转

**User Action**: agent 会话经 transitionProposal tool 对另一提案流转一次

**Expected Result**: 写库结果与人工面**一致**（同门动词，对比断言）；**agent tool 面无模式改写动词**（契约断言——模式不可变边界）

### Step 4: blitz 提案在途时手动改为远征

**User Action**: 单人开发者在提案子 tab 经 ⋯ 菜单（或 mode chip 快捷入口）将某在途 blitz 提案改为远征

**Expected Result**: 远征⇄突击二选 + 说明必填 + 快照不回溯一行明示；**溯源字段即时同步**（proposals.mode 更新——features 恒远征无列无需同步）

### Step 5: 升降级联动核查

**User Action**: 模式更改后，经「打开新会话」入口创建会话并查看既有任务与会话

**Expected Result**: 下一个经「打开新会话」入口创建的会话**自动对齐远征**；**既有任务按创建时快照照旧执行**（整数 ID / eval 豁免不变——断言）；既有会话按 blank 锁保持原预设

## Edge Cases

### Step 1b: 五态 chips 边界行为

**Precondition**: 某状态在库中计数为 0；或多态并选

**User Action**: 点击 0 计数 chip / 多选若干状态 chip / 切换子 tab

**Expected Result**: 0 计数 disabled；多选并集显示；子 tab 切换清空选择

### Step 1c: 无溯源旧提案占位

**Precondition**: 扫描吸收的旧提案（创建时无 mode 字段）

**User Action**: 查看其提案行 mode chip

**Expected Result**: 缺省占位（中性、不可点）；不伪装成任一模式

### Step 2b: 裁决 reason 空缺

**Precondition**: 裁决对话框已选目标态但 reason 留空

**User Action**: 尝试提交

**Expected Result**: **拒绝且留场**（空因拒绝）——不落部分写库；补因后可提交

### Step 2c: 目标态不在允许集

**Precondition**: 当前态为某中间态（如 under-review）

**User Action**: 打开评审流转对话框查看目标态列表

**Expected Result**: 仅列**五态机允许集**（非法转移不可选——状态机守卫）

### Step 3b: 提案文档跳转

**Precondition**: 提案挂有文档（proposal.md 及其他文档行）

**User Action**: 点击提案行文档链接

**Expected Result**: 文档跳转可用（dock 文档 tab 打开对应文档）；文档区标题「文档（N 篇）」计数真实

### Step 4b: 远征提案 accepted 对照

**Precondition**: 某远征提案被接受（accepted）

**User Action**: 检查 feature 子 tab 与谱系

**Expected Result**: **registerFeature 单步成链**（feature 行 + proposal_id 谱系 + 审计行）——对照：突击提案 accepted 无 feature 行（两分支分化断言）

### Step 4c: mode 更改后 agent 面核查

**Precondition**: 模式经人工正门变更后

**User Action**: 枚举 agent tool 面动词

**Expected Result**: **无模式改写动词**（契约断言）——模式不可变：唯一变更通道 = 提案子 tab 人工操作

### Step 5b: 溯源与视图一致性

**Precondition**: 模式变更已提交（写库返回）

**User Action**: 刷新/重查提案子 tab 的 mode chip

**Expected Result**: mode chip 恒与库中 proposals.mode 一致（变更后即时反映；无陈旧投影）

## Journey Invariants

- **模式绑定三律**：律一 新会话自动对齐（提案 mode）；律二 确立后不可切换；律三 唯一变更通道 = 提案子 tab 人工更改 + 快照不回溯
- **双面流转同门**：UI 人工裁决与 transitionProposal tool 写库一致（同门动词，无第二写者）
- mode chip 恒与库中溯源字段一致；无溯源显示缺省占位（不伪装）
- 既有任务语义按**创建时快照**执行——模式变更零回溯（整数 ID / eval 豁免 / 派发模板不变）
