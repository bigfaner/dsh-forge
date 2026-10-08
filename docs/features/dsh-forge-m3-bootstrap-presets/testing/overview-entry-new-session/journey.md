---
feature: "dsh-forge-m3-bootstrap-presets"
journey: "overview-entry-new-session"
risk_level: "High"
golden_path: false
surface_types: ["web"]
surface_keys: ["web"]
sources:
  - docs/features/dsh-forge-m3-bootstrap-presets/prd/prd-user-stories.md
  - docs/features/dsh-forge-m3-bootstrap-presets/prd/prd-spec.md
  - docs/features/dsh-forge-m3-bootstrap-presets/prd/prd-ui-functions.md
  - docs/proposals/dsh-forge-m3-bootstrap-presets/proposal.md
generated: "2026-10-08"
---

# Journey: overview-entry-new-session

**Risk Level**: High

<!-- Risk Classification Criteria:
  High   = Workflow involves state mutation, data loss risk, or irreversible operations
  Medium = Workflow involves multi-step interaction without irreversible side effects
  Low    = Workflow is read-only or purely observational
-->

<!-- 判级注记：Step 5 派发指令自动发送触发 run-tasks 派发循环 → worker 执行（任务状态迁移、代码提交）——实质状态变更的自动化执行链；诊断两路自动发送直达修复同域。可回退/可审计，但按上述标准判 High。 -->

## Overview

单人开发者从概览的提案/feature 行头点「打开新会话」：自动切到对应模式（feature 固定远征），新会话输入框预填该提案/feature 的现状上下文且不自动发送（留意图空位）；诊断失败与派发指令两路例外自动发送，错误直达修复、派发直达执行。（PRD Story 4A；UF-1/UF-3/UF-4；数据约束 5–7）

## 测试策略分工（web surface 50/50）

本旅程承担 web surface 50/50 测试策略的 **Journey 半**：18 步全为用户经概览三子 tab 的入口工作流（行头打开、预填草稿、诊断 toast、派发按钮双路由），断言基 UI 面（座位标签 / 输入框草稿 / toast / 按钮态）。**Contract 半**（消息体格式/模式路由的数据契约）由下游 gen-contracts 从各步 Expected Result 抽取为 per-step 多前置分支（如 Step 5/5b/5c 三分支、Step 4/4d 两分支）。每步「观察通道」行显式标注断言落点。

## Setup

- 库中存在带 mode 溯源的提案——blitz 与远征各一（Step 1 / Step 1d 两渠道），及一个 feature（远征内容，含分层文档）
- 一个扫描吸收的无溯源旧提案在场（Step 1b）；一个挂多篇文档的提案在场（Step 1c）
- feature 容器存在**结构违规的子图夹具**（如依赖环——消息体示例④形态：1.3→1.4→1.3——使工具栏「诊断」失败 toast 确定性触发；blocked/rejected 是任务域合法态，不必然构成五类检查违规）［source: inferred——夹具语义：validateFeatureTasks 五类检查针对结构违规，须以真实违规子图承载 Step 4，否则该步恒绿］
- 存在 blocked / rejected 且带失败记录的任务（Step 4c 任务失败诊断场景——任务级诊断入口由任务状态触发，与子图诊断夹具分立）
- 概览 dock tab 可达；消息输入框可用

## Happy Path

### Step 1: blitz 提案行头点「打开新会话」

**Precondition**: mode 溯源 = blitz 的提案在场（Setup）

**User Action**: 单人开发者在概览提案子 tab 该提案行头点「打开新会话」

**Expected Result**: 新会话以突击模式起步（座位标签断言口径）；消息输入框预填格式化上下文——`@docs/proposals/<标识>/` 第一行 → `名称：` → `摘要：` → `状态：` → `已生成文档：` + `· 路径（状态）` 逐行清单（**不含模式**）——且**不自动发送**；末尾留「我的意图：」空位

**观察通道**: web 面（座位标签 + 输入框草稿内容）

