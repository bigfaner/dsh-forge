---
feature: "dsh-forge-m3-bootstrap-presets"
journey: "bootstrap-walkthrough"
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

# Journey: bootstrap-walkthrough

**Risk Level**: High

<!-- Risk Classification Criteria:
  High   = Workflow involves state mutation, data loss risk, or irreversible operations
  Medium = Workflow involves multi-step interaction without irreversible side effects
  Low    = Workflow is read-only or purely observational
-->

## Overview

M3.5 的评审接受直接触发自举走查：用远征会话在 dsh-forge 自身里开发 dsh-forge，任务/执行记录 100% 入自身 forge.db，全景一致、全程零 manifest.md——自举纪律从纸面变现实，飞轮第一批真实数据入库，M4 起全面自身开发。（PRD Story 8；关键场景 6；业务流程三作用于 M3.5；SC8/SC9；SC-M3 门）

## Setup

- M3 预设机制就绪（双预设 + 远征全链 + 派发面可用）
- M3.5（知识沉淀）提案已 Draft 在库且处于可评审状态（走查时点 = 其评审接受之时——时序耦合记账）
- dsh-forge 自身工作区注册在应用内（自身 forge.db 活跃）

## Happy Path

### Step 1: M3.5 提案评审 accepted（走查启动）

**User Action**: 单人开发者将 M3.5 提案评审流转至 accepted

**Expected Result**: **走查启动**（即 M3.5 立项启动）；registerFeature 成链（feature 行 + proposal_id 谱系 + feature_records 审计行）

### Step 2: 远征会话派发开发

**User Action**: 在 dsh-forge 自身里用远征会话开发 dsh-forge（M3.5 任务经 run-tasks 派发执行）

**Expected Result**: 远征会话派发开发链运行（按 DAG 顺序领取 → worker 执行 → AC gate → commit → submitTask）；管线纪律照旧（自举不豁免）

### Step 3: 记录入库核查

**User Action**: 核查 M3.5 全部任务与执行记录的落库位置

**Expected Result**: **任务/执行记录 100% 入自身 forge.db**（断言）——无漂移到旧线或外部库

### Step 4: 全景一致与零 manifest 核查

**User Action**: 打开概览三视图 / 文档 / 提案子 tab 核查全景；检查文件系统

**Expected Result**: 概览三视图 / 文档 / 提案子 tab **全景一致**；**全程零 manifest.md 生成**（文件系统断言）

### Step 5: 总纲回归与收尾记账

**User Action**: 里程碑收尾时执行总纲回归与记账合入

**Expected Result**: 总纲 SC2 / SC3 / SC7 回归断言绿；**顺延表 #1–#13 与总纲回写四条款合入总纲**（文档断言，SC9）

## Edge Cases

### Step 1b: M3.5 提案未到可评审态

**Precondition**: M3.5 提案仍为 draft 或内容未就绪

**User Action**: 尝试启动走查

**Expected Result**: **走查不启动**（时序耦合记账：走查时点 = 评审接受之时）；无提前成链

### Step 2b: 走查期生成 manifest.md

**Precondition**: 走查运行期间文件系统出现 manifest.md

**User Action**: 文件系统断言检查

**Expected Result**: **断言红**（零 manifest 纪律）——即时发现并修正；走查不得以 manifest 记账替代库记账

### Step 2c: 走查中断恢复

**Precondition**: 走查中某任务受阻（blocked）或需修复

**User Action**: 走 blocked / fix 链机制处置

**Expected Result**: 机制照旧（blocked + reason / fix 链自动恢复——M2 机制回归）；自举不豁免管线纪律

### Step 3b: 记录漂移

**Precondition**: 某任务/执行记录落到了旧线或外部库（未入自身 forge.db）

**User Action**: 100% 入库断言核查

**Expected Result**: **断言红**（记录必须 100% 入自身库）——飞轮数据完整性不受损

### Step 4b: 全景不一致

**Precondition**: 三视图 / 文档 / 提案子 tab 数据相互矛盾（如任务终态但记录缺席）

**User Action**: e2e 一条链断言核查

**Expected Result**: **断言红**——全景一致是走查放行条件（不接受局部绿）

### Step 5b: 宪法回归红

**Precondition**: 总纲 SC2（无投影）/ SC3（只读边界）/ SC7（tool 读写延伸）任一回归失败

**User Action**: 执行总纲回归断言

**Expected Result**: **门不放行**（SC-M3 门条件）；宪法池回归是走查收口的硬前置

### Step 5c: 记账遗漏

**Precondition**: 收尾记账时顺延表或总纲回写四条款缺席

**User Action**: SC9 文档断言核查

**Expected Result**: **断言红**——顺延表 #1–#13 全量与四条款（M3 行收窄 / 全量顺延表 / brainstorm 条目修订 / M3.5 时序注记 + tech-research 偏离注记）必须合入总纲

## Journey Invariants

- **全程零 manifest.md 生成**（文件系统断言）——库记账是唯一记账通道
- **任务/执行记录 100% 入自身 forge.db**（自举飞轮第一批真实数据入库，无漂移）
- **走查即 M3.5 立项启动**（时序耦合：评审接受之时；不提前、不事后补）
- 自举纪律生效记账：M4 起剩余功能一律用自身开发（走查通过 = 纪律从纸面变现实）
- 总纲 SC2 / SC3 / SC7 回归绿 + SC9 记账合入 = SC-M3 门放行条件
