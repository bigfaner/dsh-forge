---
feature: "dsh-forge M2：forge 管线接管（状态层转正 + 插件执行链 + 任务/文档视图）"
platform: "web"
created: "2026-10-05"
status: "draft"
---

# dsh-forge M2 — UI Design（Web）

> 设计基线：**参考重构总纲原型（[`docs/proposals/dsh-forge-redesign/prototype/`](../../../../proposals/dsh-forge-redesign/prototype/)），核心不变，按 M2 范围细化**。设计语言（`--dsw-*` 令牌体系、行语言、状态点、chips、只读纪律、亮/暗双主题）与原型逐字一致；本设计只做四件事——①概览页签收窄为任务列表视图（DAG/泳道 = M3 预留；对账卡与漂移概念已按用户裁决移出）、②文档页签（SC4）以原型概览树 + dock 文档形态为母本细化、③会话头部挂接 pill 以原型 conv-actions 任务挂接 pill 为母本细化、④注册表单派生行沿用原型（含 hash8）并补疑似移动拒绝态。实现落位遵循产品现态（官方基座 + 产品内容叠加，fix-25 后）——落位机制（conversation.view roster / 官方右栏）归 tech-design。

## Design System

> 令牌来源 = 原型 `styles.css`（上游 ui-theme design-platform.css 实值校正版）；**样式纪律：只引用 `--dsw-*` 语义令牌，禁止裸色值/裸字号**（总纲 §风格一致纪律；产品侧由令牌 lint 机械强制）。亮/暗双主题经 `body[data-ds-dark-theme]` 切换。

### 核心令牌（亮主题 → 暗主题）

| 令牌 | 亮 | 暗 | 用途 |
|---|---|---|---|
| `--dsw-alias-bg-base` | `rgb(255,255,255)` | `rgb(21,21,23)` | 页面底 |
| `--dsw-alias-bg-layer-1/2/3` | 白 → 灰阶 | `rgb(35,35,36)`→`rgb(53,54,56)` | 层级面（dock 面板 / 行 hover / 弹层） |
| `--dsw-specific-sidebar-fill` | `rgb(249,250,251)` | `rgb(27,27,28)` | 左栏/dock 轨底 |
| `--dsw-alias-label-primary` | `rgb(15,17,21)` | `rgb(249,250,251)` | 主文本 |
| `--dsw-alias-label-secondary` / `-tertiary` | `rgb(97,102,107)` / `rgb(129,133,140)` | 提亮 | 辅文本（`.t-aux` 12/18） |
| `--dsw-alias-link` | `rgb(65,118,230)` | `rgb(103,158,254)` | 链接/可点下划 |
| `--dsw-alias-interactive-bg-hover` / `-active` | `rgba(38,49,72,.06/.10)` | `rgba(255,255,255,.08/.14)` | 行/钮交互态 |
| `--dsw-alias-border-l1..l4` | 黑系 4%–16% | 白系 6%–20% | 发丝线（`--hairline: .5px`） |
| `--dsw-alias-state-error/success/warn-primary` | 红/绿/琥珀 | 提亮 | 状态点 / 错误条 |
| `--dsw-alias-toast-bg` / `-label` | 深灰 / 近白 | — | Toast |

排版：`--font-ui`（系统栈 + PingFang/YaHei）/ `--font-code`（等宽，task-id / 路径栏用 `.t-code`）；基准 14/22，辅文 12/18，标题 16/24（`.t-title`）。圆角：`--r-control:14px`（pill/输入）、`--r-menu:20px`（菜单/气泡）、`--r-card:12px`（卡片）、`--r-overlay:24px`（模态）。动效：`--ease` + `--t-fast/.1s`、`--t-mid/.2s`；`prefers-reduced-motion` 全禁。

### 组件基元（沿用原型，不新造）

