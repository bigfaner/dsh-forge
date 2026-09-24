---
feature: "dsh-forge-m3"
journey: "dual-form-transition"
risk_level: "Medium"
golden_path: false
surface_types: ["web"]
surface_keys: ["web"]
sources:
  - docs/features/dsh-forge-m3/prd/prd-user-stories.md
  - docs/features/dsh-forge-m3/prd/prd-spec.md
  - docs/features/dsh-forge-m3/prd/prd-ui-functions.md
generated: "2026-09-24"
---

# Journey: dual-form-transition

**Risk Level**: Medium

<!-- Risk Classification Criteria:
  High   = Workflow involves state mutation, data loss risk, or irreversible operations
  Medium = Workflow involves multi-step interaction without irreversible side effects
  Low    = Workflow is read-only or purely observational
-->

## Overview

双形态使用者在同一机器并行两种形态:未注册项目在终端全程使用 forge CLI(行为与 M3 之前完全一致),已注册项目切换应用通道后日常任务管线不再依赖冻结 CC 插件(零 spawn 断言);两形态于不同项目交替操作,双方数据与行为互不破坏。

> PRD Traceability: Story 8(过渡双形态不破坏);SC7、SC1;proposal Key Scenarios「过渡双形态」;prd-spec 外围命令归宿表·过渡纪律。

## Setup

- 同一机器备两个独立 fixture 项目:一个未注册 forge 项目(终端 + 冻结 CC 插件形态)、一个已注册并完成 SoT 迁移的应用通道项目
- forge CLI 对未注册项目可用;应用通道项目运行环境就绪(应用 + dsh tool + 宿主)
- spawn/CLI 断言通道 = 进程/日志级(forge CLI 调用与冻结 CC 插件 spawn 可观测;脚本断言)

## Happy Path

### Step 1: 未注册项目全程 CLI 照旧

**User Action**: 用户在终端对未注册项目执行完整 forge 工作流(任务管线:init → 任务操作 → 提交)

**Expected Result**: 行为与 M3 之前完全一致(命令输出/数据格式/插件指令);应用不干预该项目;数据落仓内 forge 文件(CLI 通道照旧)

### Step 2: 已注册项目应用通道日常管线零插件依赖

**User Action**: 在应用内对已注册项目执行日常任务管线(派发 → 执行 → 提交)

**Expected Result**: 全程无冻结 CC 插件 spawn(脚本断言);零 forge CLI 调用(SC1 口径);任务状态回流看板 ≤5s

### Step 3: 双形态交替互不破坏

**User Action**: 在两个项目间交替操作(终端 ↔ 应用,多轮)

**Expected Result**: 双方数据与行为互不破坏;各自任务全集与各通道预期一致;无跨项目串扰/覆盖

## Edge Cases

### Step 1b: 未注册项目的冻结 CC 插件照旧可用

**Precondition**: 未注册项目以冻结 CC 插件(/run-tasks 等指令)跑日常管线

**User Action**: 在 CC 插件内执行任务工作流

**Expected Result**: 照旧可用(过渡期);数据与行为与 M3 之前一致;不受应用通道演进影响

### Step 2b: 已注册项目偶发外部会话操作

**Precondition**: 已注册项目经外部会话(终端/冻结 CC 插件)执行任务操作(过渡期场景)

**User Action**: 回看应用看板与项目数据

**Expected Result**: 外部会话不被硬阻断(过渡期兼容);变更被感知回流看板;跨阶段操作呈现偏离标识(见 stage-gates-cross-phase-context Step 7)

### Step 3b: 交替写入下的数据一致性

**Precondition**: 两项目各自存在进行中变更后进行交替操作

**User Action**: 分别校验两项目的任务全集

**Expected Result**: 各自任务全集一致,无交叉污染;单写者纪律未被破坏(未注册 = CLI 写 forge 文件,已注册 = 数据内核单写者)

## Journey Invariants

- 未注册项目 CLI 行为零变化(与 M3 之前完全一致)
- 已注册项目应用通道日常管线零冻结 CC 插件 spawn、零 forge CLI 调用(进程/日志级断言)
- 双形态数据互不破坏:每个项目恒单写者(未注册 = CLI,已注册 = 数据内核)
- 外部会话过渡期兼容,永不硬阻断(偏离仅呈现)
