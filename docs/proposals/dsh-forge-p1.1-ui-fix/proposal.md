---
created: "2026-10-03"
author: "faner"
status: Draft
intent: "enhancement"
---

# Proposal: dsh-forge P1.1 UI 修补轮（对齐 dsh 形态）

> 定位：P1 MVP 收官后的修补里程碑（「阶段或里程碑提案」口径，P1/M2 先例）。宪法输入 = 总纲 `dsh-forge-redesign/proposal.md`（官方样式纪律六条 / dsh 底子）；证据输入 = 走查报告 R1/R2（六轮实机走查 + CDP 实测）与 fix-5~10 任务档案。

## Problem

P1（M0+M1）虽已过 4.gate（MVP 门双步全绿），但六轮实机走查证明其 UI 实现与既定基准（dsh 官方形态 / 重构原型 / PRD 在案行为）存在 **7 处偏差**，其中含 1 处阻断性可用性缺陷与 1 处 P1 功能缺陷；且既有单测/e2e 体系对这些偏差存在**结构性盲区**（机械面断言看不见视觉/交互缺陷）。

### Evidence

- **走查报告链**（全在库）：[ui-walkthrough-round1.md](../../features/dsh-forge-p1-mvp/reports/ui-walkthrough-round1.md)（3 项视觉差异 + UF-1~7 总表 + 7 张实机↔原型对照截图）、[acceptance-round2.md](../../features/dsh-forge-p1-mvp/reports/acceptance-round2.md)（§5–§9 六轮补录：几何实测数据 / 4/4 复现率 / fix 完成态复测 / 全面矩阵）。
- **关键实证**：① 添加项目模态内容(560/680px) > 官方卡片(380px) 致左侧裁切——表单 label 不可见、浏览器列表左缘裁 300px（CDP 几何量取，两次修复后复测仍在）；② 知识浏览关键词键入被弹回 + 卡片网格整体消失（4/4 复现，四轮探针排除法收敛）；③ fix-3「完成」记录 AC 全勾但视觉裁切未修——**单测 132/132 绿 ≠ 修好**，机械面盲区的直接证据。
- 走查人实机复报四轮（表单裁切 / 侧栏缺件 / 会话 toolbar / dock 基座对齐）。

### Urgency

- 模态裁切**阻断 P1 核心流程**（注册表单）的可用性——「可演示 MVP」的用户承诺当前不成立。
- 并行会话 M2 管线已在途；UI 债不在此轮收口将滚入 M2，稀释里程碑主题并抬高 M2 基线噪声。

## Proposed Solution

七项修补整批立项为 **P1.1 里程碑**，三项配套机制：

1. **重新派生任务集**：fix-5~10 归档（superseded），按本提案派生 P1.1 任务集；全部根因/证据/复现载体经提案附录与报告链承接（零丢失）。
2. **双层验收制度化**：每项修补 = 视觉几何/交互断言强制入 e2e 池（机械面）+ 修复后 CDP 复测归档（证据面）；整批完成 = 走查人实机全量走查签字（人工面）。
3. **dsh 底子总纪律**：全部修补以官方件/官方槽位/官方基座为底（对齐 dsh 布局），dsh-forge 只叠内容；未点名元素一律保持现状。

### Innovation Highlights

无行业创新——本批的工程价值在于把「走查人肉眼发现、机械面看不见」的缺陷类**固化为可回归的几何/交互断言**（L3 式 computed 断言扩池），是 visual regression 思路的轻量落地（几何断言而非像素比对）。诚实说明：其余为标准缺陷修补与官方件对齐工作。

## Requirements Analysis

### Key Scenarios

