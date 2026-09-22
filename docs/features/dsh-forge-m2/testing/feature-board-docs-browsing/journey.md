---
feature: "dsh-forge-m2"
journey: "feature-board-docs-browsing"
risk_level: "Medium"
golden_path: false
surface_types: ["web"]
surface_keys: ["web"]
sources:
  - docs/features/dsh-forge-m2/prd/prd-user-stories.md
  - docs/features/dsh-forge-m2/prd/prd-spec.md
  - docs/features/dsh-forge-m2/prd/prd-ui-functions.md
generated: "2026-09-23"
---

# Journey: feature-board-docs-browsing

**Risk Level**: Medium

## Overview

SDD 开发者在应用内浏览 feature 状态机与 manifest/prd/design/ui/tasks 五类过程文档(只读渲染),并支持把过程文档放在仓外本地路径注册的项目上获得同等完整的浏览能力。

> PRD Traceability: Story 6(feature 文档浏览与仓外文档);SC4(feature 看板)、SC5(仓外文档);G4(feature 看板);UF4(feature 看板与文档浏览)。

## Setup

- 应用已启动并激活一个 forge 项目,该项目含已完成 feature(如本仓 dsh-forge-m1,状态 completed)及其 manifest/prd/design/ui/tasks 五类过程文档
- 存在另一个过程文档位于仓外本地路径的 forge 项目可供注册(仓外路径含同格式五类文档)

## Happy Path

### Step 1: 进入 feature 看板

**User Action**: 用户切换到工作台·feature 看板

**Expected Result**: 激活项目的 feature 列表正确显示,含状态标识

### Step 2: 查看 feature 状态机

**User Action**: 点击 dsh-forge-m1 feature

**Expected Result**: feature 状态机显示正确(completed);进入 feature 详情/文档目录(五类)

### Step 3: 浏览五类过程文档

**User Action**: 依次点击 manifest/prd/design/ui/tasks 文档

**Expected Result**: 五类文档在应用内只读渲染,内容可读;返回 feature 详情的导航可用

### Step 4: 注册仓外文档项目

**User Action**: 以仓外本地路径为文档位置注册该 forge 项目(显式选择并授权)

**Expected Result**: 注册完成并激活;看板/feature/文档功能完整

### Step 5: 仓外文档一致渲染

**User Action**: 打开该仓外项目的 feature 过程文档浏览

**Expected Result**: 文档格式与仓内一致,正常只读渲染,功能完整

## Edge Cases

### Step 1b: 项目无 feature

**Precondition**: 注册激活的项目没有任何 feature 数据

**User Action**: 用户进入 feature 看板

**Expected Result**: 显示空(empty)态"无 feature"引导,不显示错误

### Step 2b: 仓外路径失效

**Precondition**: 已注册项目的仓外文档路径失效(目录被移动/删除)

**User Action**: 打开该项目的 feature 详情并点击文档

**Expected Result**: 明确提示路径不可访问(error 态);提供重新指向/移除项目引导

### Step 3b: 单文档读取异常

**Precondition**: 某个过程文档内容读取失败

**User Action**: 点击该文档

**Expected Result**: 显示错误与重试;不影响其他文档与其他 feature 的浏览

### Step 4b: 文档外链防护

**Precondition**: 过程文档内容中包含外部链接

**User Action**: 渲染该文档并尝试点击外链

**Expected Result**: 只读渲染禁用外链跳转离开应用(安全约束),用户停留在应用内

### Step 5b: markdown 内容注入防护

**Precondition**: 文档/执行记录内容包含注入性内容(脚本/HTML 标签)

**User Action**: 浏览该文档与任务执行记录

**Expected Result**: 内容按 forge 原文只读安全渲染(markdown 防注入),不执行任何注入内容

## Journey Invariants

- 全部过程文档为只读渲染:不提供任何编辑入口;外链不离开应用
- feature 列表与状态机展示与 forge 数据一致
- 仓外与仓内文档格式一致、浏览功能等价
