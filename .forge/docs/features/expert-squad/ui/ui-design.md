# UI 设计：专家团管理面板（web）· v2

风格基准：根目录 `DESIGN.md`（官方 dsh 令牌体系，`.dswf-*` 自绘面前缀，零裸值）。

v2 范围修订（用户裁决）：卡片网格（大卡、内容丰富：信条三行 + 技能/白名单两组 chips + 委派次数与更新时间页脚）；详情 = Dialog 查看/编辑双模式；删除入职向导；删除委派按钮——修改、委派一律走会话对话；**[+ 招聘（HR）] 按钮打开 HR 预设招聘对话**；面板承担浏览、检索、查看、编辑、启停。

## 设计系统（本特性消费的令牌子集）

- 底色：bg-base `#ffffff` / dark `#151517`；浮面 bg-layer-2；描边 0.5px border-l4
- 文本：primary / secondary `#61666b`/`#cfd3d6` / tertiary / caption
- 强调：business-primary `#4176e6`（dark `#7aaaff`）；状态色 Success `#22c55e` / Error `#ec1313`/`#f25a5a`
- 字阶：H1 20/28·500、Body 14/22、Caption 13/20、Small 12/18
- 圆角：卡片 radius-md 12、Dialog radius-lg 16；阴影 lv2（卡片 hover）、lv3（Dialog）
- 组件复用：Button、Input、Tag、Tooltip、Modal（Dialog）、Switch；自绘面：专家卡片、状态灯、履历时间轴

## Navigation Architecture

- 落位：工作台 `main` 槽 keyed 面板（单一入口；面板内仅一层 Dialog）
- 视图：卡片网格（主视图）→ 详情 Dialog（查看 ⇄ 编辑双模式）
- 招募/修改/委派/追问全部走会话对话（主会话或 HR 预设）；面板 [召唤] 按钮 = 打开 HR 预设招聘对话（消息式 Modal：用户输入需求 → HR 调管理工具建档 → 回执建档结果，面板列表联动刷新）

## F1 专家卡片网格（主视图）

组件树：

```text
└─ dswf-expert-panel
   ├─ dswf-panel-header
   │  ├─ 标题「专家团」（H1）
   │  ├─ dswf-search-input（即时过滤名称/技能标签）
   │  ├─ 状态过滤（全部/启用/禁用）
   │  └─ Button primary「召唤」→ 打开 HR 预设招聘对话
   ├─ dswf-card-grid（auto-fill minmax(280px,1fr)，大卡）
   │  └─ dswf-xcard ×N
   │     ├─ 状态灯（7px 圆点）+ 名称
   │     ├─ 岗位（Small caption；禁用附「· 已禁用」且整卡降透明度）
   │     ├─ 信条摘要（三行截断）
   │     ├─ 技能标签 chips（段标「技能标签」）
   │     ├─ 工具白名单 chips（等宽字体，段标「工具白名单（子会话强制）」）
   │     └─ 页脚：累计委派次数 ｜ 更新时间
   └─ dswf-panel-footer（计数「N 位专家 · 显示 M」）
```

状态：加载 = 骨架卡片；空 = EmptyState（「还没有专家——在会话里对 HR 说『招募一个专家』」）；错误 = ErrorBar（重试）；无匹配 = EmptyState。
交互：点击卡片 → F2 Dialog。数据绑定：名称 ← name、岗位 ← title、信条 ← creed（截断）、chips ← skills、灯 ← enabled。

## F2 详情 Dialog（查看/编辑双模式）

```text
└─ Dialog（radius-lg 16，lv3，宽 480）
   ├─ 头部：状态灯 + 名称 ｜ [编辑（查看态）/ 保存（编辑态）] [✕]
   ├─ 查看态：岗位·启停 meta → 信条 → **能力描述**（专家具体能做什么）→ 技能 chips → 工具白名单 chips → 履历时间轴（**底部、默认折叠**）
   ├─ 编辑态：岗位 Input / 信条 Textarea / **能力描述 Textarea** / 工具白名单与技能标签共用**统一 chips 编辑器**（点击候选选用、点击已选移除、输入回车新增；工具候选来自全局工具注册表）
   └─ 底部：[禁用/启用]（右对齐）
```

- 模式切换：头部 [编辑] → 编辑态（字段预填）；[保存] 校验通过 → 写档案 + Toast「热刷新生效」→ 回查看态；校验失败（裸 `{{`、空岗位）→ 字段级错误，不落盘
- 禁用/启用：底部按钮即时生效，状态灯与卡片同步；禁用后卡片降透明度
- Esc / 遮罩 / ✕ 关闭；履历时间轴置底且默认折叠（`<details>`）——履历由派发执行追加，编辑态不出现

## 全局交互纪律（DESIGN.md 裁决继承）

- 加载/切换态覆盖层承载，禁卸载重排；中间态禁落空态分支
- 悬停提示一律 Tooltip；图标复用官方清单（Search / Close / Edit / Users）；零 emoji