| # | 场景（走查人视角） | 载体项 |
|---|---|---|
| 1 | 打开添加项目：两段内容完整可见（label 可读、列表不裁切） | 模态裁切修补 |
| 2 | 知识库搜关键词：输入生效、无结果有清除入口、清除恢复 | 关键词交互修补 |
| 3 | 会话面板顶部有 toolbar（标题 + 工具钮），对齐 dsh | toolbar 补齐 |
| 4 | 右栏 dock 与 dsh 桌面同形态同手感（chips/分栏/浮动） | dockkit 官方基座 |
| 5 | 左栏项目区四件套齐（搜索/视图选项/＋） | 侧栏补齐 |
| 6 | 轨迹 tab 打开有数据（消息/工具调用台账） | 轨迹接线 |
| 7 | 切视图往返，域过滤与域树激活标记一致 | 域树标记修补 |
| 回归 | UF-5 互换 / UF-7 三态与跟随 / 三页签 / e2e 池全绿 | 全项共担 |

### Non-Functional Requirements

- 官方件复用 + 令牌唯一（总纲样式纪律六条全程适用）；修补零平行自绘模式。
- SC2 直读纪律不破坏（侧栏过滤为客户端纯函数、快照数据源不变）。
- WCO（fix-2 无框形态）兼容：新增 UI 面与原生控制钮区避让核查入记录。
- 性能无回退：e2e 时长与首显行为不劣于 P1 基线。

### Constraints & Dependencies

- 上游全部精确 pin 0.2.0-rc.2（lockfile 口径），本批不开升级窗；dockkit 为该版静态库面（零 cordis）。
- 并行会话测试管线（journeys/contracts→scripts→run）在途：P1.1 任务执行与其时序避让（index.json 协作）。
- 走查复测工具链 = 净化 env + CDP 直连（本 harness 会话 playwright launch 受限的环境事实，报告 R2 §2.2 在案）。

## Alternatives & Industry Benchmarking

### Industry Solutions

视觉回归业内主流为像素级 snapshot 比对（Chromatic/Percy）或 DOM 几何断言（Playwright computed-style assertions）；缺陷批次管理主流为里程碑化集中收口 vs 散装 hotfix 流。

### Comparison Table

| Approach | Source | Pros | Cons | Verdict |
|----------|--------|------|------|---------|
| Do nothing | — | 零成本 | 阻断项在（注册表单不可用）；UI 债滚入 M2 | Rejected: 核心流程可用性不成立 |
| 散装 fix 任务继续跑（fix-5~10 原样） | 本仓现状惯例 | 零流程成本、证据链连续 | 走查人已裁决重派生；批次无总纲与统一验收口径 | Rejected: 用户裁决 + 缺制度化验收 |
| 并入 M2 提案作一节 | M2 先例 | 单提案管理 | 主题混淆（M2=任务域管线）+ 跨会话文件冲突 | Rejected: 里程碑主题纯度 |
| **P1.1 独立里程碑 + 双层验收 + 几何断言扩池** | 本提案 | 阻断项优先级显式化；验收制度化堵机械面盲区；M2 基线干净 | 新增里程碑流程成本（~0.5 天） | **Selected: 走查人四轮反馈的一致指向** |

## Feasibility Assessment

### Technical Feasibility

七项均已有一手根因与复现载体（附录 A）——非从零排查；官方 dockkit 契约面已勘明（S2 §2.5 + fix-10 勘面记录）；几何断言扩池有 L3 起步池先例与 georecheck 脚本母本。无技术不可行项；最大不确定 = dockkit 在 340px 窄轨的分栏可用性（已预记 `minPaneFraction`/`canSplit=false` 兜底口径）。

### Resource & Timeline

合计 ~15–17h（七项 + 验收机制 + 任务集派生/归档）；单人 2–3 个工作日。技能面已在本会话六轮走查中验证成熟。

### Dependency Readiness

上游包在 lockfile 就位（dockkit 已是 web 壳依赖树成员）；官方槽位/header 契约已清点（S2）；无外部服务依赖。

## Assumptions Challenged