| 基元 | 形态 | 用途 |
|---|---|---|
| `.pill` / `.pill.is-button` | r14 胶囊（可点态带 ▾） | feature 选择器、挂接 pill、运行态 |
| `.chip` | 紧凑标签（状态/计数） | feature 相位、只读徽标、文档类型 |
| `.state-dot`（ok/err/warn/idle，`breathing` 呼吸） | 6px 状态点 | 七态行/节点/会话行 |
| `.status-tag.st-*` | 任务状态标签（st-completed/in_progress/pending/blocked） | 任务行/时间线 |
| `.seg` / `.seg-btn` | 分段控件 | 视图切换（M2 仅「列表」） |
| `.tree-row.dir/.file` | 树行（▾ 折叠 / 📄 文件） | 文档列表（原型提案/feature 子tab 母本） |
| `.task-row` 族 | `task-id | title | ←N | ⟞N | 状态` 行 | 任务列表 |
| `.doc-head/-pathbar/-body` | 文档页签三段 | SC4 详情态（原型 renderDoc 母本） |
| `.crumb` / `.crumb-sep` | 面包屑段 | 会话位置（挂接 pill 邻位） |
| `.btn`（primary/soft/ghost + btn-sm） | 按钮 | 对话框/动作 |
| `.icon-btn` | 22px 图标钮 | 收展/关闭/在编辑器打开 |
| Toast / `.kb-empty` / 骨架行 | 反馈与空态 | 全局 |

焦点：`:focus-visible` 双线 outline（brand-primary）；键盘可达（Esc 关闭、Enter 确认、↑↓ 菜单移动）沿原型。

## Navigation

（继承 PRD `prd-ui-functions.md` Navigation Architecture——web 单页工作台；M2 新增右栏 dock 页签 ×2 + 会话头部元素 + 表单行升级，不新增路由。）

- dock 页签条（`rb-strip`）：chips 可见集 = 当前项目页签 + 全局页签（原型 dock 跟随纪律）；「概览」「文档」为**项目跟随页签**（项目切换 → 页签集切换不打断面板）；＋ 常驻无死面板。
- 页签内返回（文档详情 → 列表）= 视图态切换（Esc / ← / 返回钮），非关闭页签。

---

## UF-1 概览页签 · 任务列表视图

### Placement

右栏 dock 页签「概览」（chip 常驻当前项目集）；内容占满 `rb-body`，纵向滚动。M2 收窄说明：~~对账卡 / 项目信息卡（workspaceId 等）~~ 移出（用户裁决 2026-10-05——漂移类概念不进用户视野）；DAG / 泳道 = M3（视图 seg 预留位不渲染）。

### 组件结构

```
ov-tab
├─ ov-taskbar
│  ├─ feature pill（.pill.is-button）: ［<slug> ▾］＋ chip「<相位> <done>/<total>」
│  ├─ task-count-note（.t-aux）: 「N 条 · 状态直读（任务库）」
│  └─ 视图 seg：「列表」启用；DAG/泳道以**禁用占位**呈现（M3 接入同 seg——占位即预告，不可点）
├─ ov-statuschips（七态过滤行，细化新增）
│  └─ chip ×7：待办/执行中/已完成/阻塞/挂起/跳过/已拒绝（各带计数 + 前置状态点）
│     语义：多选交集过滤；全灭 = 全部显示（不出现空列表死态）
├─ task-list
│  ├─ task-group-label「执行中(N)」——in_progress ∪ blocked 置顶分组（原型核心保留）
│  └─ task-row（原型行语言，细化挂接双源）
│     ├─ task-id（.t-code，<feature>/<localId>）
│     ├─ task-title（ellipsis，title 全文）
│     ├─ task-deps「←N」（前置计数；title = 前置键清单）
│     ├─ task-links「⟞N」（挂接会话；title 分型列出：派发 s× / 执行 s×）
│     ├─ status-tag（七态色映射沿原型 TASK_ST）
│     └─ 行尾 ⋯（hover 显现）→ 菜单：展开时间线 / 转移状态 / 打开挂接会话
│  └─ 行展开态 task-detail（行下方缩进块）
│     ├─ task-timeline：审计记录按序（verb 图标 + from→to + 时间 + gate 结果摘要 + commit 短哈希）——auto-restore/auto-block 行专用色点
│     ├─ 挂接会话列表（两类分型行：⟞ 派发 / ⟞ 执行，点击打开会话）
│     └─ 「转移状态」按钮（人类通道入口）
└─ ov-footnote（.t-aux）：feature 绑定（无全局汇总）· 状态直读 · 应用零编排（tool 写入即时可见）
```

