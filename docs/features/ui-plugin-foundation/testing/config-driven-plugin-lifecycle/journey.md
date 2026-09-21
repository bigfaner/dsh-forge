---
feature: "ui-plugin-foundation"
journey: "config-driven-plugin-lifecycle"
risk_level: "High"
surface_types: ["web"]
surface_keys: ["web"]
sources:
  - docs/proposals/ui-plugin-foundation/proposal.md
generated: "2026-09-22"
---

# Journey: config-driven-plugin-lifecycle

**Risk Level**: High

<!-- Risk Classification Criteria:
  High   = Workflow involves state mutation, data loss risk, or irreversible operations
  Medium = Workflow involves multi-step interaction without irreversible side effects
  Low    = Workflow is read-only or purely observational
-->

<!-- Risk rationale: 删除条目腿要求清理/失效存量 userData profile 中的既有物化(对投影的破坏性操作);新增条目写产品级配置并物化投影(状态突变)。配置错误可能破坏壳启动。

Traceability: proposal.md Key Scenario "配置增删(happy)" + Success Criterion SC2。 -->

## Overview

产品作者仅通过修改产品级配置在壳内增删 hello-world 插件条目,壳行为随配置变化(新增生效 + 删除清理两层语义各验一次),两次操作的壳代码 diff = 0——配置成为插件树唯一事实源。

## Setup

- dsh-forge 壳可启动,`HOST_PROFILE_BUNDLES` 已迁出壳代码为产品级配置(配置为插件树唯一事实源)
- 存在一个既有 userData profile 投影(「存在即跳过」的写一次语义,配置变更默认不自动传播到存量 profile)
- 对账策略已按 /tech-design 裁决落档(默认回退 = 壳侧启动期差集调和,只做清理/失效、不新增装配通道)
- M1 基线冷启动测量已归档,扩展后的 live-ui-probe 计时口径可用(回归预算:相对 M1 基线增量 ≤ 5% 且绝对值 ≤ 100ms)
- git 工作区干净,可对壳代码 diff 做验证

## Happy Path

### Step 1: 在产品级配置中新增 hello-world 条目

**User Action**: 用户编辑产品级配置,新增 hello-world 插件条目(内置 bundle 形态)

**Expected Result**: 配置文件更新成功;配置仍是插件树唯一事实源,产品清单条目对运行时启停只读

### Step 2: 启动壳验证新增条目生效

**User Action**: 用户启动 dsh-forge 壳

**Expected Result**: 新增条目生效:hello-world 物化进 userData profile 并完成装配,面板在壳内渲染;壳代码 diff = 0(git diff 验证);冷启动在预算内(相对 M1 基线增量 ≤ 5% 且绝对值 ≤ 100ms)

### Step 3: 确认存量投影的写一次语义未被破坏

**User Action**: 用户检查既有 userData profile 投影中未被配置变更涉及的条目

**Expected Result**: 「存在即跳过」的写一次语义保持——既有物化不被推倒重建,其他插件条目的投影保持原状,无损坏

### Step 4: 从产品级配置中删除 hello-world 条目

**User Action**: 用户编辑产品级配置,移除 hello-world 条目并重新启动壳(触发对账)

**Expected Result**: 存量 userData profile 中该条目的既有物化被清理/失效(行为结果验收,不绑定实现);hello-world 不再装配、面板不再渲染;壳代码 diff 仍为 0

### Step 5: 复装条目验证生命周期闭环

**User Action**: 用户把 hello-world 条目重新加回产品级配置并再次启动壳

**Expected Result**: 物化重建、插件重新装配渲染——配置增删是可重复的生命周期操作,清理不留下永久残留状态

## Edge Cases

### Step 1b: 配置文件形态损坏或缺失

**Precondition**: 产品级配置文件不存在、不可读或格式非法

**User Action**: 用户启动壳

**Expected Result**: 壳以显式启动期诊断失败或落入声明的安全默认(不静默装配未知插件树),不出现无诊断的崩溃或半装配状态;错误信息指向配置问题

### Step 2b: 新增条目触发冷启动回归

**Precondition**: 配置化改动使冷启动(主进程拉起到 Webview 首帧)超出预算(相对 M1 基线增量 > 5% 或绝对值 > 100ms)

**User Action**: 用户运行扩展后的 live-ui-probe 计时测量并与基线归档比对

**Expected Result**: 超预算被判定为回归红灯(视为未通过),并同步检查 M1 验收面(SC7 UI 对等、SC9 崩溃恢复)保持绿

### Step 3b: 存量投影与配置条目版本不一致(写一次投影陈旧)

**Precondition**: 存量 profile 中该条目的物化是旧版本(写一次语义下未被更新),配置条目指向新版本

**User Action**: 用户启动壳并观察该条目的装配形态

**Expected Result**: 行为按落档的对账/写一次语义确定且可预测(保持既有物化或按裁决升级),不出现静默的半新半旧装配或投影损坏;M2 UF6 启停读写同一配置的前提不被破坏

### Step 4b: 删除条目在写一次投影上无合法清理通道

**Precondition**: 对账策略两候选(壳侧启动期差集调和 / 上游原生移除通道)均不可行或裁决未落档

**User Action**: 用户执行删除条目并重启壳

**Expected Result**: 按已落档裁决执行清理/失效;若两项机制均不可行,视为 spike 推翻假设同款错误路径——修正路线落档并同步修订 SC2 删除腿口径,不带病开工(不允许静默残留已删条目继续装配)

### Step 4c: 运行时启停试图写入产品清单条目(第二写入方)

**Precondition**: 运行时启停(M2 UF6 预留)或其他写入方试图修改产品级配置的产品清单条目

**User Action**: 用户在壳运行中触发对产品清单条目的写操作

**Expected Result**: 产品清单条目对运行时启停只读——写操作被拒绝或不生效,产品清单不被第二写入方破坏(防第二事实源)

### Step 4d: 对账清理越界(把清理当新增装配通道)

**Precondition**: 壳侧差集调和实现被扩展为不只做清理/失效,还引入新的装配来源

**User Action**: 用户审查对账实现与「不发明旁路」约束的相容性

**Expected Result**: 调和只做清理/失效、不新增装配通道;内置(profile bundle 清单)与运行时(`dsh plugin add`)仍走 dsh 插件机制同一通道,越界实现判为缺陷

## Journey Invariants

- 配置增删两次操作的壳代码 diff = 0(配置是插件树唯一事实源,壳代码常量清单不得回归)
- 产品清单条目对运行时启停只读(产品级配置不被第二写入方破坏)
- 对账/调和只做清理与失效,不发明旁路装配通道(dsh 插件机制为唯一装配机制)
- 配置化改动不引入壳启动回归(冷启动预算内),M1 验收面(SC7/SC9)保持绿
- 离线自足、进程足迹 = 2、无监听端口等 M1 NFR 在增删全程不被破坏