| Assumption | Challenge Tool | Finding |
|------------|---------------|---------|
| 「单测/e2e 绿 = 修补完成」 | Stress Test（fix-3 完成态复测） | **Overturned**：AC 全勾 + 132 单测绿但视觉裁切未修 → 双层验收 + 几何断言强制入池（本提案核心机制） |
| 「dock 问题 = 样式打磨层面」 | Assumption Flip（走查人裁决） | **Overturned**：自研轨道 vs 官方基座是架构选择 → fix-10 基座替换路线 |
| 「fix 任务散装执行足够」 | Need Gate | **Overridden**：用户选择重新派生任务集（流程一致性优先）——`Challenge Override: user chose to proceed. Reason: 里程碑化流程一致性` |
| 「本批主意图 = fix（修补）」 | 意图推断确认 | **Overridden**：用户裁定 `enhancement`（基准补齐占主导）——`Challenge Override: intent = enhancement` |

## Scope

### In Scope

- InScope-1 添加项目模态裁切修补：宽度落官方 Modal `className` 卡片挂点（浏览器相位 680 / 表单 560）；两相位「内容左缘 ≥ 卡片左缘」几何断言入 e2e（承接 fix-7 证据）
- InScope-2 知识浏览关键词交互修补：键入受控生效、无结果面 + 清除入口、清除恢复、与域过滤组合互不复位；根因插桩结论 + e2e 新用例（承接 fix-5）
- InScope-3 会话面板顶部 toolbar：官方 `conversation.session.header` 槽位承载（会话标题 lineage + utilities 两钮：面板 toggle 归位 + 编辑器打开占位）；hero 相位让位；WCO 避让核查（承接 fix-9）
- InScope-4 dock 官方 dockkit 基座替换：DockController/DockSurface(或 DockLayout)/FloatLayer + createInitialState（collapsed + 「开始」初始 tab）+ renderTab 按 kind 分发 + labels 中文化 + chrome 收展钮；自研 strip/手柄/宽度态退役；UF-5/UF-7 语义经映射层零变化；e2e dock 断言迁移不弱化 + SMOKE-LEDGER 记账（承接 fix-10；fix-8② 键盘步进随基座 moot）
- InScope-5 侧栏项目区头部补齐：搜索钮 + 过滤行（项目名/会话标题前缀子串，客户端纯函数，不改选中态）+ 视图选项占位钮；官方件承载（承接 fix-6）
- InScope-6 轨迹 tab 数据接线：ChatSnapshot wire 判别值 → TranscriptEntry 映射装配（2.12 残留②收口）；dogfood 会话下非空台账 + 单测
- InScope-7 域树激活标记一致性：视图往返后 `data-active` 与过滤态同步 + 单测（承接 fix-8①）
- InScope-8 双层验收机制：每项几何/交互断言入 e2e 池 + CDP 复测归档（执行记录含前后对照）；批末走查人实机全量走查签字（七项逐一）
- InScope-9 任务集重派生与归档：P1.1 任务集按本提案派生；fix-5~10 条目处置为 superseded（index.json 状态 + 归档注记），证据经报告链与附录 A 承接

### Out of Scope

- M2+ 记账项：任务清单 hash8 消歧后缀、dock 开始页入口卡与域页签登记、概览页、统计/召回日志页签、元数据编辑、知识文档页签
- 功能面缺口（非 UI）：reconcileAtStartup 启动接线、SC12 补偿链 e2e 故障注入面
- 主题联动（WCO overlay 暗色实值切换机制）、macOS/Linux 窗口形态（M8 三平台）
- 上游依赖升级（0.2.0-rc.2 pin 不动）

