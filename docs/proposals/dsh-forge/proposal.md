---
created: "2026-09-19"
updated: "2026-09-22"
author: "faner"
status: Draft
intent: "new-feature"
---

# Proposal: dsh-forge —— 以项目为中心的 SDD 桌面工作台(M1 = 独立桌面壳)

> **接管说明(2026-09-19)**:本提案接管 `proposals/dsh-desktop/proposal.md`(2026-09-16 修订版)的方向定义权,该提案已标记 Superseded;其 M1 范围、SC1-8、Source Code References A-H 节**整体继承且继续有效**,本文不再重复论证。**纪律约束:dsh 是 2026-09 新出现的项目,公开资料稀缺,一切以其本地源码为唯一权威参考,禁止凭记忆或公开资料猜测其 API;forge 官方文档为 2026-06 快照,以仓库实际代码与模板为准。**

> **方向同步(2026-09-22)**:本文已按 `docs/proposals/ui-plugin-foundation/proposal.md`(2026-09-21,下称"基座提案")的用户定向决策同步修订四处——①"一切皆插件"细化为**两级插件模型**;②新增**产品数据内核(SQLite 入壳)**方向声明;③新增 **forge CLI 退役演进**(终点 = 应用 API + dsh tool);④ui-plugin-foundation 基座**硬前置 M2**。范围、验收与技术论证以基座提案为准(其源码级证据继承同目录 `ui-plugin-vendor-free.md`),本文只锚定方向。

## Problem

核心问题一句话:**forge 的 SDD 方法论被锁在"终端 + Claude Code 插件"形态——需求、会话、知识、测试用例等工程资产散落为仓内文件,无项目维度的统一视图与图形化操作;其应用化需要一个自主可控的桌面载体,而该载体(独立桌面版 dsh)本身也是待建工程。** 两条问题线:

- **线一(dsh 侧,定义 M1)**:上游官方桌面端(apps/desktop)无 Linux、无托盘/通知、发布绑定组织基建、版本刚性绑定(证据与论证见 Superseded 提案,2026-09-16 源码核查)。
- **线二(forge 侧,定义产品终态)**:①工程资产散落(`docs/features/<slug>/`、`docs/proposals/`、`.forge/config.yaml`、`tests/` 等),无项目维度统一视图、检索与按需注入;②管线推进依赖终端 slash command 与人肉盯守,任务/依赖树/评估报告/执行监控无图形化载体;③绑定 Claude Code 的 skill/hook/agent 机制,方法论无法以独立产品形态分发与演进;④agent 会话与工程资产割裂——会话不感知任务上下文,任务不关联产生它的会话。

### Evidence

- **forge 侧(2026-09-19 本地核查 `Z:\project\ai\forge`)**:v3.0.0,Go CLI(19 命令)+ Claude Code Plugin(21 Skill / 16 Command / 1 Subagent / Hooks);全部状态为本地文件——`.forge/config.yaml`、`docs/features/<slug>/{manifest.md, prd/, design/, tasks/index.json, tasks/*.md, tasks/records/}`、`docs/{business-rules,conventions,decisions,lessons}/`(带 `domains` frontmatter 按需加载)、`tests/<surfaceKey>/`;feature 状态机与任务状态机(7 态)由 CLI 维护保证一致性;知识全部存在各项目仓内,**无跨项目知识层**;`forge prompt get-by-task-id` 已提供任务→执行 prompt 的现成映射(会话挂接的天然入口)。
- **dsh 侧(2026-09-16 核查,详见 Superseded 提案)**:上游 apps/desktop 为生产级同构实现(子进程宿主 + 分帧管道 + `dsh-app://` + `__DSH_TRANSPORT__` carrier),验证了壳层技术路线;everything-is-a-plugin 架构提供了能力插件化的原生机制。
- **决策日志(2026-09-19 brainstorm,全部为用户显式选择)**:①终态定位 = forge 工作台(以项目为中心),dsh 为内嵌引擎;②引擎战略 = dsh 唯一,Claude Code 插件退役(冻结过渡);③M1 冻结为纯壳,forge 从 M2 起每里程碑独立提案;④受众 = 社区公开 + 自用旗舰,三平台 + GH Releases 维持 M1 must;⑤项目三分模型(见 Proposed Solution);⑥一切皆插件(遵循 dsh 理念);⑦新增 SC9 补宿主崩溃恢复验收缺口。
- **决策日志(2026-09-21 定向,用户显式选择,经基座提案)**:⑧两级插件模型(forge 核心 = 必备插件:内置 bundle 分发、不可禁用、仅作者维护;启停语义仅第三方插件);⑨产品数据内核(SQLite 任务索引 / 项目↔会话挂接 + 任务 CRUD 数据 API)进 Electron 壳,M2/M3 落地;⑩forge CLI 退役(过渡 = 插件宿主半身 spawn CLI;终点 = 应用 API + dsh tool,CLI 不保留);⑪ui-plugin-foundation 工程基座独立立项并硬前置 M2 UI 插件任务。

