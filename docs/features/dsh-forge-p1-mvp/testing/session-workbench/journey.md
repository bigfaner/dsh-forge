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

- 已注册两个项目（甲、乙）：甲含至少一个历史会话（完整转录）；乙 = 刚注册、零会话的新项目（供 Step 4b）
- dock 页签 fixture：甲/乙各预置一个项目级页签（甲·页签 / 乙·页签）+ 全局页签常驻，可见集可区分（P1 页签占位为主，UF-7；source: inferred——预置通道 PRD 未定义）
- dsh 会话运行时可用，工作台处于会话视图
- 右栏 dock 可展开（初始默认收起）
- 场景隔离：Step 1c 以全新用户数据目录独立启动，不与基线（甲/乙）叠加

## Happy Path

### Step 1: 首屏呈现三区工作台

**User Action**: 启动应用进入工作台首屏

**Expected Result**: 左栏导航 rail 呈现（品牌行 / 新会话 / 知识库入口 / 项目树 + 会话列表 / 设置入口）；中区会话面板就位；右栏 dock 默认收起（轨道归零）；项目甲会话行以 dsh 行语言呈现（标题 / 状态点 / 相对时间），与 dsh 账本一致（数据来源注记见 Invariant 2）

### Step 2: 发起新会话并完成一次真实往返

**User Action**: 点「新会话」按钮，在对话 tab 输入 fixture 消息「列出当前工作区根目录下的文件」并发送（品牌行同属「新建会话」等价类，本步以按钮为代表，断言及于等价类——source: inferred）

**Expected Result**: 中区切换到会话视图并新建会话；完成一次真实 agent 往返，回答呈现于对话 tab；本轮含 ≥1 次工具调用（fixture 消息保证触发——source: inferred，供 Step 3 断言）

### Step 3: 切「轨迹」tab 查看最简台账

**User Action**: 点会话面板顶部「轨迹」页签

**Expected Result**: 呈现最简台账——本轮消息与 ≥1 条工具调用的时序列表（Step 2 fixture 保证）；切回对话 tab 不重置——探针：Step 2 往返转录仍在原位、会话未重建（标题未变）。知识召回 tab 由兄弟 Journey knowledge-recall-flywheel 承载（流程二第 2 条）

### Step 4: 恢复既有会话（完整转录）

**User Action**: 左栏展开项目甲节点，点击历史会话行

**Expected Result**: 恢复期间呈加载骨架；完成后 Setup 预置历史会话的全部消息与工具调用按时间序完整呈现（「恢复链路」= Story 2 AC2 断言标签，非可观察行为）

### Step 5: 视图互换且右栏状态保留

**User Action**: 展开右栏 dock（可见「甲·页签 + 全局页签」）→ 输入框预输入草稿「待发问题」不发送 → 左栏点「知识库」进入知识视图 → 点 Step 4 会话行切回（覆盖口径：会话行为三切回入口代表——「新会话」/ 品牌行属新建类、Step 2 已行使——断言及于全部入口，source: inferred）

**Expected Result**: 知识模式下右栏隐藏（已展开也隐藏）；切回后右栏按记忆恢复原展开态（页签条仍可见）。保留探针：① 草稿「待发问题」仍在输入框；② Step 4 会话转录仍完整呈现。浏览侧上下文保持由兄弟 Journey knowledge-browsing 承载（本步不种入浏览内容）

### Step 6: 切换项目时 dock 页签跟随且不打断面板

**User Action**: 左栏从项目甲切换到项目乙（衔接 Step 5 终态：右栏展开、甲会话打开）

**Expected Result**: dock 可见页签集切换为「乙·页签 + 全局页签」、不含「甲·页签」（与甲态可区分）；中区面板不打断——探针：会话面板不闪断、不回空态；切回甲时恢复「甲·页签 + 全局页签」且展开态保持

## Edge Cases

### Step 1b: 左栏收起为 56px rail

**Precondition**: 左栏处于展开态（~240px）

**User Action**: 点收起按钮

**Expected Result**: 左栏折叠为 56px rail——图标保留、悬停提示可用；再展开恢复完整导航

### Step 1c: 零项目首用的 rail 空态

**Precondition**: 应用零项目记录（首用状态；依 Setup 场景隔离独立启动）

**User Action**: 启动应用查看左栏与中区

**Expected Result**: rail 呈空态并引导指向中区 hero（UF-2）；中区为 hero 空态 + 「＋添加项目」CTA

### Step 2b: 新会话的空态引导

**Precondition**: 新建会话尚未发送任何消息

**User Action**: 查看对话 tab

**Expected Result**: 呈现引导输入的空会话态

### Step 2c: 空消息发送被拦截（validation-error）

**Precondition**: 对话 tab 输入框为空或仅空白字符

**User Action**: 直接点发送

**Expected Result**: 不发送——无消息上屏、无 agent 往返；空会话引导态保持，焦点仍在输入框（见 Derived Outcomes）

### Step 4b: 项目下「暂无会话」占位

**Precondition**: 打开的是项目乙（Setup 定义：刚注册、零会话）

**User Action**: 左栏展开项目乙节点

**Expected Result**: 项目下呈现「暂无会话」占位（UF-1 States 原文）；不报错、无空列表闪动——source: inferred（UF-1 仅定义占位态，质量项为派生）

### Step 4c: 会话列表加载中骨架

**Precondition**: 会话列表尚未就位（账本查询进行中的瞬态）

**User Action**: 展开项目节点查看会话列表

**Expected Result**: 呈现行级骨架；查询完成后会话行就位

## Derived Outcomes（Web Surface 必察项）

- **validation-error** — 实步覆盖（Step 2c）：唯一输入面 = 会话输入框，空 / 纯空白提交不产生往返与副作用——source: inferred（surface-web required_outcomes 必察项 × UF-4；PRD 未定义空消息行为）
- **session-expired** — N/A：单机产品无登录会话 / 过期概念（PRD 单机安全边界，同兄弟 Journey 口径）；最近邻 = dsh 运行时不可用，属环境故障非过期——source: inferred（必察项 × PRD 安全边界映射）

## Journey Invariants

- 会话面板三页签（对话 / 轨迹 / 知识召回）切换不重置会话状态（规则对三页签整体生效；知识召回 tab 由兄弟 Journey knowledge-recall-flywheel 行使）
- 会话列表呈现与 dsh 账本一致——「实时读、零缓存零副本」为 UF-1 数据契约，属审计通道（代码审查承载），非浏览器可观察断言
- 任何时刻不得出现「知识视图态 + 右栏可见」的状态；隐藏期间右栏状态保留，切回即恢复
- dock 可见页签集恒等于「当前项目页签 + 全局页签」（依 Setup fixture，甲/乙可见集可区分）；切换不打断中区面板
- 会话行点击必须打开对应会话且不重置中区其它视图状态
