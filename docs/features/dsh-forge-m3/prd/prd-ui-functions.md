---
feature: "dsh-forge-m3"
created: "2026-09-23"
---

# dsh-forge M3 — UI Functions

> Requirements layer: defines WHAT the UI must do. Not HOW it looks (that's ui-design.md).

## UI Scope

M3 在 M2 工作台上**扩展而非重建**:新增提案看板页面(工作台第二 tab)+ 既有页面的编排/阶段化/迁移/偏好扩展;复用 M1 主窗口会话界面作为 subagent 执行与跳转目标;零 OS 级新增面(托盘/通知沿用 M1)。工作台 tab 顺序修订(2026-09-23 PRD 裁决):**概览 / 提案 / Feature / 任务**(M2 为 概览/任务/feature)。全部能力以 forge 核心插件交付(两级插件模型继承,必备不可禁用)。人 = 观察与编排发起(派发/审批/迁移/偏好),**无任务写 UI**。

## Navigation Architecture

- **Platform**: web

### Primary Navigation (shared across pages)

| # | Label | Target Page | Icon Keyword |
|---|-------|-------------|-------------|
| 1 | 会话 | 主窗口会话界面(上游继承,M1 既有) | chat |
| 2 | 工作台 | 工作台 · 项目概览(第一 tab) | kanban |

> 导航注入机制继承 M2(shell 注入 or 上游导航扩展);本文仅定义业务导航结构。

### Secondary Pages (navigated from a parent page)

| Page | Entry Point (UF# or action) | Return Target |
|------|-----------------------------|---------------|
| 项目注册向导(含迁移确认步骤) | UF3(无激活项目自动进入 / 项目切换器「添加项目」) | 工作台 · 项目概览 |
| 工作台 · 提案看板 | Primary Navigation 2 → 提案 tab | 工作台 · 项目概览 |
| 提案详情 | UF5(点击提案条目) | 工作台 · 提案看板 |
| feature 详情与文档浏览 | UF2(点击 feature) | 工作台 · Feature tab |
| 任务详情 | UF1(点击任务卡片/节点) | 工作台 · 任务 tab |
| 会话界面(执行/审批) | UF1(编排条目「进入会话」) | 返回来源页 |

### Navigation Rules

- Primary navigation is shared across pages
- Every secondary page must have back navigation targeting its entry point page
- Every navigation target must correspond to a page defined in this document

## UI Function 1: 任务派发与编排

### Placement

- **Mode**: existing-page
- **Target Page**: 工作台 · 任务看板(`workbench/tasks`,第四 tab)
- **Position**: 任务工具栏(派发入口)+ 任务卡片/节点与详情侧板(编排态与审批入口)

### Description

在 M2 只读看板上叠加**编排发起面**(人的写操作仅限编排,无任务状态写):单任务/多选并行派发、派发前阶段产物齐全性检查警告(缺失清单 + 确认继续)、subagent 运行态呈现(待启动/执行中/待审批/失败/完成)、审批操作(批准/拒绝)、失败呈现与重派发。任务状态变更本身仍归 agent(经 dsh tool),看板仅回流呈现。

### User Interaction Flow

1. 用户在任务看板选择 1 个或多个(无依赖)任务 → 点击「派发」
2. 系统执行当前阶段产物齐全性检查(确定性代码)→ 齐全:直接进入派发确认;缺失:呈现警告 + 缺失清单,用户确认后可继续或取消
3. 确认派发 → 内核预合成系统提示词 → subagent 启动(≤3s 可交互)→ 卡片/侧板呈现运行态
4. subagent 产生审批请求 → 看板呈现待审批条目 → 用户批准/拒绝 → 结果回流
5. agent 经 dsh tool 提交 → 任务状态 ≤5s 回流看板
6. subagent 失败 → 失败态与原因呈现 → 用户可「重派发」

### Data Requirements

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| 可派发任务集 | list | 内核任务状态 | 依赖满足 + 状态允许 |
| 产物检查结果 | checklist | 内核(确定性检查) | 缺失清单;规则见 prd-spec 阶段产物清单 |
| subagent 运行态 | enum | 内核编排状态 | 待启动/执行中/待审批/失败/完成 |
| 审批请求 | list | 宿主会话通道 | 内容 + 来源任务 |
| 预合成要素标识 | badge | 内核 | 协议/目标摘要/偏好三要素已合成(可断言) |
| 派发时效 | metric | 内核 | 派发 → 可交互 ≤3s |

### States

| State | Display | Trigger |
|-------|---------|---------|
| idle(无可派发) | 派发入口禁用 + 引导 | 无满足条件任务 |
| warning(产物缺失) | 警告 + 缺失清单 + 确认继续/取消 | 检查未过 |
| running | 运行态徽标 + 进度呈现 | subagent 执行中 |
| awaiting-approval | 待审批条目 + 操作 | 审批请求到达 |
| failed | 失败态 + 原因 + 重派发 | subagent 失败 |
| done | 完成态回流 | agent 提交 |

### Validation Rules

- 多选并行派发仅允许无依赖任务集;含依赖 → 阻止并提示依赖关系
- 产物缺失警告不得阻断派发(用户确认后必须可继续)
- 审批操作需显式点击(批准/拒绝),无默认自动批准
- 重派发需二次确认

---

## UI Function 2: 阶段化呈现与阶段资产

### Placement

- **Mode**: existing-page
- **Target Page**: 工作台 · feature 看板(`workbench/features`,第三 tab)
- **Position**: feature 状态机 stepper(阶段/偏离标识)+ 详情区新增「阶段资产」只读面板

### Description

feature 看板强化阶段语义:当前阶段标识、外部会话跨阶段操作的偏离标识、阶段推进门状态(总结已/未生成);阶段资产(各阶段目标 + 摘要文件)在详情区只读渲染(经 M2 MarkdownView 白名单),供人随时查阅跨阶段上下文。

### User Interaction Flow

1. 用户进入 feature 看板 → 列表呈现各 feature 当前阶段(stepper)
2. 点击 feature → 详情区呈现阶段门状态(总结是否生成)与偏离标识(如有)
3. 打开「阶段资产」面板 → 按阶段浏览目标 + 摘要只读渲染

### Data Requirements

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| feature 阶段 | enum | manifest/内核 | prd→design→tasks→in-progress→completed |
| 偏离标识 | flag | 感知(外部跨阶段操作) | 仅呈现,不阻断 |
| 阶段门状态 | enum | 内核 | 总结已生成/未生成 |
| 阶段资产 | list+md | 文档根资产文件 | 元数据入快照;只读渲染 |

### States

| State | Display | Trigger |
|-------|---------|---------|
| normal | 阶段 stepper 正常 | 无偏离 |
| deviated | 偏离徽标 | 外部会话跨阶段操作被感知 |
| gate-pending | 「总结未生成」提示 | 阶段门未满足 |
| asset-empty | 无阶段资产占位说明 | feature 尚无推进记录 |

### Validation Rules

- 阶段资产面板严格只读(无编辑入口)
- 渲染经 MarkdownView 白名单(防注入,继承 M2)
- 偏离标识仅为呈现,不产生任何阻断交互

---

## UI Function 3: 显式迁移

### Placement

- **Mode**: existing-page
- **Target Page**: 工作台 · 项目概览(`workbench/overview`,第一 tab)+ 注册向导浮层(步骤 ② 后插入迁移确认)
- **Position**: 概览页项目卡片区(检出 `index.json` 的已注册项目呈现迁移入口)+ 迁移进度/结果浮层

### Description

一次性 SoT 迁移的显式操作面:M2 已注册且检出 `tasks/index.json` 的项目,在概览页呈现「迁移到 M3 内核」入口;确认对话框(含自动备份说明)→ 原子迁移进度 → 结果(对拍结论);失败呈现回滚状态与重试入口。新注册既有项目在向导内走同一迁移确认步骤。

### User Interaction Flow

1. 用户在概览页看到项目的「可迁移」标识 → 点击「迁移到 M3 内核」
2. 确认对话框:说明迁移内容、自动备份、迁移后 index.json 淘汰 → 确认
3. 迁移执行(原子)→ 进度呈现 → 完成后展示对拍结果(任务全集零差异)
4. 失败 → 呈现已回滚状态 + 「重试」入口(零半迁移态保证)
5. (向导路径)注册既有项目检出 index.json → 向导插入同一迁移确认步骤

### Data Requirements

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| 可迁移标识 | flag | 检出 index.json | 仅已注册项目 |
| 备份位置 | path | 迁移执行 | 自动,结果中可见 |
| 迁移进度 | enum | 内核 | 校验/迁移/对拍/完成 |
| 对拍结果 | report | 内核 | 任务全集(ID/状态/依赖/标题)零差异 |

### States

| State | Display | Trigger |
|-------|---------|---------|
| migratable | 「迁移到 M3 内核」入口 | 检出 index.json |
| confirming | 确认对话框(备份说明) | 点击入口 |
| migrating | 进度指示 | 原子迁移执行中 |
| done | 对拍结果 + index.json 已淘汰 | 成功 |
| failed-rolled-back | 回滚状态 + 重试入口 | 失败 |

### Validation Rules

- 迁移必须显式确认,无自动/静默迁移路径
- 迁移执行原子化:中断/失败必须回到可重试的干净状态(零半迁移态)
- 完成态必须展示对拍结论;结果不可当场关闭而无痕(可回查日志)

---

## UI Function 4: 偏好编辑面(三级)

### Placement

- **Mode**: existing-page
- **Target Page**: 工作台 · 项目概览(`workbench/overview`,第一 tab)
- **Position**: 概览页设置区(对齐 M2 UF6 插件管理先例的最简编辑面)

### Description

运行偏好的三级(全局/项目/feature)查看与修改:键集 = auto.\*/worktree.\*/eval.\*(surfaces 除外);呈现生效值与覆盖来源(feature > 项目 > 全局);修改经内核偏好 API 持久化,消费于预合成/派发链。

### User Interaction Flow

1. 用户打开概览页设置区 → 偏好面板呈现三级层级
2. 选择层级(全局/当前项目/当前 feature)→ 查看该级键值
3. 修改某键 → 保存 → 生效值即时更新(覆盖关系呈现)
4. 清除某级覆盖 → 回落到下一级生效值

### Data Requirements

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| 偏好键值(三级) | kv | 内核偏好存储 | 键集全量,surfaces 除外 |
| 生效值 + 覆盖来源 | computed | 内核解析 | feature > 项目 > 全局 |
| feature 选择器 | ref | feature 列表 | 编辑 feature 级时 |

### States

| State | Display | Trigger |
|-------|---------|---------|
| inherited | 值 + 「继承自上级」来源标识 | 该级未覆盖 |
| overridden | 值 + 「本级覆盖」+ 清除入口 | 该级已设置 |
| global-tier | 全局层视图 | 选择全局层级 |

### Validation Rules

- 键集固定(不暴露自由键编辑);值类型校验(布尔/数值/枚举)
- feature 级仅在激活项目存在 feature 时可编辑
- 修改仅经偏好 API(与 dsh tool 写路径同源,无第二写者)

---

## UI Function 5: 提案看板(只读)

### Placement

- **Mode**: new-page
- **Target Page**: 工作台 · 提案看板(`workbench/proposals`,第二 tab)
- **Position**: 工作台第二 tab;管线早期视图(提案 → feature 追溯链入口)

### Description

文档根 `proposals/` 目录的只读管线视图:提案列表(status/created/作者/关联 feature 徽标)+ 提案详情只读渲染(proposal 正文 + eval 评估报告,经 MarkdownView 白名单)+ 与 feature 看板互跳;外部文件变更 ≤5s 回流;状态流转仍归终端/agent(人只读,零写入口)。

### User Interaction Flow

1. 用户切换到提案 tab → 列表呈现全部提案(status/created/作者/feature 徽标)
2. 点击提案 → 详情:proposal 正文只读渲染 + eval 报告浏览
3. 点击关联 feature 徽标 → 跳转 feature 看板对应条目(可返回)
4. 外部新增/修改提案文件 → ≤5s 回流列表与详情

### Data Requirements

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| 提案元数据 | status/date/author | proposal frontmatter | 列表列 |
| 关联 feature | ref | proposal/feature 关联关系 | 徽标;互跳 |
| proposal 正文 | md | 文档根文件 | 只读渲染,白名单 |
| eval 报告 | md | 文档根 eval/ | 只读浏览 |
| 回流时效 | metric | 感知 | ≤5s |

### States

| State | Display | Trigger |
|-------|---------|---------|
| empty | 「暂无提案」+ 路径说明 | proposals/ 为空 |
| loading | 加载指示 | 首次/切换项目 |
| populated | 提案列表 | ≥1 提案 |
| detail | 正文 + eval 只读 | 点击提案 |

### Validation Rules

- 全页面零状态写入口(只读硬约束)
- 渲染经 MarkdownView 白名单(防注入)
- 无关联 feature 的提案不显示徽标(管线早期形态,正常态)

---

## Page Composition

| Page | Type | UI Functions | Position Notes |
|------|------|-------------|----------------|
| `workbench/overview`(概览,第一 tab) | existing | UF3, UF4 | 迁移入口(项目卡片区)+ 偏好设置区;M2 UF1/UF6 既有能力不动 |
| `workbench/proposals`(提案,第二 tab) | new | UF5 | 工作台第二 tab;提案 → feature 追溯链 |
| `workbench/features`(Feature,第三 tab) | existing | UF2 | stepper 强化 + 偏离标识 + 阶段资产面板;M2 UF4 既有能力不动 |
| `workbench/tasks`(任务,第四 tab) | existing | UF1 | 工具栏派发入口 + 卡片/侧板编排态与审批;M2 UF2/UF3/UF5 既有能力不动 |
| 注册向导浮层 | existing | UF3(迁移确认步骤) | 步骤 ② 后插入;仅检出 index.json 时 |
