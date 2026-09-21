---
feature: "ui-plugin-foundation"
journey: "spike-conclusion-fallback"
risk_level: "Medium"
surface_types: ["web"]
surface_keys: ["web"]
sources:
  - docs/proposals/ui-plugin-foundation/proposal.md
generated: "2026-09-22"
---

# Journey: spike-conclusion-fallback

**Risk Level**: Medium

<!-- Risk Classification Criteria:
  High   = Workflow involves state mutation, data loss risk, or irreversible operations
  Medium = Workflow involves multi-step interaction without irreversible side effects
  Low    = Workflow is read-only or purely observational
-->

<!-- Risk rationale: 多步验证工作流(三项探针 + 分发形态 + 报告落档),操作对象为抛弃型 scratch profile 与临时环境,无不可逆产品副作用;结论门控 M2 设计,返工弹性是核心。

Traceability: proposal.md Key Scenario "spike 推翻假设(error)" + Success Criterion SC4。 -->

## Overview

spike 执行者对装配路线三项未验证项逐一实测/源码级核查,每项以「结论 + 独立退路」两栏落档 spike 报告,并同时落档 hello-world 分发形态结论与离线自足兼容性声明——spike 结论(含推翻假设时的修正路线)门控 M2 设计,不带病开工。

## Setup

- 抛弃型 scratch 环境就绪:可复制的壳 userData profile 目录、可重建的 `dsh web` profile、hello-world 插件可构建产物(含 dev `link:` 与 prod tarball 两种形态)
- 上游本地 checkout SHA `c36ba648`(`0.1.6-alpha.2`)为唯一权威源;spike 报告须将所依赖的源码级事实内联进报告,不传递依赖技术方向文档现状
- 两组 inject 声明素材就绪:最小稳定子集(ui-slots / ui-chat / ui-renderer 核心槽)与 ui-goal 全集(上游实测 7 边)对照
- spike 报告模板含「结论 + 独立退路」两栏结构
- 引用基线钉在技术方向文档 git 提交版 `6f5b109`(2026-09-21)

## Happy Path

### Step 1: 实测项① plugin add 对壳 profile 目录的行为

**User Action**: spike 执行者在 scratch 壳环境的 userData profile 目录上实测 `dsh plugin add`(对照官方 `dsh web` profile 上的行为)

**Expected Result**: 结论落档:对壳自有 profile 目录可用/受限/不可用(以源码级或实测证据);若推翻假设(不可用/受限),独立退路 = 内置 bundle 清单路线(独立于 `plugin add`),同栏落档

### Step 2: 实测项② out-of-tree bundle 的物化解析

**User Action**: spike 执行者实测 profile node_modules 物化对 out-of-tree bundle 的解析细节(dev `link:` 与 prod tarball 两种形态各验一次)

**Expected Result**: 结论落档:两种形态的解析行为(成功路径与边界);若推翻假设(物化失败),独立退路 = npm 发布或 tarball 随包内置(注:两锚解析回答的是 inject 目标解析锚,不构成 ② 的退路),同栏落档

### Step 3: 实测项③ inject 依赖边以非官方包为声明方的语义

**User Action**: spike 执行者以 hello-world(非官方包)为声明方,用最小稳定子集与 ui-goal 全集两组 inject 声明对照实测

**Expected Result**: 结论落档:非官方声明方的完整语义(合法/等价性/限制);子集不合法则退回全集(不误读为「非官方声明方不可行」),独立退路按 DSH Studio 第三方插件既有声明形态调整,同栏落档

### Step 4: 落档分发形态结论与离线自足兼容性

**User Action**: spike 执行者验证 hello-world 到达打包态/离线壳的分发形态(候选:npm 物化 / tarball 内置 / 预播种)并离线启动验证

**Expected Result**: 分发形态结论落档(由 spike 定夺其一);该形态与离线自足 NFR 的兼容性声明显式落档(离线装配+启动全程无网络依赖)

### Step 5: 复核报告并门控 M2 设计

**User Action**: spike 执行者复核 spike 报告:三项各按「结论 + 独立退路」两栏齐备、源码级事实已内联、分发结论与兼容性声明在位;将报告作为 M2 设计的门控输入

**Expected Result**: 报告完整可门控——任一结论推翻假设时,M2 设计采用修正路线/退路;无「结论缺失或单栏」的带病开工路径

## Edge Cases

### Step 1b: 项①被推翻(plugin add 对壳 profile 目录不可用)

**Precondition**: 实测发现 `dsh plugin add` 无法寻址/写入壳自有 profile 目录

**User Action**: spike 执行者按两栏结构落档并核对退路独立性

**Expected Result**: 退路①内置 bundle 清单路线被采用且独立可用(不依赖 `plugin add` 恢复);退路不得从 ②/③ 挪用(npm 发布/tarball 与声明形态调整均不构成 ① 的退路);M2 设计按退路①推进

### Step 2b: 项②被推翻(out-of-tree 物化失败)

**Precondition**: profile node_modules 物化对 out-of-tree bundle 解析失败(dev `link:` 与 prod tarball 均不可用或行为不一致)

**User Action**: spike 执行者落档失败证据与退路

**Expected Result**: 退路②npm 发布或 tarball 随包内置(以打包产物为物化通道)被采用;两锚解析结论单独归档不被误用为 ② 的退路;返工面收敛在 hello-world,不波及 M2 任务面

### Step 3b: 最小稳定子集声明非法(子集不等价于全集)

**Precondition**: 最小稳定子集的 inject 声明被上游机制拒绝或不等价于 ui-goal 全集行为

**User Action**: spike 执行者落档对照结论并切换声明形态复测

**Expected Result**: 退回 ui-goal 全集(7 边)声明照常工作;结论明确区分「子集非法」与「非官方声明方不可行」,防止误读扩大返工面;「只选稳定基座」原则不受影响

### Step 4b: 候选分发形态违反离线自足

**Precondition**: 领先候选形态(如 npm 物化)在离线壳内装配或启动需要网络

**User Action**: spike 执行者离线验证候选形态并落档

**Expected Result**: 兼容性声明如实记录冲突,形态切换到兼容候选(tarball 内置 / 预播种);不允许「带冲突过关」或隐藏网络依赖

### Step 5b: 报告依赖的源码级事实发生文档漂移

**Precondition**: 技术方向文档(Draft 状态)在引用基线 `6f5b109` 之后被修订,事实基漂移

**User Action**: spike 执行者复核报告中的事实内联情况

**Expected Result**: 报告内联的事实锚定 checkout SHA `c36ba648` 自足成立,不传递依赖文档现状;修订记录触发引用处复核的机制被确认,spike 结论不受文档漂移波及

## Journey Invariants

- 三项未验证项每项都以「结论 + 独立退路」两栏落档,退路按项独立、不得互相挪用
- spike 操作只在抛弃型 scratch profile/环境上进行,不污染产品自身的 userData 状态与既有 profile
- 报告内联的源码级事实锚定唯一权威 checkout(SHA `c36ba648` / `0.1.6-alpha.2`),不传递依赖 Draft 文档现状
- spike 结论(含推翻假设的修正路线)先于 M2 UI 插件设计落档——无结论不开工
- 分发形态结论与离线自足 NFR 兼容性声明同报告落档,二者不可拆分
