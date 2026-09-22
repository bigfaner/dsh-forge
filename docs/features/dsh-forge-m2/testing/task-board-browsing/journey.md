---
feature: "dsh-forge-m2"
journey: "task-board-browsing"
risk_level: "Low"
golden_path: false
surface_types: ["web"]
surface_keys: ["web"]
sources:
  - docs/features/dsh-forge-m2/prd/prd-user-stories.md
  - docs/features/dsh-forge-m2/prd/prd-spec.md
  - docs/features/dsh-forge-m2/prd/prd-ui-functions.md
generated: "2026-09-23"
---

# Journey: task-board-browsing

**Risk Level**: Low

## Overview

SDD 开发者在应用内以只读方式浏览项目的任务/依赖树、状态分组、worktree 标识与任务详情,不依赖终端 `forge task list` 就能掌握 feature 全部任务的状态、依赖与执行记录。

> PRD Traceability: Story 1(任务可视化浏览);SC1(真实项目数据一致性)、G1(任务可视化);UF2(任务看板只读)、UF3(任务详情面板)。

## Setup

- 应用已启动且已注册并激活一个 forge 项目,该项目含 ≥10 个任务、含依赖关系(如本仓 dsh-forge,含 M1 已完成任务)
- forge 数据可正常读取(`.forge`/`docs/features` 存在且格式有效)

## Happy Path

### Step 1: 打开任务看板(依赖树视图)

**User Action**: 用户进入工作台·任务看板

**Expected Result**: 默认展示图形化依赖树,blocker 关系可视化;任务数/状态/依赖与 `forge task list` 输出一致(含已完成历史任务);首屏 ≤2 秒(500 任务规模)

### Step 2: 切换状态分组/列表视图

**User Action**: 用户切换"状态分组/列表"视图

**Expected Result**: 按 forge 任务状态(7 态)分组展示;任务执行分支名在列表视图列展示

### Step 3: 筛选与排序

**User Action**: 使用筛选器(feature/状态/worktree)与排序

**Expected Result**: 视图即时更新,筛选/排序结果与 forge 任务数据一致

### Step 4: 查看 worktree 标识

**User Action**: 查看在非默认 worktree 有执行痕迹的任务卡片/详情

**Expected Result**: worktree 标识可见(卡片角标)

### Step 5: 打开任务详情

**User Action**: 点击一个已有执行记录的任务卡片/节点

**Expected Result**: 详情面板展示描述、依赖链、执行记录,均可只读浏览;无挂接历史时该区显示空态说明

## Edge Cases

### Step 1b: forge 数据读取异常

**Precondition**: forge 任务数据读取失败(文件损坏/权限异常)

**User Action**: 用户进入任务看板

**Expected Result**: 显示错误(error)态与重试入口;应用不崩溃、不展示残缺或错误的数据

### Step 2b: 项目无任务数据

**Precondition**: 注册激活的项目没有任何任务数据

**User Action**: 用户进入任务看板

**Expected Result**: 显示空(empty)态"无任务"引导(指向 forge 初始化),不显示错误

### Step 3b: 筛选组合无结果

**Precondition**: 当前筛选条件组合下无匹配任务

**User Action**: 用户应用该筛选组合

**Expected Result**: 显示明确空态,不显示错误;清除筛选后视图恢复

## Journey Invariants

- 人侧只读:看板任何视图与任务详情不出现任务状态变更的写操作入口
- 看板信息覆盖 `forge task list` 全部维度(状态/依赖树/worktree/记录),展示状态与 forge 7 态一致
- 只读浏览操作不产生任何 forge 数据或工作台自有状态的变更
