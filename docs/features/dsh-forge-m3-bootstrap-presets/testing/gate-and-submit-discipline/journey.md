---
feature: "dsh-forge-m3-bootstrap-presets"
journey: "gate-and-submit-discipline"
risk_level: "High"
golden_path: false
surface_types: ["web"]
surface_keys: ["web"]
sources:
  - docs/features/dsh-forge-m3-bootstrap-presets/prd/prd-user-stories.md
  - docs/features/dsh-forge-m3-bootstrap-presets/prd/prd-spec.md
  - docs/proposals/dsh-forge-m3-bootstrap-presets/proposal.md
generated: "2026-10-08"
---

# Journey: gate-and-submit-discipline

**Risk Level**: High

<!-- Risk Classification Criteria:
  High   = Workflow involves state mutation, data loss risk, or irreversible operations
  Medium = Workflow involves multi-step interaction without irreversible side effects
  Low    = Workflow is read-only or purely observational
-->

## Overview

单人开发者依赖规格域 gate 兜底与提交定式：带 AC 的任务没有测试证据就提交不了，worker 提交带 commit_hash 且提交信息符合规范（AGENTS.md 约定或常识级 Conventional Commits），gate 类任务产出数字摘要——自举开发的每一步都有质检环，提交历史可审计。（PRD Story 7；关键场景 5；SC7；db-schema §6-24/§6-31 兑付）

## Setup

- 任务带 AC 清单（测试证据义务在场）
- 工作区 AGENTS.md 可配置/移除（两态可切换）
- gate 类型任务在库；git 可提交

## Happy Path

### Step 1: worker 完成任务自检后提交（AGENTS.md 配置态）

**User Action**: worker 完成任务改动与自检（任务 AC / run-tests 配方），在工作区已配置 AGENTS.md（含 commit 约定）的状态下提交并 submitTask

**Expected Result**: 提交信息**从其约定**（AGENTS.md 约定优先）；submitTask 落账，**submit 记录含 commit_hash**

### Step 2: 未配置 AGENTS.md 态提交

**User Action**: 移除 AGENTS.md 后另一任务由 worker 完成并提交

**Expected Result**: 回退**模型常识级 Conventional Commits**；submit 记录含 commit_hash（两态分别断言）

### Step 3: gate 类型任务派发执行并提交

**User Action**: 派发一个 gate 类型任务（如契约面/审计类检查）

**Expected Result**: gate 任务可派发执行；提交时 **gate_json 承载数字摘要落账**（执行记录含量化结果）

## Edge Cases

### Step 1b: 带 AC 任务缺测试证据

**Precondition**: 任务带 AC 清单，worker 未附任何测试证据

**User Action**: worker 调 submitTask 提交（缺测试证据）

**Expected Result**: **拒绝且错误信息含 AC 清单**（功能断言）——worker 可按清单自查补证；任务状态不变更、不落部分审计

### Step 1c: 非法状态转移被拒

**Precondition**: 任务实际状态与 submit 假设不符（如已被转移出 in_progress）

**User Action**: worker 调 submitTask 结算

**Expected Result**: 拒绝并回报校验提示（from 匹配口径）；库状态不被破坏（M2 口径回归）

### Step 2b: 提交信息不符规范

**Precondition**: worker 产出的提交信息不符合约定/常识级规范

**User Action**: worker 尝试以失范信息提交

**Expected Result**: **拒绝**（提交历史可审计——不产生无规范提交）；纠正后可过

### Step 3b: gate 失败走 fix 链

**Precondition**: gate 任务执行结果为失败

**User Action**: gate 失败后观察管线行为

**Expected Result**: **走 fix 链自动恢复**（block_source 单事务 + 恢复钩子——M2 机制回归断言）；失败不丢弃、不静默

## Journey Invariants

- **带 AC 任务无测试证据不得过 submit 门**（错误信息含 AC 清单——自查可修）
- submit 记录恒含 **commit_hash**；提交信息恒符合规范（配置 AGENTS.md 从其约定 / 缺省回退模型常识级 Conventional Commits）
- gate 任务产出**数字摘要**（gate_json 落账）；失败不丢弃——fix 链自动恢复
- 提交历史可审计：每步自举开发都有质检环（证据 + 哈希 + 规范三件套）