## Key Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| dockkit 窄轨（340px）分栏/拖放不可用或形态不佳 | M | M | 执行首步读 kit README；`canSplit=false` P1 兜底（随轨道加宽开放）+ 记录裁决；`minPaneFraction`/`hideSplitWhenBlocked` 面向已勘 |
| e2e 锚迁移（dock 官方 DOM）引入回归或断言弱化 | M | M | SMOKE-LEDGER 逐条台账同步；「语义不弱化」为 SC 硬条款；迁移前后断言计数对照入记录 |
| 并行会话协作冲突（index.json / 测试管线在途） | M | M | 任务执行时序避让；index 变更后 node 解析校验；提交只含 docs/proposals/<slug>/ |
| 走查人批末终验带宽（七项一次过） | L | M | 每项 CDP 复测归档先行（机械面预筛）；终验按场景表逐项打勾，预期 ≤ 30min |
| 关键词缺陷根因超出修补面（装载链重构扩大化） | L | H | 任务 Hard Rule 限定语义面不动；若插桩证明需重构，升级回提案裁决而非任务内扩权 |

## Success Criteria

- [ ] SC-1 模态可见性：两相位 `内容左缘 ≥ 卡片左缘` 几何断言入 e2e 且绿；CDP 复测 `labelVisible=true` + 浏览器列表左缘在界内，前后对照入执行记录
- [ ] SC-2 关键词交互：键入 → 受控值更新 → 无结果面（clear-filters 在场）或命中过滤；清除恢复全量；e2e 新用例在场并绿
- [ ] SC-3 会话 toolbar：标题 + utilities 两钮在场（官方槽位承载）；hero 相位让位；既有三页签/UF-5 断言零褪色
- [ ] SC-4 dock 基座：chips 页签条/分栏控件/浮动层官方原生在场，自研 strip/手柄代码退役；UF-5/UF-7 断言迁移后全绿且计数不减
- [ ] SC-5 侧栏四件套：搜索钮 + 过滤行 + 视图选项钮 + ％＋ 在场；过滤不改选中态断言在场；`data-dswf-nav="add-project"` 锚不动
- [ ] SC-6 轨迹 tab：dogfood 会话下台账非空（消息/工具行 ≥ 各 1）；映射纯函数单测在场
- [ ] SC-7 域树一致性：往返后过滤数据与 `data-active` 标记一致（回归用例绿）
- [ ] SC-8 质量门：全批 tsc + lint 五门 + vitest 全量 + e2e 池全绿；SMOKE-LEDGER 台账同步且断言零弱化
- [ ] SC-9 人工终验：走查人按场景表（7 项 + 回归行）实机逐项签字通过
- [ ] SC-10 台账收口：P1.1 任务集全部 completed；fix-5~10 标记 superseded 且归档注记指向承接任务；报告链与附录 A 引用闭环

consistency_check_result:
  status: pass
  pairs_checked: 25
  conflicts_found: 0

## Next Steps

- Proceed to `/write-prd` to formalize requirements

## Appendix A: 证据承接表（fix-5~10 → P1.1）

| 原任务 | 内容 | 根因/证据载体 | 承接 |
|---|---|---|---|
| fix-7 | 模态裁切（P0） | 几何实测两轮（R2 §5.1/§7.1）；georecheck.mjs | InScope-1 |
| fix-5 | 关键词交互 | 四轮探针 + 症状矩阵（R2 §5.2）；markerprobe/finalprobe.mjs | InScope-2 |
| fix-9 | 会话 toolbar | 三方证据（原型 conv-header / S2 槽面 / ChatSurface 现状）（R2 §8.1） | InScope-3 |
| fix-10 | dockkit 基座 | 官方契约勘面（S2 §2.5 + adapter/initial 细读）（R2 §9.1） | InScope-4 |
| fix-6 | 侧栏四件套 | 原型 :44-60 vs 产品 :216-223（R2 §6.1） | InScope-5 |
| 2.12 残留② | 轨迹 tab 接线 | SessionPanel transcript 缺省 [] + 装配未传（R1 §3） | InScope-6 |
| fix-8① | 域树标记 | walk4-J 复现（R2 §7.3） | InScope-7 |

（fix-8② dock 手柄键盘步进：随 InScope-4 官方基座替换自然 moot，不单独立项。）
