---
feature: "dsh-forge-m4"
---

# dsh-forge M4 — UI Functions

> Requirements layer: defines WHAT the UI must do. Not HOW it looks (that's ui-design.md).
>
> 路由为 PRD 层指示性命名,最终以 /tech-design 为准;本项目 web surface 尚无 sitemap.json(`docs/sitemap/` 不存在),existing-page 归属以本文件 Page Composition 为准,建议里程碑内补跑 `/gen-web-sitemap`。

## UI Scope

M4 全面 IA 重构的全部 UI 面:项目列表页(新)、项目工作台三区容器页(新)、代码区会话列表与 subagent 归拢(增强)、feature 阶段感知视图(增强)、任务详情绑定会话反查(增强)、subagent 会话任务元数据(增强)、三区位置选择器(增强)、项目设置投影与归档(增强)、分屏(新)、多窗口(新)。

## Navigation Architecture

- **Platform**: web(桌面 Electron 载体,指针驱动)

### Primary Navigation (shared across pages)

| # | Label | Target Page | Icon Keyword |
|---|-------|-------------|-------------|
| 1 | 项目列表(首页) | / | folder |
| 2 | 项目工作台 | /p/:projectId | layout-panel-left |
| 3 | 设置(壳级,继承 M1) | /settings | settings |

### Secondary Pages (navigated from a parent page)

| Page | Entry Point (UF# or action) | Return Target |
|------|-----------------------------|---------------|
| feature 视图 | UF2 forge 文件区 feature 列表项点击 | 项目工作台 |
| 任务详情 | UF4 任务面板任务点击(面板/抽屉形态,ui-design 定) | feature 视图 |
| 项目设置 | UF2 工作台头部入口 | 项目工作台 |
| 注册向导(增强) | UF1 空态 / 项目列表「新建项目」 | 项目列表 |
| 独立窗口(多窗口) | UF9/UF10「拆出为窗口」 | 拆出来源视图 |

### Navigation Rules

- Primary navigation is shared across pages:主导航 = 项目维度;项目工作台内区域切换(代码区/forge 文件区/知识区扩展位)为页内导航,不新增顶级路由
- Every secondary page must have back navigation targeting its entry point page
- Every navigation target must correspond to a page defined in this document;孤儿视图清零 = 不存在不在本表(及其后续 ui-design 扩展)内的 forge 视图入口

## UI Function 1: 项目列表页

### Placement

- **Mode**: new-page
- **Target Page**: /(应用启动首屏)
- **Position**: 应用根页;主导航第一项

### Description

项目维度的工作入口:活跃项目卡片列表 + 归档分区;新项目注册与项目打开;空态引导注册向导。

### User Interaction Flow

用户启动应用 → 呈现项目列表(卡片:名称、三区路径健康、活跃 feature 概要)→ 点击卡片进入项目工作台 →「新建项目」打开注册向导(UF7)→ 归档分区默认折叠,展开可查看已归档项目(只读,可恢复/删除)。

### Data Requirements

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| 项目卡片 | list | 项目注册表(SQLite) | 名称/归档状态/三区路径 |
| 三区路径健康 | enum(ok/degraded/invalid) | 路径探测 | 代码区/forge 文件区存在且可写 |
| 活跃 feature 概要 | text | feature_snapshot | 最新活跃 feature 与阶段 |
| 归档分区 | list | 项目注册表 | 折叠态,含恢复/删除操作 |

### States

| State | Display | Trigger |
|-------|---------|---------|
| empty | 空态引导「注册第一个项目」→ UF7 | 无项目 |
| populated | 项目卡片 + 归档分区 | 有项目 |
| loading | 骨架屏 | 首屏加载 |
| path-degraded | 卡片角标提示路径异常 | 路径探测失败 |

### Validation Rules

- 归档项目不在活跃列表展示;恢复操作将项目移回活跃区(投影不变化——workspace 未移除)
- 删除操作仅对归档项目或经确认对话(删除 = 移除投影,SC3)

---

## UI Function 2: 项目工作台(三区容器)

### Placement

- **Mode**: new-page
- **Target Page**: /p/:projectId
- **Position**: 打开项目即达;M4 后的全部 forge 视图收纳宿主

### Description

三区容器页:代码区(左/主区之一)+ forge 文件区(以 feature 为组织中心)+ 知识区扩展位(仅 IA 位,无内容);页头部 = 项目切换、项目设置入口、分屏控制。

### User Interaction Flow

打开项目 → 工作台按记忆布局渲染三区 → 页内切换区域焦点 → forge 文件区默认呈现 feature 视图(UF4)→ 头部「设置」进入 UF8;「分屏」进入 UF9 布局操作。

### Data Requirements

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| 三区布局 | layout | 布局记忆(随项目) | pane 结构/比例/收起状态 |
| 项目上下文 | object | 项目注册表 | 名称/路径/归档态 |
| 区域内容 | view | UF3/UF4 及扩展位 | 知识区零空占位 |

### States

| State | Display | Trigger |
|-------|---------|---------|
| populated | 三区布局 + 内容 | 正常 |
| loading | 分区骨架屏 | 进入/切换项目 |
| error | 明确错误 + 重试按钮 | 工作台数据加载失败 |

### Validation Rules

- 知识区扩展位不得渲染任何空 tab/空视图/预置数据(SC2 断言)
- 布局状态写入随项目记忆;项目删除时清除

---

## UI Function 3: 代码区会话列表(含 subagent 归拢)

### Placement

- **Mode**: existing-page
- **Target Page**: /p/:projectId(代码区)
- **Position**: 代码区主列表;worktree/工作区状态条伴其下

### Description

项目会话列表:顶层会话条目;subagent 会话归拢于 parent 血缘树下、默认收起(计数徽标);任务归属徽标;worktree/工作区状态。

### User Interaction Flow

查看会话列表 → 顶层条目仅为主会话(subagent 不平铺)→ 点击 parent 徽标展开内嵌后代列表(超 20 尾部「查看全部」)→ 点击任意会话打开视图(subagent 视图含任务元数据,UF6)→ 条目徽标显示任务归属(反向识别)。

### Data Requirements

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| 会话条目 | list | dsh 会话列表(项目 workspace 归组) | 顶层 = origin ≠ subagent |
| subagent 后代 | tree | 血缘索引(origin=subagent) | 默认收起 |
| 计数徽标 | text(运行中/总数) | 会话状态 + 血缘 | 如「3 / 12」 |
| 任务归属徽标 | badge | 血缘推断(会话↔任务) | 顶层与 subagent 均标 |
| worktree/工作区状态 | status | 代码区路径探测 | 健康态 |

### States

| State | Display | Trigger |
|-------|---------|---------|
| populated | 顶层条目 + 徽标 | 有会话 |
| collapsed(默认) | parent 条目 + 计数徽标 | 初始渲染 |
| expanded | 内嵌后代列表(递归收起) | 点击徽标/条目 |
| empty | 「暂无会话,发起第一个任务」引导 | 项目无会话 |
| overflow | 「查看全部」入口 | 后代 > 20 |

### Validation Rules

- 顶层列表永不出现 origin=subagent 条目(SC7 断言)
- 收起/展开状态随项目记忆
- 血缘推断超时(>100ms)降级:仅呈现顶层会话,徽标标「计算中/不可用」

---

## UI Function 4: feature 视图(阶段感知)

### Placement

- **Mode**: existing-page
- **Target Page**: /p/:projectId(forge 文件区主视图)
- **Position**: forge 文件区默认视图;feature 列表 → 单 feature 展开

### Description

以 feature 为组织中心:任务面板从属 feature;feature 视图按阶段(prd/design/tasks/in-progress/completed)呈现重点信息矩阵;执行阶段突出正在执行的任务。

### User Interaction Flow

进入 forge 文件区 → feature 列表(名称/阶段/进度)→ 打开 feature → 按当前阶段渲染重点信息(in-progress:执行进度 + 正在执行的任务卡片)→ 点击执行中任务 → 打开其 subagent 会话(UF6;无 subagent 时开顶层会话)→ 任务面板内点击其他任务进入任务详情(UF5)。

### Data Requirements

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| feature 列表 | list | feature_snapshot | slug/阶段/进度 |
| 阶段重点信息 | matrix | PRD 必答⑦矩阵 | 按阶段渲染 |
| 正在执行的任务 | list | in_progress × active 挂接(判定=PRD 裁决③) | 突出卡片 |
| 未挂接标注 | flag | in_progress 且无 active 挂接 | 「未挂接会话」 |
| blocked/suspended 提醒 | badge | task_snapshot | in-progress 阶段 |
| 阶段资产面板 | panel | M3 阶段资产(收纳) | 功能零缩水 |

### States

| State | Display | Trigger |
|-------|---------|---------|
| populated(按阶段) | 阶段矩阵对应内容 | 正常 |
| executing-focus | 执行进度 + 执行中任务卡片 | in-progress 且有执行中任务 |
| empty | 「创建第一个 feature」引导 | 无 feature |
| loading | 骨架屏 | 加载 |

### Validation Rules

- 任务面板必须处于 feature 上下文内(从属断言,SC2)
- 阶段判定透传 manifest 词表,不引入新状态词
- 点击执行中任务的打开路径不得多于 1 次点击(SC7/SC8)

---

## UI Function 5: 任务详情·绑定会话反查(增强)

### Placement

- **Mode**: existing-page
- **Target Page**: /p/:projectId(forge 文件区,任务面板内面板/抽屉)
- **Position**: M2/M3 任务详情扩展:新增「绑定会话」区

### Description

任务详情在既有字段(描述/依赖/执行记录)基础上,新增绑定会话区:挂接历史(active/ended)+ 执行 subagent 会话标识 + 一键打开。

### User Interaction Flow

打开任务详情 → 绑定会话区呈现挂接历史(新→旧)→ active 行展开其血缘内 subagent 执行会话(任务 id+title 命名)→ 点击会话条目打开(顶层走 session-focus;subagent 走 SubagentAddress)→ ended 行可展开查看历史。

### Data Requirements

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| 挂接历史 | list | session_links(含 ended) | 新→旧 |
| 执行 subagent | list | 血缘推断(active 顶层会话后代) | 运行时计算 |
| 打开动作 | action | session-focus / SubagentAddress | 通道对账归 tech-design |
| 任务元数据回显 | object | task_snapshot | 供 UF6 共用 |

### States

| State | Display | Trigger |
|-------|---------|---------|
| populated | 挂接历史 + 会话条目 | 有挂接 |
| no-link | 「未挂接会话」+ 发起入口 | 无 active 挂接 |
| inference-degraded | 仅顶层会话,血缘标注不可用 | 推断超时/失败 |

### Validation Rules

- 挂接历史完整呈现 ended 行(不删行语义,继承 M2)
- 打开失败(会话已不存在)→ 明确错误提示,不静默

---

## UI Function 6: subagent 会话视图·任务元数据(增强)

### Placement

- **Mode**: existing-page
- **Target Page**: /p/:projectId(代码区会话视图,dsh 原生视图注入)
- **Position**: 会话视图头部/信息区注入任务元数据条

### Description

subagent 会话打开时,呈现所执行任务的元数据(任务号/标题/状态/所属 feature),实现会话侧反向识别;血缘为权威,命名为辅助。

### User Interaction Flow

从 UF4/UF5/UF3 任一入口打开 subagent 会话 → 视图头部呈现任务元数据条(任务号+标题+状态)→ 点击元数据条跳回任务详情(UF5,双向互通)。

### Data Requirements

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| 任务元数据条 | object | 血缘推断 + task_snapshot | 任务号/标题/状态/feature |
| 双向跳转 | action | → UF5 | 元数据条点击 |

### States

| State | Display | Trigger |
|-------|---------|---------|
| bound | 元数据条呈现 | 血缘命中唯一任务 |
| ambiguous | 「该会话执行中」(会话级标注) | 多任务共会话(粒度局限) |
| unbound | 不呈现(普通 subagent 会话) | 血缘无任务归属 |

### Validation Rules

- 命名与血缘冲突时以血缘为准(命名仅辅助)
- 注入不得破坏 dsh 原生会话视图功能(零侵入,插件槽位体系内)

---

## UI Function 7: 三区位置选择器(注册向导/项目设置)

### Placement

- **Mode**: existing-page
- **Target Page**: 注册向导(M2 UF1 演进)与项目设置(两处复用同一组件)
- **Position**: 向导步骤项 / 设置「三区位置」节

### Description

经文件选择器选定代码区与 forge 文件区位置;知识区不提供选择器;即时校验与非法提示。

### User Interaction Flow

进入向导/设置 → 文件选择器选定代码区(必填,存在目录)→ 选定 forge 文件区(必填,默认承接 M3 文档根;可仓内/仓外)→ 即时校验(存在性/可写性/跨项目唯一/嵌套提示)→ 非法项即时标红并说明原因 → 合法后保存/完成注册。

### Data Requirements

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| 代码区路径 | path(必填) | 文件选择器 | 存在目录,绝对路径 |
| forge 文件区路径 | path(必填) | 文件选择器/输入 | 默认 = M3 文档根 |
| 校验结果 | per-rule result | 主进程校验 | 存在/可写/唯一/嵌套 |

### States

| State | Display | Trigger |
|-------|---------|---------|
| valid | 通过标识 | 全规则通过 |
| invalid | 规则级错误提示 | 任一规则失败 |
| creating | 「目录不存在,将创建」确认 | forge 文件区新路径 |

### Validation Rules

- 代码区必须存在且可写;forge 文件区允许不存在但需确认创建
- 同一目录不可注册为两个项目的代码区(继承 M2 唯一性)
- forge 文件区位于代码区内合法,仅信息提示(仓内 docs/ 形态)
- 非法提示不阻断修正(留在当前步骤)

---

## UI Function 8: 项目设置·投影与归档

### Placement

- **Mode**: existing-page
- **Target Page**: /p/:projectId/settings
- **Position**: 项目设置「投影与生命周期」节

### Description

项目生命周期操作与投影状态:改名、归档/恢复、删除;投影状态呈现(健康/降级/偏差)与手动重试;dsh 侧偏差提示呈现。

### User Interaction Flow

打开设置 → 查看投影状态(健康/降级/偏差明细)→ 降级时「重试投影」→ 改名(投影同步)→ 归档(确认后移入归档分区,workspace 保留)→ 归档项目可恢复或删除(删除经确认对话,移除投影)。

### Data Requirements

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| 投影状态 | enum(healthy/degraded/deviation) | 对账结果 | 含偏差明细 |
| 生命周期动作 | actions | 项目注册表 | 改名/归档/恢复/删除 |
| 归档语义说明 | static copy | PRD 必答⑤ | 归档 ≠ 删除 |

### States

| State | Display | Trigger |
|-------|---------|---------|
| healthy | 同步正常 | 对账一致 |
| degraded | 降级提示 + 重试 | 投影写失败 |
| deviation | 偏差明细(不回流说明 + 建议) | dsh 侧手改 |

### Validation Rules

- 改名同步投影;失败降级不阻断改名本身(本地生效,投影待重试)
- 删除必须经确认对话;删除后布局记忆随之清除
- 偏差仅提示,任何入口不得触发反向写

---

## UI Function 9: 分屏布局

### Placement

- **Mode**: existing-page
- **Target Page**: /p/:projectId(工作台布局层)
- **Position**: 工作台头部「分屏」控制;pane 作用于三区内容视图

### Description

项目工作台内同屏多视图(典型:左会话右任务面板);pane 增删与比例调整;布局随项目记忆。

### User Interaction Flow

工作台头部「分屏」→ 添加 pane → 选择视图(会话/feature 任务面板/看板类)→ 拖拽调比例 → 关闭 pane → 布局自动记忆;重进项目恢复。

### Data Requirements

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| pane 结构 | layout tree | 布局记忆 | 视图类型/比例/顺序 |
| 可选视图 | enum list | 代码区/forge 文件区视图 | ui-design 定枚举 |

### States

| State | Display | Trigger |
|-------|---------|---------|
| single(默认) | 单视图 | 初始 |
| split | 多 pane 同屏 | 添加分屏 |
| restored | 上次布局 | 重进项目 |

### Validation Rules

- 分屏不改变视图本身的功能面(复用同一视图组件)
- 与 M1 托盘/单实例行为对账(设计期);布局记忆随项目

---

## UI Function 10: 多窗口

### Placement

- **Mode**: existing-page
- **Target Page**: 独立窗口(从工作台 pane「拆出为窗口」)
- **Position**: pane 操作菜单「拆出」;窗口集合随项目记忆

### Description

将项目内视图拆出为独立窗口并行观察;独立窗口仍属同一应用实例(单实例约束);拆出窗口集合随项目记忆。

### User Interaction Flow

pane 菜单「拆出为窗口」→ 视图迁入新窗口 → 主窗口与独立窗口并行操作 → 关闭独立窗口可「收回」主窗口(或记忆保持拆出态)。

### Data Requirements

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| 窗口集合 | list | 布局记忆 | 视图类型/尺寸/位置 |
| 收回动作 | action | 布局记忆 | 独立窗口 → 主窗口 pane |

### States

| State | Display | Trigger |
|-------|---------|---------|
| single-window(默认) | 仅主窗口 | 初始 |
| multi-window | 主 + 独立窗口并行 | 拆出 |
| restored | 重进恢复拆出态 | 布局记忆 |

### Validation Rules

- 全部窗口同属单实例;关闭主窗口 = 退出应用(继承 M1,设计期对账)
- 交付顺序:分屏(UF9)先于多窗口(P4 内先后)

---

## Page Composition

| Page | Type | UI Functions | Position Notes |
|------|------|-------------|----------------|
| /(项目列表) | new | UF1 | 启动首屏 |
| /p/:projectId(项目工作台) | new | UF2, UF3, UF4, UF5, UF9, UF10 | 三区容器宿主页 |
| /p/:projectId/settings(项目设置) | new | UF7, UF8 | 工作台二级页 |
| 注册向导(增强) | existing(M2 UF1 演进) | UF7 | 项目列表入口 |
| subagent 会话视图(dsh 原生,注入) | existing | UF6 | 代码区会话视图内 |
