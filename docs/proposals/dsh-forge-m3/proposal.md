---
created: "2026-09-22"
author: "faner"
status: Draft
intent: "new-feature"
---

# Proposal: dsh-forge M3 —— 流程即产品:编排原生会话管线与 forge CLI 退役

> **定向说明(2026-09-22)**:本提案依据 `todo.md`(2026-09-22 重梳)推进建议与本日 brainstorm 决策链立题,**取代主提案(`docs/proposals/dsh-forge/proposal.md`)路线图中 M3 的原定义**(原 M3 = 知识库 + 测试用例管理 → 修订为:知识库远期、测试用例管理后置、M3 = 流程即产品);M4 定义同步修订(残余 = 管线原生化工作流 UI / 对抗式评估器 / Quality Gate UI / CC 插件与 forge 仓 CLI 发布的最终收口)。主提案为方向锚,本文为 M3 范围与验收的唯一权威。

## Problem

核心问题一句话:**forge 的 SDD 流程编排仍住在「冻结的 Claude Code 插件 + 终端 CLI」里——任务派发依赖 agent 启动后自跑命令合成策略、阶段推进无门控、目标与摘要不随会话走,而 M2 工作台只是这套旧管线的只读观察窗;应用要成为流程的载体,就必须把编排(派发/预合成/阶段门/写通道)原生化,并在能力覆盖后彻底退役 forge CLI。**

三条问题线:

- **线一(编排缺位)**:任务执行 = `/run-tasks` 派发 task-executor 子代理,启动后自跑 `forge prompt get-by-task-id` 合成执行策略——专业化上下文(任务类型协议、feature 目标摘要、运行偏好)不进系统提示词,每回合重复付出合成成本;阶段切换(prd→design→tasks→in-progress)无强制门,目标与摘要不跨阶段传递。
- **线二(通道错位)**:操作主体混淆——查询类 CLI 命令人与 agent 共用、变更类命令主要是 agent 在用,而人真正需要的是看板观察(GUI 已具备),agent 真正需要的是会话内原生工具面(bash spawn CLI 是代理通道,非原生);M2 的「主会话直注」是 spike 裁决的降级形态,并行执行与专业化提示词无从谈起。
- **线三(退役悬空)**:CLI 退役演进方向已定(终点 = 应用 API + dsh tool,CLI 不保留,2026-09-21),但无推进切片则永远悬空;`tasks/index.json` 多写者一致性(SC8 spike §4:旧写者重写静默丢未知字段)是退役路径上的已知结构风险。

### Evidence

- **todo.md(2026-09-22 重梳)**:条目 2「subagent 必须具备——系统提示词专业化:提前合成」【M3+ 候选,优先级高】;条目 3「任务 CRUD API + 运行偏好分级(全局/项目/feature)」【M3+ 候选】;条目 5「SDD 流程融合 UI,强制阶段化」【M3+ 候选,核心】;条目 14「补充 proposal 看板」【已确认 dsh-forge-m2 feature 看板未包含此缺口】;推进建议 = 三者合成「流程即产品」。
- **M2 现状核查(2026-09-22)**:24/52 任务完成——SC8 语义等价性 spike、SQLite 内核(6 表)、双层防护、插件装配、ForgeBridge/SessionLaunch(host 半身)、部分 UI 已落地;UF4 feature 看板详情页含 feature 关联 proposal 文档只读 tab,但 `docs/proposals/` 目录级视图(管线早期、尚无 feature 的提案)无任何 GUI 载体。
- **SC8 spike 结论(2026-09-22,design/spike-1-findings.md)**:①dsh 无 `.md` 子代理定义文件形态,原生子代理系统 `ctx.subagents` 在场(§1.3);②宿主 `sessionController.create/prompt` 通道可用,prompt 注入即持久化用户消息(§2);③`FORGE_ACTOR` 透传可行但仅覆盖 submit 记录,`index.json` 为双形态共写往返文件、旧写者静默丢未知字段(§4);④dsh 会话无终态信号,「会话结束」不可得为明确事件(§5);⑤host 侧存在 `systemPrompt` 服务注入先例(ui-deliverables,§1.4)。
- **决策日志(2026-09-22 brainstorm,全部为用户显式选择)**:①M3 主线 = 流程即产品三件套 + 提案看板,知识库维持远期、测试用例管理后置;②CLI 退役 M3 一步到位——M3 末应用出包与执行链零 forge CLI 依赖;③操作主体模型 = 人观察看板(GUI 只读),dsh tool 面向 agent,M3 不做人侧任务写 UI;④执行模型 = 任务级 subagent 并行,派发时预合成专业化系统提示词;⑤强制阶段化 = 编排层硬门(外部会话不硬阻断);⑥SoT 分治——任务结构化状态(index.json 内容)以 SQLite 为权威,任务/记录 md 留文件不入库,`index.json` M3 终态直接淘汰(一次性迁移);⑦新会话/任务派发前检查当前阶段产物齐全性(优先代码机械性检查,缺失提示不阻断 + 缺失清单);⑧forge 技能集迁移至 dsh 原生形态(随 CLI/CC 插件退役);⑨过程文档(特别是任务相关)默认仓外,仓内兼容(M2「仓内默认」注册默认值翻转)。

