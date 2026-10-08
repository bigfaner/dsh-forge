---
created: "2026-10-08"
related: design/tech-design.md
---

# Page Map: dsh-forge M3 —— 自举·模式预设

> Platform = web（Electron renderer，apps/web）。M3 全部 UI 面 = **既有面的升级**（概览三子 tab / 设置对话框分区）+ 平台座位开关开启（hero `AgentPresetSeat` 非自建）；无新路由、无新 tab、左栏不加行、中区不加签。布局结构基准 = [ui-design.md](../ui/ui-design.md) v24（170 冒烟断言），视觉遵循官方样式纪律（`--dsw-*` 令牌唯一 / 官方件复用 / 界面说明最小化）。

## Page Overview

| Page | 类型 | 注册缝 / 落位 | 入口 | 返回 |
|---|---|---|---|---|
| 概览 · 提案子 tab（UF-1 升级） | 既有子 tab | `views/overview/proposal-tab.tsx` | 概览 tab 子 tab 切换 | 子 tab 切换 / chip × |
| 概览 · feature 子 tab（UF-4 升级） | 既有子 tab | `views/overview/feature-tab.tsx` | 同上 | 同上 |
| 概览 · 任务子 tab（UF-3 = M2 复刻 + 诊断 + 派发） | 既有子 tab | `views/overview/task-tab/` | 同上 | 同上 |
| 评审流转对话框 | 模态（官方 Modal） | proposal-tab 局部 | 提案行 ⋯ → 评审流转… | Esc / 取消（空因拒绝留场） |
| 模式更改对话框 | 模态（官方 Modal） | proposal-tab 局部 | ⋯ 或 mode chip 快捷入口 | Esc / 取消 |
| Forge设置 分区（UF-2） | 设置对话框新分区 | client-plugin `settings.section` slot（通用设置下方·多小节结构） | 设置入口 | 设置关闭 |
| hero 预设座位 | 平台 UI（非自建） | `ui-settings` 开关行开启后平台自现 | 新会话 hero | —（平台组件） |
| 新会话（提案/feature/诊断/派发渠道） | 既有面新增入口行为 | `openSessionWithPreset()` 组合子 + 跳转既有会话缝 | 行头「打开新会话」/ 诊断发送 / 任务子 tab「派发」 | 中区会话面常驻 |

## Pages

### 概览 · 提案子 tab（UF-1 完整形态）

- **Target File**：`apps/web/src/views/overview/proposal-tab.tsx`（M2 纯列表行 → 完整形态）+ `ProposalVerdictDialog.tsx` / `ProposalModeDialog.tsx`（新增局部组件）
- **Data Source**：`forge:proposals/list`（行增 mode + taskCount）；`forge:proposals/transition`（人工裁决·新 RPC）；`forge:proposals/setMode`（律三正门·新 RPC）；`forge:proposals/listDocs`（提案文档区·只读目录扫描——「文档不固定」数据源）；`forge:features/list`（谱系成链关联联读·superseded_by 取代链联查）；事件订阅刷新（写推送链既有）
- **结构**：五态 chips（0 计数 disabled·多选并集·切换清空）→ 提案行（标题 + **名称右侧 mode chip**：远征蓝/突击琥珀/无溯源「未标记」中性不可点 + 中文状态 tag + **「打开新会话」按钮** + ⋯ 菜单）→ 展开元数据（摘要独占一行；两列网格 `标识|作者` → `模式|谱系` → `创建|裁决`；文档区「文档（N 篇）」——提案文档不固定）
- **对话框**：评审流转 = 目标态仅列五态机允许集 + reason 必填（空因拒绝留场）+ **accepted 分叉文案**（远征 → 将单步成链建 feature；突击 → 直接进入任务阶段·无 feature）；模式更改 = 远征⇄突击二选 + 说明必填 + 快照不回溯一行明示
- **约束**：mode chip 与库一致（无溯源显示缺省占位）；错配守卫可见性不阻断

### 概览 · feature 子 tab（UF-4 升级）

