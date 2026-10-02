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

**PRD 溯源**: Story 3（全部 3 条 AC：域前缀过滤（Step 2）/ 详情抽屉不含 frontmatter（Step 4）/ 热度与事件计数一致（Step 1））；流程三第 2 步（prd-spec Business Flow）；UF-6（工具栏 / 域树 / 卡片网格 / 详情抽屉）；提案 Key Scenario「知识浏览」、SC5（浏览子集）。

## Setup

- 已注册项目，其知识目录存在分域组织的前端域 / 后端域知识文件（frontmatter 合规：摘要 / 关键词 / 状态 / 时间等）；前端域含 3 层目录链「前端 → 前端/规范 → 前端/规范/React」（深度边界 = 3，第 3 层放知识文件）
- 关键词 fixture：前端域知识 K1 的标题与 frontmatter 关键词均含「部署」；K2 全字段（标题 / 关键词 / 摘要 / 正文）不含「部署」；token「qz9」为全部知识全字段不含——命中 / 未命中在任何字段口径下均确定（source: inferred——PRD 未定义工具栏关键词的命中字段口径，fixture 以双命中 / 全未命中规避口径不确定性）
- 使用事件 fixture：K1 已被召回 3 次（应用状态层使用事件表预置 3 条事件，预置通道 PRD 未定义——source: inferred；事件语义同流程三第 4 步），供热度断言
- 应用侧知识索引已建立（可重建的派生缓存）
- 场景隔离：Step 1b / 1c / 1d 以独立知识目录状态启动，不与基线叠加；Step 1c 目录仍含 ≥1 个知识文件（与 1b 空目录态可区分）

## Happy Path

### Step 1: 进入知识库浏览视图

**User Action**: 左栏点「知识库」入口

**Expected Result**: 中区整体切换为知识库视图（右栏隐藏、状态保留）；浏览页签（P1 唯一页签）呈现当前项目知识的 auto-fill 卡片网格（索引直读），卡片带热度徽章——K1 徽章数字 = 3，与 Setup 使用事件计数一致（Story 3 AC3 断言）；左轨域目录树呈现 fixture 3 层结构（目录即域，≤3 层；第 3 层节点可见——深度边界可达；>3 层目录的呈现口径 PRD 未定义，UNKNOWN 不入断言）

### Step 2: 域目录树前缀过滤

**User Action**: 点域树「前端」域节点

**Expected Result**: 网格按目录路径前缀过滤——仅前端域知识卡片出现，后端域条目不出现在网格中

### Step 3: 工具栏关键词细分

**User Action**: 在工具栏搜索框输入 fixture 关键词「部署」

**Expected Result**: 在域过滤基础上进一步细分——网格呈现 K1 卡片（标题与关键词双命中）、不呈现 K2 卡片（全字段未命中）；命中字段口径 UNKNOWN（规避策略见 Setup）

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

### Step 1c: 索引失效后静默重建（暖缓存）

**Precondition**: 此前已进入过知识面板（索引缓存已建立）；其后知识目录在应用外被修改（新增 / 删除知识文件），索引相对目录已过期；目录仍含 ≥1 个知识文件（依场景隔离）

**User Action**: 重新进入知识库浏览视图

**Expected Result**: 两阶段观察契约——① 首显不被重建阻塞：面板立即呈现旧缓存内容（探针：本次新增条目暂不在网格、被删条目仍在）；② 重建完成后网格更新为最新目录内容（新增条目出现、被删条目消失）；全程无对账横幅（P1）。「重建不阻塞首显（缓存先行）」的可观察代理即上述先旧后新两阶段

### Step 1d: 首次进入（冷缓存）网格骨架

**Precondition**: 索引缓存不存在（首次进入知识面板；依场景隔离独立启动）

**User Action**: 进入知识库浏览视图

**Expected Result**: 呈现网格骨架（UF-6「加载中」态）；索引建立完成后卡片网格就位

### Step 2b: 组合过滤无结果

**Precondition**: 域过滤与关键词组合后无任何命中（fixture：前端域过滤 + 关键词「qz9」）

**User Action**: 查看网格区域

**Expected Result**: 呈现空结果提示与清除过滤入口（UF-6 States 原文）；点清除入口 → 过滤条件清空、网格回到全量卡片（恢复目标态 = 全量网格；source: inferred——UF-6 仅定义提示与清除入口，恢复语义派生自「清除过滤」字面义 + Setup 非空库）

### Step 2c: 中层域节点选择（前缀含子树）

**Precondition**: 域树呈现 3 层 fixture 结构（Step 1），处于未过滤态

**User Action**: 点第 2 层域节点「规范」

**Expected Result**: 网格呈现「前端/规范」子树全部卡片，含第 3 层「前端/规范/React」下条目——前缀匹配含整棵子树（source: inferred——UF-6 仅定义「目录路径前缀匹配」，子树包含为前缀语义派生）

### Step 3b: 空关键词不收紧过滤（validation-error）

**Precondition**: 当前处于域过滤态、搜索框为空（衔接 Step 2）

**User Action**: 在搜索框输入纯空白字符

**Expected Result**: 过滤不收紧——等价于无关键词条件，网格保持域过滤结果；无报错、不进入空结果态（见 Derived Outcomes）

## Derived Outcomes（Web Surface 必察项）

- **validation-error** — 实步覆盖（Step 3b）：唯一输入面 = 工具栏关键词搜索框，空 / 纯空白输入不产生过滤收紧与副作用——source: inferred（surface-web required_outcomes 必察项 × UF-6 工具栏；PRD 未定义空关键词行为，按「空条件不生效」最小语义派生）
- **session-expired** — N/A：单机产品无登录会话 / 过期概念（PRD 单机安全边界，同兄弟 Journey 口径）——source: inferred（必察项 × PRD 安全边界映射）

## Journey Invariants

- 域过滤 = 目录路径前缀匹配：选「前端」域不得出现后端域条目；选中层节点含其整棵子树（Step 2c——子树包含为前缀语义派生，source: inferred）
- 详情抽屉正文区不得混入 frontmatter 字段
- 卡片热度数字恒等于该知识的使用事件计数（同源数据）——Step 1 以 K1 徽章 = 3 实例化（Setup 事件 fixture）；召回后热度 +1 的动态侧由兄弟 Journey knowledge-recall-flywheel 承载
- 浏览全程对知识目录零写入（只读纪律）
