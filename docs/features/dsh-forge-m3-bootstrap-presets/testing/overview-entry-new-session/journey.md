---
feature: "dsh-forge-m3-bootstrap-presets"
journey: "overview-entry-new-session"
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

# Journey: overview-entry-new-session

**Risk Level**: Medium

<!-- Risk Classification Criteria:
  High   = Workflow involves state mutation, data loss risk, or irreversible operations
  Medium = Workflow involves multi-step interaction without irreversible side effects
  Low    = Workflow is read-only or purely observational
-->

## Overview

单人开发者从概览的提案/feature 行头点「打开新会话」：自动切到对应模式（feature 固定远征），新会话输入框预填该提案/feature 的现状上下文且不自动发送（留意图空位）；诊断失败与派发指令两路例外自动发送，错误直达修复、派发直达执行。（PRD Story 4A；UF-1/UF-3/UF-4；数据约束 5–7）

## Setup

- 库中存在带 mode 溯源的提案（blitz 与远征各一）与 feature（远征内容，含分层文档）
- 任务子 tab 容器（feature 容器 + 突击提案容器）有任务；存在 blocked / rejected 任务（诊断场景）
- 概览 dock tab 可达；消息输入框可用

## Happy Path

### Step 1: blitz 提案行头点「打开新会话」

**User Action**: 单人开发者在概览提案子 tab 某 mode 溯源 = blitz 的提案行头点「打开新会话」

**Expected Result**: 新会话以突击模式起步（座位标签断言）；消息输入框预填格式化上下文——`@docs/proposals/<标识>/` 第一行 → `名称：` → `摘要：` → `状态：` → `已生成文档：` + `· 路径（状态）` 逐行清单（**不含模式**）——且**不自动发送**；末尾留「我的意图：」空位

### Step 2: 用户补明确意图后手动发送

**User Action**: 单人开发者在预填草稿末尾补一句明确意图并手动发送

**Expected Result**: 会话带现状上下文 + 用户意图开工；预填内容作为消息发出（草稿未被丢弃）

### Step 3: feature 行头点「打开新会话」

**User Action**: 在概览 feature 子 tab 某 feature 行头点「打开新会话」

**Expected Result**: 新会话**固定切远征模式**；输入框预填 `@docs/features/<标识>/` 开头的同构上下文（含阶段与分层文档真实路径清单），同样不自动发送（断言）

### Step 4: 任务子 tab 诊断失败 toast 点「发送给 agent」

**User Action**: 在任务子 tab 点工具栏「诊断」（feature 容器），在失败 toast 中点「发送给 agent」

**Expected Result**: 打开新会话并**自动发送**错误消息（检查项 + 任务键 + 修复指引——错误直达修复例外，断言）；**会话模式 = 任务容器对应模式**（feature 容器 → 远征 / 突击提案直挂任务 → 突击）

### Step 5: 工具栏「派发」按钮（存在未终态任务）

**User Action**: 在任务子 tab 某容器存在未处于终态的任务（待办/执行中/受阻/挂起）时点工具栏「派发」按钮

**Expected Result**: 按钮亮起可点（全部任务终态时置灰——断言）；当前容器无执行中任务 → **新开一个派发会话**（模式 = 容器对应模式：feature → 远征 / 突击提案 → 突击）并**自动发送**派发指令——**「`/run-tasks <容器标识>`」单行最小消息**（只给 dispatchTask 必要信息 = contextSlug；不含所属/摘要/阶段/任务池快照/请求行）

## Edge Cases

### Step 1b: 提案无 mode 溯源

**Precondition**: 经行头入口打开的提案为扫描吸收的旧提案（无溯源字段）

**User Action**: 点其行头「打开新会话」

**Expected Result**: 新会话不切换模式（保持默认远征）；现状上下文预填照常（不自动发送）

### Step 1c: 预填消息体格式边界

**Precondition**: 提案挂有多篇文档（proposal.md 之外任意文档行）

**User Action**: 点行头「打开新会话」后检查输入框草稿

**Expected Result**: 消息体**不含模式行**（模式由会话预设承载）；文档清单 = 相对容器目录的**真实路径** + 状态逐行；末尾「我的意图：」空位在场

### Step 3b: feature 渠道恒远征

**Precondition**: 当前会话语境为突击（或上次打开了 blitz 提案）

**User Action**: 点 feature 行头「打开新会话」

**Expected Result**: 新会话一律固定切远征（feature 固定远征——不随当前语境漂移）；预填含阶段行与分层文档真实路径

### Step 4b: 非失败任务无诊断入口

**Precondition**: 任务状态非 blocked / rejected（如 pending / completed）

**User Action**: 展开该任务行内详情查看动作区

**Expected Result**: 动作区**无「诊断失败」按钮**（仅失败任务出现——断言）

### Step 4c: blocked 任务「诊断失败」→「发送给 agent」

**Precondition**: 某任务状态 = blocked（如 fix 链源任务），有失败记录

**User Action**: 展开详情点「诊断失败」查看失败摘要 toast，再点「发送给 agent」

**Expected Result**: 失败摘要 toast（状态 + 原因 + 最近记录 + 任务键，5s 自消）；发送 = 新会话**自动发送**格式化失败诊断（`@docs/features|proposals/<标识>/` 第一行 + 所属 + 摘要 + [阶段] + 任务键 + 失败记录逐行 + 修复请求——断言）；**会话模式 = 任务容器对应模式**（@path 相应指向 features/ 或 proposals/）

### Step 5b: 全部任务终态

**Precondition**: 当前容器任务全部处于终态（completed / skipped / rejected）

**User Action**: 查看并尝试点击工具栏「派发」按钮

**Expected Result**: 按钮置灰不可点（tooltip 说明）；不新开派发会话、不发送派发指令

### Step 5c: 当前容器存在执行中任务

**Precondition**: 当前容器有正在执行的任务（其派发会话在场）

**User Action**: 点工具栏「派发」按钮

**Expected Result**: **跳转到对应的派发会话**（该任务最新派发挂接·task_session_links/claim 记录）——不新建会话、不重复发送、不切模式（断言）

### Step 5d: 无单任务直接执行入口

**Precondition**: 任务子 tab 任意视图与任务详情

**User Action**: 查看任务行 / 详情动作区寻找单任务执行入口

**Expected Result**: **无单任务直接执行入口**（不支持指定单个任务直接执行——必须按 DAG 依赖顺序领取执行，断言）

## Journey Invariants

- **自动发送例外清单收口** = 诊断两路（feature 子图诊断 + 任务失败诊断）+ 派发指令；「打开新会话」预填一律不自动发送（等待用户明确意图）
- **模式路由恒 = 容器对应模式**：提案渠道 → 提案 mode；feature 渠道 → 固定远征；诊断发送与派发新会话 → 任务容器对应模式
- 消息体以 **@path 引用容器目录锚**（`@docs/proposals/<标识>/` · `@docs/features/<标识>/`）；**不含模式**（由会话预设承载）；派发指令例外 = 「`/run-tasks <容器标识>`」单行最小消息（唯一必要参数 = contextSlug）
- 派发按钮语义恒定：未终态任务在场亮起 / 全部终态置灰；执行中在场跳转既有派发会话（不新建、不重发）
