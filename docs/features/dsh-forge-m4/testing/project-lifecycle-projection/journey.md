---
feature: "dsh-forge-m4"
journey: "project-lifecycle-projection"
risk_level: "High"
golden_path: false
surface_types: ["web"]
surface_keys: ["web"]
sources:
  - docs/features/dsh-forge-m4/prd/prd-user-stories.md
  - docs/features/dsh-forge-m4/prd/prd-spec.md
  - docs/features/dsh-forge-m4/prd/prd-ui-functions.md
generated: "2026-09-30"
---

# Journey: project-lifecycle-projection

**Risk Level**: High

<!-- Risk Classification Criteria:
  High   = Workflow involves state mutation, data loss risk, or irreversible operations
  Medium = Workflow involves multi-step interaction without irreversible side effects
  Low    = Workflow is read-only or purely observational
-->

## Overview

编排者在项目设置「投影与生命周期」节查看投影状态并执行项目生命周期操作:改名(投影同步改名、分组保持)、归档(forge 侧移入归档分区、dsh 侧 workspace 保留、会话仍按项目分组)、恢复(投影不变化)、删除(经确认对话、workspace 移除、会话退未分组且历史不删除、布局记忆清除);dsh 侧手工变更不回流、仅偏差提示——这是「归档 ≠ 删除」语义的运行载体。

> PRD Traceability: Story 5(归档不丢历史、改名不丢归组);SC3(单向投影·归档/删除/偏差);UF8(项目设置·投影与归档)、UF1(归档分区);PRD 必答④(投影语义)/必答⑤(归档与删除语义);proposal Key Scenarios「改名/归档」「错误路径」。

## Setup

- 已注册 ≥2 个项目:其一为生命周期承载项目(含会话、布局记忆与归档前数据);投影健康(对账一致)
- 测试可操控 dsh 侧数据面(手工改名/删除/乱序 workspace,供偏差构造)
- 断言口径:归档 ≠ 删除;偏差仅提示,任何入口不得触发反向写;删除后布局记忆随之清除;投影操作 ≤2s

## Happy Path

### Step 1: 查看投影状态

**User Action**: 编排者打开项目设置「投影与生命周期」节

**Expected Result**: 投影状态 healthy(对账一致);生命周期动作(改名/归档/恢复/删除)与归档语义说明呈现

### Step 2: 改名项目

**User Action**: 修改项目名并确认

**Expected Result**: forge 侧项目名更新;投影同步改名 → dsh 侧 workspace 同名(断言);会话分组随 workspace 保持;改名本身不被投影失败阻断(本地生效)

### Step 3: 归档项目

**User Action**: 执行归档并确认

**Expected Result**: forge 侧项目移入归档分区(左栏降透明只读),项目会话列表不再展示(断言);dsh 侧 workspace 保留,会话仍按该项目 workspace 分组(断言,历史可按组找回)

### Step 4: 恢复归档项目

**User Action**: 经归档行菜单/设置恢复项目

**Expected Result**: 项目移回活跃区;投影不变化(workspace 未移除,会话分组保持)

### Step 5: 删除项目

**User Action**: 对归档项目执行删除并经确认对话

**Expected Result**: forge 侧项目条目删除;dsh 侧 workspace 移除(断言);会话按 dsh 语义退为未分组且历史不删除(断言);该项目布局记忆随之清除

## Edge Cases

### Step 1b: 投影降级态

**Precondition**: 投影写入曾失败(workspace 不可写)

**User Action**: 打开项目设置察看投影状态

**Expected Result**: degraded 态降级提示 + 手动「重试投影」入口;生命周期操作不被阻断;恢复后重试成功即两侧一致

### Step 1c: dsh 侧手工改名偏差

**Precondition**: dsh 侧手工改了某 workspace 名

**User Action**: 启动/刷新触发对账,察看 forge 侧

**Expected Result**: 偏差提示(deviation 明细:差异事实 + 处理建议);不回流,任何入口不触发反向写(断言)

### Step 1d: dsh 侧手工删除/乱序偏差

**Precondition**: dsh 侧手工删除 workspace 或打乱顺序

**User Action**: 启动/刷新触发对账,察看 forge 侧

**Expected Result**: deviation 偏差明细呈现;forge 侧权威数据不被改动

### Step 2b: 改名投影失败

**Precondition**: 改名时投影通道失败

**User Action**: 确认改名

**Expected Result**: 改名本地生效不被阻断;投影待重试(降级态);两侧最终一致可达成

### Step 3b: 归档分区呈现细节

**Precondition**: 存在归档项目

**User Action**: 察看左栏全项目树归档分区与工作台

**Expected Result**: 归档项目降透明只读、不挂会话;恢复/删除经行菜单;该项目会话列表不再展示(断言)

### Step 5b: 删除当前活跃项目

**Precondition**: 被删项目为当前活跃项目

**User Action**: 经确认对话删除

**Expected Result**: 删除完成;工作台落到其余项目或空态,不指向已删 id

### Step 5c: 布局记忆清除断言

**Precondition**: 被删项目存有布局记忆(pane 结构/收起状态/拆出窗口集合)

**User Action**: 删除后察看其余项目与重进行为

**Expected Result**: 该项目布局记忆随之清除,无孤儿布局残留;其余项目布局不受影响

## Journey Invariants

- 归档 ≠ 删除:归档恒保留 workspace 与按项目分组;删除才移除投影,且会话历史永不删除
- 单向投影:任何入口不得触发 dsh→forge 反向写;dsh 侧手改仅呈现偏差提示
- 删除必经确认对话;删除后布局记忆随之清除
- 生命周期操作(注册/改名/归档)不被投影失败阻断(降级承诺,提供手动重试)
- 投影不迁移、不删除 dsh 侧既有 workspace 之外的数据;未注册目录既有会话仍显示未分组(不破坏)
- 投影操作(注册/改名/归档/删除)同步完成 ≤2s(失败降级不阻断)
