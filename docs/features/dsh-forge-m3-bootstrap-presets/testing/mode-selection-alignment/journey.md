---
feature: "dsh-forge-m3-bootstrap-presets"
journey: "mode-selection-alignment"
risk_level: "High"
golden_path: false
surface_types: ["web"]
surface_keys: ["web"]
sources:
  - docs/features/dsh-forge-m3-bootstrap-presets/prd/prd-user-stories.md
  - docs/features/dsh-forge-m3-bootstrap-presets/prd/prd-spec.md
  - docs/features/dsh-forge-m3-bootstrap-presets/prd/prd-ui-functions.md
  - docs/features/dsh-forge-m3-bootstrap-presets/design/tech-design.md
  - docs/proposals/dsh-forge-m3-bootstrap-presets/proposal.md
  - docs/proposals/dsh-forge-m3-bootstrap-presets/spikes/s5-preset-base.md
generated: "2026-10-08"
---

# Journey: mode-selection-alignment

**Risk Level**: High

<!-- Risk Classification Criteria:
  High   = Workflow involves state mutation, data loss risk, or irreversible operations
  Medium = Workflow involves multi-step interaction without irreversible side effects
  Low    = Workflow is read-only or purely observational
-->

<!-- 判级注记：blank 锁 = 模式一经首回合确立、会话生命周期内不可再切换（错档补救 = 新开会话）——不可逆操作；模式点选即时改写会话工具面/技能目录（状态变更）。按上述标准判 High。 -->

## Overview

单人开发者在新建会话的 hero 一键选择远征/突击模式（默认远征），经提案绑定入口创建的会话自动对齐提案模式，错配场景获得可见性守卫——会话从第一步就带正确的工具与技能组合，不为逐会话手选错档买单。（PRD Story 1；业务流程一「模式选择与自动对齐」；SC1）

## 测试策略分工（web surface 50/50）

本旅程承担 web surface 50/50 测试策略的 **Journey 半**：11+ 步全为用户经 UI 的模式选择/自动对齐/守卫工作流，断言基 UI 投影面（座位标签 + 工具面/技能目录投影——SC1 口径）。**Contract 半**（配置/文件级契约面核查）由 preset-physical-isolation 与 worker-provisioning 承担——旅程间分工，非单旅程内五五。每步「观察通道」行显式标注断言落点。

## Setup

- 应用首启完成：`ui-settings` 行 `enabled: true` 已首启预置物化（一次性；此后该行归用户运行时修改），hero 预设座位可见
- 双预设（远征 = 完整 SDD 管线 / 突击 = 提案直达任务执行）经宿主物化绝对路径装进用户 profile；registry default = 远征
- 库中存在 mode 溯源 = blitz 的提案（供自动对齐步骤使用）
- 一个远征 feature 在场、一个带直挂任务的 blitz 提案在场（供 Step 5/5b 错配守卫场景）
- 一个既有已确立模式的会话在场（供 Step 1b「既有会话组合不受开关影响」对照）；一个 hero 自由创建（无提案上下文）的远征会话在场（供 Step 5b 错配记账——非 Step 2 会话复用，无提案上下文语境独立成立）

## Happy Path

### Step 1: 新建会话查看 hero 预设座位

**Precondition**: hero 开关开启（首启预置）；双预设已物化

**User Action**: 单人开发者新建一个会话，查看 hero 区的预设座位

**Expected Result**: 预设座位在场：折叠标签 = 远征模式（registry 默认）；展开菜单列「远征模式 / 突击模式」双入口——中文显示名直出、远征在前（order 1/2）

**观察通道**: web 面（hero 座位与菜单 DOM）

### Step 2: blank 期点选「突击模式」

**Precondition**: 会话处于 blank 期（未发首回合）

**User Action**: 在 blank 会话中点选菜单「突击模式」

**Expected Result**: 组合即时切换：座位标签 = 突击模式；会话工具面/技能目录与突击组合一致（技能清单不含规格技能全集——SC1 投影断言口径）

**观察通道**: web 面（座位标签）+ 会话投影面（工具面/技能目录投影）