### Step 2: 用户补明确意图后手动发送

**Precondition**: Step 1 的预填草稿在场（未发送）

**User Action**: 单人开发者在预填草稿末尾补一句明确意图并手动发送

**Expected Result**: 首条消息 = 预填上下文 + 用户意图全文（会话转录可见——预填内容作为消息发出，草稿未被丢弃）［source: inferred——预填目标 = 输入框草稿（UF-1 第 4 条），手动发送 = 草稿整体成为消息体，无丢弃路径］

**观察通道**: web 面（会话消息流首条内容）

### Step 3: feature 行头点「打开新会话」

**Precondition**: feature 在场（Setup，远征内容）

**User Action**: 在概览 feature 子 tab 该 feature 行头点「打开新会话」

**Expected Result**: 新会话**固定切远征模式**；输入框预填 `@docs/features/<标识>/` 开头的同构上下文（含阶段与分层文档真实路径清单），同样不自动发送

**观察通道**: web 面（座位标签 + 输入框草稿）

### Step 4: 任务子 tab 诊断失败 toast 点「发送给 agent」

**Precondition**: 当前 feature 容器子图存在结构违规（Setup 夹具——依赖环形态）

**User Action**: 在任务子 tab 点工具栏「诊断」（feature 容器），在失败 toast 中点「发送给 agent」

**Expected Result**: 打开新会话并**自动发送**格式化失败诊断——`@docs/features/<标识>/` 第一行 → `所属：` → `摘要：` → `[阶段：]` → `诊断：validateFeatureTasks 失败` + 五类检查逐行（✗ 项含任务键与违规描述）→ `请求：请排查修复`（UF-3 第 4 条/消息体示例④）；**会话模式 = 远征**（工具栏「诊断」为 feature 容器专属——UF-3 第 6 条/数据约束 3：突击容器无 feature 子图「诊断」按钮，本路径无突击分支；突击提案直挂任务的模式路由由 Step 4c 任务失败诊断承载）

**观察通道**: web 面（toast 内容 + 新会话模式与自动发送消息体）

### Step 5: 工具栏「派发」按钮（存在未终态任务）

**Precondition**: 当前容器存在未处于终态的任务（待办/执行中/受阻/挂起）且无正在执行的任务

**User Action**: 点工具栏「派发」按钮

**Expected Result**: 按钮亮起可点；点击 → **新开一个派发会话**（模式 = 容器对应模式：feature → 远征 / 突击提案 → 突击）并**自动发送**派发指令——**「`/run-tasks <容器标识>`」单行最小消息**（只给 dispatchTask 必要信息 = contextSlug；不含所属/摘要/阶段/任务池快照/请求行——v23 裁决；终态置灰与执行中跳转两分支见 Step 5b/5c）

**观察通道**: web 面（按钮态 + 新会话模式 + 自动发送消息）

## Edge Cases

### Step 1b: 提案无 mode 溯源

**Precondition**: 经行头入口打开的提案为扫描吸收的旧提案（无溯源字段——Setup 在场）

**User Action**: 点其行头「打开新会话」

**Expected Result**: 新会话不切换模式（保持默认远征）［source: inferred——「不切换」为 UF-1 第 4 条原词；「保持远征」由 registry 默认 = 远征（SC1）补足］；现状上下文预填照常（不自动发送）；提案行 mode chip 显示缺省占位

**观察通道**: web 面（座位标签 + 草稿 + mode chip）

### Step 1c: 预填消息体格式边界

**Precondition**: 提案挂有多篇文档（proposal.md 之外任意文档行——Setup 在场）

**User Action**: 点行头「打开新会话」后检查输入框草稿

**Expected Result**: 消息体**不含模式行**（模式由会话预设承载）；文档清单 = 相对容器目录的**真实路径** + 状态逐行；末尾「我的意图：」空位在场

**观察通道**: web 面（草稿逐行内容）

### Step 1d: 远征提案行头对齐

**Precondition**: mode 溯源 = expedition 的提案在场（Setup）

