---
feature: "dsh-forge-p1-mvp"
journey: "knowledge-browsing"
risk_level: "Low"
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

# Journey: knowledge-browsing

**Risk Level**: Low

<!-- Risk Classification Criteria:
  High   = Workflow involves state mutation, data loss risk, or irreversible operations
  Medium = Workflow involves multi-step interaction without irreversible side effects
  Low    = Workflow is read-only or purely observational
-->

## Overview

单人开发者在知识库一等公民视图中浏览项目知识资产：进入浏览页签看卡片网格、经左轨域目录树做前缀过滤、工具栏关键词细分，点卡片打开详情抽屉（摘要块 + 两列元数据 + Markdown 正文），全程只读。

**PRD 溯源**: Story 3（全部 3 条 AC：域前缀过滤 / 详情抽屉不含 frontmatter / 热度与事件计数一致）；流程三第 2 步（prd-spec Business Flow）；UF-6（工具栏 / 域树 / 卡片网格 / 详情抽屉）；提案 Key Scenario「知识浏览」、SC5（浏览子集）。

## Setup

- 已注册项目，其知识目录存在分域组织的前端域 / 后端域知识文件（frontmatter 合规：摘要 / 关键词 / 状态 / 时间等）
- 应用侧知识索引已建立（可重建的派生缓存）

## Happy Path

### Step 1: 进入知识库浏览视图

**User Action**: 左栏点「知识库」入口

**Expected Result**: 中区整体切换为知识库视图（右栏隐藏、状态保留）；浏览页签（P1 唯一页签）呈现当前项目知识的 auto-fill 卡片网格（索引直读），左轨域目录树呈现（目录即域，≤3 层）

### Step 2: 域目录树前缀过滤

**User Action**: 点域树「前端」域节点

**Expected Result**: 网格按目录路径前缀过滤——仅前端域知识卡片出现，后端域条目不出现在网格中

### Step 3: 工具栏关键词细分

**User Action**: 在工具栏搜索框输入关键词

**Expected Result**: 在域过滤基础上进一步细分，网格仅呈现组合过滤命中的卡片

### Step 4: 点卡片打开详情抽屉

**User Action**: 点一张知识卡片

**Expected Result**: 右侧滑入详情抽屉——摘要块 + 两列元数据 + Markdown 正文（统一包装渲染）；正文区不含 frontmatter 字段；浏览上下文（网格与过滤条件）保持

### Step 5: 关闭抽屉回到浏览上下文

**User Action**: 按 Esc 或点 ✕ 关闭抽屉

**Expected Result**: 抽屉关闭，回到网格浏览上下文（过滤条件不丢失，无需重新过滤）

## Edge Cases

### Step 1b: 空库引导

**Precondition**: 当前项目知识目录为空（无任何知识文件）

**User Action**: 进入知识库浏览视图

**Expected Result**: 呈现「尚无知识」引导，说明知识目录位置；无卡片网格渲染

### Step 1c: 索引失效后静默重建

**Precondition**: 知识目录在应用外被修改（新增 / 删除知识文件）后进入知识面板

**User Action**: 重新进入知识库浏览视图

**Expected Result**: 索引按需一次性静默重建（P1 无对账横幅），卡片网格反映最新目录内容；重建不阻塞面板首显（缓存先行）

### Step 2b: 组合过滤无结果

**Precondition**: 域过滤与关键词组合后无任何命中

**User Action**: 查看网格区域

**Expected Result**: 呈现空结果提示与清除过滤入口；点清除后恢复上一有效状态

## Journey Invariants

- 域过滤 = 目录路径前缀匹配：选「前端」域不得出现后端域条目
- 详情抽屉正文区不得混入 frontmatter 字段
- 卡片热度数字恒等于该知识的使用事件计数（同源数据）
- 浏览全程对知识目录零写入（只读纪律）