### Urgency

- M2 会话挂接(UF5)落地后,日常管线具备向应用迁移的条件——迁移动力随时间衰减,编排能力不跟上,双形态过渡期将无限拉长(主提案过渡管理约束)。
- CLI 的查询/变更双通道每多活一个里程碑,`index.json` 多写者风险与「第二事实源」诱惑就多积累一分;spike 已给出结构风险证据,越晚动手对拍基准(冻结 CLI 行为)越难保持新鲜。
- 预合成与阶段化是后续一切编排能力(M4 管线工作流 UI、评估器)的地基——地基不落,M4 无从起建。

## Proposed Solution

**M3 = 「流程即产品」**:把 SDD 流程的编排权从「CC 插件指令流 + CLI」迁入应用,并以 dsh tool 建立 agent 原生操作面,同里程碑完成 forge CLI 在应用侧的退役。

**七项交付**:

1. **任务执行 subagent 化**:每个被领取任务派发为一个 dsh subagent(`ctx.subagents`),并行执行互不串扰;**派发时预合成专业化系统提示词**——任务类型协议 + feature 目标/摘要 + 生效运行偏好,替代 task-executor 启动后自跑合成;编排与审批在看板可见可操作。
2. **任务 CRUD 应用 API + SoT 分治迁移**:任务状态机(7 态)/依赖解析/记录渲染由 Electron 数据内核承载;任务结构化状态以 **SQLite 为权威**(单写者 = 内核),`tasks/index.json` 一次性迁移后**终态淘汰**;任务文档 `tasks/*.md` 与记录 `tasks/records/*.md` 留仓不入库(快照仅存元数据/路径);agent 写通道 = dsh tool(claim/submit/transition/reopen/add)。实现载体(TS 原生移植 vs Go 引擎嵌入库)留 /tech-design 裁决,禁止 CLI 进程依赖进入终态。
3. **CLI 退役收口(M3 一步到位)**:查询面 = 人看板(M2 看板 + M3 提案看板)+ agent 只读 dsh tool;变更面 = dsh tool;**forge 技能集同步迁移**至 dsh 原生技能形态(承载路径按 M2 spike §1.1 两路径设计定:项目侧播种 / customSkillDirs;`forge:` 前缀寻址障碍随迁移消解——技能是 CC 插件资产的核心面,不迁移则 CC 插件退役悬空);外围命令(quality-gate/cleanup/prompt/task index/validate/check-deps/surfaces/config/feature complete/proposal 查询)逐项归宿(内核 API / dsh tool / GUI / 淘汰,归宿表 PRD 定);**M3 末应用出包与执行链零 forge CLI 依赖**。过渡纪律:已注册项目 = 应用通道;未注册项目 CLI 照旧不破坏。
4. **强制阶段化(编排层硬门)**:①**新会话/任务派发前检查当前阶段产物齐全性**——**优先代码机械性检查**(确定性文件存在/结构校验,由应用代码执行,不依赖 LLM 判断;各阶段期望产物清单 PRD 定且必须机器可校验),缺失则**提示不阻断**(警告 + 缺失清单,用户确认后可继续派发);②feature 阶段推进以**阶段总结为门**——agent 会话生成 feature 目标与摘要,**保存为文件**(forge 数据模型新增阶段资产文件,落于项目过程文档根,默认仓外/仓内兼容;具体路径/命名设计期定),并可在工作台面板中查看(只读渲染,经 M2 MarkdownView);③应用只为当前阶段派发会话/任务;新阶段会话系统提示词**强制注入**目标 + 摘要;看板呈现阶段与偏离标识;外部会话(终端/CC 插件)不硬阻断(零宿主侵入,spike §5 约束)。
5. **运行偏好三级分级**:全局 / 项目 / feature 三级继承链(feature > 项目 > 全局),消费于预合成与派发链;最简编辑面对齐 UF6 插件管理先例;forge 数据模型配合演进(当前仅项目级)。
6. **提案看板(只读管线视图)**:项目过程文档根下 `proposals/` 目录(仓内或仓外随注册配置)列表(status/created/作者/关联 feature 徽标)+ 详情只读渲染(经 M2 MarkdownView 白名单)+ eval/ 评估报告浏览 + 与 feature 看板互跳;状态流转仍归终端/agent(人只读)。
7. **过程文档默认仓外**:agent 过程文档(proposal/PRD/design/任务/记录/阶段资产,**特别是任务相关**)默认存放于**代码仓外**的工作台管理文档根(注册时可改);仓内存放继续支持(既有项目与偏好仓内的工作流兼容);M2 的「仓内默认」注册默认值翻转;indexer/看板/提案板/阶段资产全部按文档根寻址。对齐主提案项目三分模型——文档外置从可选升为默认。