### Urgency

- dsh 处于 0.1.x-rc 周发布快速演进期,独立壳越晚启动,与上游 desktop-host/协议缝的适配分叉成本越高(Superseded 提案已论证)。
- forge v3.0.0 刚把方法论、数据格式与 CLI 面稳定下来,是应用化的起点窗口。
- 插件退役决定后,日常开发管线**暂住**在冻结的 Claude Code 插件上,迁移动力随时间衰减——应用能力覆盖(M2 落地)越晚,双形态过渡期越长。

## Proposed Solution

产品终态:**以项目为中心的 SDD 桌面工作台**。

**项目三分模型(数据模型母决策)**——工作台中的"项目"实体绑定三部分,各自可位于不同位置:

1. **代码根目录**:被开发的应用(传统意义上的 workspace/repo);
2. **工作台自有项目文件**:app-managed state(项目注册、设置、会话挂接索引、视图状态等,工作台自己维护);
3. **agent 过程文档**:提案/PRD/design/任务/记录/知识/测试用例——可留在仓内 `docs/`,**也可外置到仓外路径**,文档存储以本地文件系统为默认,**可对接 wiki 系统**(对接方式——单向发布或双向同步——在设计阶段定)。

**实体挂接**:feature = 一次功能迭代或 bug-fix,是需求管线单元(proposal→PRD→设计→任务);会话挂接 feature/任务执行;知识分**项目级**与**跨项目级**(全局层,forge 侧需新增的能力);测试用例挂接 feature。

**路线图(方向锚点;仅 M1 进入本 feature 的 v1)**:

- **M1 纯壳(= v1,范围冻结,继承 Superseded 提案)**:三平台安装包 + 宿主子进程 + 托盘/通知 + 免签名 GitHub Releases + 更新检测。不含任何 forge 能力。
- **M2 需求与会话**:**任务列表可视化**(第一功能面:forge 任务/依赖树从终端表格变成图形看板)、feature 看板(状态机/文档浏览)、**会话挂接**(从任务一键发起 dsh 会话 + 任务上下文注入)。**硬前置(2026-09-21)**:ui-plugin-foundation 工程基座(至少 spike + bundle 配置化)完成后,UI 插件任务方可开工,且 M2 PRD 须先按两级插件模型修订 G6/SC6、按 SQLite 方向记账 DF001/DF005(修订完成前不得进入任务分解);首个任务为 spike:dsh 插件机制 vs forge skill/hook/subagent 语义等价性(= M2 SC8,与基座提案的装配路线 spike 验证面不同,互不替代)。
- **M3 知识与测试用例**:知识库(项目级 + 跨项目全局层)的浏览、检索与会话按需注入;测试用例管理(journey/contract 与测试脚本的关联视图、执行结果)。
- **M4 管线原生化(应用化完成态)**:brainstorm→PRD→设计→任务→执行 的管线、对抗式评估器、Quality Gate、任务编排从"Claude Code skill 指令流"迁移为**应用原生工作流**;插件退役完成;forge CLI 同步退役——能力形态终点 = **应用 API(Electron 数据内核)+ dsh tool,CLI 不保留**(过渡形态 = 插件宿主半身 spawn CLI;具体形态由 M2 SC8 spike 与 M4 设计定,禁止预判)。

