---
created: "2026-10-02"
author: "faner"
status: Draft
intent: "new-feature"
---

# Proposal: dsh-forge 重构 —— 从零设计的薄状态层工作台（零代码分支重开）

> **接管说明（2026-10-02）**：本提案沉淀 M1–M4 迁移经验后，**从零重新设计**产品形态与数据模型，替代既有路线（`proposals/dsh-forge` 及其 M2–M4 演进链）作为方向权威。既有提案不删除，保留为教训与参考。实施载体 = **零代码新分支**（详见 Scope）。

## Problem

核心问题一句话：**dsh-forge M1–M4 迁移的产出未达到用户预期——工作台 UI 与上游 dsh 会话体验割裂、打磨粗糙；「文件 SoT + SQLite 投影」双层架构引入投影/快照/回流等派生概念，认知与维护成本高于收益；产品职责边界（应用管什么、不管什么）从未被清晰划定。**

### Evidence（经验沉淀，四条核心教训）

1. **「必备插件 + 上游 home 增强层」路线天然产出嫁接感**：M4 选择在上游 dsh home 上做槽位注入增强（`packages/plugins/forge-workbench`），视觉与组件受上游令牌/0.1.6-alpha peerDeps 锁死，打磨上限被结构性封死——落地体验与验收原型（`docs/features/dsh-forge-m4/ui/prototype/`）差距显著。产品级 UI 需要自己的主场。
2. **投影/双 SoT 的复杂度反噬**：M4 的 workspaceRegistry 单向投影（forge 文件 → SQLite 快照）+ DF003 感知回流，是「文件为 SoT + 结构化需求」的折衷产物；用户明确否定此类派生概念——**SoT 边界应按资产类型一次划清，而非运行时双向折衷**。
3. **里程碑语言与用户心智系统性错位**：用户预期「M4 达成后去掉工作台插件」，而既有决议⑧明确「forge 核心 = 必备插件、不可禁用」——M4 退役的是 Claude Code 插件。决策日志记录的是技术语义，未核对用户心智模型，导致"完成"≠"达成预期"。
4. **薄产品职责从未定义**：M2–M4 持续加码（投影、归档、多窗口、文档管理、知识库挂载……），应用逐渐变成"什么都管"的重产品；用户实际要的是**状态层 + 只读引用**的薄产品。

### Urgency

- 现有增强层路线每多迭代一步，嫁接感债务越深，重写成本越高。
- M4 已完成、遗留项（20 技能/四动词/影子 git）顺延未清，正是路线重审的天然窗口。
- 用户对当前产品的信任已受损，继续在旧架构上打磨只会加深"失望-修补"循环。

## Proposed Solution

**从零设计薄状态层产品**：应用只做「结构化状态 + 只读引用 + 会话编排入口」；不管文档内容、不管管线推进、不管代码仓。**归零设计但锁定 dsh 为 agent 运行时**（从需求推导，不预设架构）。

### 数据模型（单一归属，无投影）

每类资产**有且仅有一个归属**，不存在派生快照：

| 资产 | 归属（唯一 SoT） |
|---|---|
| 任务清单 / 执行记录（forge 运行时资产） | **应用运行时存储**（不进代码仓） |
| 任务/feature/提案状态、会话挂接、视图状态 | **应用数据库** |
| proposal / PRD / tech-design / ui-design | **默认代码仓内；项目注册时可选仓外** |
| 项目级知识 | **仓外独立目录**（随项目） |
| 全局知识（经验/专家/通用规则） | **独立全局库**，多项目共享 |
| 测试资产 | **代码仓内** |

应用对文档/知识/代码均为**只读引用**（渲染展示、路径跳转），不负责管理/迁移/导出，也不做上下文注入——知识的使用由 agent 自行决定。

### 产品形态（UI/UX 基线 = M4 验收原型）

三区单工作台页，以 `docs/features/dsh-forge-m4/ui/prototype/`（project-home.html，v2.12 线框）为交互骨架基准：

