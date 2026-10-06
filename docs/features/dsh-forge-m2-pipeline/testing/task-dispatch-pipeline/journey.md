---
feature: "dsh-forge-m2-pipeline"
journey: "task-dispatch-pipeline"
risk_level: "High"
golden_path: true
surface_types: ["web"]
surface_keys: ["web"]
sources:
  - docs/features/dsh-forge-m2-pipeline/prd/prd-user-stories.md
  - docs/features/dsh-forge-m2-pipeline/prd/prd-spec.md
  - docs/proposals/dsh-forge-m2-pipeline/proposal.md
generated: "2026-10-07"
---

# Journey: task-dispatch-pipeline

**Risk Level**: High

<!-- Risk Classification Criteria:
  High   = Workflow involves state mutation, data loss risk, or irreversible operations
  Medium = Workflow involves multi-step interaction without irreversible side effects
  Low    = Workflow is read-only or purely observational
-->

## Overview

单人开发者一句话发起 run-tasks，任务管线自动领取就绪任务、派发匿名 executor 执行、质量门通过后落账并提交 git，概览任务列表即时反映新状态——开发者只表达意图，任务状态层自动推进。（PRD Story 2；业务流程一主链；SC-M2 门核心场景；本特性 Golden Path）

## Setup

- 已注册工作区，其每工作区任务库中有某 feature 的就绪任务（前置依赖全部处于终态 {completed, skipped}）
- 工作区代码仓处于可提交状态（git 可用）
- 应用已启动，项目会话可发起技能指令

## Happy Path

### Step 1: 在项目会话中发起 run-tasks

**User Action**: 单人开发者在项目会话中输入 run-tasks 技能指令，表达「让任务管线跑起来」的意图

**Expected Result**: dispatcher 进入派发循环；应用自身不发起任何编排动作（web 无编排逻辑），管线推进全部由 dispatcher 驱动

### Step 2: dispatcher 领取就绪任务

**User Action**: dispatcher 经 claimTask tool 领取任务（无需人工介入）

**Expected Result**: core 前置满足守卫（依赖全到终态）与就绪选择（分支延续优先 + priority → 创建序）通过；任务 pending→in_progress；审计记录（verb='claim'，含派发会话 id + 挂接行）；返回 dispatchPrompt，构成 = 人格段（task-executor，无标签）+ 约束块 + 动态信息块（含 BLOCKERS 依赖快照）+ 类型策略块

### Step 3: dispatcher 同步派发匿名 executor

**User Action**: dispatcher 以 dispatchPrompt 为初始提示词同步派发匿名 executor subagent（阻塞等待）

**Expected Result**: executor 子会话以 dispatchPrompt 为唯一差异化通道启动执行（无 per-spawn 系统提示注入），约束标记原样保留

### Step 4: executor 按简报执行并跑质量门

**User Action**: executor 按简报执行改动，随后依次执行质量门（编译→格式→lint→测试）

**Expected Result**: 质量门四步全部通过，gate 结果可被记录与提交

### Step 5: executor 提交结算落账

**User Action**: executor 调 submitTask（携带 gate 结果 / 执行摘要 / 提交哈希 / 执行会话 id）

**Expected Result**: 任务落账 completed；审计记录（gate 结果 / 执行摘要 / 提交哈希 / 执行会话 id）；git 提交产生

### Step 6: 开发者在概览任务列表确认新状态

**User Action**: 单人开发者打开（或已打开）概览页签查看任务列表

**Expected Result**: 概览列表在写入返回后单次重取即见新值（completed）——「即时」判据成立，无 watch、无同步延迟；数据全部直读每工作区库

## Edge Cases

### Step 2b: 库中无就绪任务

**Precondition**: 库中任务前置均未满足，或全部已处终态，或库中无任务

**User Action**: dispatcher 调 claimTask 尝试领取

**Expected Result**: 无任务被领取（无状态转移），派发循环等待或结束；不制造虚假就绪

### Step 2c: 前置未到终态的任务不可领取

**Precondition**: 某 pending 任务存在未终态前置依赖（满足集 {completed, skipped} 之外的状态）

**User Action**: dispatcher 调 claimTask 尝试领取该任务

**Expected Result**: 依赖终态守卫拒绝放行；不产生部分领取或越序领取

### Step 3b: 非法状态转移被拒（from 不匹配）

**Precondition**: 任务实际状态与动词假设不符（如已被人工转移出 in_progress）

**User Action**: executor 调 submitTask 结算

**Expected Result**: 拒绝并回报校验提示（from 匹配 / record·reason 校验口径）；库状态不被破坏

### Step 5b: 质量门未通过或执行受阻 → blocked 结算

**Precondition**: executor 执行中质量门未通过或执行受阻

**User Action**: executor 调 submitTask result=blocked（reason 必带）

**Expected Result**: 任务 in_progress→blocked（reason 落审计）；应用自身不发起任何编排动作（web 无编排逻辑，代码审计断言）；插件不注册人类通道 tool（transitionTask / transitionFeature——代码审计 0 注册）

### Step 5c: blocked 结算缺 reason

**Precondition**: executor 提交 blocked 但 reason 缺席

**User Action**: executor 调 submitTask result=blocked（无 reason）

**Expected Result**: 拒绝提交（reason 必带校验）；任务状态不变更、不落部分审计

### Step 6b: 派发写入与页签浏览并发

**Precondition**: 概览页签处于打开状态且用户正在浏览（读路径活跃）

**User Action**: 派发链写入动词（claim / submit）发生的同时用户持续浏览概览列表

**Expected Result**: tool 写入与 UI 读取无锁竞争（派发循环与页签浏览互不阻塞）；列表在写入返回后单次重取即见新值

## Journey Invariants

- 每次写动词必产生一行 append-only 审计记录：claim 记派发会话 id，submit 记执行会话 id
- 任务状态唯一来源 = 每工作区库状态机（七态转移矩阵）；所有转移经 core 动词 API 单门（UI 与 tool 同门，无第二写者）
- dispatchPrompt 四段构成恒定：人格段（task-executor，无标签）+ 约束块 + 动态信息块（含 BLOCKERS 快照）+ 类型策略块——executor 唯一差异化通道
- 概览列表数据全部直读每工作区库，无 watch / 回流 / 快照同步模块
- 应用自身不发起编排动作；对代码仓的写入仅限 executor 结算的 git 提交