**架构约束**:

- **一切皆插件 → 两级插件模型(2026-09-21 修订)**:遵循 dsh 的 everything-is-a-plugin 理念,forge 的各项能力(任务看板、知识库、管线、文档存储适配器……)以 dsh 插件形式提供,壳不焊死功能,保留回馈上游与独立分发的自由;但插件分两级——**forge 核心 = 必备插件**:内置 bundle 分发、不可禁用、不可被第三方修改、仅作者维护升级,消费基座槽位 + 复用 dsh 组件体系 + 贡献自有槽位供第三方扩展工作台;**第三方 = 扩展插件**:用户经 `dsh plugin add` 自装,注入基座槽位或工作台槽位,与必备插件同机制共存、互不垄断。原"能力可独立启停、禁用回归纯壳"语义收缩至第三方插件(M2 G6/SC6 记账修订);插件清单 = 产品级配置(插件树唯一事实源),不得焊死壳代码(ui-plugin-foundation 交付件)。
- **宿主与协议缝复用**:M1 技术架构(宿主子进程 + `dsh-app://` + carrier)整体继承,是 M2+ 一切能力的底座(细节见 Superseded 提案)。
- **产品数据内核(SQLite 入壳,方向声明 2026-09-21)**:Electron 壳 = 运行宿主 + 产品数据内核——任务索引、项目↔会话挂接、工作台自有状态以 SQLite 置于 Electron 侧存储,并提供数据 API(特别是任务 CRUD);M2/M3 落地,项目三分模型的"工作台自有项目文件"即落于此。诚实声明:数据内核进壳偏离官方壳极小产品 API 面模式,是 dsh-forge 作为产品壳(非兼容壳)的自主选择;纪律 = preload IPC 面沿用 M1 electron-ipc-security 约束(origin-lock、typed、版本化、最小必要面);事实源关系(forge 文件 vs SQLite)与 API 形态 M2/M3 设计时定。
- **forge 能力形态演进(CLI 退役,2026-09-21 定向)**:forge 特色能力是本应用的差异化价值核心,以必备能力随产品交付;CLI 为过渡形态(插件宿主半身 spawn Go CLI,经标准 rpc 暴露,二进制随包分发)→ 演进终点 = **应用 API(Electron 数据内核)+ dsh tool,CLI 不保留**;任务调度机制(领取分配、依赖解析、状态机编排)插件化——可随产品演进替换,不动数据内核。
- **数据格式为唯一事实源**:应用与(过渡期内的)插件读写同一套 forge 文件格式,双形态不产生第二事实源;SQLite 数据内核落地后的事实源关系为 M2/M3 设计命题,落地前 forge 文件仍为唯一事实源,禁止预支结论。

**过渡管理**:Claude Code 插件**冻结在 3.x**(bug-fix only,停止演进);日常管线随应用能力覆盖迁移(约 M2 会话挂接落地后开始),M4 完成;forge 公开仓库的演进载体角色由本应用继承。forge 引擎(Go CLI)同为过渡形态——过渡期经插件宿主半身 spawn 使用,退役终点见架构约束。

### Innovation Highlights

