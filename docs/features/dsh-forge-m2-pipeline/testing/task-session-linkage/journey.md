---
feature: "dsh-forge-m2-pipeline"
journey: "task-session-linkage"
risk_level: "Low"
golden_path: false
surface_types: ["web"]
surface_keys: ["web"]
sources:
  - docs/features/dsh-forge-m2-pipeline/prd/prd-user-stories.md
  - docs/features/dsh-forge-m2-pipeline/prd/prd-spec.md
  - docs/features/dsh-forge-m2-pipeline/prd/prd-ui-functions.md
generated: "2026-10-07"
---

# Journey: task-session-linkage

**Risk Level**: Low

<!-- Risk Classification Criteria:
  High   = Workflow involves state mutation, data loss risk, or irreversible operations
  Medium = Workflow involves multi-step interaction without irreversible side effects
  Low    = Workflow is read-only or purely observational
-->

## Overview

单人开发者双侧看见任务与会话的挂接——会话头部看到该会话挂接的任务、任务行看到挂接的会话，执行痕迹可追溯（哪个任务在哪个会话里做过一目了然）。（PRD Story 6；业务流程四；SC6③；UI Function 3）

## Setup

- 一次完整派发已发生（dispatcher 会话 claim + executor 子会话 submit）
- 挂接表 task_session_links 与审计 task_records 已在每工作区库

## Happy Path

### Step 1: 查看任务行的挂接会话

**User Action**: 在概览任务子 tab 查看该任务行（列表副行 / 详情抽屉挂接区）

**Expected Result**: 挂接会话展示两类且与库一致——派发会话（挂接表）与执行会话（审计记录会话 id），双数据源分别断言

### Step 2: 查看会话头部的挂接任务

**User Action**: 切换到 dispatcher 会话查看会话头部

**Expected Result**: 头部展示挂接任务且与库中挂接行一致（e2e 断言）；pill 分型展示（派发 ⟞ / 执行 ⟞）

### Step 3: 从挂接 pill 定位任务

**User Action**: 点击会话头挂接 pill

**Expected Result**: dock 开概览 tab + 切到任务子 tab + 选中 feature + 任务抽屉打开

### Step 4: 会话切换即时反映

**User Action**: 切换到另一会话查看其头部

**Expected Result**: pill 随 session id 即时变化（不残留上一会话的挂接展示）

## Edge Cases

### Step 1b: 派发与执行会话 id 相异可判

**Precondition**: 完整派发链（dispatcher 主会话 + executor 子会话，S8 实证子会话 id 形态可得）

**User Action**: 查看任务行两类挂接展示

**Expected Result**: 两侧会话 id 相异可判，不混示为同一会话

### Step 2b: 挂接数超限溢出

**Precondition**: 该会话挂接任务数 >2

**User Action**: 查看会话头部 pills

**Expected Result**: ≤2 并排显示，超出以 +N 溢出菜单呈现

### Step 4b: 无挂接会话

**Precondition**: 会话未 claim 过任何任务（无挂接行）

**User Action**: 查看该会话头部

**Expected Result**: 无挂接 pill 展示（不渲染空占位）

## Journey Invariants

- 两侧展示与库记录一致：任务行双数据源（task_session_links = 派发会话；task_records.session_id = 执行会话）分别断言
- 挂接展示为只读浏览面（不写库、不造挂接）
- pill 随 session id 变化（无跨会话残留）
- 挂接数据直读每工作区库（无第二来源）