### States

| State | 呈现 | 触发 |
|---|---|---|
| 空态·feature 无任务 | `.kb-empty`：「任务由 run-tasks / addTask 产生——本 feature 暂无任务」 | 新 feature |
| 空态·项目零 feature | 页签级 `.kb-empty`：「未发现 feature 目录（docs/features/）——注册或首次打开后自动扫描建行」 | 非结构化仓（S9① 零命中形态，一等空态） |
| 空态·过滤无命中 | 「当前过滤组合无任务」+ 一键清过滤 | chips 组合过窄 |
| 加载中 | 行级骨架（SkeletonRows） | 库查询/重取 |
| 写入后刷新 | 受影响行/计数/相位 chip 即时更新（无整页闪动） | tool 写动词返回后单次重取（断言锚） |
| 人工转移被拒 | 错误 Toast（from≠to / reason 缺席 / 终值非法） | 服务端校验失败 |

### Interactions

1. feature pill → 菜单（feature 列表：slug + 相位 chip + done/total；当前项勾选）→ 切换即重拉列表。
2. 七态 chips 点选 toggle；计数实时（随写入重取刷新）。
3. 行点击 = 展开/收起时间线（惰性拉取，展开不离开列表上下文）；⋯ 菜单动作同置。
4. 「转移状态」→ 模态对话框：目标态选择（from≠to 约束——当前态禁用；终态提示）+ 原因输入（必填，textarea）+ 确认/取消（Esc）；确认后行即时更新，Toast 留痕「已转移 <key> → <状态>（reason 摘要）」。
5. task-links / 挂接会话行点击 → 左栏定位并打开对应会话（原型 sess-open 同径）。
6. 键盘：↑↓ 行移动 + Enter 展开；chips 可 Tab 达。

### Data Binding

| 元素 | 数据 | 来源（PRD Data Requirements） |
|---|---|---|
| feature pill / 菜单 | slug + 相位 + done/total | features（相位 = 推导机维护，只读） |
| 七态 chips 计数 | 按态计数 | tasks 按 feature 聚合 |
| task-row | key/title/type→图标省略/deps 计数/挂接计数/状态 | tasks + task_edges + 挂接双数据源（links ∪ records.session_id 分型） |
| task-timeline | verb/from→to/时间/gate/commit | task_records 按 (key, id) 序 |

---

## UF-2 文档页签 · 只读浏览（SC4）

### Placement

右栏 dock 页签「文档」（项目跟随，与「概览」并排）；两视图态：列表态（缺省）/ 详情态（页签内切换，返回不关页签）。

### 组件结构