**架构约束(继承 + 新增)**:

- 继承:两级插件模型(forge 核心 = 必备插件)、宿主与协议缝、electron-ipc-security(origin-lock、typed、版本化、最小必要面)、零侵入上游、数据格式纪律。
- 新增:**操作主体模型定形**——任务状态变更 = agent 域(经 dsh tool),人 = 观察与编排发起(派发/审批),无任务写 UI;**SoT 分治**——结构化状态入 SQLite、文档资产(任务/记录 md、阶段目标与摘要)留文件(默认仓外文档根,仓内兼容);阶段资产文件与文档根模型为 forge 数据模型演进项(forge 仓用户可控)。

### Innovation Highlights

- **agent-native 操作主体分离**:传统工具(Linear/Jira/issue tracker)的看板是人的写界面;本方案把看板定位为**人的观察面**、dsh tool 为 **agent 的操作面**——流程数据的写权归执行者(agent),人保留编排发起与审批。这是「SDD 工作流为 agent 而产品化」的差异化位,同类(Superpowers/Spec Kit/OpenSpec)均无人/agent 通道分离的应用形态。
- **预合成对抗运行时合成**:把执行策略的合成从「子代理启动后自跑命令」前移到「派发时一次性合成进系统提示词」——专业化上下文不再每回合重复付出,是编排原生化后才能兑现的红利。
- **SoT 按数据类型分治**:结构化状态(状态机/依赖)入关系存储消解多写者风险,文档资产(任务/记录 md)留文件保住 git 评审——不同于「全量入库」与「全量留文件」的两端方案。
- 诚实声明:提案看板、偏好分级为常规产品能力,非创新项。

## Requirements Analysis

### Key Scenarios