- **Target File**：`apps/web/src/views/overview/feature-tab.tsx`
- **Data Source**：`forge:features/list`（谱系 proposal_id 关联链）；`forge:features/listDocs`（分层文档数据源·服务法 listFeatureDocs M2 已有·M3 开通道）；doc_kind→中文组名映射常量 = **apps/web 展示常量**（非 contracts——纯展示无跨端消费）
- **结构**：阶段 chips（进行中/需求/设计/任务/已完成/已归档——「阶段」原「相位」更名）→ feature 行（标题 + **远征 mode chip 只读（硬编码恒真）** + 阶段 tag + 「打开新会话」按钮）→ 展开元数据（摘要独占一行；两列 `标识|阶段` → `模式|谱系`）→ **分层文档**（中文分组标题「需求文档(N)/设计文档(N)/UI 文档(N)…」→ 文档行 `📄 dir/name` 相对 feature 目录真实路径 + [状态] › 整行可点 → dock 文档 tab）
- **约束**：feature 列表 = 远征内容（突击无 feature 阶段）

### 概览 · 任务子 tab（UF-3 = M2 全量复刻 + 诊断 + 派发）

- **Target File**：`views/overview/task-tab/`（M2 三视图全量复刻）+ 诊断/派发融入工具栏；`DiagToast.tsx`（新增）
- **Data Source**：`forge:tasks/validateFeatureTasks`（既有 RPC·feature 容器专用）；`forge:tasks/detail`（container 水化 = 任务失败诊断消息数据源）；容器 pill = `forge:features/list` ∪ `forge:proposals/list`（**taskCount > 0 判据——行级任务计数由 core JOIN 分组单查询**；前端组合两域读·MVC 跨域聚合归前端先例）；**派发可用态 = 当前容器任务终态判定（前端纯派生——终态集与相位推导机口径同源）；派发指令 = `/run-tasks <标识>` 模板串接（v23 最小消息·零额外数据依赖）；跳转目标 = 执行中任务最新派发挂接会话（taskDetail/sessionLinks——task_session_links ∪ records 双源）**
- **结构（v22 工具栏布局）**：工具栏控件一行（**容器 pill**：feature 容器远征点 + 突击提案容器琥珀点 + 「突击提案」标记 + 「无 feature 阶段」计数注 + **突击容器无「诊断」按钮** | **视图下拉**：pill 右侧·类模式切换下拉·当前视图直出 + ▾·选项 列表|DAG|泳道 | 右簇固定最右端：**[诊断] + [派发]**[诊断在左·派发居最右]）→ 三视图 M2 复刻 → 行内详情动作区**「诊断失败」按钮**（仅 blocked/rejected 任务；**无单任务执行动作**）
- **诊断两路**：feature 子图「诊断」→ toast 锚定按钮左侧（成功「子图健康 ✓」1s 自消；失败 = 五类检查逐项 + ✗ 含任务键 + 「发送给 agent」5s）；任务失败「诊断失败」→ 失败摘要 toast（状态+原因+最近记录+任务键·5s）+ 「发送给 agent」→ **打开新会话自动发送**（模式 = 任务容器对应模式：feature → 远征 / 突击提案 → 突击）
- **派发入口（v22/v23）**：「派发」按钮——当前容器存在未终态任务（pending/in_progress/blocked/suspended）亮起（**可点击态 = 与其它按钮同款式**）、全部终态置灰（**深灰实底·非透明淡出** + tooltip 说明——v24）；**执行中任务在场 → 跳转对应派发会话**（该任务最新派发挂接·不新建不重发不切模式）；**否则新开派发会话**（容器对应模式）+ **自动发送**派发指令——**「/run-tasks <容器标识>」单行最小消息**（v23：dispatchTask 唯一必要参数 = contextSlug；模板串接·无纯函数必要——背景/池快照/请求行废止：池快照由 dispatchTask 返回自附）；**无单任务直接执行入口**（dispatchTask 就绪选择 = 机械序）
- **约束**：概览 tab 默认 560px + 左缘拖拽 400–920（工具栏控件恒一行——pill/视图下拉/诊断/派发）