### Step 3: 发起首回合（blank 锁生效）

**Precondition**: 会话已选定突击模式且处于 blank 期（Step 2 会话）

**User Action**: 在该会话中发起首回合对话

**Expected Result**: 首回合正常进行；此后 blank 锁生效——预设座位卸载，切换面不再提供（SC1 UI 投影面双信号：座位卸载/点选超时）；会话保持突击组合（越界切换尝试的处置见 Step 3b）

**观察通道**: web 面（首回合消息流 + 座位卸载）

### Step 4: 经提案绑定入口创建新会话（自动对齐）

**Precondition**: 库中存在 mode 溯源 = blitz 的提案（Setup）

**User Action**: 单人开发者从该提案经绑定入口（提案/feature 行头「打开新会话」）创建新会话

**Expected Result**: 会话以突击模式起步（blank 期 `select`）：座位标签 = 突击模式，工具面/技能目录与突击组合一致——用户无需逐会话手选

**观察通道**: web 面（新会话座位标签）+ 会话投影面（工具面/技能目录投影）

### Step 5: hero 自由会话用于异模式 feature（错配守卫）

**Precondition**: Step 2/3 的突击会话在场（已确立突击组合）；一个远征 feature 在场（Setup）

**User Action**: 在该突击会话中经概览 feature 子 tab 打开此远征 feature 的内容并继续其任务工作（如经任务子 tab 该 feature 容器的「派发」入口）

**Expected Result**: 应用不阻断但给出可见性守卫：mode chip 对照（会话组合 vs 所打开内容的模式）+ 派发入口提示（守卫呈现于所打开异模式内容的对照面与派发入口——AC4 语义，像素位归 ui-design）；平台 blank 锁边界如实记账，不伪装可切换

**观察通道**: web 面（mode chip 对照 + 派发入口提示）

## Edge Cases

### Step 1b: hero 开关未开启

**Precondition**: `ui-settings` 行缺席或被用户运行时关闭；一个既有已确立模式的会话在场（Setup）

**User Action**: 新建会话查看 hero

**Expected Result**: 预设座位不自现（开关门控）；既有会话的组合不受开关影响［source: inferred——开关只控 hero 座位可见性（UF hero 节/流程一），组合装配在会话创建时已定，无回溯通道］

**观察通道**: web 面（hero 座位缺席 + 既有会话组合投影不变）

### Step 1c: 设置 UI 切换 hero 开关（行所有权）

**Precondition**: 首启预置已完成（开关 = 开启、行所有权已让位用户）

**User Action**: 经设置对话框将 hero 开关关闭并保存，再重新打开并保存

**Expected Result**: 两次保存均成功持久化（首启预置一次性——此后该行归用户运行时修改，设置 UI 保存正常持久化）；关闭期间新建会话 hero 无预设座位，重开后座位回归；既有会话组合全程不变

**观察通道**: web 面（设置对话框保存反馈 + hero 座位随开关变化）

### Step 2b: 显式点选默认远征

**Precondition**: blank 会话，座位当前 = 远征模式（默认态）

**User Action**: 点选菜单「远征模式」

**Expected Result**: 座位标签保持远征模式，组合不漂移（幂等点选）［source: inferred——点选当前已选预设 = 无变化写入，投影面自然稳定］

**观察通道**: web 面（座位标签与组合投影）

### Step 2c: blank 期点选后、首回合前重启（中间态恢复）

**Precondition**: blank 会话已点选突击模式（未发首回合）

**User Action**: 重启应用后重新打开该会话

**Expected Result**: 按会话当前已选预设投影重建——座位标签 = 突击模式，工具面/技能目录与突击组合一致（点选不因重启丢失、不回退 registry 默认）［source: inferred——恢复投影按会话 agentPreset 重建（SC1「恢复会话按 agentPreset 投影重建同款组合」+ S5 已验重启投影重建通道）；blank 期点选经 select 接线已写入会话（S5 已验 select 接线）→ 已选未锁的中间态恢复 = 按已选值］

**观察通道**: web 面（座位标签）+ 会话投影面（组合投影）