- **既有项目迁移(一次性)**:注册既有 forge 项目 → indexer 摄入 `index.json` → 权威翻转 → 仓内 index.json 消失;任务/记录 md 原样留仓;迁移前后任务状态零丢失(对拍断言)。
- **派发执行闭环(happy path)**:看板选任务 → 派发 → subagent 以预合成系统提示词启动执行 → 审批在工作台可见可操作 → agent 经 dsh tool 提交 → 状态回流看板 ≤5s,全程零 CLI 调用。
- **并行执行**:≥3 个无依赖任务并行派发,互不串扰,各自提交独立回流。
- **产物齐全性检查(派发前)**:当前阶段期望产物缺失时,新会话/任务派发不被阻断,呈现警告与缺失清单,用户确认后照常派发;检查为代码机械性执行(确定性,无 LLM 参与)。
- **阶段推进**:阶段推进请求在阶段总结未生成时被门拒绝(可观察错误);总结生成 → 推进 → 新阶段会话系统提示词含目标 + 摘要(注入内容断言);阶段资产文件可在面板查看。
- **agent 会话内查询**:会话中经只读 dsh tool 查任务/依赖/feature 状态,替代 bash spawn CLI。
- **技能原生寻址**:会话内以 dsh 原生扁平名调用 forge 技能(submit-task 等),无 `forge:` 前缀障碍。
- **提案浏览**:列表 → 详情 → eval 报告;feature ↔ proposal 互跳;外部变更 ≤5s 回流。
- **新注册默认仓外**:注册向导默认过程文档根在代码仓外(应用管理);仓内选项保留;既有仓内项目不受影响。
- **偏好覆盖**:全局设默认、项目覆盖、feature 再覆盖;预合成产物反映生效值。
- **过渡双形态**:未注册项目全程 CLI 照旧;已注册项目切换后不再依赖 CC 插件日常管线。
- **错误路径**:迁移冲突(迁移时外部写入)检测与重试;门拒绝的引导文案;dsh tool 不可用时的会话降级提示;subagent 失败的看板呈现与重派发。

### Non-Functional Requirements

- 继承 M1/M2:离线自足、三平台、中英双语、IPC 安全约束、≤2s 看板首屏(500 任务规模)、≤5s 状态回流。
- 派发链性能:派发 → subagent 可交互 ≤3s(对齐 M2 发起预算)。
- 迁移安全:一次性迁移原子性(失败可回滚重试),迁移前后状态对拍零差异。
- 审计:任务状态变更经 dsh tool 留 actor 标识(FORGE_ACTOR 语义延续,SC8 spike §4 通道)。

### Constraints & Dependencies

- **硬前置:dsh-forge-m2 完成**(至少 UF2 看板 / UF5 发起链 / 数据内核 / e2e 腿落地——M3 全部交付建立在 M2 的内核、装配、发起链之上)。
- **前置 spike×4(M3 首任务,结论归档 design/)**:①dsh 插件注册 model-facing tool 的先例与契约;②subagent 上下文的审批面与 FORGE_ACTOR 透传;③`systemPrompt` 注入契约(spike §1.4 先例已在,需定形);④`forge prompt` 模板到应用侧预合成的移植面盘点。
- **状态机载体两难(TS 原生移植 vs Go 引擎嵌入库)**:/tech-design 裁决,M3 proposal 不预支(2026-09-21「禁止预判」纪律延续)。
- forge 仓配合演进(用户可控):偏好三级模型、阶段资产与文档根数据模型、技能承载;CC 插件维持冻结(bug-fix only)。
- dsh 上游零侵入;vendored 对齐基准与升级纪律继承 M2。

## Alternatives & Industry Benchmarking

### Industry Solutions

- **Linear / Jira**:人侧流程看板的事实标准——写界面为人设计;本方案反其道(人观察/agent 操作),agent-native 工作流无成熟对标。
- **Claude Code 子代理 / Codex 派发模式**:子代理 + 工具面是 agent 编排的行业主流形态,预合成系统提示词对齐「上下文工程」共识;差异在编排器产品化(看板 + 门控 + SoT)。
- **Superpowers / Spec Kit / OpenSpec**(forge 同类):全部插件/CLI 形态,无应用载体、无 agent 工具面、无人/agent 通道分离——M3 后形态差异进一步拉开。

### Comparison Table