- **左栏**：「知识库」独立面板（置于项目树上方，用户可直观管理知识）+ 全项目树 + 会话列表（dsh 行语言）；
- **中区**：dsh 会话面板（对话/轨迹双视图）；
- **右栏**：dock 页签容器（项目概览 + 项目知识 dock，默认收起）。

与 M4 的本质区别：该三区页是**新产品的原生首屏**（自有主场与设计体系），不再是上游 home 上的增强层。

### UI 资产复用策略（源码复核 2026-10-02，上游 `Z:\project\github\deepseek-harness`）

上游官方机制（apps/web vite.config 明注）："Plugin packages never enter this graph; they arrive as runtime bundles through the client module system"——构建期只产出**壳**（`@deepseek-ai/dsh-client-web`：boot 内核 = 静态模块表 + Cordis loader），ui-* 插件包**不进构建图**，运行期由宿主经 `window.__DSH_BOOT__` boot manifest（injections）+ `applyIndexInjections` 动态加载，`__DSH_TRANSPORT__` carrier 接 RPC。

**本产品采纳的模式**：
1. 自有 vite 前端入口（仿 `apps/web` 模式），复用 `dsh-client-web` 壳内核——产品 shell 是自己的入口，不存在"住进上游 home"；
2. **boot manifest 由产品掌舵**：选哪些 ui-*（ui-sidebar / ui-chat / ui-conversation / ui-dockkit / ui-theme…）的 client bundle 进入产品——它们经产品自己的 manifest 成为**产品 bundle 的组成部分**（非第三方运行时插件）；
3. 库性质包（ui-theme 令牌、ui-primitives）可静态库消费，作为自有设计体系基座；
4. forge 专属 UI（知识面板、项目树增强、dock 面板）做成产品自有 client 插件，与上同机制共存；
5. 否决"把 ui-* 静态打进 dist"（与 client module system 对抗的重度 fork，升级合并成本高——非最优）。

**槽位可替换性（sidebar 示例，源码核实）**：官方 ui-sidebar 本质只是 `'sidebar'` 槽位的占用者（`ctx.slots.inject('sidebar', ...)` 注册槽位树：`sidebar.workspaces` / `sidebar.panellist` / `sidebar.settings` 等子洞）；ui-workspace 等生态插件不依赖官方包本身，只按洞名注入（`inject('sidebar.workspaces', ..., WorkspaceBrowser)`）。替换两路线：**A（默认）保留官方 sidebar 壳、自有插件替换 `sidebar.workspaces` 占用者**（自有项目树/知识面板，成本最小，壳的折叠/导航/快捷键白拿）；B 整壳替换 `'sidebar'` 槽位占用者（须复刻槽位契约：洞名 + injected props，契约漂移风险自担）。无论 A/B，均为清单级增删，不碰前端构建。

**风格一致纪律（ui-theme 令牌系统，源码核实）**：视觉一致性由 `ui-theme` 运行时注入的三层 CSS 变量保证（`--dsw-static-*` 调色板 / `--dsw-alias-*` 语义别名含深浅双主题 / `--dsw-specific-*` 区域特定，另有 `--dsw-radius-*`、`--dsw-font-*`（随用户字号偏好联动）、`--dsw-elevation-*`、focus 规范）。自有组件硬纪律：**样式只引用 `--dsw-*` 变量，禁止裸色值/裸字号**——自动获得同视觉语言、主题切换、字号联动；基础组件优先复用 `ui-primitives`（本就吃令牌）。

命名辨析（避免误引）：`@deepseek-ai/dsh-web`（packages/web/web）是 ctx.web 能力插件，与 UI 无关；`packages/host/*` 是宿主侧插件；`apps/web` 与 `apps/desktop-host` 是应用。

### dsh 源码 vendor 裁决（发布状态核实 2026-10-02）

上游 npm 发布状态：`@deepseek-ai/dsh`（CLI/profile-boot）、`dsh-client-web`（壳内核）、全部 `ui-*`、`dsh-host-webserver`、`dsh-workspace`、`dsh-app-boot` 均 **public**；唯一 **private 不发布**的是 `@deepseek-ai/dsh-desktop-host`（Electron 宿主进程，本体仅 ~122 行 main + office/更新/退出巡检附件，其全部依赖均为公开包）。裁决：

