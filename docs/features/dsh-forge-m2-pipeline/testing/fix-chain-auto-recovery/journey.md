---
feature: "dsh-forge-m2-pipeline"
journey: "fix-chain-auto-recovery"
risk_level: "High"
golden_path: false
surface_types: ["web"]
surface_keys: ["web"]
sources:
  - docs/features/dsh-forge-m2-pipeline/prd/prd-user-stories.md
  - docs/features/dsh-forge-m2-pipeline/prd/prd-spec.md
  - docs/proposals/dsh-forge-m2-pipeline/proposal.md
generated: "2026-10-07"
---

# Journey: fix-chain-auto-recovery

**Risk Level**: High

<!-- Risk Classification Criteria:
  High   = Workflow involves state mutation, data loss risk, or irreversible operations
  Medium = Workflow involves multi-step interaction without irreversible side effects
  Low    = Workflow is read-only or purely observational
-->

## Overview

executor 受阻提交 blocked 后，管线自动创建修复任务（fix 链），修复任务完成（或被人工跳过）后源任务自动恢复——单点失败不断链，开发者不必手工搬移状态。（PRD Story 3；业务流程一受阻分支 5–6；SC-M2 门含 fix 链一次）

## Setup

- 任务 X 处于 in_progress 且执行受阻（executor 即将提交 blocked）
- 工作区每工作区任务库可写，审计记录链在场
- 依赖边表无环（健康起点）

## Happy Path

### Step 1: executor 受阻提交 blocked

**User Action**: executor 调 submitTask result=blocked（reason 必带，描述受阻原因）

**Expected Result**: 任务 X in_progress→blocked，reason 落审计；应用不发起任何编排动作

### Step 2: 创建修复任务（fix 链）

**User Action**: executor 调 addTask --block-source 创建修复任务

**Expected Result**: 单事务原子完成三件事——fix 任务行 + 依赖边（源→fix）+ 源任务置 blocked（审计 verb='auto-block'）；三者原子，无半成品

### Step 3: 修复任务执行至完成

**User Action**: 派发链领取 fix 任务并执行（同派发链旅程），executor 质量门全过后 submitTask

**Expected Result**: fix 任务 completed；恢复钩子被触发（blockers 反查后继）

### Step 4: 源任务自动恢复

**User Action**: 恢复钩子触发（无需人工介入）

**Expected Result**: 源任务前置全满足时 blocked→pending（审计 verb='auto-restore'，依赖边保留不删）；恢复行在场（e2e 断言）

### Step 5: 概览三视图与依赖守卫即时反映

**User Action**: 开发者查看概览任务列表 / DAG / 泳道

**Expected Result**: fix 链关系（fix 任务、依赖边、源任务恢复后状态）在写入返回后单次重取即见；DAG 视图呈现源→fix 依赖边

## Edge Cases

### Step 1b: blocked 提交缺 reason

**Precondition**: executor 提交 blocked 但 reason 缺席

**User Action**: executor 调 submitTask result=blocked（无 reason）

**Expected Result**: 拒绝提交；任务状态不变更，不进入 fix 链

### Step 2b: 成环依赖被拒并回报完整环路径

**Precondition**: 试图构造会成环的依赖（addTask 双 flag 组合）

**User Action**: 提交会成环的 addTask

**Expected Result**: 拒绝写入并回报完整环路径；无部分写入（无半成品边）

### Step 2c: fix 链深度超上限

**Precondition**: fix 链深度将超过上限（>6）

**User Action**: 提交 addTask --block-source

**Expected Result**: 拒绝并提示人工介入；链深 ≤6 守卫成立

### Step 4b: 阻塞源被人工跳过同样触发恢复

**Precondition**: 阻塞源 fix 任务被人工跳过（skipped，属终态满足集）

**User Action**: 恢复钩子触发

**Expected Result**: 源任务满足恢复条件（满足集 = {completed, skipped}）→ blocked→pending（审计 verb='auto-restore'）

### Step 4c: 源任务前置未全满足时不恢复

**Precondition**: 恢复钩子触发但源任务除 fix 外另有未终态依赖

**User Action**: 恢复钩子反查后继

**Expected Result**: 源任务不恢复（保持 blocked）；待全部前置终态后再恢复

## Journey Invariants

- fix 链三件套原子性：fix 任务行 + 依赖边 + 源任务置 blocked 于单事务完成，任一失败全部不落
- task_edges 恒无环：成环写入必被拒绝且回报完整环路径
- 依赖终态守卫满足集恒为 {completed, skipped}，恢复判定与领取判定同源
- 自动恢复只改状态不删边（verb='auto-restore' 审计在场，边保留）
- fix 链深度 ≤6：超限拒绝并提示人工介入