| Approach | Source | Pros | Cons | Verdict |
|----------|--------|------|------|---------|
| Do nothing(M2 形态延续:spawn CLI + 主会话直注) | 现状 | 零新工程 | CLI 依赖永续;编排无法产品化;预合成/阶段化/并行无从谈起 | Rejected: 与应用化终态冲突(用户 2026-09-22) |
| 原路线图 M3(知识库 + 测试用例管理) | 主提案路线图 | 对齐既有锚点 | 编排地基缺位;与 todo.md 重梳冲突;知识库已被标远期 | Rejected: 路线图修订(用户 2026-09-22) |
| 三段式渐进(M3 查询面+写面开口,M4 收口) | 本提案 brainstorm 中间方案 | 风险分层,里程碑小 | agent 侧 CLI 依赖 M3 零消解,退役全压 M4 | Rejected: 用户定向一步到位 |
| SoT 整体翻转(任务/记录 md 亦入库) | 「全量入库」端方案 | 消灭文件同步面 | 文档 git 评审断裂;迁移面翻倍 | Rejected: 分治(用户 2026-09-22) |
| **流程即产品 + CLI M3 退役 + SoT 分治** | 本提案 | 编排原生化一步到位;多写者风险根除;M4 减负 | 单里程碑承载引擎/数据/通道三迁移,单人风险高 | **Selected: 2026-09-22 决策日志六项显式选择** |

## Feasibility Assessment

### Technical Feasibility

**中高**。关键面已有 spike 证据背书:`ctx.subagents` 原生子代理系统在场(§1.3)、`sessionController` 发起通道可用(§2)、`systemPrompt` 服务注入先例存在(§1.4)、host 半身 Node 全能力(§1.4)。剩余未知集中在前置 spike×4(tool 注册面 / subagent 审批面 / systemPrompt 契约 / prompt 移植面),均为「先例存在、契约未定」型,非「能力不存在」型。状态机移植保真是最大工程风险,对拍基准(冻结 CLI 行为)当前可用。

### Resource & Timeline

单人产品线;M3 范围量级 ≥ M2(52 任务),建议 PRD 分 phase(内核 SoT 迁移 → dsh tool 面 → subagent 执行 → 阶段化 → 偏好/提案看板),每 phase 设 gate;具体量级随任务分解评估,本提案不预支。

### Dependency Readiness

无外部 API 依赖;forge 仓自研可控;M2 为硬前置(当前 24/52,Phase 5/6 在建);dsh vendored 基准锁定纪律继承。

## Assumptions Challenged

| Assumption | Challenge Tool | Finding |
|------------|---------------|---------|
| M3 = 知识库 + 测试用例管理(主提案路线图) | todo.md 重梳 + 用户定向 | Overturned:知识库远期、测试用例后置;M3 = 流程即产品(路线图同步修订) |
| 应用 API 需要配人侧任务写 UI | 用户定向(人观察看板,dsh tool 面向 agent) | Overturned:任务写通道消费方 = dsh tool;人 = 观察与编排发起;写 UI 不做 |
| 写面应以 forge 文件为 SoT 稳妥过渡 | Stress Test(多写者 vs git 评审) + 用户定向 | Refined:SoT 分治——结构化状态 SQLite 权威、md 留仓、index.json 终态淘汰 |
| CLI 退役按 M2 桥接 → M4 收口渐进 | Need Gate(为何是现在)+ 用户定向 | Overturned:M3 一步到位,应用零 CLI 依赖;forge 仓发布收口留 M4 |
| 子代理需迁移「定义文件」形态 | M2 spike §1.3 侦察 | Confirmed 不迁移:预合成系统提示词承载执行协议,行为等价无功能损失 |
| 阶段强制 = 阻断旧会话继续 | Stress Test(spike §5 无终态信号) | Refined:编排层硬门——只为当前阶段派发 + 注入强制 + 偏离标识,零宿主侵入 |
| 执行策略在子代理启动后合成(forge 原形态) | Assumption Flip(合成时机) | Overturned:派发时预合成进系统提示词,专业化上下文一次到位 |
| 提案可视已随 M2 UF4 覆盖 | 简单替代检查(UF4 仅 feature 关联 tab) | Overturned:目录级提案看板独立交付(用户指出的缺口) |
| 过程文档默认仓内(forge 与 M2 注册默认) | 用户定向 + 简单替代检查(项目三分模型本就允许外置) | Overturned:默认翻转仓外,仓内兼容保留 |
| forge 技能随 CC 插件冻结即可 | Assumption Flip(CC 插件退役后技能面悬空) | Overturned:技能集迁移 dsh 原生形态(spike §1.1 承载路径) |
| 阶段门只校验阶段总结 | 用户定向 + Need Gate(检查由谁执行) | Refined:派发前增加产物齐全性检查,优先代码机械性检查(不依赖 LLM 判断) |

