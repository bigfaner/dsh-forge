---
feature: "dsh-forge-m4"
journey: "multi-window-tearout"
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

# Journey: multi-window-tearout

**Risk Level**: Medium

<!-- Risk Classification Criteria:
  High   = Workflow involves state mutation, data loss risk, or irreversible operations
  Medium = Workflow involves multi-step interaction without irreversible side effects
  Low    = Workflow is read-only or purely observational
-->

## Overview

编排者将项目工作台内某视图(会话/看板)拆出为独立窗口,主窗口与独立窗口并行观察与操作、互不干扰,且全部窗口同属同一应用实例(单实例约束不变);关闭独立窗口可收回主窗口;拆出窗口集合随项目记忆,重进恢复拆出态——多窗口并行观察的工作流(M4 多窗口部分;页内分屏见 split-pane-layout-memory 旅程)。

> PRD Traceability: Story 6(分屏观察与布局记忆·多窗口部分);SC4(分屏/多窗口);UF10(多窗口)、UF9(拆出来源 = pane);PRD 必答⑨;proposal Key Scenarios「分屏/多窗口」。

## Setup

- 应用以单实例运行(M1 壳基座:托盘/单实例语义继承);已注册项目含会话与看板数据;分屏布局可用(拆出来源 = pane)
- 断言口径:主窗口与独立窗口并行操作互不干扰且同属单实例(e2e 断言);布局记忆 = 主窗口 pane 结构 + 拆出窗口集合,随项目存储

## Happy Path

### Step 1: 选中待拆出视图

**User Action**: 编排者在分屏工作台内选中某 pane(如看板视图),打开 pane 操作菜单

**Expected Result**: 「拆出为窗口」动作可用(拆出来源 = 工作台 pane)

### Step 2: 拆出为独立窗口

**User Action**: 点击「拆出为窗口」

**Expected Result**: 该视图迁入新独立窗口;主窗口 pane 结构让位更新;拆出窗口集合记入布局记忆

### Step 3: 并行观察与操作

**User Action**: 在主窗口操作会话、同时在独立窗口操作看板

**Expected Result**: 两侧互不干扰(操作互不抢占、状态互不串扰)(e2e 断言);两窗口呈现同一数据内核的派生视图

### Step 4: 关闭独立窗口并收回

**User Action**: 关闭独立窗口,选择收回主窗口

**Expected Result**: 视图收回主窗口 pane;布局记忆更新为收回后结构

### Step 5: 重进恢复拆出态

**User Action**: 离开后重进该项目

**Expected Result**: 拆出窗口集合随项目记忆恢复(布局记忆的一部分);恢复态与离开时一致

## Edge Cases

### Step 1b: 单实例边界

**Precondition**: 已存在拆出的独立窗口

**User Action**: 从操作系统再次启动应用

**Expected Result**: 单实例语义保持(M1 继承):不产生第二实例,聚焦既有实例;全部窗口同属单实例(断言)

### Step 2b: 拆出后主窗口 pane 让位

**Precondition**: 被拆出视图原占主窗口唯一内容 pane

**User Action**: 拆出该视图

**Expected Result**: 主窗口按布局规则让位呈现,不出现空白主窗口死区;布局记忆与实际一致

### Step 3b: 并行操作同一数据

**Precondition**: 主窗口与独立窗口呈现同一项目数据(如同一任务状态面)

**User Action**: 两侧并行观察与操作

**Expected Result**: 状态以数据内核为事实源,两侧一致更新、互不覆盖互不丢失

### Step 4b: 直接关闭不收回

**Precondition**: 用户直接关闭独立窗口(不经收回动作)

**User Action**: 关闭独立窗口后重进项目

**Expected Result**: 布局记忆与实际窗口集一致;不恢复已关窗口、不残留不可达窗口引用

### Step 5b: 恢复时目标缺失

**Precondition**: 拆出窗口记忆中的视图目标数据已删除

**User Action**: 重进项目触发恢复

**Expected Result**: 降级呈现、不崩溃;其余布局正常恢复

## Journey Invariants

- 全部窗口(主窗口 + 独立窗口)同属单实例;关闭主窗口 = 退出应用(M1 语义继承)
- 布局记忆 = 主窗口 pane 结构 + 拆出窗口集合,随项目存储;项目删除时随之清除
- 并行操作互不干扰;数据内核恒为事实源,窗口内容为派生视图
- 拆出/收回均更新布局记忆;记忆与实际窗口集恒一致
- 多窗口不改变 M1 壳行为(托盘/单实例)
