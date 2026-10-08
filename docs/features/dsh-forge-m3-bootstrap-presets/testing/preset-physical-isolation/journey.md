---
feature: "dsh-forge-m3-bootstrap-presets"
journey: "preset-physical-isolation"
risk_level: "Low"
golden_path: false
surface_types: ["web"]
surface_keys: ["web"]
sources:
  - docs/features/dsh-forge-m3-bootstrap-presets/prd/prd-user-stories.md
  - docs/features/dsh-forge-m3-bootstrap-presets/prd/prd-spec.md
  - docs/proposals/dsh-forge-m3-bootstrap-presets/proposal.md
generated: "2026-10-08"
---

# Journey: preset-physical-isolation

**Risk Level**: Low

<!-- Risk Classification Criteria:
  High   = Workflow involves state mutation, data loss risk, or irreversible operations
  Medium = Workflow involves multi-step interaction without irreversible side effects
  Low    = Workflow is read-only or purely observational
-->

## Overview

单人开发者核查突击会话在物理上调不到规格技能（而非「被叮嘱不要」），且双预设镜像不随上游演进漂移——模式边界靠机制不靠提示词纪律，升级 dsh 不悄悄破坏双预设。（PRD Story 6；关键场景 8 降级支；SC2 预设层/契约面）

## Setup

- 双预设已物化（boot overlay 注行物化或首启模板预置——宿主物化绝对路径形态）
- 上游 standard.patch.yml 可对照（机械 diff 基线）
- 突击与远征会话均可创建（技能目录可枚举）

## Happy Path

### Step 1: 突击会话枚举技能目录

**User Action**: 单人开发者创建突击会话并枚举其技能目录

**Expected Result**: **不含 write-prd 等规格技能全集**（技能枚举断言——突击目录物理缺 spec 探针，spike S6-3 已实证同构物理边界）

### Step 2: 机械 diff 双预设 standard 基础行

**User Action**: 将两预设的 standard 基础行与上游 standard.patch.yml 机械 diff

**Expected Result**: **一致**（契约面断言）；镜像行含**必填 config 全集**（如 tool-fs-search 的 sampleOverCapResults）

### Step 3: 检查预设行装配的 customSkillDirs

**User Action**: 检查预设行的 customSkillDirs 装配形态

**Expected Result**: 一律**物化绝对路径**（`!!js` 表达式形态禁用——spike 裁决全形态死刑）

## Edge Cases

### Step 1b: 远征会话枚举对照

**Precondition**: 远征会话已创建（默认或显式）

**User Action**: 枚举远征会话技能目录并尝试 brainstorm

**Expected Result**: **规格技能全集可见且 brainstorm 可用**（对照面——物理隔离只作用于突击组合）

### Step 2b: 镜像行缺必填 config

**Precondition**: 双预设镜像的 standard 基础行缺失某必填 config（上游演进新增）

**User Action**: 机械 diff 发现缺行后装配该预设

**Expected Result**: **整预设 broken 不上菜单**（spike 教训：缺 config → schema 拒绝）——契约面清单含 config 全集义务兜底

### Step 3b: `!!js` 表达式形态

**Precondition**: 预设行 customSkillDirs 误用 `!!js` 表达式（非物化路径）

**User Action**: 以该形态装配并启动

**Expected Result**: **全形态死刑**（packaged-js 负对照：`!!js` 行 broken 确认——3.9 补验实证）；不上菜单、不静默降级

## Journey Invariants

- **模式边界靠机制不靠提示词纪律**：物理调不到（目录物理缺），而非「被叮嘱不要」
- 物理边界 = **枚举面即证**：突击目录物理缺 spec 技能（断言通道 = 技能枚举，无需运行期探测）
- 双预设镜像**不随上游演进漂移**：契约面清单 + 机械 diff 跟踪（含行 config 全集义务）
- `!!js` 表达式形态全形态死刑；customSkillDirs 恒物化绝对路径