## Scope

### In Scope

- 任务执行 subagent 化:任务级 dsh subagent 并行执行 + 派发时预合成专业化系统提示词(任务类型协议 / feature 目标摘要 / 生效偏好)+ 看板编排与审批可见。
- 任务 CRUD 应用 API:状态机(7 态)/依赖解析/记录渲染入数据内核;agent 写通道 dsh tool(add/claim/transition/submit/reopen)。
- SoT 分治迁移:任务结构化状态 SQLite 权威化 + `index.json` 一次性迁移并终态淘汰 + 任务/记录 md 留文件不入库(随文档根,默认仓外)。
- CLI 退役收口:只读查询 dsh tool(会话内 agent 查询)、forge 技能集迁移至 dsh 原生形态、外围命令归宿表落地、M3 末应用出包与执行链零 forge CLI 依赖。
- 强制阶段化:新会话/任务派发前的**当前阶段产物齐全性检查**(优先代码机械性检查;缺失提示不阻断 + 缺失清单)+ 阶段总结门——阶段目标与摘要**保存为文件**(forge 数据模型新增阶段资产,落于文档根)且可在工作台面板查看(只读)+ 只为当前阶段派发 + 新阶段会话系统提示词强制注入目标与摘要 + 看板阶段/偏离标识。
- 运行偏好三级分级:全局/项目/feature 继承链 + 预合成/派发链消费 + 最简编辑面(对齐 UF6 先例)。
- 提案看板(只读):文档根下 proposals 列表 + 详情只读渲染 + eval 报告浏览 + feature 互跳 + ≤5s 回流。
- 过程文档默认仓外:注册默认值翻转(仓外文档根为默认,仓内兼容)、文档根管理、既有仓内项目读写不破坏。
- 前置 spike×4 结论归档(tool 注册 / subagent 审批与 ACTOR / systemPrompt 契约 / prompt 移植面)。

### Out of Scope

- 人侧任务写操作 UI(人 = 观察与编排发起;todo「人写通道后置」继续成立)。
- 阶段知识注入(todo 留坑,依赖远期知识库);知识库(远期);测试用例管理(后置里程碑)。
- 看板内嵌会话面板(split view)、多窗口并行视图、wiki 对接。
- 管线工作流 UI(brainstorm→PRD→设计应用原生工作流)、对抗式评估器、Quality Gate UI(M4 管线原生化残余)。
- CC 插件退役最终收口与 forge 仓 CLI 停止发布(M4;M3 验收面 = 应用零依赖)。
- SoT 进一步翻转评估(任务/记录 md 入库、feature manifest 权威化等,按需后议)。
- forge CLI 机制通用化重构(载体两难归 /tech-design,不预设)。
- 修改 dsh 上游仓库(零侵入约束)。

## Key Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| 单里程碑承载引擎/数据/通道三迁移,单人范围爆炸 | H | H | PRD 分 phase 硬门交付(内核 SoT → tool → subagent → 阶段化 → 偏好/看板);外围命令归宿表 PRD 期先行收敛;每 phase gate 可独立验收 |
| 状态机移植保真(7 态 + 依赖 + 记录渲染 + 原子性) | M | H | 迁移前用冻结 CLI 生成 golden 对拍集(行为基准);载体两难 tech-design 优先裁决;对拍断言进 SC |
| index.json 淘汰的过渡断裂(未注册项目 / CC 插件 / 多机器) | M | M | 过渡纪律:未注册项目 CLI 照旧;已注册项目迁移原子化 + 失败回滚;多机状态不随仓为已接受代价(记入文档) |
| subagent 审批面 / FORGE_ACTOR 透传未知 | M | M | 前置 spike(首任务),结论未出不开工执行模型任务;兜底 = 审批聚合到主会话 |
| dsh tool 注册面 / systemPrompt 契约依赖上游服务面 | M | M | 前置 spike;先例均已在场(§1.4/tool-skill);契约漂移走 vendored 升级显式适配任务 |
| SQLite 权威后任务状态无 git diff,评审面收窄 | M | L | 记录 md 留仓保底;看板历史(记录文件)为评审面;已接受代价显式记账 |
| 偏好三级 / 阶段资产 / 文档根 / 技能承载 = forge 侧数据模型与资产演进量 | M | M | forge 仓自研可控;PRD 期数据模型盘点,设计期定形 |
| 文档根默认仓外改变既有心智,过程资产脱离 git 视野 | M | L | 看板/提案板成为过程资产主视图;仓内兼容保留;文档根布局 PRD 期定 |
| M2 延期拖 M3 开工线 | M | M | 硬前置显式记账;M2 Phase 5/6 收尾与 M3 spike 可并行(spike 零产品代码) |