- **主线 = B 自写薄宿主**：自有 ~100 行宿主入口（`loadProfileDirectory` + `runProfile` + `{url, injections}` IPC 上报），依赖全走 npm 公开包——**彻底去 vendor**，与零代码新分支的纯净起点一致；
- **fallback = A 继续 vendor desktop-host**（现行 `packages/desktop-host-vendor` 模式）：仅在 B 的 spike 失败（runProfile 等 0.x API 不可用/面不足）时启用；
- 前端/UI 侧零 vendor（全 npm 依赖 + 版本精确锁定）。

### 知识库数据形态与视图（2026-10-02 定向）

**知识一律以 Markdown 文档承载**；frontmatter 承载结构化元数据——摘要、关键词、状态、作者、修改时间等。应用解析 frontmatter 驱动两级视图：

- **知识列表页**：各知识卡片由 frontmatter 字段构建（标题/摘要/关键词/状态/时间等，支持按关键词、状态过滤）；
- **知识详情页**：基础信息表单区展示 frontmatter（只读渲染），文档区只展示正文（frontmatter 不混入正文显示）。

约束：frontmatter schema 为应用与技能双方共享的契约（技能/agent 写知识时须带合规 frontmatter）；正文与元数据分离渲染；沿用只读纪律——应用只读渲染不代写，元数据编辑由用户或 agent 侧完成。

### 项目 ↔ 工作区映射（引用而不复制）

dsh 的 Workspace（`@deepseek-ai/dsh-workspace`，经 `ctx.workspaceRegistry`）= 稳定 uuid + canonical path + 有序会话账本。衔接原则：**项目记录持有 `workspaceId` 引用，join key = canonical path；会话列表每次经 dsh workspace API 实时读取，应用数据库不存会话账本副本**。应用侧只存自己的扩展字段（文档位置、知识目录、任务/feature 状态），dsh 的归 dsh——此为「无投影」纪律在项目映射上的落实。

**具体机制（源码核实，2026-10-02）**：

1. **注册 = 先 dsh 后自家**：`ctx.workspaceRegistry.create(projectDir)` 返回实体（uuid + canonical path），应用库 `projects` 表只存 `workspace_id` 外键 + 自有扩展字段（文档位置、知识目录、归档态）——**无会话列表字段**。`create()` 对同 canonical path 幂等（上游语义 "Returns the existing or newly durable workspace"）。
2. **对账钥匙 = canonical path**：应用库同时存 `ws.path`；启动时校验 `registry.get(workspace_id)?.path === project.canonical_path`，失配则按 canonical path 在 `registry.list()` 中找回，找不回则重新 `create()`（幂等安全）→ 单向修引用，不产生数据复制。
3. **会话列表实时读**：左栏渲染时直接 `registry.get(workspace_id).sessionIds` → 逐 id 取会话头（标题/状态点/相对时间）；renderer 侧经 `packages/api/workspace-controller` RPC 面等价调用。零缓存零副本，dsh 侧增删天然一致。
4. **写权在 dsh**：会话的 attach/detach/排序由 dsh 侧（会话启动自动挂接或经其 API）维护，应用不写账本。

**与 M4 投影的本质区别**：投影方案存 sessionIds 快照副本、需 watch/感知/回流（DF003）追平；本方案应用只持外键，UI 渲染直问本体——无快照、无回流、无感知机制，概念只剩「外键 + 对账」。

### 管线归属

SDD 管线技能（brainstorm→PRD→设计→任务→执行）**单独做成一个独立 dsh 插件**——目的是**独立迭代**：技能（方法论与流程指令）的演进节奏与工作台产品（壳/UI/状态层）解耦，二者可各自发版、互不阻塞版本；亦即可独立分发与启停。应用只看不管（不做原生编排），未来再评估。

**技能集裁剪（2026-10-02 定向）**：forge 的 eval-\* 系列对抗评估技能**暂不引入**该插件；引用 eval-\* 的技能（如 brainstorm 的对抗评估步、设计/PRD 流程中的评估门）须相应调整——移除或改为可选步骤，不得留下指向缺失技能的悬空引用。