### Forge设置 分区（UF-2）

- **Target File**：apps/web client-plugin `settings.section` slot 注册（通用设置下方·**分区内多小节结构**——可承载多个配置小节，小节间明显视觉分隔，行式控件对齐 dsh 通用设置形态）
- **Data Source**：`forge:settings/get · set`（新 RPC → core forgeSettings → `{userData}/forge-settings.json`）
- **结构**：worker 小节（当前唯一小节）= **默认 LLM 三项**——Provider / Model（联动）/ Reasoning（低|中|高 三段），行式布局（标签左/控件右）；未配置态 = ⚠ 占位「worker 派发将回退父会话继承」+ 保存禁用（填齐激活·脏态实时）；保存失败 = 错误行留场可重试；「按任务类型指派特定 LLM」= 未来注记文案锚点
- **约束**：成功保存后下次派发即生效（dispatchTask 实时读，无重启）

### hero 预设座位（平台 UI——开关开启）

- 非本里程碑自建 UF：`ui-settings` 开关行首启预置开启后 hero 自现 `AgentPresetSeat`（折叠标签 = registry default 远征模式；菜单列双预设中文直出 order 1/2；blank 期点选即时切换；首回合后平台 blank 锁）。产品面职责 = 装配双预设 + 开关首启预置，不改平台座位组件。

### 新会话（提案/feature/诊断/派发渠道——入口行为）

- **Target File**：apps/web client-plugin `openSessionWithPreset({ mode?, prefill, autosend? })` 组合子 + **跳转既有会话**（平台「按会话 id 打开」缝——实施期核实）
- **行为序**：平台会话编排 API 创建 blank 会话 → mode 在场则 `agentPreset.select`（提案渠道 = 提案 mode·无溯源不切换；feature 渠道 = 固定远征；诊断发送 = 任务容器对应模式；**派发 = 容器对应模式，v22**）→ **composer 预填**（draft 缝·实施期核实）→ **autosend = 诊断两路 + 派发指令**（错误/派发直达例外——v22 扩容）；**派发跳转分支（v22）**：执行中任务在场 → 不新建，按其最新派发挂接会话 id 打开（task_session_links/claim 记录·taskDetail 水化）
- **预填内容**（`formatPrefill` 纯函数）：`@<docsRoot>/proposals|features/<标识>/` 第一行（docsRoot = docsRootOf(工作区, forge_dir) 数据推导——标准布局 `@.forge/docs/...`，仓外 forge 目录 = 绝对路径锚；2026-10-09 锚点修正）→ 名称/所属 → 摘要 → 状态/阶段 → 已生成文档真实路径清单 → **不含模式** → 末尾「我的意图：」空位（等待用户明确意图手动发送）

## Shared Components

| 组件 | 落点 | 说明 |
|---|---|---|
| ModeChip | `apps/web/src/components/` | 远征蓝/突击琥珀/未标记中性（只读与可点两态） |
| DiagToast | `apps/web/src/views/overview/task-tab/` | 锚定触发按钮左侧；1s/5s 双档；失败档含「发送给 agent」动作 |
| formatPrefill / formatDiagMessage | `apps/web/src/views/overview/`（纯函数） | 消息体组装（@path 首行 → 所属 → 摘要 → [阶段] → 主体 → 请求；不含模式）——组件测试锚，对齐 PRD 消息体示例 ×5（派发指令 ⑤ = `/run-tasks <标识>` 单行模板串接，非纯函数） |
| DocGroupList | `views/overview/feature-tab.tsx` 内 | 分层文档（doc_kind→中文组名映射常量 + 真实 rel_path 行） |
| 既有 EmptyState / SkeletonRows / ErrorBar / StateChip / KvChip | 既有 | 三态沿 P1/M2 形制 |

## Route Guard Configuration

不适用——M3 无新路由；全部面 = 既有 tab/子 tab 升级与 slot 注册制（`settings.section` / 平台座位开关），生命周期由官方右栏与设置对话框管理。