## Success Criteria

- [ ] SC1 零 CLI 执行链:在无 forge CLI 的干净环境安装应用 → 注册既有项目完成一次性迁移 → 看板派发任务 → subagent 以预合成系统提示词执行 → agent 经 dsh tool 完成 claim/submit → 状态回流看板 ≤5s;全程 forge CLI 调用数 = 0(进程/日志级断言);会话内 forge 技能集以 dsh 原生形态可寻址调用(如 submit-task 扁平名解析成功,断言)(e2e)。
- [ ] SC2 SoT 迁移零丢失:迁移前后任务全集对拍(ID/状态/依赖/标题)零差异;迁移完成后项目文档树内 `tasks/index.json` 不存在;`tasks/*.md` 与 `tasks/records/*.md` 原样留存于原位置(仓内或仓外文档根,不迁移不改动);迁移中断可重试且不产生半迁移态。
- [ ] SC3 subagent 并行执行:3 个无依赖任务并行派发互不串扰;每个 subagent 系统提示词可断言包含任务类型协议 + feature 目标摘要 + 生效偏好(e2e 注入内容断言);审批在工作台可见可操作。
- [ ] SC4 阶段硬门:当前阶段产物不齐全时,新会话/任务派发**不被阻断**但呈现警告与缺失清单,用户确认后可继续派发(检查为确定性代码执行,断言无模型调用;e2e);阶段总结未生成时,阶段推进请求被拒绝并给出可观察引导;总结生成后推进成功——项目文档根存在对应阶段资产文件(目标 + 摘要)且工作台面板可查看其只读渲染(e2e 断言),新阶段会话系统提示词包含目标 + 摘要(e2e 断言);外部会话不被硬阻断但看板呈现偏离标识。
- [ ] SC5 偏好三级继承:全局→项目→feature 逐级覆盖用例通过,预合成产物反映最终生效值(断言);最简编辑面可完成三级查看与修改。
- [ ] SC6 提案看板:proposals 列表/详情/eval 报告与文件内容一致,外部变更 ≤5s 回流;proposal ↔ feature 互跳正确;只读(无任何状态写入口)。
- [ ] SC7 过渡双形态:同一机器上未注册项目全程使用 forge CLI 不受影响;已注册项目切换应用通道后,冻结 CC 插件不再被其日常管线依赖(脚本断言无 spawn)。
- [ ] SC8 前置 spike 归档:四项 spike(tool 注册 / subagent 审批与 ACTOR / systemPrompt 契约 / prompt 移植面)结论与兜底建议归档于 design/,作为后续任务的开工依据。
- [ ] SC9 过程文档默认仓外:新注册项目的过程文档根默认位于代码仓外(应用管理路径,注册向导默认值断言);任务/记录/阶段资产/proposals 读写全部经文档根,代码仓内零新增过程文档;既有仓内项目读写兼容不破坏(e2e)。

consistency_check_result:
  status: pass
  pairs_checked: 56
  conflicts_found: 0

## Next Steps

- Proceed to `/write-prd` to formalize requirements(外围命令归宿表、各阶段期望产物清单(机器可校验)、阶段资产与文档根数据模型、技能承载路径、偏好键集为 PRD 期必答项)
- 记账动作:主提案路线图 M3/M4 定义修订 + `todo.md` 状态标记同步(条目 2/3/5/14 → M3 立项)
- 开工线:dsh-forge-m2 完成 + 前置 spike×4 结论归档(M3 首任务,可与 M2 Phase 5/6 收尾并行,零产品代码)