### 存量处置

拉**零代码新分支**，从零开始实现；dsh-forge 主分支历史（M1–M4 文档）保留为教训与参考。

### Innovation Highlights

- **薄状态层定位**（诚实声明：非创新，是纠偏）——对照 Linear/Jira 的重协作面与 AI 客户端的纯会话面，本产品只占「agent 工程的状态与编排入口」这一窄位，其余一切留给文件与仓。
- **按资产类型一次划清 SoT**：以「生命周期/复用域/写者」为轴的文档归属分类，替代运行时投影折衷——是对 M2–M4 双层架构的方法论否定。
- 知识两层（项目级/全局）独立于代码仓，过程资产与代码解耦的思路继承自三分模型，但去掉了应用侧纳管。

## Requirements Analysis

### Key Scenarios

- 首用：零配置启动 → 首屏 = 工作台（hero 相位）→ 添加项目（注册代码区 + 文档位置选择）。
- 日常：左栏切换项目/会话 → 中区执行会话 → 右栏 dock 查项目概览与知识。
- 知识管理：左栏「知识库」面板浏览/检索项目级与全局知识。用户可管理知识，**由 agent 自行决定使用哪些知识**（应用不做注入）。未来可增加：类似 dsh 轨迹 tab 的「知识使用监控」面板，展示 agent 实际使用了哪些知识。
- 状态查看：任务/feature 状态从应用数据库直读（无文件扫描、无投影同步）。
- 边界场景：项目归档（只读）；文档仓外模式；知识目录缺失/重建。

### Non-Functional Requirements

- 继承 M1 壳层 NFR（离线自足、进程足迹、可恢复性、无监听端口、三平台分发）。
- 状态读写延迟：任务/看板数据全部来自数据库，首屏无需文件扫描。
- 应用对仓内文件零写入（只读纪律），杜绝"应用改仓"造成的双写。

### Constraints & Dependencies

- **硬约束：dsh 为唯一 agent 运行时**（归零设计、锁定约束——从需求推导而非架构出发）。
- dsh 0.1.x-rc 快速演进：版本锁定 + 显式适配任务策略继承。
- forge 技能（管线）继续以现有形态运行，其读写对象（任务清单/执行记录迁入应用运行时存储）需要 forge 侧配合演进（自研可控）。
- 上游 dsh 源码（`Z:\project\github\deepseek-harness`）为唯一权威参考。

## Alternatives & Industry Benchmarking

### Industry Solutions