- **SDD 方法论的应用化(核心增量)**:"项目维度管理 × agent 会话 × spec-driven 方法论"的交叉位无成熟桌面产品——issue 工具(Linear/Jira)管协作不管 agent 会话与 SDD 管线;AI 桌面客户端(Jan/Cherry Studio)管会话不管工程化方法论;forge 同类(Superpowers/Spec Kit/OpenSpec)全部为插件/CLI 形态。本工程以 **dsh 为 agent 运行时**、**forge 为方法论与数据模型**、**桌面应用为载体**,把工具链长成产品。
- **方法论借架构再变现**:dsh 用插件化架构让 UI/宿主/协议缝被本工程零成本复用(Superseded 已论证);"一切皆插件"反过来要求 forge 能力也以插件形态组装——同一架构理念的第二次变现,并保留回馈上游与独立分发的自由。
- **项目三分模型**:代码 / 工作台状态 / 过程文档三者解耦,文档可外置、可对接 wiki——把"agent 过程资产"从代码仓的从属地位解放为一等公民,适配"过程文档不属于代码仓"的团队实践。
- 继承项(诚实声明,非创新):托盘/系统通知的桌面人体工学、Linux + 免签名 GH Releases 分发,是分发矩阵补位与复用变现,详见 Superseded 提案。

## Requirements Analysis

### Key Scenarios

**M1(v1,继承 Superseded 提案,验收归 SC1-9)**:干净机器首用(零终端配置到会话)、关窗驻留/通知召回、更新检测引导、CLI/官方桌面/本壳三方共存、宿主崩溃恢复、错误路径引导。

**M2+ 方向性场景(不进入 v1 验收,锚定路线图)**:

- **项目工作台(M2)**:打开项目 → 任务/依赖树可视化看板 → feature 状态与文档浏览 → 从任务一键发起 dsh 会话(任务上下文自动注入)→ 会话执行与审批在看板内可见、可回溯。
- **知识与测试(M3)**:检索项目级与跨项目知识 → 选中条目注入当前会话;按 feature 聚合查看测试用例与最近执行结果。
- **文档外置与 wiki 对接(M2-M3)**:项目注册时选择过程文档位置(仓内 / 仓外路径 / wiki);外置文档与仓内格式一致。

### Non-Functional Requirements

- 继承 M1 全部 NFR(离线自足、进程足迹 = 2、可恢复性、无监听端口安全模型、零侵入上游)——见 Superseded 提案。
- **插件化**:forge 能力以插件组装;启停语义仅第三方插件(forge 核心 = 必备插件,不可禁用,2026-09-21 修订);壳内核不因能力增减而改动。
- **存储解耦**:工作台不要求过程文档位于代码仓内;外置为可选能力,默认关闭。
- **双形态一致性**:过渡期内应用与冻结插件共享 forge 数据格式,互不破坏。

### Constraints & Dependencies

- **继承 M1 全部技术约束**:宿主子进程复用上游 desktop-host(private 包获取方式待 tech-design)、版本精确锁定、内置上游 Node 运行时、独立 profile 目录名、三平台 CI 为 must(详见 Superseded 提案)。
- **forge 依赖**:`Z:\project\ai\forge`,用户自研可控(v3.0.0,Go 单二进制 CLI 可随包分发,过渡形态——退役演进见架构约束);插件冻结在 3.x 过渡。
- **dsh 插件机制为一等依赖**:"一切皆插件"要求 forge 能力跑在 dsh 插件机制上,其与 forge skill/hook/subagent 语义的等价性**未知**,M2 首个 spike 前禁止假设结论。
- **forge 侧新能力依赖**:跨项目全局知识层、过程文档外置、wiki 对接,均超出 forge 当前数据模型,需 forge 核心配合演进(用户可控,无第三方协调成本)。
- **M2 前置依赖(2026-09-21)**:ui-plugin-foundation 工程基座(至少 spike + bundle 配置化)硬前置 M2 UI 插件任务;M2 PRD 修订(G6/SC6 两级插件模型、DF001/DF005 SQLite 记账)完成前不得进入 M2 任务分解(基座提案 Next Steps 已记账)。

## Alternatives & Industry Benchmarking

### Industry Solutions

