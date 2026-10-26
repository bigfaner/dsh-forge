# UI 设计：专家团管理面板（web）· v2

风格基准：根目录 `DESIGN.md`（官方 dsh 令牌体系，`.dswf-*` 自绘面前缀，零裸值）。

v2 范围修订（用户裁决）：卡片网格（大卡、内容丰富：人设摘要三行 + 技能/白名单两组 chips + 更新时间页脚）；详情 = Dialog 查看/编辑双模式；删除入职向导；删除委派按钮——修改、委派一律走会话对话；**[召唤] = 打开 HR 预设官方会话（复用 chat-view 切 HR 预设，不自建消息 Modal）**；面板承担浏览、检索、查看、编辑、启停。

## 设计系统（本特性消费的令牌子集）

- 底色：bg-base `#ffffff` / dark `#151517`；浮面 bg-layer-2；描边 0.5px border-l4
- 文本：primary / secondary `#61666b`/`#cfd3d6` / tertiary / caption
- 强调：business-primary `#4176e6`（dark `#7aaaff`）；状态色 Success `#22c55e` / Error `#ec1313`/`#f25a5a`
- 字阶：H1 20/28·500、Body 14/22、Caption 13/20、Small 12/18
- 圆角：卡片 radius-md 12、Dialog radius-lg 16；阴影 lv2（卡片 hover）、lv3（Dialog）
- 组件复用：Button、Input、Tag、Tooltip、Modal（Dialog）、Switch；自绘面：专家卡片、状态灯

## Navigation Architecture

- 落位：工作台 `main` 槽 keyed 面板（单一入口；面板内仅一层 Dialog）
- 视图：卡片网格（主视图）→ 详情 Dialog（查看 ⇄ 编辑双模式）
- 招募/修改/委派/追问全部走会话对话（主会话或 HR 预设）；面板 [召唤] 按钮 = 打开 HR 预设官方会话（复用既有 chat-view 切 HR 预设，不自建消息 Modal）；召唤会话默认绑定用户当前打开的工作区——dsh-forge 形态工作区按 workspaceId/cwd 归属解析对应项目后再绑定（对齐 useWorkspaceProjectMap / worktree 锚定判例）

## F1 专家卡片网格（主视图）

组件树：

```text
└─ dswf-expert-panel
   ├─ dswf-panel-header（2026-10-25 用户裁决：搜索+筛选左置、召唤独右）
   │  ├─ 标题「专家团」（H1）
   │  ├─ dswf-search-input（即时过滤名称/技能标签，左置紧随标题）
   │  ├─ dswf-status-select（状态筛选 select：全部/启用/禁用 三态；native select 基座 + dswf 令牌包装——官方 primitives 无同语义 Select）
   │  └─ Button primary「召唤」（独占右侧）→ 打开 HR 预设官方会话（复用 chat-view）
   ├─ dswf-card-grid（auto-fill minmax(280px,1fr)；1.60 裁决：同键聚组——组为网格单元）
   │  └─ dswf-xgroup ×N（组容器：data-expert-key）
   │     ├─ xg-head：键名（等宽）+ 来源数 + [展开对比]（仅同键多来源组）
   │     ├─ dswf-xcard（生效卡，首张）
   │     │  ├─ 状态灯（7px 圆点）+ 名称 + **英文标识 chip**（等宽字体）+ **来源角标**（项目/用户/内置三态，`origin-badge origin-{project|user|plugin}`）+ **「生效」标**（遮蔽胜出层）
   │     │  ├─ 岗位（Small caption；禁用附「· 已禁用」且整卡降透明度）
   │     │  ├─ 人设摘要（三行截断）
   │     │  ├─ 技能标签 chips（段标「技能标签」）
   │     │  ├─ 工具白名单 chips（等宽字体，段标「工具白名单（子会话强制）」）
   │     │  └─ 页脚：更新时间
   │     └─ dswf-xshadow ×N（被遮蔽卡折叠摘要行，只读）：来源角标 + 岗位 + 更新时间 + 「被遮蔽 · 只读」；点击展开 dswf-xcompare
   │        └─ dswf-xcompare（展开对比）：字段对齐表（字段｜生效卡｜被遮蔽卡）——岗位/简介/人设/工具白名单/技能五行，差异格 `diff` warn 高亮
   └─ dswf-panel-footer（计数「N 位专家 · 显示 M」——N/M 按专家键数计；组内来源数在组头标注）
```