- [Linear](https://linear.app)：重状态管理面的标杆——本产品取其"状态直读"体验，但不做协作面。
- [Obsidian](https://obsidian.md)：纯文件 GUI 路线——被否决为数据模型（结构化状态需入库），但文档只读渲染思路同源。
- dsh 官方桌面（apps/desktop）：仍是壳层技术母本（宿主子进程/协议缝复用），但不再是 UI 母本。

### Comparison Table

| Approach | Source | Pros | Cons | Verdict |
|----------|--------|------|------|---------|
| Do nothing（在 M4 增强层上继续打磨） | 现状 | 零重写成本 | 嫁接感与打磨上限结构性封死；用户信任持续受损 | Rejected: 痛点即源于此路线（教训①） |
| 只换 UI 不动数据模型 | 修补路线 | 改动小 | 投影/双 SoT 复杂度留存；职责边界仍未定义 | Rejected: 教训②④未解决 |
| 连 agent 运行时也归零重选 | 最激进 | 自由度最高 | 可能重造 dsh 轮子；失去协议缝复用 | Rejected: 锁定 dsh 约束（用户定向） |
| **薄状态层 + 单一归属数据模型 + 原生三区工作台（零代码分支）** | 本提案 | 痛点根因全解；职责清晰；UX 有原型基线 | 单人重写量；知识/任务迁移需 forge 侧配合 | **Selected: 2026-10-02 brainstorm 全部显式裁决（见 Assumptions Challenged）** |

## Feasibility Assessment

### Technical Feasibility

高——壳层/宿主/协议缝技术已由 M1–M4 验证；本次重写主要是产品层（UI + 数据边界），无未验证技术依赖。UI 从自有主场重写，摆脱上游令牌束缚后打磨上限打开。

### Resource & Timeline

单人产品线；零代码分支上按新 PRD/设计/任务管线推进，里程碑划分留待 `/write-prd`。

### Dependency Readiness

无外部 API 依赖；dsh 本地源码齐备；forge 自研可控（任务清单/执行记录迁存储需 forge 配合改造）。

## Assumptions Challenged

| Assumption | Challenge Tool | Finding |
|------------|---------------|---------|
| "M4 达成后去掉工作台插件"曾是计划内容 | 事实核对（决议⑧原文） | Dispel: 从未有此计划——决议即"必备插件永存"；错位在决策日志未核对用户心智模型（教训③） |
| 痛点根因是布局/导航效率 | XY Detection（Y=产品达成预期） | Overturned: 根因 = 增强层路线（割裂+打磨粗糙），非局部布局 |
| 修补现有 UI 即可挽回体验 | Assumption Flip | Overturned: 用户选择完全从零设计 |
| forge 文件必须保持 SoT，结构化靠投影 | Stress Test（投影/快照/回流概念成本） | Overturned: 按资产类型一次划清 SoT；任务清单/执行记录 = 应用运行时资产 |
| 应用应纳管代码/知识/过程资产 | Need Gate（更简替代 = 只读引用） | Overturned: 状态层 + 只读引用；知识两层独立存放 |
| SDD 管线应原生编排进应用（M3-M4 方向） | Why now（迁移动力与范围） | Deferred: 管线留技能，应用只看不管，未来再议 |
| 三区工作台骨架随重写作废 | 用户定向 | Refined: M4 验收原型（v2.12）保留为 UX 基线，但载体从"增强层"变为"原生首屏" |

## Scope

### In Scope（v1）

- **零代码新分支**：从零搭建应用（壳 + 原生三区工作台 UI，UX 基线 = M4 原型）。
- 薄状态层数据模型落地：任务清单/执行记录迁入应用运行时存储；任务/feature/提案状态、会话挂接、视图状态入库为唯一 SoT。
- 文档归属模型：注册时选择 proposal/PRD/design 仓内（默认）或仓外；知识两层目录约定；应用侧一律只读引用。
- 左栏「知识库」面板（项目级 + 全局）与右栏项目概览/知识 dock。
- dsh 会话面板作为中区组件接入（引擎能力复用，不重造）。
- 既有 plugin-forge-workbench 工作台视图与投影层的移除（旧分支收尾，不进新分支）。

### Out of Scope

- SDD 管线的应用原生编排（管线权归独立技能插件；未来独立提案）。
- 管线技能独立插件（forge skills plugin）的封装与分发——独立工程，与本产品并行推进、互不阻塞。
- 文档编辑、导出、wiki 对接、双向同步（应用只读）。
- 知识使用监控面板（类 dsh 轨迹 tab，展示 agent 实际使用了哪些知识）——未来功能，本次不做。
- 多窗口、深度原生 UI、代码签名（继承既有 Out of Scope）。
- 旧分支 M4 遗留项（20 技能/四动词/影子 git/runtime_root）的清偿——随管线归属议题顺延。

## Key Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| 零代码重写周期内日常管线无家可归 | H | M | 旧分支/冻结插件在过渡期继续可用；新分支首个里程碑优先打通会话+任务状态主链路 |
| 任务清单/执行记录迁出代码仓需 forge 技能侧配合，双形态过渡期数据分裂 | M | H | 迁移开关 + 一次性切换（不做并行双写）；forge 自研可控 |
| "薄"边界随需求再次膨胀（重蹈 M2–M4 加码） | H | M | 本提案 Scope 为宪法级边界；任何加码须新提案显式推翻「只读引用」纪律 |
| dsh 0.1.x-rc 演进导致中区会话组件适配分叉 | M | M | 版本精确锁定 + 显式适配任务（继承策略） |
| UX 原型（静态 HTML）与落地再次出现质量衰减（教训④复发） | M | H | 原生首屏 + 自有设计令牌；验收以可交互走查对照原型逐项断言 |

## Success Criteria

- [ ] SC1 首屏 = 原生三区工作台（非上游 home 增强层）：左栏知识库面板 + 项目树 + 会话列表、中区会话面板、右栏 dock 默认收起，布局与 M4 原型 v2.12 线框逐区对照走查通过（走查记录归档）。
- [ ] SC2 无投影断言：代码库中不存在快照同步/回流/watch 感知类投影机制；任务/feature/提案状态全部从应用数据库直读，看板首屏 ≤2s @500 任务。
- [ ] SC3 只读纪律：应用运行全程对代码仓与知识目录零写入（文件系统级监控验证一次全流程操作）。
- [ ] SC4 文档归属：注册项目时可选择 proposal/PRD/design 仓内（默认）/仓外；两模式下文档浏览/跳转均可用（e2e 各覆盖一条路径）。
- [ ] SC5 知识两面板：左栏「知识库」面板可浏览/检索项目级与全局知识（不注入会话——知识使用由 agent 自行决定）；右栏项目知识 dock 可展示当前项目知识；知识卡片/详情由 frontmatter 解析驱动（列表卡片字段 + 详情基础信息表单 + 正文区不含 frontmatter，e2e 各一条）。
- [ ] SC6 会话主链路：从工作台发起/恢复 dsh 会话、会话挂接任务元数据可见（继承 M2/M4 已验证能力，新载体下重验）。
- [ ] SC7 任务状态主链路：任务领取/提交/状态变更由管线技能写入应用状态层（写 API），看板即时反映；应用自身不发起任何编排动作（只看不管边界内验证：状态直读 + 技能侧写入）。
- [ ] SC8 零代码分支纪律：新分支不含旧工作台视图/投影层代码（代码审计断言，白名单仅壳层基建与可复用工具）。

## Next Steps

- Proceed to `/write-prd`（以本提案 + M4 原型 v2.12 为 UX 基线；含文档归属与知识两层的目录约定设计命题）。

## Source Code References（源码参考，供后续执行 agent 使用）

> 使用规则：dsh 本地源码为唯一权威（禁止凭公开资料猜测）；行号会漂移，优先按符号名检索。

- **dsh 仓库**：`Z:\project\github\deepseek-harness`（导航见 `proposals/dsh-forge` Source Code References A–H，2026-09-16 核查）。
- **UI 复用母本**：`Z:\project\github\deepseek-harness\apps\web`（vite 入口 + 壳内核模式；vite.config "Plugin packages never enter this graph" 注释 = 机制权威）与 `packages/client/web`（`dsh-client-web` boot 内核）；UI 资产 = `packages/client/ui-*`；boot manifest / injections 机制 = `apps/web/src/main.ts`（`applyIndexInjections` + `__DSH_TRANSPORT__`）；槽位替换契约 = `packages/client/ui-sidebar/src/client/index.ts`（`slots.inject('sidebar', ...)`）与 `ui-workspace/src/client/`（洞位注入消费方）；设计令牌 = `packages/client/ui-theme/src/styles/{design-platform,base,focus}.css`（`--dsw-*` 三层变量）。
- **工作区映射**：vendored `packages/workspace/workspace/src/{types,entity,index}.ts`（Workspace 实体与会话账本语义）+ `packages/api/workspace-controller`（workspace API 面）。
- **UX 基线**：`docs/features/dsh-forge-m4/ui/prototype/`（index.html / project-home.html / app.js / styles.css / data.js；布局权威 = `ui/workbench-layout-v2.md` v2.12）。
- **壳层工程模式参考**：本仓 `packages/desktop-host-vendor`（vendored 上游，SHA `c36ba648` / `0.1.6-alpha.2`）。
- **教训原始链**：`docs/features/dsh-forge-m2..m4/`（投影机制 = m4 tech-design workspaceRegistry 段；增强层 = m2 cordis 双半身/m4 原生 home 增强层）。
- **forge 仓库**：`Z:\project\ai\forge`（任务/执行记录数据格式与技能读写对象，迁移改造面）。
