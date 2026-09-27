---
feature: "dsh-forge-m4"
---

# dsh-forge M4 — UI Functions

> Requirements layer: defines WHAT the UI must do. Not HOW it looks (that's ui-design.md).
>
> 路由为 PRD 层指示性命名,最终以 /tech-design 为准;本项目 web surface 尚无 sitemap.json(`docs/sitemap/` 不存在),existing-page 归属以本文件 Page Composition 为准,建议里程碑内补跑 `/gen-web-sitemap`。
>
> **对账(2026-09-25,原型验收回写)**:工作台 IA 已按验收原型定形 —— 布局线框权威 = `ui/workbench-layout-v2.md`(v2.9 + 评审裁决 #15–#23,共八批);UF2 / UF3 / UF7 / UF8 与 Page Composition 已同步更新。
> **对账(2026-09-26,注册交互重构)**:项目创建改「添加项目确认卡」(文档位置预览行 + 证据三档门控 + 零 git 强制);上游裁决 = `docs/decisions/project-storage-and-knowledge.md` §5 v2;UF7 全文重写。

## UI Scope

M4 全面 IA 重构的全部 UI 面:项目工作台三区容器页(新,**启动首屏**;项目枚举/切换/归档并入左栏全项目树,独立项目列表页裁撤 —— 2026-09-27 裁决)、代码区会话列表与 subagent 归拢(增强)、feature 阶段感知视图(增强)、任务详情绑定会话反查(增强)、subagent 会话任务元数据(增强)、三区位置选择器(增强)、项目设置投影与归档(增强)、分屏(新)、多窗口(新)。

## Navigation Architecture

- **Platform**: web(桌面 Electron 载体,指针驱动)

### Primary Navigation (shared across pages)

| # | Label | Target Page | Icon Keyword |
|---|-------|-------------|-------------|
| 1 | 项目工作台(启动首屏) | /p/:projectId(无活跃项目 → 空态) | layout-panel-left |
| 2 | 设置(壳级,继承 M1) | /settings | settings |

### Secondary Pages (navigated from a parent page)

| Page | Entry Point (UF# or action) | Return Target |
|------|-----------------------------|---------------|
| feature 视图 | UF2 forge 文件区 feature 列表项点击 | 项目工作台 |
| 任务详情 | UF4 任务面板任务点击(面板/抽屉形态,ui-design 定) | feature 视图 |
| 项目设置 | UF2 工作台头部入口 | 项目工作台 |
| 添加项目确认卡 | 工作台左栏 ＋ / 工作台空态(无项目) | 当前页(原位弹卡,不跳页) |
| 独立窗口(多窗口) | UF9/UF10「拆出为窗口」 | 拆出来源视图 |

### Navigation Rules

- Primary navigation is shared across pages:主导航 = 项目维度;项目工作台内区域切换(代码区/forge 文件区/知识区扩展位)为页内导航,不新增顶级路由
- Every secondary page must have back navigation targeting its entry point page
- Every navigation target must correspond to a page defined in this document;孤儿视图清零 = 不存在不在本表(及其后续 ui-design 扩展)内的 forge 视图入口

## UI Function 1: 项目枚举与切换(左栏全项目树)

> 2026-09-27 裁决:启动首屏 = 项目工作台(project-home);独立项目列表页裁撤,项目枚举/切换/归档分区并入工作台左栏全项目树(与 UF3 同容器)。原「项目列表页」的数据/校验语义保留,宿主变更。

### Placement

- **Mode**: embedded(原 new-page 独立页裁撤)
- **Target Page**: /p/:projectId(工作台左栏「项目」区;应用启动首屏)
- **Position**: 左栏全项目树 L1 层(项目 → 会话 → subagent 三级)

### Description

项目维度工作入口(并入左栏):全项目树枚举(归档项目降透明只读呈现)、点击项目行切换工作台项目、路径健康角标、区头 ＋ 添加项目(UF7);归档分区语义保留为树内分区。

### User Interaction Flow

启动应用 → 直接进入项目工作台(恢复上次活跃项目;无项目 → 工作台空态引导「添加项目」)→ 左栏全项目树枚举全部项目 → 点击项目行 = 切换工作台项目(整台跟随)→ 区头 ＋ 打开添加项目确认卡(UF7)→ 归档项目在树内降透明呈现(只读,不挂会话),恢复/删除经行菜单。

### Data Requirements

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| 项目树 L1 行 | tree | 项目注册表(SQLite) | 名称/归档状态/路径健康角标 |
| 路径健康 | enum(ok/degraded/invalid) | 路径探测 | 代码区/forge 文件区存在性;可写性为运行时状态 |
| 归档项目 | 树内降透明行/分区 | 项目注册表 | 只读,不挂会话;恢复/删除行菜单 |
| 活跃项目指针 | id | app_state | 启动恢复;切换即写 |

### States

| State | Display | Trigger |
|-------|---------|---------|
| empty | 工作台空态:hero 引导「添加项目」→ UF7 | 无项目 |
| populated | 全项目树(分组 × 排序;归档降透明分区) | 有项目 |
| loading | 左栏骨架屏 | 首次装载 |
| path-degraded | 项目行角标提示路径异常 | 路径探测失败 |

### Validation Rules

- 归档项目不在活跃分组展开;恢复操作将项目移回活跃区(投影不变化——workspace 未移除)
- 删除操作仅对归档项目或经确认对话(删除 = 移除投影,SC3;删除当前项目 → 工作台落到其余项目或空态)

---

## UI Function 2: 项目工作台(三区容器)

### Placement

- **Mode**: new-page
- **Target Page**: /p/:projectId(应用启动首屏,2026-09-27 裁决;无活跃项目 → 空态)
- **Position**: 启动直达;M4 后的全部 forge 视图收纳宿主

### Description

三区容器页(2026-09-25 原型验收定形):**左栏** = 全项目树侧栏(项目 → 会话 → subagent 三级;分组 × 排序视图选项);**中间** = dsh 会话面板(面包屑链 + 对话/轨迹双视图 + 输入卡;新会话 hero 相位);**右栏** = dockkit 页签容器(「开始」页 / 项目概览 / 文档 / 依赖图,整栏跟随当前项目)。知识区 = 右栏面板注册制的扩展位(不渲染,后续里程碑)。

### User Interaction Flow

启动/切换项目 → 三区渲染(右栏默认收起,轨道归零)→ 左栏:点「新会话」建草稿(单例);会话行 hover ⋯ = 重命名 / 分叉 / 归档;区头「＋」原位弹注册向导对话框(UF7,不跳页)→ 中间:hero 相位输入卡左上可选项目与模式(标准 / PTC / 极简 / 创建);发首条消息后进入会话视图 → 右栏:会话头面板钮展开(收起/展开同一图标;⛶ 全屏覆盖会话列);「开始」页三卡片点击原位替换为对应面板 tab。

### Data Requirements

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| 左栏项目树 | tree | 项目注册表 + dsh 会话(血缘归组) | 分组(按项目树/按项目/单列表)× 排序(手动/最近更新);每组 5 条 + 溢出折叠 |
| 会话行 | list | dsh 会话列表 | 状态点优先级 + 相对时间;hover 时间位变 ⋯ 菜单 |
| 新会话草稿 | draft | 本地 | 单例;未发送不持久化(刷新还原) |
| 右栏 tab 集 | list | 会话内布局 | 开始页(可关闭)/ 概览(三子 tab)/ 文档 / 依赖图(DAG / 泳道双模式) |
| 布局记忆 | layout | 随项目 | 左栏宽/收起 rail、右栏宽/收起、内容列宽 |

### States

| State | Display | Trigger |
|-------|---------|---------|
| populated | 三区 + 会话面板 | 正常(已有消息的会话) |
| hero(新会话) | 中间头部塌缩;右上角无任何图标;项目/模式选择器在输入卡左上 | 新会话未发送首条消息 |
| loading | 分区骨架屏 | 进入/切换项目 |
| error | 明确错误 + 重试按钮 | 工作台数据加载失败 |
| archived | 归档横幅 + 只读态 | 项目已归档 |

### Validation Rules

- 新会话(未发送)同时仅一个:已存在时点「新会话」无效(no-op);草稿不持久化
- 会话头部右上图标(utilities + 面板钮)仅已发送会话呈现;新会话无任何头部图标
- 右栏全部 tab 关闭 = 自动回到开始页内容但无 chip,且隐藏「＋」;开面板经开始页三卡片
- forge 产物文档 tab 名 = `slug/产物名称`(目录树条目名,含子目录)
- 依赖图 feature 下拉可选项仅限本项目 feature,名称旁带状态徽标
- 知识区扩展位不得渲染任何空 tab/空视图/预置数据(SC2 断言)
- 布局状态写入随项目记忆;项目删除时清除

---

## UI Function 3: 会话列表增强(左栏项目树内,含 subagent 归拢)

### Placement

- **Mode**: existing-page
- **Target Page**: /p/:projectId(左栏项目树)
- **Position**: 左栏「项目」区;工作台打开即常驻

### Description

会话列表(2026-09-25 原型验收定形,dsw 行语言):会话行 = 状态点优先级 + 标题 + 相对时间(**无计数徽标**,计数入 hover 卡);subagent 归拢于血缘树下默认收起(行尾 ▾ 展开后代);hover 时间位变 ⋯ 会话菜单(重命名 / 分叉 / 归档);分组 × 排序视图选项;每组 5 条 + 溢出折叠。

### User Interaction Flow

查看列表 → 视图选项切分组(按项目树/按项目/单列表)与排序(手动/最近更新)→ 点击行打开会话 → hover 行尾 ⋯ 执行重命名/分叉/归档(归档无确认,行消失;恢复走设置「已归档会话」)→ 组内超 5 条折叠,点「展开其余 N 个会话」→ 项目行(文件夹图标,hover 换三角 caret)可展开任意项目的会话。

### Data Requirements

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| 会话条目 | list | dsh 会话列表(项目 workspace 归组) | 顶层 = origin ≠ subagent;状态点优先级:待输入 > 运行中 > subagent 运行中 |
| subagent 后代 | tree | 血缘索引(origin=subagent) | 默认收起,行尾 ▾ 递归展开 |
| 相对时间 | text | 会话更新时间 | 刚刚 / N 分钟 / N 天 |
| ⋯ 会话菜单 | actions | 会话 mutator | 重命名 / 分叉(复制为顶层)/ 归档(无确认) |
| 溢出 | flag | 每组 > 5 条 | 折叠行「展开其余 N 个会话」 |
| 已归档会话 | list | 归档会话注册 | 设置页恢复入口(UF8) |

### States

| State | Display | Trigger |
|-------|---------|---------|
| populated | 分组会话行 | 有会话 |
| collapsed(默认) | 血缘后代收起 | 初始渲染 |
| expanded | 内嵌后代列表(递归收起) | 点击 ▾ |
| overflow | 「展开其余 N 个会话」 | 每组 > 5 |
| empty | 「暂无会话,发起第一个任务」引导 | 项目无会话 |
| inference-degraded | 仅顶层会话行 + 降级说明 | 血缘推断 >100ms |

### Validation Rules

- 顶层列表永不出现 origin=subagent 条目(SC7 断言)
- 收起/展开与溢出状态随项目记忆;视图选项(分组×排序)持久化
- 血缘推断超时(>100ms)降级:仅呈现顶层会话行,不渲染后代层级;恢复后自动回完整模式
- 归档会话行消失;恢复经设置页「已归档会话」(UF8),不提供就地撤销

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

## UI Function 7: 项目创建·文档位置(添加项目确认卡 / 项目设置)

### Placement

- **Mode**: existing-page(同一确认卡组件三入口复用:项目列表「新建项目」/ 空态引导 / **工作台左栏区头「＋」原位弹卡**)
- **Target Page**: 原位确认卡(不跳页)+ 项目设置(/p/:projectId/settings「文档位置」节,事后迁移)
- **Position**: 注册唯一入口;知识区不上卡(M4 不渲染)

### Description

(2026-09-26 定形,上游裁决 = `docs/decisions/project-storage-and-knowledge.md` §5 v2)注册**唯一必答 = 代码区文件夹**(拖拽/粘贴/浏览);文档位置不做表单选择,以**预览行**呈现侦测预选(注册时刻读到写入承诺,✎ 展开才见模式+路径);过程留痕灰字告知。**零 git 强制**:无 `.git` 目录为一等公民,任何流程不得以「先 git init」为前置。

### User Interaction Flow

给路径 → 侦测(git / 仓内 forge 树特征 / 已注册 / 父目录多子仓)→ 卡:项目名(自动取文件夹名,✎ 可改)+ 侦测行 + **文档位置预览行**(证据三档预选:命中 forge 树 = 沿用仓内 / 有 `.git` = 仓内新建 `<root>\docs`(懒物化)/ 无 `.git` = **应用管理主路径**)+ 留痕灰字 + 高级折叠(自定义文档路径,仓外需授权)→ [添加项目] → 投影同步 + 快照就绪。已注册路径不出卡流程(卡内「已注册」提示,快车道 toast 打开);父目录误选 → 子仓 chips 一键选。

### Data Requirements

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| 代码区路径 | path(唯一必填) | 拖拽/粘贴/浏览 + 侦测器 | 存在且为目录 + 可读(注册校验);**可写性 = 运行时状态**(激活复检) |
| 文档位置预选 | enum(reuse / inrepo / app) | 证据三档门控 | 默认只由本仓证据决定,换路径即重估,**无跨项目黏性** |
| 项目名 | text(自动) | 文件夹名 / git 仓库名 | 可改,随时可改(左栏 ⋯ / 设置) |
| 高级自定义 | path(可选) | 输入 | 仓外需显式授权(BIZ-001/003 收窄至此) |

### States

| State | Display | Trigger |
|-------|---------|---------|
| valid | 侦测陈述 + 预览行(可添加) | 路径存在且未注册 |
| registered | 「已注册项目 — 同一代码根仅一个项目」+ 禁用 | 路径已注册 |
| nogit | 「未检测到 git — 文档将由应用管理」(信息,**非错误**) | 无 `.git` |
| missing | 「路径不存在」+ 禁用 | 目录不存在 |
| parent | 子仓 chips(≥2 `.git`) | 父目录误选 |
| custom-outside | 授权行(高级) | 自定义路径在代码根外 |

### Validation Rules

- 硬校验仅 2 条:代码区**存在且为目录 + 可读**;**跨项目唯一**(realpath 归一比对;嵌套/同仓 worktree/remote 重合仅软提示,工程口径见 decisions §5.5)
- `ERR_FORGE_NOT_DETECTED` **废止**(D1:desktop 无 `.forge`);未检出 forge 树不是错误,只是门控证据输入
- 零 git 强制:无 `.git` → 应用管理为主路径;`.git` 后至 → 一次性非模态「迁入仓内」建议(非强制)
- 黏性禁令:不跨项目携带仓内选择;仓内落点只来自本仓侦测命中或本卡显式动作
- 词汇统一「添加项目 / 文档位置」(废除「注册向导 / 档案区」);场景演示 chips 不上产品 UI
- 设置页「文档位置」= 双向迁移一等动作(迁入仓 / 迁回应用;应用管理形态带内部版本历史)

---

## UI Function 8: 项目设置·投影与归档

### Placement

- **Mode**: existing-page
- **Target Page**: /p/:projectId/settings
- **Position**: 项目设置「投影与生命周期」节

### Description

项目生命周期操作与投影状态:改名、归档/恢复、删除;投影状态呈现(健康/降级/偏差)与手动重试;dsh 侧偏差提示呈现。

### User Interaction Flow

打开设置 → 查看投影状态(健康/降级/偏差明细)→ 降级时「重试投影」→ 改名(投影同步)→ 归档(确认后移入归档分区,workspace 保留)→ 归档项目可恢复或删除(删除经确认对话,移除投影)→ 「已归档会话」区:搜索 + 逐条「解除归档」→ 会话行即时回左栏项目树(UF3)。

### Data Requirements

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| 投影状态 | enum(healthy/degraded/deviation) | 对账结果 | 含偏差明细 |
| 生命周期动作 | actions | 项目注册表 | 改名/归档/恢复/删除 |
| 归档语义说明 | static copy | PRD 必答⑤ | 归档 ≠ 删除 |
| 已归档会话 | list | 会话归档注册 | 搜索 + 解除归档(UF3 ⋯ 菜单归档的唯一恢复口) |

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
| /p/:projectId(项目工作台) | new | UF1, UF2, UF3, UF4, UF5, UF9, UF10 | **启动首屏**(2026-09-27 裁决;恢复上次活跃项目,无项目 → 空态);三区容器宿主页(左栏项目树 = 项目枚举/切换/归档 UF1 / 中间 dsh 会话面板 / 右栏 dockkit 页签;2026-09-25 定形);独立项目列表页裁撤 |
| /p/:projectId/settings(项目设置) | new | UF7, UF8 | 工作台二级页 |
| 添加项目确认卡(增强) | existing(M2 UF1 演进) | UF7 | 工作台左栏 ＋ / 工作台空态(原位弹卡,唯一入口) |
| subagent 会话视图(dsh 原生,注入) | existing | UF6 | 代码区会话视图内 |
