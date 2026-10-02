---
feature: "dsh-forge-p1-mvp"
journey: "project-registration"
risk_level: "High"
golden_path: false
surface_types: ["web"]
surface_keys: ["web"]
sources:
  - docs/features/dsh-forge-p1-mvp/prd/prd-user-stories.md
  - docs/features/dsh-forge-p1-mvp/prd/prd-spec.md
  - docs/features/dsh-forge-p1-mvp/prd/prd-ui-functions.md
  - docs/proposals/dsh-forge-p1-mvp/proposal.md
generated: "2026-10-03"
---

# Journey: project-registration

**Risk Level**: High

<!-- Risk Classification Criteria:
  High   = Workflow involves state mutation, data loss risk, or irreversible operations
  Medium = Workflow involves multi-step interaction without irreversible side effects
  Low    = Workflow is read-only or purely observational
-->

## Overview

单人开发者从零项目首用状态出发，经两段式添加项目流程（第一段·文件浏览器选定工作区目录 → 第二段·注册表单确认）把代码项目注册进工作台，注册成功后左栏出现该项目及其 dsh 会话列表——dsh 会话与知识库挂上项目，获得统一的 AI Coding 工作主场。

**PRD 溯源**: Story 1（全部 AC：happy path / 两段取消干净退出 / 幂等挂接 / 补偿路径归 project-registration-compensation Journey）；流程一（prd-spec Business Flow）；UF-2（hero 空态）、UF-3（两段式模态）；提案 Key Scenario「首用」、SC13 happy path。

## Setup

- 应用以零项目状态首用启动，中区呈现 hero 空态
- 本地文件系统存在一个尚未注册的工作区候选目录（canonical path 不命中任何既有工作区）
- dsh workspace registry 与应用状态层（数据库）均可用，无历史孤儿注册

## Happy Path

### Step 1: 从 hero 空态打开添加项目流程

**User Action**: 在中区 hero 空态点击「＋添加项目」CTA

**Expected Result**: 添加项目两段模态打开，处于第一段·文件浏览器——目录列表、面包屑与「已注册」标记（ownership 预检可视化）呈现

### Step 2: 在文件浏览器选定工作区目录

**User Action**: 双击进入目录层级或经面包屑跳转浏览，单击选中目标工作区目录，点「下一步」

**Expected Result**: 进入第二段·注册表单——工作区目录只读回填（可「重新选择」），项目名自动取文件夹名

### Step 3: 核对注册表单默认值与只读派生行

**User Action**: 查看表单字段（必要时直接输入或点「浏览…」改选目录）

**Expected Result**: 文档位置（forge 目录）默认 `<工作区>/.forge`、知识库目录默认 `<工作区>/.knowledge`，两者均可直输或浏览改选；任务清单与记录 = `{dsh-forge-home}/{canonical-path 扁平化}` 只读自动派生；仓内/仓外由 forge 目录是否位于工作区内自动推导（无 radio 字段）；表单不含「默认召回域」字段

### Step 4: 点「确认」提交注册

**User Action**: 点击底部「确认」按钮

**Expected Result**: 进入不可交互中断的注册执行（取消点已过）——四步链启动：ownership 预检 → dsh create → 应用库写入，进度指示呈现

### Step 5: 确认注册成功与左栏挂载

**User Action**: 等待注册执行完成

**Expected Result**: 成功反馈呈现并自动关闭模态；左栏出现该项目及其 dsh 会话列表（实时读 dsh 账本，零副本）；注册记录落应用数据库（含 workspace 外键）；hero 空态永久隐退，不残留

## Edge Cases

### Step 1b: 文件浏览器段取消

**Precondition**: 流程处于第一段·文件浏览器，尚未进入注册表单

**User Action**: 直接关闭对话框

**Expected Result**: 干净退出回工作台 hero——未调用 dsh create，dsh 侧与应用侧均无残留（无副作用、无补偿动作）

### Step 2b: 选定已注册目录（幂等挂接既有）

**Precondition**: 候选目录的 canonical path 命中 dsh registry 既有工作区（浏览器行带「已注册」标记）

**User Action**: 选中该已注册目录，点「下一步」进入表单后「确认」

**Expected Result**: 注册执行走「挂接既有」分支——ownership 预检命中，不新建工作区、不登记补偿；应用库写入 projects 行成功，左栏出现该项目，既有工作区与会话不受影响

### Step 3b: 注册表单段取消

**Precondition**: 流程处于第二段·注册表单

**User Action**: 点「返回上一步」回到文件浏览器后关闭，或直接关闭对话框

**Expected Result**: 干净退出——取消点均在 dsh create 之前，无任何 dsh 侧与应用侧副作用，无补偿动作

### Step 3c: 换选工作区的字段联动

**Precondition**: 表单态下部分字段已被手动修改或经「浏览…」选定过

**User Action**: 点「重新选择」重开文件浏览器，换选另一个工作区目录

**Expected Result**: 未手改的字段随新工作区重构（forge 目录/知识库目录默认值重算、项目名重取、任务清单与记录重新派生）；手改或浏览选定过的字段保留原值不重置

### Step 3d: 非法路径拦截于表单态

**Precondition**: 表单态下 forge 目录或知识库目录输入框可编辑

**User Action**: 在文档位置（forge 目录）或知识库目录直接输入非法路径

**Expected Result**: 非法路径被拦截于表单态（不进入注册执行），给出可修正提示；工作区目录必选且必须为存在的本地目录

### Step 5b: 项目态下经项目树「＋」再次添加项目

**Precondition**: 已有至少一个项目，工作台处于项目态（hero 已隐退）

**User Action**: 点左栏项目树「＋」打开添加项目流程并完成注册

**Expected Result**: 同一两段式流程可用；注册成功后左栏项目树新增该项目，多项目并存，hero 不再出现

## Journey Invariants

- 取消点只存在于两段对话框（返回上一步或直接关闭），均在 dsh create 之前；任何取消后 dsh 侧与应用侧零残留
- 应用库 projects 记录必须携带 workspace 外键，canonical path 为对账 join key
- 左栏会话列表实时读 dsh 账本，零缓存零副本（无投影同步）
- hero 空态仅在项目数 = 0 时呈现；首个项目注册成功后永久让位，不残留