- **[Linear](https://linear.app) / [Jira](https://www.atlassian.com/software/jira)**:项目维度管理的事实标准,但不管 agent 会话与 SDD 管线——反衬交叉位空缺。
- **[Jan](https://jan.ai/) / [Chatbox](https://chatboxai.app/en/) / [Cherry Studio](https://github.com/cherryhq/cherry-studio)**:通用桌面 AI 客户端,验证"桌面壳 + 会话"形态,但无方法论与项目工程资产层。
- **[Berd](https://cryptobriefing.com/block-open-sources-berd-ai-agent-app/)**(Block)/ **[Zed](https://zed.dev/acp)**:桌面壳 + 协议驱动 agent 后端的先例(ACP 路线)。
- **Superpowers / Spec Kit / OpenSpec**(见 forge README 竞品对比):forge 同类 SDD/技能插件,均无质量门控/上下文持久化/知识沉淀,且全部为插件形态、无应用化路线——forge 应用化后将形成形态差异。
- **dsh 官方桌面(apps/desktop)**:M1 的复用母本与差异化对照(发行形态与能力面差异见 Superseded 提案)。

### Comparison Table

| Approach | Source | Pros | Cons | Verdict |
|----------|--------|------|------|-----------|
| Do nothing(forge 保持插件形态迭代) | forge 现状 | 零新工程 | 无 GUI 与项目统一视图;绑定单一 harness;方法论无法产品化 | Rejected: 与应用化终极目标冲突(用户 2026-09-19) |
| 桌面壳与 forge 各自独立演进,不做融合 | 本提案的前身(Superseded 定位) | 各自简单 | 两产品方向漂移;壳无差异化价值支撑 | Rejected: 融合为单一产品线 |
| 未经 dsh,直接为 forge 做独立应用(自研运行时/第三方 SDK) | 类 Jan/Cherry 自建路线 | 产品纯粹 | 需自建会话/审批/UI 插件生态 ≈ 重造 dsh;失去协议缝复用 | Rejected as-is: dsh 免费提供应用化底座 |
| 应用内双引擎(dsh + Claude Code) | 灵活性导向 | 模型/能力互补 | 两套会话/审批/凭据集成面,M2 范围翻倍,行为差异长期消不完 | Rejected: 集成面必须单一(用户 2026-09-19) |
| M1 重定义为最小工作台(壳增量后置) | 激进路线 | 最快见到 forge 价值 | 地基风险与新 UI 风险叠加;推翻已冻结的 M1 证据链 | Rejected: 风险不叠加(Stress Test,用户 2026-09-19) |
| 基于上游 apps/desktop 补齐 | 上游 | 工作量最小 | 受官方工程约束,Linux 需改官方流水线 | Rejected(2026-09-16 已决,继承) |
| **forge 工作台:项目为中心 + dsh 唯一引擎 + 一切皆插件 + M1 壳先行** | 本提案 | 终态与方法论对齐;单一集成面;能力插件化可独立演进;底座先行风险分层 | 单人长期产品线;依赖 dsh 0.1.x-rc 演进与插件机制等价性 | **Selected: 2026-09-19 决策日志(七项显式选择,见 Evidence)** |

## Feasibility Assessment

### Technical Feasibility

- **M1:高**(生产背书,继承 Superseded 提案论证;剩余三点未知归 `/tech-design`)。
- **M2+:中高(方向性判断)**——forge 核心状态宿主无关(文件 + Go CLI),sidecar/随包分发/直接读写均可行;数据格式 3.x 已稳定。剩余未知:①dsh 插件机制能否等价承载 forge 语义(M2 首个 spike,兜底 = 管线原生化前置);②UI 插件装配路线三项未验证项(→ ui-plugin-foundation spike,2026-09-21 已立项收敛);③跨项目知识层、文档外置、wiki 对接的 forge 侧演进量(M3 设计时评估)。

### Resource & Timeline

单人产品线。M1 数周量级(继承评估);M2+ 随各里程碑提案独立评估,本提案不预支。

### Dependency Readiness

无外部 API 依赖;发布通道 GitHub Releases;forge 自研可控(Go CLI 可静态编译随包分发);desktop-host private 包获取方式待 tech-design(继承)。

## Assumptions Challenged

| Assumption | Challenge Tool | Finding |
|------------|---------------|---------|
| 本工程是"复用变现 + 分发补位"的薄壳,无产品野心(原 Innovation Highlights 自述) | Assumption Flip + 用户定向 | Overturned:升级为产品线,终态 = forge 工作台、dsh 为引擎 |
| 桌面 dsh 为主体,forge 融入为附加面板(原修订方向) | Assumption Flip(IA 中心翻转) | Overturned:以项目/feature 为中心、会话内嵌;终态定位错了 M2+ UI 骨架会推倒重来 |
| 应用需要兼容 Claude Code 作为第二引擎 | XY Detection(Y=方法论获得独立载体,X=引擎选择) | Overturned:dsh 唯一引擎,插件退役(冻结过渡) |
| 新定位应体现在 v1(工作台优先) | Stress Test(地基风险 × 新 UI 风险叠加) | Refined:M1 冻结为纯壳,forge 从 M2 起独立提案 |
| 三平台分发对自用工具是过重负担 | Need Gate(更简替代/为何是现在) | Rejected 挑战:社区公开 + 自用旗舰,维持 M1 must(用户定向) |
| 过程文档必须存放在代码仓内(forge 现状) | 用户输入 + 简单替代检查 | Refined:项目三分模型,文档可外置 + 可对接 wiki,默认仓内 |
| forge 能力作为应用的内置功能开发 | 用户定向(一切皆插件) | Refined:能力以 dsh 插件形式提供,壳不焊死功能 |
| "一切皆插件"意味着全部能力可启停、可禁用 | 用户定向(必备能力,2026-09-21,经基座提案) | Refined:两级插件模型——forge 核心 = 必备插件(内置分发、不可禁用、仅作者维护);启停语义收缩至第三方插件(M2 G6/SC6 记账修订) |
| 工作台数据(任务索引/挂接)读写经 forge 文件与 CLI 即可,无需应用侧存储 | Stress Test(M2 G1 首屏 ≤2s @500 任务的文件扫描成本;挂接关系无结构化存储) | Refined:SQLite 数据内核入壳方向声明(Electron 侧 + 数据 API,任务 CRUD),M2/M3 落地,事实源关系届时设计 |
| forge CLI 作为长期能力形态保留 | 用户定向(2026-09-21,经基座提案) | Refined:CLI 为过渡形态;演进终点 = 应用 API(Electron 数据内核)+ dsh tool,CLI 不保留(形态由 M2 SC8 spike 与 M4 设计定) |
| (继承)主进程即宿主 / 无桌面形态 / Python 依赖 / v1 必须签名与自动更新 | 源码核查 + Stress Test | 见 Superseded 提案 Assumptions Challenged(结论继续有效) |

## Scope

### In Scope(v1 = M1 桌面壳,范围冻结,继承 Superseded 提案)

- 三平台(Windows/macOS/Linux)安装包,内嵌完整运行时,离线安装,无需预装 Node/pnpm。
- 壳 + 宿主子进程:`dsh-app://` 承载 Web 资源与 API 流量,carrier 接入现有 client UI 插件族,不开监听端口(UI 零重用)。
- 系统托盘(关窗驻留、菜单恢复/退出);系统通知(等待用户输入 / 回合完成,点击聚焦会话)。
- 应用内更新检测(v1 档位:启动检测 → 提示 → 引导发布页;失败不阻断启动)。
- GitHub Releases 发布通道 + 三平台 CI。
- 共存:独立 profile 目录名(≠ `desktop`)+ 共享 `$DSH_HOME` 产品数据 + 单实例锁。
- 宿主子进程崩溃恢复:壳存活、提示、重启子进程、依托 session 持久化恢复(**SC9 新增验收**)。

> 方向锚定项(任务可视化看板、feature 管线、会话挂接、知识库含跨项目层、测试用例管理、管线原生化、文档外置与 wiki 对接)均为 M2+ 里程碑,各自独立提案,不在本 feature 交付。

### Out of Scope

- 一切 forge 能力与 forge 侧改造(M2+ 各里程碑独立提案;v1 交付物不得出现任何 forge 依赖)。
- 代码签名、公证、完整后台自动更新(后续里程碑,绑定组织级证书投入)。
- 拖拽文件/文件夹集成;非开发者上手引导;多窗口、原生菜单等深度原生 UI。
- ACP/SDK sidecar 外部进程模式;修改上游 dsh 仓库;bundled Python 运行时打包(假设已解除,继承)。

## Key Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| M2+ 愿景挤压 M1 交付(范围爆炸) | H | M | M1 冻结 + Out of Scope 显式排除 forge + SC1-9 不含 forge 能力;M2+ 每里程碑独立提案 |
| dsh 插件机制 vs forge skill/hook/subagent 语义等价性未知 | M | M | M2 首个 spike 对照 dsh 源码(禁止猜测);兜底 = 管线原生化前置;forge 自研可自由改造 |
| 项目三分模型引入文档双位置/外置的一致性与同步复杂度 | M | M | forge 数据格式为唯一事实源;外置默认关闭;wiki 对接方式设计期定 |
| 跨项目全局知识是 forge 全新能力层(无现成模型) | M | M | M3 设计期从项目级 `domains` 机制泛化;先项目级后全局级的分层交付 |
| 插件退役过渡期拉长(迁移动力衰减) | M | M | 冻结版 bug-fix only;迁移计划锚定 M2 会话挂接落地;M4 收口 |
| dsh 快速迭代致协议缝/profile 结构漂移(继承) | H | M | 版本精确锁定 + 升级走显式适配任务(继承 Superseded 策略) |
| desktop-host private 包获取(继承) | M | M | tech-design 三选一决策(源码投影/vendor/请求上游发布) |
| 安装包体积三份运行时(继承) | H | M | 上游 runtime-file-policy 裁剪思路 + 体积预算(继承) |
| Linux 原生模块 prebuild 未知(继承) | M | M | tech-design 首项 spike + CI Linux 矩阵先行 |
| 未签名首启摩擦 / 三平台行为差异 / 多装共存冲突 / 子进程崩溃(继承) | H-M | M-L | 见 Superseded 提案 Key Risks(SC9 新增崩溃恢复验收) |
| SQLite 数据内核入壳扩大 preload IPC 安全面(偏离官方极小产品 API 面模式) | M | M | 沿用 M1 electron-ipc-security 约束(origin-lock、typed、版本化、最小必要面);API 面随 M2/M3 设计逐项评审 |
| 两级插件模型与 M2 PRD 口径不同步(G6/SC6/DF001/DF005) | M | M | 硬时序门槛:M2 PRD 修订完成前不得进入 M2 任务分解(基座提案 Next Steps 已记账) |

## Success Criteria

> 以下为 v1(M1)验收;M2+ 各里程碑验收随其提案定义。SC1-8 继承自 Superseded 提案(原文继续有效),SC9 为本次新增。

- [ ] SC1 干净机器验证:在无 Node/git/pnpm 的 Windows、macOS、Linux 各一台上,从 GitHub Releases 下载 → 安装 → 启动(允许平台安全机制一次性引导;零终端)→ 应用内完成 API key 配置 → 发起真实会话且至少一次 shell 工具调用成功、一次审批交互完成(平台手检清单 + 录屏归档)。
- [ ] SC2 离线自足:断网状态下可完成安装与首次启动;更新检测失败不阻断启动、不弹错误。
- [ ] SC3 进程足迹:空闲稳态时应用自有进程数 = 2(壳主进程 + 宿主子进程;系统 webview 辅助进程不计入),三平台进程树断言脚本验证。
- [ ] SC4 系统通知:"等待用户输入"与"回合完成"两种状态在三平台各触发一次系统通知,点击聚焦对应会话。
- [ ] SC5 托盘驻留:关闭主窗口后应用驻留托盘;托盘菜单可恢复窗口与完全退出。
- [ ] SC6 更新检测:配置假 GitHub Releases feed 时,启动后 60 秒内显示更新提示并可跳转发布页(e2e 驱动验证)。
- [ ] SC7 UI 对等:现有 web GUI 功能面在桌面载体全部可用——现有 web e2e/快照测试在桌面载体通过,或 tech-design 定义并落地等价载体级测试。
- [ ] SC8 多装共存:CLI、官方桌面(若装)、本壳三方共存,共享 `$DSH_HOME` 会话/凭据交替使用互不损坏;独立 profile 目录与上游 `desktop` 并存验证。
- [ ] SC9 宿主崩溃恢复(新增):三平台各验证一次——强制终止宿主子进程 → 壳保持存活并提示 → 重启宿主子进程 → 最近会话状态从 session 持久化恢复(脚本或手检清单)。

## Next Steps

- Proceed to `/write-prd` to formalize requirements(PRD 覆盖 M1;以本文与 Superseded 提案的 Source Code References 为源码导航)
- M2(需求与会话,含任务可视化)PRD 已立项(`docs/features/dsh-forge-m2/`,status = prd);开工线为双门槛(2026-09-21)——ui-plugin-foundation 基座(至少 spike + bundle 配置化)完成 + M2 PRD 修订完成(G6/SC6 两级插件模型、DF001/DF005 SQLite 记账),二者并行推进,任一悬空则 UI 插件任务阻塞;M2 首个任务仍为语义等价性 spike(SC8)

## Source Code References(源码参考,供后续执行 agent 使用)

> **使用规则**:dsh 本地源码为唯一权威(禁止凭公开资料猜测);forge 文档为 2026-06 快照,以仓库代码与模板为准;行号会漂移,优先按符号名检索。

- **dsh 仓库**:`Z:\project\github\deepseek-harness` —— 完整导航见 Superseded 提案 Source Code References A-H 节(宿主组装/carrier/RPC/事件/持久化/上游桌面实现/UI 组装/Electron 工程模式,2026-09-16 核查,继续有效)。
- **插件路线源码导航(M2+,2026-09-21)**:`docs/proposals/dsh-forge/ui-plugin-vendor-free.md`(技术方向文档)——npm 发布面、ui-slots 契约、装配机制、dist-tag 陷阱的源码级证据;上游对齐基准 = vendored SHA `c36ba648` / `0.1.6-alpha.2`;引用其结论须钉在 git 提交版 `6f5b109`。
- **course 仓库**:`Z:\project\github\electron-course`(Electron 工程教学参考,同上 H 节)。
- **forge 仓库**:`Z:\project\ai\forge`(用户自研;Go CLI + Claude Code Plugin;v3.0.0;MIT):
  - `README.md` — 能力面、竞品对比、两种工作模式、工程规模。
  - `docs/user-guide/architecture-overview.md` — 四大组件(Skill/Command/Agent/Hook)与协作;数据流(所有状态变更经 forge CLI);feature 状态机((none)→prd→design→tasks→in-progress→completed)与任务状态机(7 态);Quality Gate 顺序(compile→fmt→lint→unit-test→test→probe);目录约定全景。
  - **数据落点(M2+ 读写对象)**:`.forge/config.yaml`;`docs/features/<slug>/`(manifest.md、prd/、design/、ui/、testing/<journey>/contracts/、tasks/{index.json, *.md, records/, specs/});`docs/proposals/<slug>/proposal.md`;`docs/{business-rules,conventions,decisions,lessons,sitemap}`;`tests/<surfaceKey>/`(标签晋升 `@feature`→`@regression`)。
  - **forge CLI 关键命令**(完整参考 `forge -h`):`forge task {add,claim,list,query,status,transition,reopen,submit,index,validate,check-deps}`、`forge feature {set,complete,list}`、`forge config {get,set}`、`forge surfaces detect`、`forge quality-gate`、`forge prompt get-by-task-id`(会话挂接现成入口)、`forge cleanup`、`forge proposal <slug>`。
  - 其余:`docs/user-guide/{usage-guide,initialization,environment-setup}.md`。
