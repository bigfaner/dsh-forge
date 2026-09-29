---
feature: "dsh-forge-m4"
journey: "task-session-roundtrip"
risk_level: "Medium"
golden_path: false
surface_types: ["web"]
surface_keys: ["web"]
sources:
  - docs/features/dsh-forge-m4/prd/prd-user-stories.md
  - docs/features/dsh-forge-m4/prd/prd-spec.md
  - docs/features/dsh-forge-m4/prd/prd-ui-functions.md
generated: "2026-09-30"
---

# Journey: task-session-roundtrip

**Risk Level**: Medium

<!-- Risk Classification Criteria:
  High   = Workflow involves state mutation, data loss risk, or irreversible operations
  Medium = Workflow involves multi-step interaction without irreversible side effects
  Low    = Workflow is read-only or purely observational
-->

## Overview

编排者从任务看板打开任务详情 dock,在「挂接历史」节看到 active/ended 完整挂接与经血缘推断识别的执行 subagent 会话,一键打开顶层派发会话(session-focus)或 subagent 会话(dsh 原生 SubagentAddress),并在 subagent 会话视图看到所执行任务的元数据、双向跳回任务详情;执行 subagent 以「任务 id + title」命名,血缘为权威、命名为辅助——这是 M4 任务↔会话互达的主线用户工作流(人侧反查与执行 agent 侧身份识别的合流)。

> PRD Traceability: Story 2(从任务直达执行会话,含 subagent)、Story 7(执行 agent 的任务身份可见);SC7;UF5(任务详情 dock·挂接历史节)、UF6(subagent 会话元数据)、UF3(会话树归拢);PRD 必答⑥(subagent 归拢与反查机制);proposal Key Scenarios「任务↔会话反查」「快速识别(人与 agent)」。

## Setup

- M3 基座可用:任务看板、派发链、session_links;dsh 宿主可用(凭据就绪),subagent 会话通道就绪
- fixture:一个可执行任务(带类型与执行 prompt)已派发——执行体按派发 prompt 注入的命名约定以「任务 id + title」命名 spawn subagent(约定遵循率在 e2e 以固定桩验证,不依赖真实模型自由命名);该任务另具 ≥1 条 ended 挂接(构造挂接历史)
- 断言口径:血缘推断 = 点击时运行时只读计算(≤100ms,超时降级为仅顶层会话);顶层打开走 M1 session-focus,subagent 打开走 dsh 原生 SubagentAddress

## Happy Path

### Step 1: 打开任务详情 dock

**User Action**: 编排者在任务看板点击执行中任务(in_progress 且存在 active 挂接)行

**Expected Result**: 右缘 dock 滑入(现有 TaskDetailPanel 同构形态:min(440px, 45vw)、无遮罩、看板保持可交互、焦点陷阱 Esc/✕/外点关闭并归还焦点);切换任务原地换内容、无闪烁

### Step 2: 查看挂接历史

**User Action**: 察看 dock「挂接历史」节

**Expected Result**: active 与 ended 挂接完整呈现、新→旧排序;ended 行可展开查看历史;会话运行中徽标呈现(active 挂接存在)

### Step 3: 识别执行 subagent 会话

**User Action**: 展开 active 挂接行,察看血缘内执行 subagent 会话标识

**Expected Result**: 血缘推断命中的 origin=subagent 会话被标识,以「任务 id + title」命名展示(命名约定 + 血缘双重校验);推断为运行时只读计算,不落库、可随时重算

### Step 4: 打开顶层派发会话

**User Action**: 点击挂接行的顶层会话条目

**Expected Result**: 经 M1 session-focus 打开该顶层会话并定位到会话视图(e2e 断言)

### Step 5: 打开 subagent 执行会话

**User Action**: 点击执行 subagent 会话条目

**Expected Result**: 经 dsh 原生 SubagentAddress 打开该 subagent 会话;任务→会话打开路径 ≤1 次点击(e2e 断言)

### Step 6: 查看 subagent 会话任务元数据并双向互达

**User Action**: 察看 subagent 会话视图头部任务元数据条,并点击它

**Expected Result**: 元数据条呈现任务号/标题/状态/所属 feature(bound 态);点击跳回任务详情 dock(会话侧 ↔ 任务侧双向互通)

### Step 7: 会话树反向标识

**User Action**: 察看代码区左栏 parent 会话行

**Expected Result**: subagent 会话归拢于 parent 血缘树下默认收起(行尾 ▾ 递归展开),不出现在顶层列表;会话树徽标与任务详情 dock 两侧均能识别该任务归属(反查互证)

## Edge Cases

### Step 1b: 未挂接会话标注

**Precondition**: 任务 in_progress 但无 active 挂接(或全部挂接已 ended)

**User Action**: 打开该任务详情 dock

**Expected Result**: 常规展示 + 「未挂接会话」标注 + 发起入口(no-link 态);不误呈执行 subagent 标识

<!-- surface-web required_outcomes 映射:validation-error → 本旅程无表单输入面,映射为未挂接/目标缺失的错误态呈现(no-link / open-failed) -->

### Step 3b: 血缘内无 subagent 命中

**Precondition**: active 挂接顶层会话血缘树内无 origin=subagent 会话(如顶层会话自身执行)

**User Action**: 点击绑定会话入口

**Expected Result**: 打开动作落到顶层派发会话;不误报 subagent、无空转报错

### Step 3c: 血缘推断超时/失败降级

**Precondition**: 血缘推断计算 >100ms 或失败

**User Action**: 察看挂接历史节/会话树

**Expected Result**: 降级为仅呈现顶层会话 + 血缘标注不可用说明(inference-degraded 态);恢复后自动回完整模式;不阻塞 dock 其余节

### Step 5b: 打开目标缺失

**Precondition**: 待打开会话已不存在或已清理

**User Action**: 点击会话条目

**Expected Result**: 明确错误提示「会话不存在或已清理」(open-failed 态);不静默、不崩溃

<!-- surface-web required_outcomes 映射:session-expired → 宿主/会话通道不可用使打开动作失败,呈现为 open-failed 明确错误 + 恢复引导,不静默 -->

### Step 6b: 多任务共会话粒度局限

**Precondition**: 同一顶层会话连续执行多个任务(一话多任务)

**User Action**: 察看 subagent 会话元数据条

**Expected Result**: 呈「该会话执行中」会话级标注(ambiguous 态);任务级精度为 M5 派发协议重构备注,不误指单一任务

### Step 7b: 命名与血缘冲突

**Precondition**: subagent 会话被手工改名(命名约定被破坏)

**User Action**: 从任务详情与会话树两侧反查

**Expected Result**: 以血缘推断为准,命名仅作辅助展示;归拢/标识/打开均不受改名影响

## Journey Invariants

- 血缘推断为唯一权威且纯只读:不落库、可随时重算;命名(任务 id + title)仅辅助,冲突时以血缘为准
- subagent 会话永不出现在代码区左栏顶层列表;恒归拢于 parent 血缘树下默认收起(SC7 断言)
- 任务→会话打开路径 ≤1 次点击;顶层走 session-focus、subagent 走 SubagentAddress
- dock 与现有 TaskDetailPanel 同构:右缘滑入、无遮罩、看板保持可操作、焦点陷阱关闭并归还焦点
- subagent 会话视图的任务元数据注入不破坏 dsh 原生会话视图功能(零侵入,插件槽位体系内)
- 血缘推断点击时计算 ≤100ms,超时降级为仅顶层会话
