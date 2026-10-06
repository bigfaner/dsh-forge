---
feature: "dsh-forge-m2-pipeline"
journey: "interrupted-dispatch-recovery"
risk_level: "Medium"
golden_path: false
surface_types: ["web"]
surface_keys: ["web"]
sources:
  - docs/features/dsh-forge-m2-pipeline/prd/prd-user-stories.md
  - docs/features/dsh-forge-m2-pipeline/prd/prd-spec.md
  - docs/proposals/dsh-forge-m2-pipeline/proposal.md
generated: "2026-10-07"
---

# Journey: interrupted-dispatch-recovery

**Risk Level**: Medium

<!-- Risk Classification Criteria:
  High   = Workflow involves state mutation, data loss risk, or irreversible operations
  Medium = Workflow involves multi-step interaction without irreversible side effects
  Low    = Workflow is read-only or purely observational
-->

## Overview

executor 子会话中断后，dispatcher 外环重新领取同一任务并拿到按当前状态重新合成的执行简报——中断只损失时间不损失状态，无需人工清理。（PRD Story 4；业务流程一中断恢复分支；SC-M2 门含模拟中断恢复一次）

## Setup

- 任务处于 in_progress 但其执行记录缺失（模拟 executor 子会话中断）
- dispatcher 外环活跃（run-tasks 派发循环在运行）
- 中断前该任务曾领取过（有历史 claim 审计行）

## Happy Path

### Step 1: dispatcher 外环再次领取同一任务

**User Action**: dispatcher 在外环中对执行记录缺失的 in_progress 任务再次调 claimTask（无需人工察觉中断）

**Expected Result**: claimTask 对 in_progress 幂等重入——无状态转移（仍 in_progress）

### Step 2: 领取重新合成的执行简报

**User Action**: dispatcher 接收 claimTask 的返回

**Expected Result**: 返回按当前状态重新合成的 dispatchPrompt（动态信息块按当前库状态实时取数）；digest 新值（与中断前简报相异可判）

### Step 3: executor 按重派简报继续执行并结算

**User Action**: dispatcher 以重派简报派发 executor，executor 完成执行后 submitTask

**Expected Result**: 任务正常落账（completed + 审计 + git 提交）；链路自愈完成，全程无需人工清理

## Edge Cases

### Step 1b: 执行记录在场的任务不误重派

**Precondition**: 任务 in_progress 且执行记录在场（executor 正常执行中，record 未缺失）

**User Action**: dispatcher 外环调 claimTask 尝试领取

**Expected Result**: 按 record 在场判定非中断态，不触发重派路径；不产生重复派发或重复执行

### Step 2b: 连续多次中断反复幂等重入

**Precondition**: 同一任务连续多次中断（执行记录持续缺失）

**User Action**: dispatcher 外环多次 claimTask 同一任务

**Expected Result**: 每次均无状态转移（仍 in_progress），每次返回重合成简报；不产生重复转移记录

### Step 3b: 中断期间任务已被人工处置

**Precondition**: 中断期间任务被人工转移（如人工置 blocked 或 skipped）

**User Action**: dispatcher 外环 claimTask 同一任务

**Expected Result**: 状态机转移校验拒绝非法领取（from 不匹配）；人工处置结果不被覆盖

## Journey Invariants

- 中断恢复零人工清理：全程无人工介入即可续链（恢复出口 = dispatcher 外环）
- 幂等重入不产生状态转移与重复结算（任务保持 in_progress）
- 重派简报按当前状态重合成（digest 新值），dispatchPrompt 四段构成不变
- 审计链 append-only：中断与恢复不篡改既有记录
