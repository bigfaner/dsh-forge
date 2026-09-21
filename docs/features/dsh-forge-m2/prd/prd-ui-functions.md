---
feature: "dsh-forge-m2"
---

# dsh-forge M2 — UI Functions

> Requirements layer: defines WHAT the UI must do. Not HOW it looks (that's ui-design.md).

## UI Scope

新增**项目工作台**页面族(应用自有 UI,中英双语),承载项目上下文与全部 forge 能力视图;复用 M1 主窗口现有会话界面作为会话执行/审批与跳转目标;无 OS 级新增面(托盘/通知沿用 M1)。全部能力以可启停插件交付,禁用后工作台退出、应用回归纯壳会话形态。

## Navigation Architecture

- **Platform**: web

### Primary Navigation (shared across pages)

| # | Label | Target Page | Icon Keyword |
|---|-------|-------------|-------------|
| 1 | 会话 | 主窗口会话界面(上游继承,M1 既有) | chat |
| 2 | 工作台 | 工作台 · 项目概览(new) | kanban |

> 导航注入机制(shell 注入 or 上游导航扩展)属 /ui-design 与 /tech-design 决策;本文仅定义业务导航结构。

### Secondary Pages (navigated from a parent page)

| Page | Entry Point (UF# or action) | Return Target |
|------|-----------------------------|---------------|
| 项目注册向导 | UF1(无激活项目时自动进入 / 项目切换器"添加项目") | 工作台 · 项目概览 |
| 工作台 · 任务看板 | Primary Navigation 2 → 任务 tab | 工作台 · 项目概览 |
| 工作台 · feature 看板 | Primary Navigation 2 → feature tab | 工作台 · 项目概览 |
| 任务详情 | UF2(点击任务卡片/节点) | 工作台 · 任务看板 |
| feature 详情与文档浏览 | UF4(点击 feature) | 工作台 · feature 看板 |
| 会话界面(执行/审批) | UF5(挂接条目"进入会话") | 工作台 · 任务看板(返回来源) |

### Navigation Rules

- Primary navigation is shared across pages
- Every secondary page must have back navigation targeting its entry point page
- Every navigation target must correspond to a page defined in this document

## UI Function 1: 项目注册与管理

### Placement

- **Mode**: new-page
- **Target Page**: 工作台 · 项目概览(含项目切换器)与 项目注册向导(浮层/分步)
- **Position**: 工作台首屏;无激活项目时注册向导自动进入

### Description

注册/移除 forge 项目、切换激活项目(单激活)。注册向导 ≤3 步:①选代码根目录 → ②选过程文档位置(仓内默认 / 仓外本地路径,仓外需显式选择并授权) → ③确认完成。项目三分信息(代码根目录/工作台自有状态/文档位置)持久化为工作台自有状态。

### User Interaction Flow

1. 用户从项目切换器点"添加项目" → 进入注册向导
2. 选择代码根目录 → 系统检出 forge 数据(`.forge`/`docs/features` 等);未检出 → 错误引导(修正路径或提示先初始化项目),停在步骤 ①
3. 选择文档位置:默认仓内;切换"仓外路径" → 选择目录并确认授权提示
4. 确认 → 注册完成,激活该项目,进入工作台

### Data Requirements

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| 代码根目录 | path | 用户选择 | 必须可访问;检出 forge 数据 |
| 文档位置 | enum + path | 向导步骤 ② | 仓内(默认)/ 仓外本地路径 |
| 项目显示名 | string | 目录名(可改) | 列表展示 |
| 激活项目标识 | ref | 工作台自有状态 | 单激活 |

### States

| State | Display | Trigger |
|-------|---------|---------|
| empty(无项目) | 注册向导自动进入 | 首次使用/全部移除 |
| loading(扫描) | 步骤内扫描指示 | 检出 forge 数据时 |
| error(未检出/路径不可访问) | 错误信息 + 修正引导 | 步骤 ① 校验失败 |
| populated(项目列表) | 项目卡片 + 激活标记 + 切换/移除 | ≥1 注册项目 |

### Validation Rules

- 代码根目录必须存在且可读;未检出 forge 数据不得进入步骤 ②
- 仓外文档路径必须与代码根目录不同且显式授权确认
- 移除项目需二次确认,且明确提示"仅删除工作台注册信息,不动项目文件"

---

## UI Function 2: 任务看板(只读)

### Placement

- **Mode**: new-page
- **Target Page**: 工作台 · 任务看板
- **Position**: 工作台主视图(依赖树视图与状态分组/列表视图可切换)

### Description

以图形化依赖树 + 状态分组/列表两种视图只读展示激活项目的任务全集:状态(7 态)、依赖(blocker 关系)、所属 feature、worktree 标识、变更来源标识[会话/终端]。支持按 feature/状态/worktree 筛选与排序。**不提供任何写操作入口**(人侧只读,主体模型见 prd-spec)。

### User Interaction Flow

1. 用户进入任务看板 → 默认展示依赖树视图(当前 feature 任务着色/过滤可选)
2. 切换"状态分组/列表"视图 → 按状态列分组展示
3. 使用筛选器(feature/状态/worktree)与排序 → 视图即时更新
4. 点击任务卡片/节点 → 打开任务详情(UF3)

### Data Requirements

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| 任务 ID/标题/状态 | id/string/enum | forge 任务数据 | 状态与 forge 一致(7 态) |
| 依赖关系 | graph | forge 任务数据 | blocker 边 |
| 所属 feature / worktree | ref/string | forge 任务数据/执行痕迹 | 卡片角标 |
| 变更来源标识 | enum[会话/终端] | 变更事件(DF003) | 最近变更可见 |
| 任务规模 | count | — | ≤500 任务,首屏 ≤2s |

### States

| State | Display | Trigger |
|-------|---------|---------|
| loading | 骨架/进度 | 首次加载/切换项目 |
| empty | "无任务"引导(指向 forge 初始化) | 项目无任务数据 |
| error(读取失败) | 错误 + 重试 | forge 数据读取异常 |
| populated | 树/列表视图 | 正常 |
| updating(回流中) | 轻量变更提示 | 外部变更到达(≤5s 时效) |

### Validation Rules

- 只读约束:视图内不出现任何状态变更按钮/入口
- 筛选组合无结果时显示明确空态,不显示错误

---

## UI Function 3: 任务详情面板

### Placement

- **Mode**: existing-page
- **Target Page**: 工作台 · 任务看板(详情侧板/浮层)
- **Position**: 任务看板内,由任务卡片/节点唤出

### Description

单个任务的完整只读详情:描述、依赖链(上游 blocker 链)、执行记录(forge records)、变更来源标识、历史会话挂接列表;含"发起会话"入口(UF5)。

### User Interaction Flow

1. 用户点击任务 → 详情面板展开
2. 浏览描述/依赖链/执行记录/来源标识
3. 点击"发起会话" → 走 UF5 流程
4. 点击历史挂接条目 → 回溯该会话(UF5)

### Data Requirements

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| 任务描述/元数据 | markdown/text | forge 任务文件 | 只读渲染 |
| 依赖链 | graph | forge 任务数据 | 含上游传递链 |
| 执行记录 | list | forge tasks/records | 只读渲染 |
| 变更来源标识 | enum[会话/终端] | 变更事件 | 按变更逐笔 |
| 挂接历史 | list | 工作台自有状态(挂接索引) | 会话标识/时间 |

### States

| State | Display | Trigger |
|-------|---------|---------|
| loading | 骨架 | 打开详情 |
| populated | 分区详情 | 正常 |
| error | 错误 + 重试 | 单任务数据异常 |

### Validation Rules

- 详情为只读渲染;记录内容按 forge 原文渲染(markdown 防注入)
- 无挂接历史时该区显示空态说明

---

## UI Function 4: feature 看板与文档浏览

### Placement

- **Mode**: new-page
- **Target Page**: 工作台 · feature 看板(含 feature 详情/文档浏览子视图)
- **Position**: 工作台次级 tab

### Description

激活项目的 feature 列表与状态机可视化(prd → design → tasks → in-progress → completed);点击 feature 浏览其 manifest/prd/design/ui/tasks 五类过程文档(只读渲染,含仓外路径来源)。

### User Interaction Flow

1. 用户进入 feature 看板 → feature 列表(状态标识)
2. 点击 feature → 状态机视图 + 文档目录(五类)
3. 点击文档 → 应用内只读渲染;返回 feature 详情

### Data Requirements

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| feature 列表/状态 | list/enum | forge feature 数据 | 状态机各态 |
| 文档内容 | markdown | manifest/prd/design/ui/tasks | 只读;仓内或仓外路径来源 |

### States

| State | Display | Trigger |
|-------|---------|---------|
| loading | 骨架 | 进入/切换 |
| empty | "无 feature"引导 | 项目无 feature |
| error | 错误 + 重试 | 读取异常(含仓外路径失效) |
| populated | 列表/状态机/文档 | 正常 |

### Validation Rules

- 仓外路径失效时明确提示路径不可访问,并提供重新指向/移除项目引导
- 文档渲染为只读,禁用外链跳转离开应用(安全约束)

---

## UI Function 5: 会话挂接

### Placement

- **Mode**: existing-page(发起入口)→ 复用现有页面(跳转目标)
- **Target Page**: 发起入口在工作台 · 任务看板/任务详情(UF2/UF3);跳转目标 = 主窗口会话界面(上游继承,M1 既有)
- **Position**: 任务卡片与详情面板的"发起会话"动作;挂接状态/历史在任务详情展示

### Description

从任务一键发起 dsh 会话:任务执行 prompt(`forge prompt get-by-task-id`)自动注入,挂接关系写入工作台自有状态;看板展示任务的挂接状态(进行中/历史),可跳转主窗口现有会话界面(执行/审批在现有会话 UI 完成);历史挂接可回溯。

### User Interaction Flow

1. 用户在任务卡片/详情点击"发起会话"(1 次点击)
2. 系统注入任务执行 prompt → 进入会话界面(≤3 秒可交互);失败 → 错误提示与恢复引导(沿用 M1 恢复模式)
3. agent 在会话中执行任务操作(审批走现有会话 UI)
4. 看板任务卡显示挂接状态与来源标识[会话];用户可从挂接条目"进入会话"或查看历史挂接

### Data Requirements

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| 任务执行 prompt | text | forge CLI(DF001) | 完整注入 |
| 会话标识/状态 | ref/enum | dsh 会话 | 挂接条目 |
| 挂接索引 | list | 工作台自有状态(DF005) | 任务↔会话,持久化 |
| 变更回流 | event | forge 文件(DF003) | ≤5s,来源[会话] |

### States

| State | Display | Trigger |
|-------|---------|---------|
| initiating | 发起中指示 | 点击发起 |
| active(挂接进行中) | 会话状态徽标 + "进入会话" | 会话运行 |
| error(发起失败) | 错误 + 恢复引导 | 宿主/凭据异常 |
| history(历史挂接) | 挂接列表(时间/会话) | 会话结束 |
| plugin-disabled | 功能不可用提示 + 启用引导 | 能力插件被禁用 |

### Validation Rules

- 仅可对存在执行 prompt 的任务发起会话;不满足时按钮禁用并说明原因
- 挂接关系为工作台自有状态,不写入 forge 数据(不产生第二事实源)

---

## UI Function 6: 能力插件启停

### Placement

- **Mode**: existing-page
- **Target Page**: 工作台 · 项目概览(能力插件管理区)
- **Position**: 工作台设置区(入口常驻但低频)

### Description

forge 能力插件的启用/禁用入口(对接插件机制,机制细节属 spike/tech-design)。禁用 → 工作台能力整体退出,应用回归 M1 纯壳会话形态;重新启用 → 能力恢复,数据零损坏。

### User Interaction Flow

1. 用户打开工作台设置区 → 看到 forge 能力插件状态(启用/禁用)
2. 点击禁用 → 二次确认(说明影响:工作台视图退出、会话/挂接能力不可用;forge 数据不受影响)
3. 禁用后主窗口回归纯壳会话形态;重新启用 → 工作台恢复且数据完整

### Data Requirements

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| 插件状态 | enum | 插件机制 | 启用/禁用 |
| 影响说明文案 | text | 静态 | 中英双语 |

### States

| State | Display | Trigger |
|-------|---------|---------|
| enabled | 状态 + "禁用"动作 | 默认 |
| disabled | 状态 + "启用"动作 | 用户禁用后 |
| transitioning | 操作中指示 | 启停执行 |

### Validation Rules

- 启停操作不得触碰 forge 数据与项目文件(仅能力装载状态)
- 禁用时有激活挂接会话需提示影响(会话本体不受影响,挂接视图能力退出)

---

## Page Composition

| Page | Type | UI Functions | Position Notes |
|------|------|-------------|----------------|
| 工作台 · 项目概览 | new | UF1, UF6 | 项目切换/注册入口 + 能力插件管理区;无项目时向导自动进入 |
| 工作台 · 任务看板 | new | UF2, UF3 | 依赖树/列表视图 + 任务详情侧板(UF3) |
| 工作台 · feature 看板 | new | UF4 | feature 状态机 + 文档浏览子视图 |
| 主窗口会话界面 | existing(上游继承,M1 既有) | UF5(跳转目标) | 会话执行/审批;UF5 发起后跳入,返回工作台 |

> 注:本项目 web surface 尚无 `docs/sitemap/sitemap.json`(M1 主窗口 100% 继承上游 GUI,未生成 sitemap);唯一 existing-page 目标为上游继承会话界面,无仓内路由可校验。M2 新增页面均为 new-page。建议 M2 落地后运行 /gen-web-sitemap 建立基线。
