---
feature: "dsh-forge-m3"
journey: "proposal-board-browsing"
risk_level: "Low"
golden_path: false
surface_types: ["web"]
surface_keys: ["web"]
sources:
  - docs/features/dsh-forge-m3/prd/prd-user-stories.md
  - docs/features/dsh-forge-m3/prd/prd-spec.md
  - docs/features/dsh-forge-m3/prd/prd-ui-functions.md
generated: "2026-09-24"
---

# Journey: proposal-board-browsing

**Risk Level**: Low

<!-- Risk Classification Criteria:
  High   = Workflow involves state mutation, data loss risk, or irreversible operations
  Medium = Workflow involves multi-step interaction without irreversible side effects
  Low    = Workflow is read-only or purely observational
-->

## Overview

SDD 开发者在工作台·提案看板(第二 tab)只读浏览文档根 `proposals/` 下全部提案:列表(status/created/作者/关联 feature 徽标)、详情只读渲染与 eval 报告浏览,经徽标与 feature 看板互跳;外部文件变更 ≤5 秒回流,全程零状态写入口。

> PRD Traceability: Story 6(提案只读浏览);SC6;UF5(提案看板·只读);proposal Key Scenarios「提案浏览」。

## Setup

- 应用已启动并激活一个已注册项目(fixture 承载)
- 项目文档根 `proposals/` 含 ≥2 个提案(frontmatter 含 status/created/作者),其中 ≥1 个关联 feature、≥1 个未关联;≥1 个提案含 eval 评估报告
- 感知链就绪(外部文件变更回流 ≤5s 口径)

## Happy Path

### Step 1: 打开提案列表

**User Action**: 用户切换到工作台·提案 tab

**Expected Result**: 列表呈现全部提案,含 status/created/作者列与关联 feature 徽标;工作台 tab 顺序 = 概览/提案/Feature/任务;内容与文档根一致

### Step 2: 查看提案详情与 eval 报告

**User Action**: 点击某提案条目

**Expected Result**: 详情页呈现 proposal 正文与 eval 报告只读渲染(经 MarkdownView 白名单),内容与文档根文件一致;返回回到提案看板

### Step 3: 经徽标互跳 feature 看板

**User Action**: 点击提案的关联 feature 徽标

**Expected Result**: 跳转 feature 看板对应条目;可返回提案看板(返回来源)

### Step 4: 外部变更回流

**User Action**: 在应用外新增/修改提案文件(或 eval 报告),回到提案看板

**Expected Result**: 列表与详情 ≤5 秒回流变更,免手动刷新;回流内容与文件一致

## Edge Cases

### Step 1b: 提案目录为空的空态

**Precondition**: 项目文档根 `proposals/` 为空(或不存在)

**User Action**: 打开提案 tab

**Expected Result**: 呈现「暂无提案」+ 路径说明(empty 态,正常呈现,无错误)

### Step 2b: 无关联 feature 的提案不显示徽标

**Precondition**: 提案未关联任何 feature(管线早期形态)

**User Action**: 查看列表与该提案详情

**Expected Result**: 列表不显示 feature 徽标;详情浏览照常可用(正常态,非错误)

### Step 4b: 感知链故障时的降级呈现

<!-- source: inferred:感知链故障的失败面沿用 M2 口径(sync-error 工具栏指示 + 静默重试、保留最后良好视图);文件恒为事实源,看板为派生快照可重建 -->

**Precondition**: 感知链(watcher/扫描)故障,外部变更无法回流

**User Action**: 察看提案看板状态与内容

**Expected Result**: sync-error 工具栏指示 + 静默重试,保留最后一次良好视图;恢复或重启全量重扫后与文档根文件一致

### Step 4c: 恶意 markdown 防注入

<!-- source: prd-spec Security(markdown 防注入:提案/eval 渲染经白名单) -->

**Precondition**: 提案正文或 eval 报告文件内含恶意 markdown 结构

**User Action**: 浏览该提案详情

**Expected Result**: 渲染经 MarkdownView 白名单,注入内容不生效

## Journey Invariants

- 提案看板全页面零状态写入口(只读硬约束;状态流转归终端/agent)
- 渲染恒经 MarkdownView 白名单(防注入)
- 看板内容与文档根文件一致(派生视图);感知健康时外部变更 ≤5s 回流,故障时保留最后良好视图且文件恒为事实源