### Step 3b: 首回合后尝试切换模式

**Precondition**: 会话已过首回合（超出 blank 期）

**User Action**: 查看该会话头部寻找模式切换入口（预设座位与菜单）

**Expected Result**: 预设座位已卸载——无菜单可展开、点选不响应（SC1 双信号：座位卸载/点选超时）；会话内无第二切换通道；会话头部其他元素照常在场（观察面有效性对照）；会话保持原预设

**观察通道**: web 面（负向可用性 + 阳性对照）

### Step 3c: 重启后恢复既有会话

**Precondition**: 应用重启，此前存在已确立模式的会话

**User Action**: 重新打开该既有会话

**Expected Result**: 座位标签 / 工具面 / 技能目录与重启前一致（恢复按会话 agentPreset 投影重建同款组合——SC1）

**观察通道**: web 面 + 会话投影面

### Step 4b: 提案无 mode 溯源

**Precondition**: 经绑定入口创建会话的提案为扫描吸收的旧提案（无溯源字段）

**User Action**: 经该提案行头「打开新会话」创建新会话

**Expected Result**: 不切换（保持默认远征）［source: inferred——「不切换」为 UF-1 第 4 条原词；「保持远征」由 registry 默认 = 远征（SC1）补足］；提案行 mode chip 显示缺省占位

**观察通道**: web 面（座位标签 + mode chip）

### Step 5b: 错配守卫如实记账

**Precondition**: hero 自由远征会话在场；带直挂任务的 blitz 提案在场（Setup）

**User Action**: 在该远征会话中经概览任务子 tab 继续该突击提案直挂任务的工作

**Expected Result**: 可见性守卫呈现（mode chip 对照 + 派发入口提示）但零阻断；突击语义（整数 ID / eval 豁免）照旧生效——下游读溯源字段不读会话预设（SC3）

**观察通道**: web 面（守卫呈现 + 任务语义投影）

## Derived Outcomes 裁决（web surface 规则）

依 gen-journeys surface-web 规则 Required Outcome Reference（每条 Web Journey 必须考虑以下派生 Outcome），逐项裁决：

- **validation-error**: **N/A（已考虑）+ 近似物显式映射**。本旅程交互面 = 离散枚举点选（远征/突击二选菜单）——无自由文本输入、无字段级校验语义，web 表单形态（字段近场报错、可更正重试）不适用。最近似物 = Step 3b：越界切换尝试（首回合后再切换）的拒绝形态 = 状态机层物理防呆——座位卸载（SC1 双信号「座位卸载/点选超时」），切换面物理缺席而非表单校验反馈，已显式识别为该类派生的状态机类比［source: inferred——surface-web validation-error 规则考虑记录；承载步 = Step 3b］
- **session-expired**: **适配在场（本地化 = 会话连续性）**。产品为本地单人工作台，无登录态与服务端会话凭据，登录会话过期形态 N/A；规则语义「unsaved data preserved or user warned」的本地化派生 = Step 2c（blank 期已选未锁的中间态重启——已选模式经投影重建保留，不静默回退默认）+ Step 3c（既有会话重启投影重建同款组合）［source: inferred——surface-web session-expired 规则本地化映射至重启连续性域；承载步 = Step 2c/3c］

## Journey Invariants

- 模式一经首回合确立，会话内不可再切换（平台 blank 锁——切换面卸载）；唯一模式变更通道 = 提案子 tab 人工更改（模式绑定三律）
- 会话工具面/技能目录恒由预设组合唯一决定，与提案/任务内容无关；断言基 UI 投影面（座位标签 + 工具面/技能目录投影）
- 自动对齐只发生在经绑定入口创建会话的 blank 期；提案模式变更不回溯既有会话预设
- hero 开关（`ui-settings` 行）只控制座位可见性；首启预置后该行归用户运行时修改（设置 UI 保存正常持久化——Step 1c 行使验证）
- 分叉会话投影重建不在 M3 断言面（PRD SC1 收窄为「恢复」——proposal 原文含分叉，收窄已裁决）