**User Action**: 点该远征提案行头「打开新会话」

**Expected Result**: 新会话以远征模式起步（对齐提案 mode）；预填 `@docs/proposals/<标识>/` 上下文、不自动发送（与 Step 1 同构、仅模式不同）

**观察通道**: web 面（座位标签 + 草稿）

### Step 1e: 连续两次「打开新会话」的草稿独立性

**Precondition**: Step 1 会话的预填草稿未发送

**User Action**: 不发送，再从另一行头（如 feature 行）点「打开新会话」

**Expected Result**: 新开第二个会话、其输入框预填该渠道上下文；第一会话的草稿原样保留（会话间输入框独立——新开不覆盖/不清空既有会话草稿）［source: inferred——预填目标 = 各新会话自身输入框（UF-1 第 4 条），会话间无共享输入框语义］；两会话均常驻可回访（中区会话面常驻——Page Composition）

**观察通道**: web 面（两会话输入框草稿各自在场）

### Step 2b: 空意图直接发送

**Precondition**: Step 1 的预填草稿在场、用户未补写意图

**User Action**: 不补意图直接手动发送

**Expected Result**: 消息照常发出（预填上下文即消息体——「我的意图：」后为空）；无字段级校验拦截、无近场报错（消息输入框为自由文本会话输入、非受控表单——validation-error 裁决见 Derived Outcomes 节）［source: inferred——输入框无字段校验语义；UF-1 第 4 条只约定「等待用户输入明确意图后手动发送」，未设强制门，空意图发送 = 合法消息］

**观察通道**: web 面（消息流内容）

### Step 3b: feature 渠道恒远征

**Precondition**: 当前会话语境为突击（或上次打开了 blitz 提案）

**User Action**: 点 feature 行头「打开新会话」

**Expected Result**: 新会话一律固定切远征（feature 固定远征——不随当前语境漂移）；预填含阶段行与分层文档真实路径

**观察通道**: web 面（座位标签 + 草稿）

### Step 4b: 非失败任务无诊断入口

**Precondition**: 任务状态非 blocked / rejected（如 pending / completed）

**User Action**: 展开该任务行内详情查看动作区

**Expected Result**: 动作区**无「诊断失败」按钮**（仅失败任务出现）；详情其余动作照常在场（观察面有效性对照）

**观察通道**: web 面（负向可用性 + 阳性对照）

### Step 4c: blocked 任务「诊断失败」→「发送给 agent」

**Precondition**: 某任务状态 = blocked（如 fix 链源任务）且有失败记录（Setup）

**User Action**: 展开详情点「诊断失败」查看失败摘要 toast，再点「发送给 agent」

**Expected Result**: 失败摘要 toast（状态 + 原因 + 最近记录 + 任务键，5s 自消）；发送 = 新会话**自动发送**格式化失败诊断（`@docs/features|proposals/<标识>/` 第一行 + 所属 + 摘要 + [阶段] + 任务键 + 失败记录逐行 + 修复请求）；**会话模式 = 任务容器对应模式**（feature 容器 → 远征 / 突击提案直挂任务 → 突击——@path 相应指向 features/ 或 proposals/）。异步口径：点击须落在 5s toast 窗口内；窗口过期后可重开——「诊断失败」按钮常驻 blocked/rejected 详情动作区，重展开详情再点即重开结果 toast［source: inferred——按钮常驻（UF-3 第 5 条），重开通道 = 按钮再点］

**观察通道**: web 面（toast 内容/时序 + 新会话模式与消息体）

### Step 4d: 诊断成功路径

**Precondition**: feature 容器子图五类检查全绿（健康容器）

**User Action**: 点工具栏「诊断」

**Expected Result**: 成功 toast「子图健康 ✓」**1s 自动消失**；无「发送给 agent」按钮、不新开会话（成功路径无自动发送）

**观察通道**: web 面（toast 出现/消失双相等待）

### Step 4e: 突击容器无「诊断」按钮