```
doc-tab（列表态）
├─ doc-tab-head：标题「文档」+ .t-aux「docs/features · docs/proposals · 只读」
└─ doc-list（滚动；tree 行语言 = 原型概览提案/feature 子tab 母本）
   ├─ 组·提案（dir 行 ▾ docs/proposals/<slug>/ + 五态 chip）
   │  └─ file 行：📄 proposal.md（title = 摘要）→ 点击进详情态
   └─ 组·feature ×N（dir 行 ▾ <slug>/ + 相位 chip）
      └─ file 行：📄 <rel_path>（七类全收；title = 每文档摘要）→ 详情态
      （悬空行：⚠ 前缀 + 淡化——引用在、文件缺；仍可点入悬空详情态）

doc-tab（详情态）
├─ doc-head：← 返回 · 📄 <文件名> · 只读 chip（原型 renderDoc 母本）
├─ doc-pathbar（.t-code）：canonical 全路径（ellipsis + title 全文）
│  ├─ 「在编辑器中打开」icon-btn（📁 → 系统关联编辑器；应用零写入）
│  └─ ↻ 重读（只读重拉）
├─ doc-badges：类型 chip（proposal/prd-spec/tech-design/…）+（悬空 chip，若有）
├─ doc-abs（如有）：一句话摘要（feature_documents.summary / proposals 承载）
└─ doc-body：Markdown 只读渲染（frontmatter 不混入正文；代码块等宽）
悬空详情态：doc-head + pathbar 保留 + 占位面「⚠ 引用悬空——文件不在当前分支或已移动」+ 返回钮（不崩溃、不写入、不删行）
```

### States

| State | 呈现 | 触发 |
|---|---|---|
| 空态·零命中 | `.kb-empty`：「未发现结构化文档（docs/features · docs/proposals）」+ 目录约定一句话 | 非结构化仓（S9①；一等空态） |
| 悬空态 | 列表行 ⚠ 淡化；详情态占位面（见上） | 分支切换 / 文件移动（SC-branch） |
| 加载/渲染失败 | 骨架 / 错误条 + ↻ 重试 | 文件读取中/失败 |
| 长文档 | doc-body 独立滚动；pathbar 常驻 | 正文 > 视口 |

### Interactions

1. 组折叠/展开（tree-toggle 原型行为；记忆展开态于页签会话内）。
2. file 行点击 → 详情态；← / Esc / 返回钮 → 列表态（保持滚动位置与展开态）。
3. 「在编辑器中打开」→ 系统关联打开（Toast 留痕路径；悬空态该钮禁用）。
4. ↻ 重读 = 只读重新拉取（外部编辑后自取新文）。

### Data Binding

| 元素 | 数据 | 来源 |
|---|---|---|
| 列表组/行 | feature/proposal 行 + 文档索引（类型/相对路径/摘要） | feature_documents + proposals（发现面建行） |
| 详情正文 | 文件内容（Markdown） | 工作区文件只读 |
| 悬空标记 | 文件存在性判定 | 只读探测 |

---

## UF-3 会话头部挂接任务展示（SC6③ 挂接部分）

### Placement

中区会话面板头部 title-row 动作簇（`conv-actions`——原型母本位：crumbs 右侧、utilities 图标簇左侧；最终缝位 = tech-design §7-13 挂接部分必答，本设计给出母本位推荐）。hero 相位头部塌缩 → 不展示（无会话即无挂接）。

### 组件结构

```
conv-actions
├─ 挂接 pill（.pill.is-button）：⟞ <taskKey> · <状态词>（原型逐字母本；状态点随七态色）
│  多挂接：≤2 并排；>2 = 首 1 枚 +「+N」溢出 pill（点开菜单列全）
│  title / 菜单副行注明分型：「派发」（claim 会话）或「执行」（executor 子会话）
└─（既有元素不动：运行态 pill 等）
```

### States

| State | 呈现 | 触发 |
|---|---|---|
| 无挂接 | 不占位 | 会话未参与任务 |
| 有挂接 | pill(s) 在场，状态实时（写入后单次重取） | claim / submit 发生 |
| 任务已终态 | pill 状态词随库（completed/skipped/…），不自动消失（历史事实） | 任务完成/跳过 |

### Interactions

1. pill 点击 → 右栏切「概览」页签 + 选中 feature + 定位任务行（展开时间线）——原型 task-goto 同径。
2. 溢出「+N」→ 菜单（⟞ key · 状态 · 分型）逐项跳转。
3. 只读展示——头部不提供任何写入入口（只看不管）。

