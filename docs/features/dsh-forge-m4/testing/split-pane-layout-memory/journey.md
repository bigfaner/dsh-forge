---
feature: "dsh-forge-m4"
journey: "split-pane-layout-memory"
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

# Journey: split-pane-layout-memory

**Risk Level**: Medium

<!-- Risk Classification Criteria:
  High   = Workflow involves state mutation, data loss risk, or irreversible operations
  Medium = Workflow involves multi-step interaction without irreversible side effects
  Low    = Workflow is read-only or purely observational
-->

## Overview

编排者在项目工作台内添加分屏(典型组合:左会话右任务面板/看板),同屏操作多个 pane,拖拽调整比例并收起 subagent 后代列表;离开后重进该项目,pane 结构/比例/收起状态恢复——「重进项目即回到上次观察姿态,不用重新摆布局」的布局记忆工作流(M4 分屏部分;多窗口拆出见 multi-window-tearout 旅程)。

> PRD Traceability: Story 6(分屏观察与布局记忆·分屏部分);SC4(分屏/多窗口);UF9(分屏布局)、UF3(收起状态随项目记忆)、UF2(布局记忆字段);PRD 必答⑨(分屏/多窗口行为)/必答⑧(收起状态);proposal Key Scenarios「分屏/多窗口」。

## Setup

- 已注册项目含会话数据(含带 subagent 后代的 parent 会话)与任务看板/面板数据;工作台头部「分屏」控制可用
- 布局记忆按项目存储可用;断言口径 = 重进恢复(e2e 断言),布局随项目、项目删除时随之清除
- 典型断言组合:会话 + 看板(或任务面板)两 pane 同屏可操作

## Happy Path

### Step 1: 进入单视图默认态

**User Action**: 编排者打开某项目工作台

**Expected Result**: 内容区单视图呈现(single 默认态);此前无布局记忆时无残留布局

### Step 2: 添加分屏并选视图

**User Action**: 经工作台头部「分屏」添加 pane,选择视图(会话 + 任务面板/看板组合)

**Expected Result**: 两视图同屏可见且均可操作(e2e 断言);可选视图 = 当前项目可用的代码区/forge 文件区视图集

### Step 3: 拖拽调整 pane 比例

**User Action**: 拖拽 pane 分隔条调整比例

**Expected Result**: 比例即时生效;各 pane 复用同一视图组件,功能面不变(分屏不改变视图本身)

### Step 4: 收起 subagent 后代

**User Action**: 在左栏 parent 会话行展开/收起 subagent 后代列表

**Expected Result**: 后代默认收起,行尾 ▾ 递归展开;收起/展开状态记入随项目记忆的布局状态

### Step 5: 离开并重进恢复

**User Action**: 离开该项目后重进

**Expected Result**: pane 结构、比例与 subagent 收起状态恢复(重进恢复,e2e 断言);无需重新摆布局

### Step 6: 关闭分屏回到单视图

**User Action**: 关闭一个 pane 至单视图

**Expected Result**: 回到单视图呈现;布局记忆更新为当前结构

## Edge Cases

### Step 2b: 可选视图枚举边界

**Precondition**: 添加 pane 时察看可选视图集

**User Action**: 打开视图选择

**Expected Result**: 仅呈现当前项目可用视图(会话/feature 任务面板/看板类);知识区扩展位视图不出现(未启用即不渲染)

### Step 3b: 比例极值边界

**Precondition**: 分隔条拖至极值

**User Action**: 拖拽分隔条至边界

**Expected Result**: pane 收缩受最小可读宽度约束,不失能、不产生 0 宽死区;松手后布局可继续操作

<!-- surface-web required_outcomes 映射:responsive-layout → pane 比例在窗口尺寸变化下保持可用(最小宽约束),内容不溢出不可读 -->

### Step 5b: 跨项目布局隔离

**Precondition**: 两个项目各自摆过不同布局

**User Action**: 在两项目间切换并重进

**Expected Result**: 项目间布局互不串扰(按项目记忆,各自恢复各自姿态)

### Step 5c: 恢复目标缺失

**Precondition**: 记忆布局中某视图的目标数据已删除(如会话已归档)

**User Action**: 重进项目

**Expected Result**: 恢复不崩溃;缺失目标降级呈现(空态/可替换),其余 pane 正常恢复

### Step 6b: 全部 pane 关闭后重进

**Precondition**: 已关闭全部分屏至单视图

**User Action**: 重进项目

**Expected Result**: 重进恢复单视图(记忆与实际一致),不恢复已关闭的 pane

## Journey Invariants

- 分屏不改变视图本身的功能面(复用同一视图组件)
- 布局状态随项目记忆(pane 结构/比例/subagent 收起状态);项目删除时随之清除
- subagent 后代恒归拢于 parent 血缘树下默认收起,顶层列表永不出现 origin=subagent 条目
- 每组会话 >5 条溢出折叠为「展开其余 N 个会话」;溢出/收起状态随项目记忆
- M1 壳行为(托盘/单实例)不受分屏影响