**Precondition**: 容器 pill 选中突击提案容器（任务直挂）

**User Action**: 查看任务子 tab 工具栏右簇

**Expected Result**: 无「诊断」按钮（validateFeatureTasks 为 feature 域校验——UF-3 第 6 条/数据约束 3）；「派发」按钮与任务级「诊断失败」入口仍可用（阳性对照——工具栏其余控件在场）

**观察通道**: web 面（负向可用性 + 阳性对照）

### Step 5b: 全部任务终态

**Precondition**: 当前容器任务全部处于终态（completed / skipped / rejected）

**User Action**: 查看并尝试点击工具栏「派发」按钮

**Expected Result**: 按钮置灰不可点（tooltip 说明）；不新开派发会话、不发送派发指令

**观察通道**: web 面（按钮态 + tooltip）

### Step 5c: 当前容器存在执行中任务

**Precondition**: 当前容器有正在执行的任务（其派发会话在场）

**User Action**: 点工具栏「派发」按钮

**Expected Result**: **跳转到对应的派发会话**（该任务最新派发挂接——task_session_links/claim 记录）：不新建会话、不重复发送、不切模式

**观察通道**: web 面（会话切换落点）

### Step 5d: 无单任务直接执行入口

**Precondition**: 任务子 tab 任意视图与任务详情

**User Action**: 查看任务行 / 详情动作区寻找单任务执行入口

**Expected Result**: **无单任务直接执行入口**（不支持指定单个任务直接执行——必须按 DAG 依赖顺序领取执行）；视图切换/详情展开等其余动作照常在场（观察面有效性对照）

**观察通道**: web 面（负向可用性 + 阳性对照）

## Derived Outcomes 裁决（web surface 规则）

依 gen-journeys surface-web 规则 Required Outcome Reference（每条 Web Journey 必须考虑以下派生 Outcome），逐项裁决：

- **validation-error**: **N/A（已考虑）+ 近似物显式映射 + 边界步定义**。本旅程表单面 = 消息输入框（自由文本会话输入，非受控表单字段）——字段级校验形态（近场报错、表单不提交、可更正重试）不适用；空意图发送的行为已显式定义于 Step 2b（无拦截、消息照常发出）。最近似物（已识别、非派生本体）：Step 5b 派发按钮置灰 + tooltip = 状态门控反馈；Step 4b/4e 动作区无按钮 = 负向可用性［source: inferred——surface-web validation-error 规则考虑记录；边界承载步 = Step 2b］
- **session-expired**: **适配在场（本地化 = 草稿/会话连续性）**。产品为本地单人工作台，无登录态与服务端会话凭据，登录过期形态 N/A；规则语义「unsaved data preserved or user warned」的本地化派生 = Step 1e（连续两次「打开新会话」——既有会话未发送草稿保留、不被新开覆盖）+ 会话常驻可回访（中区会话面常驻——Page Composition）［source: inferred——surface-web session-expired 规则本地化映射；承载步 = Step 1e］

## Journey Invariants

- **自动发送例外清单收口** = 诊断两路（feature 子图诊断 + 任务失败诊断）+ 派发指令；「打开新会话」预填一律不自动发送（等待用户明确意图）
- **模式路由恒 = 容器对应模式**：提案渠道 → 提案 mode（无溯源 → 不切换）；feature 渠道 → 固定远征；任务失败诊断发送与派发新会话 → 任务容器对应模式；feature 子图诊断为 feature 容器专属 → 恒远征（Step 4/4e 口径收窄）
- 消息体以 **@path 引用容器目录锚**（`@docs/proposals/<标识>/` · `@docs/features/<标识>/`）；**不含模式**（由会话预设承载）；派发指令例外 = 「`/run-tasks <容器标识>`」单行最小消息（唯一必要参数 = contextSlug）
- 派发按钮语义恒定：未终态任务在场亮起 / 全部终态置灰；执行中在场跳转既有派发会话（不新建、不重发）
