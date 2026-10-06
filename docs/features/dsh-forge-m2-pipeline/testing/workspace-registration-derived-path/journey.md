---
feature: "dsh-forge-m2-pipeline"
journey: "workspace-registration-derived-path"
risk_level: "High"
golden_path: false
surface_types: ["web"]
surface_keys: ["web"]
sources:
  - docs/features/dsh-forge-m2-pipeline/prd/prd-user-stories.md
  - docs/features/dsh-forge-m2-pipeline/prd/prd-spec.md
  - docs/features/dsh-forge-m2-pipeline/prd/prd-ui-functions.md
generated: "2026-10-07"
---

# Journey: workspace-registration-derived-path

**Risk Level**: High

<!-- Risk Classification Criteria:
  High   = Workflow involves state mutation, data loss risk, or irreversible operations
  Medium = Workflow involves multi-step interaction without irreversible side effects
  Low    = Workflow is read-only or purely observational
-->

## Overview

单人开发者注册工作区时，注册表单的任务清单只读行显示任务数据实际存储位置（含消歧后缀），疑似目录移动时得到明确指引而非静默出错——表单不撒谎，数据位置与展示一致。（PRD Story 7；业务流程五；UI Function 4）

## Setup

- hero CTA / 侧栏 ＋ 入口可达注册表单
- OS 目录选择器可用（系统对话框一步）
- tasksHome 已定（env `DSH_FORGE_TASKS_HOME` 覆盖 > `{userData}/forge-workspaces` 默认）

## Happy Path

### Step 1: 选择工作区目录

**User Action**: 从 hero CTA 或侧栏 ＋ 打开 OS 目录选择器，选定工作区目录

**Expected Result**: 选定目录一步回填注册表单（系统对话框，无手动输入路径）

### Step 2: 查看任务清单只读行

**User Action**: 查看注册表单的任务清单只读行

**Expected Result**: 展示 `{dsh-forge-home}/{扁平化}@{hash8}` 全路径；该串由应用侧单一来源下发（core 派生 + RPC 下发，web 侧不自算）

### Step 3: 确认注册

**User Action**: 确认注册提交

**Expected Result**: 注册成功 + 建库（含发现面只读扫描建行）；实际建库位置与展示串逐字一致（SC2 单源断言）

## Edge Cases

### Step 1b: 重选目录派生行更新

**Precondition**: 表单已展示某目录的派生路径

**User Action**: 重新选择另一工作区目录

**Expected Result**: 派生行随目录变化更新（扁平化主体与 hash8 相应变化），表单不残留旧值

### Step 2b: 同扁平化主体路径消歧

**Precondition**: 存在扁平化后主体相同的多个工作区路径

**User Action**: 查看各自注册表单的派生行

**Expected Result**: hash8 消歧后缀正确区分（同主体异路径各自成库，不互串）

### Step 3b: 疑似目录移动拒绝注册

**Precondition**: 目标存储目录不存在，但发现同扁平化主体、异 hash8 的既有目录（疑似移动）

**User Action**: 确认注册

**Expected Result**: 拒绝注册并给出手工指引（删除孤儿目录或改回原名）；不清理、不认领、不崩溃（零副作用，表单留场）

### Step 3c: 拒绝后重选目录复检通过

**Precondition**: 曾因疑似移动被拒绝

**User Action**: 重选目录后再次确认注册

**Expected Result**: 复检通过，恢复正常确认（注册成功 + 建库）

## Journey Invariants

- 派生路径单源：展示串由 core 派生经 RPC 下发，与实际建库位置逐字一致（SC2 断言锚）
- 建库位置恒为 `{dsh-forge-home}/{扁平化}@{hash8}`（hash8 = 原路径 sha-256 前 8 hex 消歧后缀）
- 疑似移动 = 拒绝 + 手工指引，零副作用（不清理、不认领、不崩溃）
- 注册写动作只经 core 单门（表单确认不绕过建库协作者）
