---
feature: "dsh-forge-p1-mvp"
journey: "session-workbench"
risk_level: "Medium"
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

# Journey: session-workbench

**Risk Level**: Medium

<!-- Risk Classification Criteria:
  High   = Workflow involves state mutation, data loss risk, or irreversible operations
  Medium = Workflow involves multi-step interaction without irreversible side effects
  Low    = Workflow is read-only or purely observational
-->

## Overview

单人开发者在原生三区工作台（左栏导航 rail / 中区会话面板 / 右栏 dock）进行真实 dsh 会话：发起新会话完成一次 agent 往返、恢复既有会话看完整转录，并在切换视图（会话 ⇄ 知识库）与切换项目时不丢失面板状态。

**PRD 溯源**: Story 2（全部 3 条 AC：真实往返 / 恢复转录 / 视图与项目切换状态保留）；流程二（prd-spec Business Flow）；UF-1（rail）、UF-4（会话面板三页签）、UF-5（视图互换）、UF-7（dock 页签跟随）；提案 Key Scenario「日常会话」、SC1、SC6①②。

## Setup

- 已注册两个项目（甲、乙），项目甲下存在至少一个历史会话（含完整转录）
- dsh 会话运行时可用，工作台处于会话视图
- 右栏 dock 可展开（初始默认收起）

## Happy Path

### Step 1: 首屏呈现三区工作台

**User Action**: 启动应用进入工作台首屏

**Expected Result**: 左栏导航 rail 呈现（品牌行 / 新会话 / 知识库入口 / 项目树 + 会话列表 / 设置入口）；中区会话面板就位；右栏 dock 默认收起（轨道归零）；会话列表实时读 dsh 账本（标题 / 状态点 / 相对时间）

### Step 2: 发起新会话并完成一次真实往返

**User Action**: 点品牌行（整块 = 新会话快捷）或「新会话」按钮，在对话 tab 输入消息并发送

**Expected Result**: 中区切换到会话视图并新建会话；完成一次真实 agent 往返，回答呈现于对话 tab

### Step 3: 切「轨迹」tab 查看最简台账

**User Action**: 点会话面板顶部「轨迹」页签

**Expected Result**: 呈现最简台账——本轮消息与工具调用的时序列表；切回对话 tab 会话状态不重置

### Step 4: 恢复既有会话（完整转录）

**User Action**: 左栏展开项目甲节点，点击历史会话行

**Expected Result**: 中区打开该会话，转录完整呈现（恢复链路）；恢复期间呈加载骨架

### Step 5: 视图互换且右栏状态保留

**User Action**: 先展开右栏 dock → 左栏点「知识库」进入知识视图 → 再点「新会话」/ 会话行 / 品牌行切回会话视图

**Expected Result**: 知识模式下右栏隐藏（已展开也隐藏，面板状态保留）；切回会话视图后右栏按记忆恢复原展开态；两侧状态（会话上下文 / 浏览上下文）均不丢失

### Step 6: 切换项目时 dock 页签跟随且不打断面板

**User Action**: 左栏从项目甲切换到项目乙

**Expected Result**: dock 可见页签集切换为「当前项目（乙）页签 + 全局页签」；中区面板不打断；切回项目甲时原页签集（含展开状态）恢复

## Edge Cases

### Step 1b: 左栏收起为 56px rail

**Precondition**: 左栏处于展开态（~240px）

**User Action**: 点收起按钮

**Expected Result**: 左栏折叠为 56px rail——图标保留、悬停提示可用；再展开恢复完整导航

### Step 1c: 零项目首用的 rail 空态

**Precondition**: 应用零项目记录（首用状态）

**User Action**: 启动应用查看左栏与中区

**Expected Result**: rail 呈空态并引导指向中区 hero（UF-2）；中区为 hero 空态 + 「＋添加项目」CTA

### Step 2b: 新会话的空态引导

**Precondition**: 新建会话尚未发送任何消息

**User Action**: 查看对话 tab

**Expected Result**: 呈现引导输入的空会话态

### Step 4b: 项目下「暂无会话」占位

**Precondition**: 打开的是新注册项目（无任何会话）

**User Action**: 左栏展开该项目节点

**Expected Result**: 项目下呈现「暂无会话」占位（不报错、无空列表抖动）

### Step 4c: 会话列表加载中骨架

**Precondition**: dsh 账本查询进行时

**User Action**: 展开项目节点查看会话列表

**Expected Result**: 呈现行级骨架；查询完成后会话行就位

## Journey Invariants

- 会话面板三页签（对话 / 轨迹 / 知识召回）切换不重置会话状态
- 会话列表实时读 dsh 账本，零缓存零副本
- 任何时刻不得出现「知识视图态 + 右栏可见」的状态；隐藏期间右栏状态保留，切回即恢复
- dock 可见页签集恒等于「当前项目页签 + 全局页签」；切换不打断中区面板
- 会话行点击必须打开对应会话且不重置中区其它视图状态
