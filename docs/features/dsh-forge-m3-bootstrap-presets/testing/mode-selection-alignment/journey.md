---
feature: "dsh-forge-m3-bootstrap-presets"
journey: "mode-selection-alignment"
risk_level: "Medium"
golden_path: false
surface_types: ["web"]
surface_keys: ["web"]
sources:
  - docs/features/dsh-forge-m3-bootstrap-presets/prd/prd-user-stories.md
  - docs/features/dsh-forge-m3-bootstrap-presets/prd/prd-spec.md
  - docs/proposals/dsh-forge-m3-bootstrap-presets/proposal.md
generated: "2026-10-08"
---

# Journey: mode-selection-alignment

**Risk Level**: Medium

<!-- Risk Classification Criteria:
  High   = Workflow involves state mutation, data loss risk, or irreversible operations
  Medium = Workflow involves multi-step interaction without irreversible side effects
  Low    = Workflow is read-only or purely observational
-->

## Overview

单人开发者在新建会话的 hero 一键选择远征/突击模式（默认远征），经提案绑定入口创建的会话自动对齐提案模式，错配场景获得可见性守卫——会话从第一步就带正确的工具与技能组合，不为逐会话手选错档买单。（PRD Story 1；业务流程一「模式选择与自动对齐」；SC1）

## Setup

- 应用首启完成：`ui-settings` 行 `enabled: true` 已首启预置物化（一次性；此后该行归用户运行时修改），hero 预设座位可见
- 双预设（远征 = 完整 SDD 管线 / 突击 = 提案直达任务执行）经宿主物化绝对路径装进用户 profile；registry default = 远征
- 库中存在 mode 溯源 = blitz 的提案（供自动对齐步骤使用）

## Happy Path

### Step 1: 新建会话查看 hero 预设座位

**User Action**: 单人开发者新建一个会话，查看 hero 区的预设座位

**Expected Result**: 预设座位在场：折叠标签 = 远征模式（registry 默认）；展开菜单列「远征模式 / 突击模式」——中文显示名直出、order 1/2

### Step 2: blank 期点选「突击模式」

**User Action**: 在未发首回合的 blank 会话中点选菜单「突击模式」

**Expected Result**: 组合即时切换：座位标签 = 突击模式；会话工具面/技能目录与突击组合一致（投影断言——技能清单不含规格技能全集）

### Step 3: 发起首回合（blank 锁生效）

**User Action**: 在选定突击模式的会话中发起首回合对话

**Expected Result**: 首回合后座位不可再切换（blank 锁）——再点选菜单无效（UI 投影面断言：座位锁定、点选不响应）；会话保持突击组合

### Step 4: 经提案绑定入口创建新会话（自动对齐）

**User Action**: 单人开发者从 mode 溯源 = blitz 的提案经绑定入口（提案/feature 行头「打开新会话」）创建新会话

**Expected Result**: 会话以突击模式起步（blank 期 `select`）：座位标签 = 突击模式，工具面/技能目录与突击组合一致——用户无需逐会话手选

### Step 5: hero 自由会话用于异模式 feature（错配守卫）

**User Action**: 将 hero 自由创建（无提案上下文）的会话用于另一模式的 feature 工作

**Expected Result**: 应用不阻断但给出可见性守卫：mode chip 对照 + 派发入口提示；平台 blank 锁边界如实记账，不伪装可切换

## Edge Cases

### Step 1b: hero 开关未开启

**Precondition**: `ui-settings` 行缺席或被用户运行时关闭

**User Action**: 新建会话查看 hero

**Expected Result**: 预设座位不自现（开关门控）；既有会话的组合不受开关影响

### Step 2b: 显式点选默认远征

**Precondition**: blank 会话，座位当前 = 远征模式（默认态）

**User Action**: 点选菜单「远征模式」

**Expected Result**: 座位标签保持远征模式，组合不漂移（幂等点选）

### Step 3b: 首回合后尝试切换模式

**Precondition**: 会话已过首回合（超出 blank 期）

**User Action**: 再次点开座位菜单尝试切换至另一模式

**Expected Result**: 点选无效——会话保持原预设（UI 投影面断言）；会话内无第二切换通道

### Step 3c: 重启后恢复既有会话

**Precondition**: 应用重启，此前存在已确立模式的会话

**User Action**: 重新打开该既有会话

**Expected Result**: 按 agentPreset 投影重建同款组合（座位标签 / 工具面 / 技能目录与重启前一致）

### Step 4b: 提案无 mode 溯源

**Precondition**: 经绑定入口创建会话的提案为扫描吸收的旧提案（无溯源字段）

**User Action**: 经该提案行头「打开新会话」创建新会话

**Expected Result**: 不切换（保持 registry 默认远征）；提案行 mode chip 显示缺省占位

### Step 5b: 错配守卫如实记账

**Precondition**: hero 自由会话（远征）打开突击提案的直挂任务

**User Action**: 在该会话中继续突击提案的任务工作

**Expected Result**: 可见性守卫呈现（mode chip 对照 + 派发入口提示）但零阻断；突击语义（整数 ID / eval 豁免）照旧生效——下游读溯源字段不读会话预设

## Journey Invariants

- 模式一经首回合确立，会话内不可再切换（平台 blank 锁）；唯一模式变更通道 = 提案子 tab 人工更改（模式绑定三律）
- 会话工具面/技能目录恒由预设组合唯一决定，与提案/任务内容无关；断言基 UI 投影面（座位标签 + 工具面/技能目录投影）
- 自动对齐只发生在经绑定入口创建会话的 blank 期；提案模式变更不回溯既有会话预设
- hero 开关（`ui-settings` 行）只控制座位可见性；首启预置后该行归用户运行时修改（设置 UI 保存正常持久化）
