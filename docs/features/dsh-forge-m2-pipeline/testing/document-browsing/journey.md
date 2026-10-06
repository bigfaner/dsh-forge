---
feature: "dsh-forge-m2-pipeline"
journey: "document-browsing"
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

# Journey: document-browsing

**Risk Level**: Low

<!-- Risk Classification Criteria:
  High   = Workflow involves state mutation, data loss risk, or irreversible operations
  Medium = Workflow involves multi-step interaction without irreversible side effects
  Low    = Workflow is read-only or purely observational
-->

## Overview

单人开发者在概览页签的提案 / feature 子 tab 浏览项目文档（含仓外项目），点开只读文档核对规格并跳转编辑器——不切出工作台即可核对规格与设计上下文。（PRD Story 5；业务流程三；SC4；UI Function 2）

## Setup

- 仓内项目：按目录约定组织文档的已注册工作区（features + 全类文档 + proposals 在场）
- 仓外项目夹具：按目录约定预置目录结构

## Happy Path

### Step 1: 浏览概览 feature 子 tab 文档列表

**User Action**: 在概览 feature 子 tab 浏览某 feature 的文档行（含 design 文档）

**Expected Result**: 文档行经真实发现链建行（注册 / 首次打开只读扫描按目录约定）；文档行整行可点（行尾 › 箭头）

### Step 2: 点开 design 文档

**User Action**: 点击一篇 design 文档行

**Expected Result**: dock 开出独立文档 tab（按 docRel 去重）；内容呈现正文只读渲染 + canonical 路径栏 + 只读徽标

### Step 3: 查看 mermaid 图渲染

**User Action**: 查看文档中的 mermaid 图（erDiagram）

**Expected Result**: mermaid 代码块渲染为图（erDiagram = 验收锚；mermaid 库懒加载）

### Step 4: 在编辑器中打开

**User Action**: 点击「在编辑器中打开」

**Expected Result**: 跳转系统关联编辑器打开该文档（跳转不写文件）

### Step 5: 浏览仓外项目文档

**User Action**: 切换到仓外项目，浏览其概览提案 / feature 子 tab 并点开文档

**Expected Result**: 经真实发现链建行后同构呈现（只读渲染 + canonical 路径栏 + mermaid 渲染）；仓内 / 仓外同构

## Edge Cases

### Step 5b: 零命中项目空态

**Precondition**: 项目目录内无任何约定文档（零命中）

**User Action**: 浏览其概览提案 / feature 子 tab

**Expected Result**: 呈现空态（一等展示，非错误）

### Step 2b: 文档引用悬空

**Precondition**: 文档引用悬空（模拟分支切换后文件不在当前分支）

**User Action**: 打开对应文档条目

**Expected Result**: 只读缺省渲染并标注悬空（路径栏保留）；不崩溃、不写入、不删行（SC-branch）

### Step 2c: 同文档重开去重

**Precondition**: 该文档的 tab 已打开

**User Action**: 再次点击同一文档行

**Expected Result**: 激活已有 tab（不新开）；多文档可并存开多个 tab

### Step 3b: mermaid 渲染失败回退占位卡

**Precondition**: mermaid 源非法或渲染失败

**User Action**: 查看该图

**Expected Result**: 回退占位卡（源码 + 回退注记）；不影响文档其余部分渲染

## Journey Invariants

- 只读纪律：应用对代码仓与文档位置零写入（文件系统级监控验证，SC3 回归；显式「在编辑器中打开」跳转除外——跳转不写文件）
- 文档 tab 按 docRel 去重（同文档不重复开 tab）
- 悬空文档不崩溃、不写入、不删行（条目保留，文件恢复后可正常打开）
- 仓内 / 仓外项目同构呈现（同一渲染面，无特例分支心智）