### Data Binding

| 元素 | 数据 | 来源 |
|---|---|---|
| 挂接 pill | taskKey + 当前状态 + 分型（派发=挂接表 / 执行=records.session_id 反查，并集） | 每工作区任务库（会话 id 双向查） |

---

## UF-4 注册表单任务清单派生行（升级）

### Placement

添加项目 · 注册表单（P1 既有「任务清单与记录」行）——位置/只读语义不变，值升级 + 新增拒绝态。

### 组件结构

```
表单行（原型母本逐字沿用）
├─ label「任务清单与记录」
└─ readonly input（.fb-static .t-code）：{dsh-forge-home}\{扁平化}-{hash8}
   title = 「统一存放于 {dsh-forge-home}/{canonical-path 扁平化}-{hash8 消歧后缀}，注册时自动派生」
疑似移动拒绝态（细化新增——确认注册后）
├─ 表单错误条（warn 色，表单底部）：「检测到同主体旧目录：{孤儿目录路径}（疑似工作区被移动）」
├─ 指引文案（.t-aux）：「请删除上述旧目录，或将工作区目录改回原名后重试——应用不自动迁移任务数据」
└─ 确认钮维持禁用直至用户重选/环境变化复检通过（重选目录即复检）
```

### States

| State | 呈现 | 触发 |
|---|---|---|
| 正常派生 | 只读行随选定目录即时更新（换选联动沿 P1 规则） | 选定/换选工作区 |
| 疑似移动 | 错误条 + 指引（见上）；确认被拒 | 注册预检发现同扁平化主体异 hash8 目录 |
| 复检通过 | 错误条消失，恢复正常确认 | 用户按指引处置后重选 |

### Interactions

1. 行只读（tabindex=-1）；换选工作区 → 派生串与预检状态随之重构。
2. 确认（疑似移动时）→ 不发起点注册链，仅呈现拒绝反馈（零副作用）。

### Data Binding

| 元素 | 数据 | 来源 |
|---|---|---|
| 派生串 | `{home}\{flatten}-{hash8}` | 应用侧单源下发（SC2 一致断言锚） |
| 疑似移动 | 同主体异 hash8 目录探测 | 注册预检 |

---

## 全局反馈与纪律

- **Toast**：转移留痕 / 编辑器跳转留痕 / 写入刷新不留痕（静默即时）。
- **零编排**：四 UF 均无「发起编排」入口；唯一写入口 = 人工转移对话框（人类通道）——其余状态变化全部来自 tool 侧写入的被动刷新。
- **只读纪律可视化**：文档页签只读 chip + 路径栏（原型母本）；「在编辑器中打开」= 跳转，应用零写入。
- **令牌纪律**：全部样式经 `--dsw-*`；亮/暗双主题同稿校验。

## 原型（prototype/）

本设计附 HTML 原型（`ui/prototype/`：index.html + styles.css + app.js + data.js，纯静态无依赖）——聚焦 M2 四 UF 的可交互走查：右栏 dock（概览/文档页签 + 即时刷新模拟）、会话头部挂接 pill、注册表单派生行（含疑似移动演示）；样式与令牌与总纲原型同源。

## 评审注记

- `auto.eval.uiDesign = true`（AUTO_RUN）但 **eval-ui 技能未安装于本机 harness skills 目录**——自动对抗评审无法执行，以本文件自检（PRD UF ↔ 设计逐条对齐 + 原型母本引用逐处标注）替代；偏差在此显式记账，不静默跳过。
- 与 PRD 的差异：一处——视图 seg 以禁用占位呈现 DAG/泳道（PRD「DAG/泳道 = M3 不渲染」的**可发现性强化**形态：占位不可点、无功能面）；已按 Step 10 以原型为准回写本文件。挂接 pill 呈现为短键（title 含全键与分型说明）——「taskKey」的显示细化，非语义差异。