状态：加载 = 骨架卡片；空 = EmptyState（「还没有专家——在会话里对 HR 说『招募一个专家』」）；错误 = ErrorBar（重试）；无匹配 = EmptyState。
交互：点击生效卡 → F2 Dialog；点击被遮蔽摘要行或组头「展开对比」⇄ 收起对比表（默认折叠）。
数据绑定：名称 ← name、**标识 chip ← name（英文键正本）**、岗位 ← title、人设摘要 ← 正文（截断）、chips ← skills、灯 ← enabled、来源角标 ← origin（1.60 聚组载荷：同键全层条目 + effective 位）、生效标 ← effective=true。
操作语义：编辑/启停仅生效卡持有（写 project 层既有链路）；被遮蔽卡只读（「提升为 project 定制」类动作不在本期，留待后续裁决）。

**档案语义分层**：`name` 英文标识 = 键正本（派发字符串键，不注入内容）；`description` 简介 = 何时委派我（选人依据）；正文「**人设（Persona）**」= Markdown 自由输入，派发时由使用方组装为 `SubagentStartRequest.persona` 注入子会话（做什么/不做什么与执行原则合一，不拆分强加结构）。履历（工作记录：执行任务与委派主/子会话）**不在本期**——派发链产物，归独立提案。

## F2 详情 Dialog（查看/编辑双模式）

```text
└─ Dialog（radius-lg 16，lv3，宽 680、max-height 88%）
   ├─ 头部（列布局，唯一分隔线在头部容器底）：标识行（状态灯 + 名称 + **英文标识 chip** ｜ [禁用/启用（查看态；编辑态隐藏）] [编辑（查看态）/ 保存（编辑态）] [✕]）+ 来源行（1.67 裁决：降位弱化——见下）
   ├─ 来源行（1.67 用户裁决）：标识行下一行，「来源」lead + 来源角标（`origin-badge origin-{project|user|plugin}`，具名「项目 · <名>」）+ 被遮蔽同名提示；字体次级色弱化令牌；**无「生效」徽标**——生效序判定依赖当前项目语境，Dialog 无法判定用户在哪个项目（列表侧生效标不受影响）；内置/user 角标尾缀 **? 图标**，hover tooltip（原生 title 机械）：内置 = 随插件分发的兜底档案、user = 当前用户全局档案（跨项目共享）；project 无 ?
   ├─ 查看态：岗位·启停 meta → 简介（何时委派我）→ 人设（Persona · Markdown 渲染）→ 工具白名单 chips → 技能 chips
   ├─ 编辑态：岗位 Input / 简介 **Textarea（默认 2 行、最多 6 行自适应；上限 120 字 ≈ 6 行 × 20 全角字/行，依据 Dialog 内容宽 652px ÷ 14px Body 字号）** / 人设 **Markdown 文本域（默认 12 行、最多 100 行自适应，自动换行；不设字数硬限，滚动上界兜底）** / 工具白名单与技能标签均为 **multi-select 控件**（box 显已选 chips + 下拉勾选菜单；技能可新增；菜单相对字段定位、在 Dialog body 滚动边界内无底部遮挡）；**统一排序：工具在上、技能在下**；**英文标识 `name` 不可改（键正本）**
   ├─ 查看态渲染：人设（Persona）经 **MarkdownDoc（官方件）** 渲染——标题/加粗/行内代码/列表；其余段纯文本
   └─ （无底部工具栏——启停钮在头部）
```

- 模式切换：头部 [编辑] → 编辑态（字段预填）；[保存] 校验通过 → 写档案 + Toast「热刷新生效」→ 回查看态；校验失败（裸 `{{`、空岗位）→ 字段级错误，不落盘
- 禁用/启用：头部按钮即时生效（查看态在场、编辑态隐藏），状态灯与卡片同步；禁用后卡片降透明度
- Esc / 遮罩 / ✕ 关闭

## 全局交互纪律（DESIGN.md 裁决继承）

- 加载/切换态覆盖层承载，禁卸载重排；中间态禁落空态分支
- 悬停提示一律 Tooltip；图标复用官方清单（Search / Close / Edit / Users）；零 emoji
