---
created: "2026-10-02"
author: "faner"
status: Draft
intent: "new-feature"
---

<!-- 本提案 = 总纲（docs/proposals/dsh-forge-redesign/proposal.md，Accepted）路书 M2「forge 管线接管」的里程碑提案。总纲的定位与边界、工件版图、演进路书对本提案具宪法级约束；《架构基线》（§3 状态层细则 / §5 演进纪律 / §6 已知边界）与《技术预研笔记》（§2 派发方案 v3 / §4 动态提示词组装）为技术输入。SC 继承总纲验收池并细化，只增不减；范围溢出显式记账。 -->

# Proposal: dsh-forge M2 —— forge 管线接管（状态层转正 + 插件执行链 + 任务/文档视图）

## Problem

核心问题：P1（MVP）之后，产品的任务管线仍住在旧世界——日常开发任务依赖 Claude Code 冻结插件 3.x（bug-fix only）与旧仓任务文件，总纲的核心断言「任务状态层 = 唯一 SoT、forge 插件接管执行链」在产品侧尚不存在。M2 要把任务域从「无」带到「转正」：**任务/feature/提案状态进入应用状态层（唯一 SoT），forge 插件（tool + skills）在本仓落地并跑通 run-tasks 派发链，产品 UI 以任务列表与文档视图消费状态层**。

### Evidence

- P1 已交付（任务记录 1–4 全绿）：走线架 + 知识飞轮第一圈（episodes 1–4 records 齐）；**episode 4（MVP 门：安装包冒烟 + 飞轮 e2e）已通过**（4.2 飞轮 dogfood 四连绿 + 4.3 安装包冒烟两连绿，4.gate 记录在案——2026-10-05 代码核对回填，原「待执行」表述作废）；M2 执行前置已满足。
- 总纲路书 M2 行明确交付：state-layer 转正（唯一 SoT）、forge 插件 tool 半身转正（claimTask / submitTask / … 消费能力面；dispatchPrompt 合成内聚 claimTask，run-tasks 派发链跑通）、任务三视图列表先行、不提供迁移能力；SC 锚点 = SC4 / SC7。
- P1 记账顺延项落点：SC6③（任务↔会话挂接元数据）显式顺延 M2 随 SC7 联测（P1 proposal Assumptions Challenged）；「对账卡完整 UI、概览页内容、文档 tab」P1 Out of Scope 划归 M2+。
- 架构基线 §3 已冻结状态层细则（表集——原文六表、M2 修订后七表；七态 CHECK + blockers 无环 + append-only 记录 + 动词 API）；§6 将「单机单活跃分支」断言锚定 M2 设计。
- 技术预研 §2/§4 已定稿：dispatchPrompt 派发前一次性合成（约束块 + 动态信息块 + 类型策略块，TS 模板函数族）、run-tasks 链路、老 forge（`Z:\project\ai\forge`）语义迁移映射表。
- **并行轨现实核查**：本仓（redesign 分支）内无 plugin-forge 任何产出——路线图「并行轨自 M0 启动」未发生；M2 必须从零落地插件工件（本提案裁决并入本仓，见 Assumptions Challenged）。

### Urgency

- 自举链路以 M2 为地基：M3 达成自举后（M4 起产品用自身开发），任务/提案/执行记录必须已在自身状态层运行——M2 不落地则 M3/M4 全线后延。
- 日常任务管线仍住冻结旧线（bug-fix only），新旧双形态并存成本随时间累积；MVP 建立的用户信任需要下一个可演示跃迁（「任务在产品里跑起来」）。
- P1 刚验证的两条缝（Cordis 服务注入 / systemPrompt.section）与 dogfood 基建处于热态，M2 立即复用成本最低。

## Proposed Solution

按总纲路表直切 M2 全量，四个交付面：

**① core · forge 域转正（每工作区 DB）**

- 存储落位：**每工作区独立 DB，部署于 `{dsh-forge-home}/{canonical-path 扁平化}@{hash8}/`**（hash8 = 原路径 sha-256 前 8 hex 消歧后缀，防扁平化碰撞——总纲 2026-10-02 M2 细化；core 多句柄管理；schema 版本表随库 + 幂等迁移；兑现总纲数据模型「任务清单/执行记录统一位于」的字面语义，注册表单只读行不撒谎）。中央 state.db 维持 projects / knowledge 域**完全不动**（范围对齐 2026-10-02：worktree 分组列 `repo_root_path` 随 §6-37 后移 M3，中央域例外随之消失——恢复宪法原句）；forge 域表不进中央库。
- 七表一次到位：`features` / `feature_documents`（feature 文档索引，manifest 库内化——manifest.md 文件形态判消亡，技能经 tool 读写，**相位推导机**：upsertFeatureDoc / addTask / claimTask / submit 钩子内聚重算 feature 相位，doc→phase 映射 + task 状态分布联合推导，快照 + 派生不变量断言）/ `tasks`（七态 CHECK）/ `task_edges`（blockers，写入时无环校验）/ `task_records`（append-only）/ `proposals`（五态承载，管线消费归 M3）/ `task_session_links`（挂接元数据，会话账本本体归 dsh）。`feature_records` 第八表 = M3 增表（范围对齐后移——M2 期间 feature 域转移无审计，显式记账该缺口）。
- 状态机与动词 API：代码内一份状态常量 + `addTask / claimTask / submitTask / transitionTask / queryTask…` 动词函数（+ proposal 最小动词）；转移校验（from 匹配、依赖终态守卫、record/reason 必带）全在服务内；每次写自动审计。**transitionTask = 人类逃生通道**（状态异常时强行恢复：UI 直调能力面、from≠to + reason 必带、不封装 tool——§6-27 面分治）——agent 使用含义明确的 API，executor 的受阻出路唯一 = submitTask result=blocked。
- **dispatchPrompt 合成内聚 claimTask**（预研 §2/§4 定稿落实）：claim 返回值携带 `dispatchPrompt` = executor 约束块（单一 TS 源，迁移自 task-executor.md 硬约束）+ 动态信息块（TASK_ID/FILE/TYPE/CATEGORY、BLOCKERS 依赖现状快照、PHASE_SUMMARY、COVERAGE 等 core 实时取数）+ 类型策略块（TS 模板函数族，exhaustive 路由）；**独立 taskPrompt tool 取消**。模块落位（core forge 域内子模块划分）与每类型快照测试为设计期细化。

**② plugin-forge 插件入仓（过渡单包，M3 拆核心/规格）**

- tool 半身：addTask / claimTask / submitTask / queryTask 等动词 tool（**transitionTask 不进 tool 面**——人类逃生通道 UI 专属），消费 `ctx.forgeProjects`（Cordis 服务注入，与 knowledge 插件同缝——P1 已 pin 验证）。
- skills 半身迁移 + eval-\* 裁剪（去悬空引用，机械断言零残留）：**run-tasks**（subagent 阻塞派发循环，`run_in_background: false`）/ **fix 链**（`--source-task-id --block-source`、完成自动恢复，经 core blockers 边 + submit 钩子）/ **submit-task**（quality gate 序列内置：compile→fmt→lint→test）/ **git-commit 纪律** / **run-tests**。
- 恢复唯一出口 = dispatcher 外环：record 缺失 → 重派（按当前状态重新合成简报）。
- quick-tasks / consolidate-specs / 规格技能（write-prd / ui-design / tech-design / gen-\* / breakdown-tasks）= M3 随拆包与双预设。

**③ web · 三区扩展**

- **概览 dock 页签**：任务子 tab · 列表视图（feature 绑定选择器、无全局汇总、七态 chips、任务行含挂接会话；tool 写入即时刷新）。DAG / 泳道 = M3；~~对账卡完整 UI~~（2026-10-05 用户裁决移出：漂移类概念不进用户视野、防心智负担——见 Out of Scope 记账）。
- **文档 dock 页签（SC4）**：proposal / PRD / tech-design / ui-design 只读浏览（`MarkdownDoc` body variant + canonical 路径栏 + 只读徽标 + 「在编辑器中打开」）；仓内 / 仓外两模式 e2e 各覆盖一条路径。
- **SC6③ 挂接双侧可见**：会话头部展示挂接任务、任务行展示挂接会话，与 `task_session_links` 记录一致；写入机制（claim 时 tool 侧会话上下文解析）设计期定（执行上下文展示 §6-39 = M3，范围对齐后移）。
- **单机单活跃分支断言**（架构基线 §6 锚定 M2）：分支切换后文档引用（feature_documents.rel_path / proposals.doc_path）悬空 → 只读缺省渲染并标注，不崩溃不写入。

**④ 验收与质量**

- SC7 真闭环 + SC4 + SC6③ + SC2 扩展任务域；**SC-M2 门 = 派发链端到端走查**（真实模型 dogfood，P1 dogfood 基建复用）。
- 契约面 pin 扩池（forge 域动词 API 面、每工作区 DB 布局、plugin-forge tool 面）；G0–G2 门全绿；SC2/SC3 回归。
- **不提供迁移能力**：旧仓任务文件原地保留，新旧并行直至旧线自然废弃（宪法裁决，验收含零迁移断言）。

### Innovation Highlights

诚实声明：**无新创新主张**。方案内容全部继承总纲、架构基线与技术预研定稿。阶段级新增裁决五处（brainstorm 2026-10-02）：① 立项单位细化到里程碑——P2 拆为 M2 / M3 两次立项（偏离「一阶段一提案」约定，显式记账，理由 = 更贴单人执行节奏）；② plugin-forge 并入本仓 monorepo（过渡单包；「独立发版」以包为单位保留）；③ 任务域 = 每工作区独立 DB @扁平化路径（中央库维持 projects/knowledge 双域现状）；④ 插件转正面 = 执行链全量（run-tasks / fix 链 / submit-task gate / git 纪律 / run-tests），上游入口技能归 M3；⑤ SC-M2 门 = 派发链端到端真实模型走查（对齐 P1 的 SC-MVP 门纪律）。

## Requirements Analysis

### Key Scenarios

- **派发链（核心场景）**：产品会话内 run-tasks skill → `claimTask` tool → core（转移校验 + dispatchPrompt 合成，随 claim 返回）→ subagent 阻塞派发（匿名 executor，初始 prompt = dispatchPrompt，约束标记原样保留）→ executor 内 `submitTask`（gate 编译/格式/lint/测试通过后落账 + blockers 恢复钩子）+ git 提交 → 概览任务列表即时刷新。产品全程只看不管（不发起编排）。
- **fix 链**：执行遇阻 → `addTask`（block-source）+ block 边写入 → 新任务完成自动恢复原任务；三视图与依赖守卫即时反映。
- **任务浏览**：概览页签 → feature 选择器 → 列表视图（七态 chips 过滤）→ 任务行看挂接会话与执行记录；tool 侧写入后视图即时刷新（无文件扫描、无同步延迟）。
- **文档浏览（SC4）**：仓内项目与仓外项目各自的文档页签 → 只读渲染 proposal/PRD/design → 「在编辑器中打开」跳转。
- **会话挂接（SC6③）**：会话头部看到挂接任务；任务行看到挂接会话；两侧展示与库中 `task_session_links` 一致。
- **失败/边界**：blockers 成环写入被拒；非法状态转移（from 不匹配 / 依赖未终态）被拒且带 record/reason 校验提示；分支切换后文档引用悬空 → 只读缺省渲染并标注；旧仓任务文件不被触碰（无迁移工具、无同步）。
- **SC-M2 走查**：上述派发链（含一次 fix 链）一条链不间断真实模型演示。

### Non-Functional Requirements

- **SC2 扩展任务域**：任务/feature/proposal 状态全部从每工作区 DB 直读（数据来源断言），看板首屏 ≤2s @500 任务（机械判据）；任务域无 watch / 回流 / 快照同步模块（代码审计）。
- **单一写入路径**：每工作区 DB 的写只经 core 服务（UI 动作与 forge tool 同门）；数据库无第二写者。
- **只读纪律（SC3 回归）**：应用对代码仓与文档位置零写入（文档页签只读渲染 + 路径跳转）。
- 令牌纪律（`--dsw-*` 零裸值）、应用离线自足（agent 模型调用属 dsh 会话域，不在此列）——继承 P1 SC-NFR 口径。
- 上游依赖维持精确 pin（0.2.0-rc.2 + lockfile 入库）；M2 期末按架构基线 §5.1 评估一次升级窗口（节奏化显式任务，不被动跟随）。
- schema 前向单向：旧应用打开新 schema 明确拒绝（架构基线 §5.4，随库生效）。

### Constraints & Dependencies

- **宪法级**：总纲（定位 / 边界 / 工件版图 / 路书）+ 架构基线（工件能力边界、依赖方向、单一写入路径、§3 状态层细则、§5 演进纪律、§6 单机单活跃分支）。
- **执行前置**：P1 MVP 门通过（episode 4：安装包冒烟 + 飞轮 e2e）；SC6①② 绿。
- **已验证缝（P1 G1 pin 池）**：Cordis 服务定义/注入模式（`forgeProjects` / `forgeKnowledge`）——plugin-forge tool 半身消费 `ctx.forgeProjects` 同缝，无新未验证依赖；subagent 阻塞调用面与负结论（无 per-spawn 系统提示注入 → dispatchPrompt 是 executor 唯一差异化通道）已在预研核实。
- **语义迁移面**：老 forge（`Z:\project\ai\forge`）任务七态 / 21 类型模板 / 执行协议 / fix 链语义——映射表 = 预研 §2；**只迁移语义，不迁移数据**。
- **dsh 唯一 agent 运行时**；forge 技能过渡期继续以现有形态运行不受影响（旧线冻结现状）。

## Alternatives & Industry Benchmarking

### Industry Solutions

- 阶段化里程碑交付（每里程碑可演示增量 + 门全绿）即本提案模式——总纲敏捷化重切已裁定；对照物是自家旧线 M2–M4（投影 / 双 SoT / 增强层路线，已否定）。
- 任务状态管理的行业常规（Linear/Jira 式状态直读 + 工具写入）在总纲 Innovation Highlights 已对标；本提案无新增对标面。

### Comparison Table

| Approach | Source | Pros | Cons | Verdict |
|----------|--------|------|------|---------|
| Do nothing（暂不立项 M2） | — | 零投入 | 任务管线继续住冻结旧线；M3 自举无从起动；路表停滞 | Rejected: 自举链路断根，MVP 信任增量无下一步跃迁 |
| M2 内部再切两步（M2a 状态层+视图 / M2b 插件链） | 切法权衡 | 每步更小 | M2a 收尾时 SC7 只能以模拟 tool（原型 ⚡ 式）验收，「转正」语义落空；多一道门开销 | Rejected: SC7 闭环本质跨产品+插件，拆开则中间态不可演示 |
| 更胖：提前并入 M3 预设与拆包 | 切法权衡 | 自举更早 | 单人 1–2 周/里程碑节奏被打乱；拆包决策依赖 M2 插件实跑反馈 | Rejected: 违反「溢出显式记账」纪律 |
| **按路表直切 M2 全量（core forge 域 + 插件执行链 + 任务/文档视图 + SC-M2 门）** | 总纲 §演进路书 M2 行 | SC7 一次性真闭环；自举地基一次立起；SC 继承清晰 | 单人 1–2 周体量偏满（溢出项显式记账顺延） | **Selected: 2026-10-02 brainstorm 全部显式裁决（见 Assumptions Challenged）** |

## Feasibility Assessment

### Technical Feasibility

高。全部关键缝已由 P1 验证（Cordis 服务注入、subagent 阻塞调用面、dogfood e2e 基建）；每工作区 DB = 现有 SQLite 驱动的多句柄常规用法；dispatchPrompt 合成 = 纯函数 TS 模板（预研 §4 设计定稿，含每类型快照测试方案）。主要新风险 = run-tasks 派发链真实会话稳定性（模型行为方差），以 SC-M2 门 dogfood 走查 + dispatcher 外环重派机制兜底。

### Resource & Timeline

单人 1–2 周（路表里程碑节奏）。溢出纪律：显式记账顺延，不静默砍 SC；天然弹性项 = 对账卡 UI 细节与文档 tab 打磨（可后补），SC7 真闭环与 SC-M2 门不可压缩。

### Dependency Readiness

上游 npm 栈齐备且精确 pin；老 forge 语义参考（本地源码）齐备且预研已做映射；P1 产物直接复用（contracts 骨架、core 服务模式、G1 pin 池、e2e/dogfood 基建、安装包管线）；无外部 API 依赖。

## Assumptions Challenged

| Assumption | Challenge Tool | Finding |
|------------|---------------|---------|
| 立案单位应为阶段（P2 = M2+M3 一个提案，总纲 slug 约定） | Need Gate（Why now：M3 内容重依赖插件实跑反馈） | Overturned（用户裁决）: M2 单里程碑提案，P2 拆两次立项——更贴单人执行节奏、M3 brainstorm 可吃 M2 实跑证据；本提案显式记账该偏离，总纲约定不需修改（里程碑提案 = 更细粒度，未违背「显式立项」精神） |
| 并行轨 = 外部独立工程另立跟踪（总纲 / P1 口径） | 事实核查（本仓零产出）+ 耦合面清点（dispatchPrompt 内聚 claimTask / contracts 共享 / Cordis 注入联调） | Overturned（用户裁决）: plugin-forge 并入本仓 monorepo，过渡单包（M3 拆核心/规格）；「独立工件、独立发版」以包为单位保留；Challenge Override: user chose to proceed. Reason: 紧耦合 + 单人单仓成本最低 |
| 任务状态进中央 state.db（P1 现状惯性外推） | Stress Test（宪法行字面 = 「统一位于 {dsh-forge-home}/{扁平化}」+ 表单只读展示该路径） | Overturned: 每工作区独立 DB @扁平化路径——表单展示路径与数据实际位置一致（不撒谎）、工作区隔离、按项目备份/删除、无跨项目查询需求（三视图 feature 绑定无全局汇总）；代价（schema 多实例迁移）以版本表随库 + 幂等迁移消解 |
| 插件转正面 = 最小派发链（claim→派发→submit 即可） | Assumption Flip（真实使用中缺 fix 链 / submit gate / git 纪律的派发链是否可用） | Refined: 执行链全量（run-tasks / fix 链 / submit-task 内置 gate / git 纪律 / run-tests）——缺环的执行链在真实任务上跛脚；上游入口技能（quick-tasks / 规格技能）= M3 突击预设组成部分 |
| SC7 可用模拟 tool 承接（原型 ⚡ 模式，P1 依赖声明模式延续） | Stress Test（「转正」语义 = 真插件真链路；插件已入仓，无外部阻塞借口） | Overturned: SC7 真闭环验收（真 tool 写入 → 状态层 → 看板即时），并新增 SC-M2 门（真实模型 dogfood 派发链走查，对齐 SC-MVP 门纪律） |

## Scope

### In Scope

**① core · forge 域转正（每工作区 DB）**

- 每工作区 DB 部署于 `{dsh-forge-home}/{canonical-path 扁平化}@{hash8}/`（hash8 消歧后缀，§6-34；core 多句柄管理；schema 版本表随库 + 幂等迁移；启动打开/建库）；中央 state.db 维持 projects / knowledge 域**完全不动**（~~例外：projects + repo_root_path 列，§6-37 worktree 同项目分组~~——2026-10-05 核对修订：范围对齐已将 §6-37 整族后移 M3，中央域例外随之消失；本行与 Proposed Solution / Out of Scope 后移表 / db-schema §0 同口径）。
- 七表一次到位：`features` / `feature_documents`（文档索引，manifest 库内化）/ `tasks`（七态 CHECK）/ `task_edges`（blockers 无环校验）/ `task_records`（append-only）/ `proposals`（五态承载）/ `task_session_links`；`feature_records` = M3 增表（范围对齐后移，append-only 新表软迁移——M2 期间 feature 域转移无审计，显式记账该缺口）。
- 状态机常量 + 动词 API（addTask / claimTask / submitTask / transitionTask / queryTask… + proposal 最小动词）；转移校验、依赖终态守卫、record/reason 必带、每次写自动审计。
- dispatchPrompt 合成内聚 claimTask（约束块单一 TS 源 + 动态信息块含 BLOCKERS 快照 + 类型策略模板函数族；独立 taskPrompt 取消）；每类型快照测试（fixture 任务 → prompt 断言）。

**② plugin-forge 插件入仓（过渡单包）**

- tool 半身全量动词（消费 `ctx.forgeProjects`，Cordis 同缝）；tool 写入 → 状态层 → UI 即时刷新（SC7 缝）。
- skills 半身迁移 + eval-\* 裁剪（零悬空引用机械断言）：run-tasks（subagent 阻塞派发循环）/ fix 链（block 边 + 完成自动恢复）/ submit-task（quality gate：compile→fmt→lint→test）/ git-commit 纪律 / run-tests。
- 恢复出口 = dispatcher 外环（record 缺失重派，按当前状态重新合成）。

**③ web · 三区扩展**

- 概览 dock 页签：任务子 tab · 列表视图（feature 绑定、无全局汇总、七态 chips、挂接会话展示、tool 写入即时刷新）。
- 文档 dock 页签（SC4）：proposal/PRD/design 只读浏览（`MarkdownDoc` body + canonical 路径栏 + 只读徽标 + 在编辑器中打开）；仓内/仓外两模式 e2e 各一条。
- SC6③ 挂接双侧可见（会话头部 + 任务行，与 `task_session_links` 一致）。
- 单机单活跃分支断言：文档引用悬空 → 只读缺省渲染并标注。

**④ 验收与质量**

- SC7 真闭环 + SC4 + SC6③ + SC2 扩展任务域 + SC-M2 门（派发链端到端真实模型走查，含 fix 链一次）。
- 契约面 pin 扩池：forge 域动词 API 面、每工作区 DB 布局、plugin-forge tool 面。
- G0–G2 门全绿；SC2/SC3 回归；不提供迁移能力（零迁移断言）。

### Out of Scope

- **M3（预设与自举）**：出厂双预设（远征/突击）+ S5/S6 spike、plugin-forge 拆包（管线核心 / 规格深化）、brainstorm 三模式共享、任务三视图补全 DAG/泳道、自举达成与走查；quick-tasks / consolidate-specs / 规格技能（write-prd / ui-design / tech-design / gen-\* / breakdown-tasks）。
- **M2 范围对齐顺延项（2026-10-02 裁决，见下节）**：worktree 项目域全族（§6-37/§7-16）、会话头部执行上下文展示（SC6④/§6-39）、task_records 执行上下文两列（§6-38）、`feature_records` 表（§6-35④）、注册疑似移动认领对话框（F10-①）。
- **对账卡 UI（2026-10-05 用户裁决移出 M2）**：漂移 / 找回类概念不进用户视野（防心智负担——M2 只做核心功能）。**机制面不受影响**：启动对账（reconcileAtStartup）继续静默自愈（P1 已交付、fix-27 已接线），不一致仅留记账日志；未来若需可视化再显式立项（非顺延承诺）。
- **proposals 管线完整消费**：proposals 表 M2 仅承载 + 最小动词，提案 UI 与流程消费 = M3 随预设。
- **M4+ 知识内核深化**：抽取 / 审核 / 置信度四信号 / 知识写入 tool / 晋升 / 召回可观测（trace 流 / 召回日志页签 / 统计分析）/ 知识 ↔ 会话联动扩展。
- **旧仓任务文件迁移工具**（宪法裁决：不提供迁移能力，新旧并行直至旧线自然废弃）。
- AGENTS.md tab（总纲延后锚点）；多窗口 / 拆分面板；三平台分发（维持 Windows 冒烟回归，三平台归 M8）。

### 范围对齐（2026-10-02）：计划外功能点梳理与后移

以 brainstorm 定稿 + 总纲路表 M2 行 + P1 顺延清单为「原计划」基线：M2 = 任务域转正（schema + 动词 + 执行链 + tool 半身 + 列表/文档视图 + SC4/SC7/SC6③/SC2/SC-M2 门）。评审期 db-schema 预设计（39 项裁决）中的**净新增功能点全部后移 M3**，M2 回到原计划体量（单人 1–2 周）。**设计定稿不回退**——后移项在 db-schema 中标注「M3 交付」，tech-design 不为其消耗 M2 设计预算；全部为前向软迁移形态（新表 / 加列 / 中央加列），M2 落地库零迁移负担。

**后移清单（净新增 → M3）**：

| 功能点 | 裁决锚 | M2 替代行为 |
|---|---|---|
| worktree 项目域（.git 判定器 / repo_root 分组 / 中央 `repo_root_path` 列 / 兄弟枚举提示 / 项目树两级呈现） | §6-37、§7-16 | 无——M2 = 单工作区管线，中央域恢复**零改动**（例外随之消失） |
| task_records `branch` / `worktree` 两列 | §6-38 | 无——M3 append-only 加列软迁移（§6-24③ 已认可路径） |
| 会话头部执行上下文展示（SC6④） | §6-39 | 无——§7-13 缝 M2 只答挂接；刷新接线（§7-11）届时一并 |
| `feature_records` 第八表 | §6-35④ | 无——M3 增表；M2 feature 域转移无审计 = 已记账缺口 |
| 注册疑似移动认领对话框 | F10-①（§7-15①） | 拒绝注册 + 手工指引（删孤儿目录或改回原名）；S10 的 UI 兜底随移 M3 |

**承重保留清单（计划外，但 M2 原计划验收依赖——不后移）**：

| 功能点 | 裁决锚 | 保留理由 |
|---|---|---|
| validateStore 只读校验动词 | C8 | SC2 直读断言 / SC-M2 断言 / 启动全库断言的统一入口——断言基建，非用户功能 |
| proposals 发现面扫描建行 | §6-36 | SC4 proposal 浏览锚点的数据来源（SC4 = 原计划 M2 验收） |
| 相位推导机（触发器闭包 + 不变量断言） | §6-28/29 | 列表视图 feature 状态与 SC2 任务域扩展「直读」语义的写路径完整性 |

（形态裁决不在梳理之列：manifest 库内化、动词命名、状态机拆面、fix 链语义（C1–C3/C6）等 = 原计划交付物的设计演进，非净新增。）

## Key Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| run-tasks 派发链真实会话稳定性（subagent 阻塞 + 模型行为方差） | M | H | SC-M2 门 dogfood 走查（P1 dogfood 基建复用）；dispatcher 外环重派机制（record 缺失 → 按当前状态重合成简报）；失败分诊协议迁移自 task-executor 约束块 |
| 每工作区多 DB 的 schema 版本管理复杂化（多实例迁移漂移） | M | M | schema 版本表随库 + 启动幂等迁移；旧应用打开新 schema 明确拒绝（§5.4）；单测覆盖多库并存迁移场景 |
| 老 forge 语义迁移遗漏（21 类型模板 / 执行协议 / fix 链细节） | M | M | 预研 §2 映射表为迁移清单；每类型快照测试（fixture → prompt 断言）；eval-\* 裁剪零悬空引用机械断言；旧线源码随时比对 |
| 任务域 UI 范围膨胀（DAG/泳道被顺手拉入 M2） | M | M | 本提案 Out of Scope 显式记账（M3 补全）；列表视图对照原型 H 域走查 |
| P1 MVP 门未过即开工 M2（~~episode 4 待执行~~——已通过，2026-10-05 核对回填，风险消解、行保留作记账） | M | M | 执行前置声明：M2 任务线开工以 P1 门绿为条件；本提案（设计与立项）与 P1 收尾并行不违例 |
| 每工作区 DB 与中央库双拓扑引发写路径混淆（AI 协作腐化形态：隐式跨界） | L | M | 单一写入路径断言扩到每工作区 DB（写只经 core 服务）；L1 import 边界 + L3 审计池扩池（架构基线 §2 防线继承） |
| 仓库移动/挂载形态变化 → flatten+hash8 全变、旧 forge.db 成孤儿（与对账卡「按 path 找回」心智不对称）；同仓多 worktree 状态分裂 | M | H | M2 = 注册时发现疑似移动即拒绝 + 手工指引（认领对话框 = M3，范围对齐后移）；S10 spike 验证 canonical path 输入稳定性；多 worktree 分裂面 M2 不触及（单工作区管线，中央域零改动） |
| in_progress 中断恢复链断裂（老 forge claim-resume / 简报重拉语义无家可归——外环重派 mitigation 本体缺失） | M | H | 恢复协议三选一设计期裁决（附录 C-C1：claimTask 幂等重入 / redispatchTask / 降级记偏离）；SC-M2 走查加「模拟子会话中断后恢复」 |
| 相位推导机漏推 → 派生不变量断言红灯、G0–G2 阻断 | L | H | 触发器闭包已修（§6-29 审计修订：含 transitionTask / auto-restore）；事务内增量 + 启动全库双断言 |
| block-source 崩溃窗口状态-边脱节（源停 in_progress 挂未满足边）；无界 fix 链 | M | M | 附录 C-C2（addTask 单事务同置源 blocked）/ C6（链深 ≤3）裁决后机械防线 |
| executor 执行会话对 SC6③ 隐没；dsh 会话 id 在 tool 上下文可得性未验证 | M | M | S8 spike（PRD 前）；SC6③ 已改双数据源断言；回退 = submit 侧 session_id NULL + 显式记偏离 |

## Success Criteria（M2 验收 = 总纲 SC 池继承细化 + 新增）

- [ ] **SC7**（完整真闭环）：addTask / claimTask / submitTask 写动词 + queryTask 只读由 plugin-forge tool 半身（消费 `ctx.forgeProjects`）对接每工作区状态层（tool 面期望集 = §7-5 裁决结果，闭口后冻结）；概览任务列表即时反映（e2e 一条——「即时」判据 = 写入返回后单次重取即见新值，刷新通道间隔上限见 §7-11）；应用自身不发起任何编排动作（代码审计断言：web/ 无编排逻辑）；**plugin-forge 不注册 transitionTask tool（代码审计——人类逃生通道不进 agent 面）**；动词 API 单测覆盖全路径（转移校验 from 匹配 / 依赖终态守卫 / record 必带 / append-only / blockers 无环拒绝（构造路径 = addTask 双 flag 组合，db-schema B.5-1）/ transitionTask from≠to + reason 必带）。
- [ ] **SC-M2**（新增 · M2 门）：派发链端到端走查——run-tasks skill 会话内 claimTask（返回 dispatchPrompt = 约束块 + 动态信息块（含 BLOCKERS 快照）+ 类型策略块，断言三段构成）→ subagent 阻塞派发（初始 prompt = dispatchPrompt）→ executor submitTask（quality gate 编译/格式/lint/测试通过后落账）+ git 提交 → 任务列表即时刷新；含 fix 链一次（block 边写入 + 完成自动恢复断言）；真实模型 dogfood 一条链不间断演示。
- [ ] **SC4**（完整）：文档页签两模式 e2e 各一条——仓内项目浏览 proposal/PRD/design 并跳转（在编辑器中打开）；仓外项目同构（只读 + canonical 路径栏 + 只读徽标）。
- [ ] **SC6③**（P1 顺延清账）：任务↔会话挂接双侧可见——任务行 = 双数据源（`task_session_links` = 派发会话、`task_records.session_id` = 执行会话，两侧分别一致断言）；会话头部展示缝 = 设计期必答（§7-13 挂接部分；执行上下文内容 §6-39 = M3，范围对齐后移）。
- [ ] **SC2**（扩展任务域）：任务/feature/proposal 状态全部从每工作区 DB 直读（数据来源断言）；看板首屏 ≤2s @500 任务（机械判据）；代码审计任务域无 watch/回流/快照同步模块；每工作区 DB 位于 `{dsh-forge-home}/{扁平化}@{hash8}/`（部署位置断言含消歧后缀，与注册表单展示一致）。
- [ ] **SC-branch**（新增 · 单机单活跃分支断言，架构基线 §6 锚定）：构造文档引用悬空（模拟分支切换）→ 文档页签只读缺省渲染并标注，不崩溃、不写入。
- [ ] **SC-NFR**（回归）：应用对代码仓与文档位置零写入（文件系统级监控验证一次全流程，SC3 回归）；单一写入路径扩展（每工作区 DB 写只经 core 服务，UI 与 tool 同门，审计断言）；令牌 lint / 离线自足 / G0–G2 全绿。
- [ ] **SC8**（回归 · 零迁移）：无批量/命令式旧仓任务迁移工具与旧→新同步路径（代码审计；发现面单向吸收白名单 = 旧线 manifest 的 title/status + 文档索引三字段，显式清单豁免——非迁移）；旧仓任务文件原地未被改动（断言）。

consistency_check_result:
  status: pass
  pairs_checked: 62
  conflicts_found: 0
  note: 2026-10-02 两轮对抗审计（内部一致性 19 项 + 宪法符合性 17 项）机械修复全数落库后复核；设计裁决项见 db-schema 附录 C

## Next Steps

- 进入 `/write-prd`：以本提案 + 总纲（§演进路书 M2 行 / §forge 插件 / §数据模型）+ 架构基线（§3 / §5 / §6）+ 技术预研（§2 / §4）+ P1 tech-design（契约面清单与工程规范）为输入。
- PRD 后走 `/tech-design`，设计期必答题：每工作区 DB 句柄生命周期与迁移编排；dispatchPrompt 模板族在 core forge 域内的模块落位；挂接写入机制（claim 时 tool 侧会话上下文解析）；文档发现面（forge 目录只读扫描契约）；任务列表视图形态对照原型 H 域断言迁移；**每工作区 DB 目录派生单源化**（2026-10-05 核对增补：flatten+hash8 计算落位 core——sha-256 须 node:crypto，path-key 保持浏览器安全零依赖不承载；注册表单只读行展示串改经 RPC 下发 core 派生值，取代 apps/web form-model 自算——现状 = 双源且展示串无 hash8 后缀，此为 SC2「与注册表单展示一致」断言的单源前提）；**任务域服务面形状**（2026-10-05 核对增补：任务/feature/proposal 动词挂现有 `ctx.forgeProjects`（现为绑定中央 state.db 单句柄的 5 法 ProjectService）扩展 vs 新服务名；cwd → 每工作区 forge.db 的多句柄路由（knowledge bindings 机制同构复用）；boot 桥 `BridgeServiceName` / ready 在场位 / 方法白名单三处联动）。**任务域 schema 已预设计定稿**（见 `db-schema.md`：八域表 + 一基建表全量 DDL、七态转移矩阵、动词×写矩阵、不变量机械防线、36 项已裁决），设计期余下开口 = §7-6 映射表（ValidTypes↔模板名）、§7-11 刷新判据、§7-12 多库迁移失败策略、§7-13 会话头部缝·挂接部分（tech-design 必答；§7-13 执行上下文部分与 §7-16 worktree 呈现随范围对齐移 M3）；**S8 / S9① / S10 = PRD 前 spike（已排程，§7-14；2026-10-05 三者完成并全数通过——结论回填 db-schema §7-14 与 `spikes/` 同目录三份文档：S8 子会话 ctx 可得且 id 可区分 / S9① 仓外发现率成立（约定与旧线同构）/ S10 hash8 全形态稳定）**。
- M2 首任务建议 = core forge 域 schema + 状态机动词单测（地基先行），随后插件 tool 半身对接（SC7 缝），UI 面最后装配。

## 版本历史

- 2026-10-02：brainstorm 定稿——按路表直切 M2 全量；五项阶段裁决（里程碑立项单位 / plugin-forge 入仓过渡单包 / 每工作区 DB @扁平化路径 / 执行链全量转正 / SC-M2 门）；SC7 真闭环 + SC4 + SC6③ + SC2 扩展 + SC-branch + SC-M2 + SC-NFR/SC8 回归。
- 2026-10-02（schema 预设计补充）：新增配套 `db-schema.md`——六域表 + 二基建表全量 DDL 与语义；边表三裁决（`task_key`/`prerequisite_key` 命名、满足集 {completed, skipped} 且 rejected 不满足、边持久不删满足为派生）+ 九项配套裁决（含砍通配依赖 `1.x`，预研 §2 映射表待补记）；append-only 触发器机械防线；八项设计期开口移交 tech-design。
- 2026-10-02（动态追加契约补充）：task_edges 动态追加支持定稿——addTask 单事务原子（tasks→edges→records）、增量环校验（新节点作前置结构性无环）、动态边只随 addTask 发生（老 forge AddDependency 不平移）、两级去重、同 feature 边约束 DB CHECK（待审）；新增开口：动态任务 localId 分配策略。
- 2026-10-02（审核修订一）：tasks.coverage 改 REAL（小数阈值）；task_session_links 移除 link_type（纯关联事实，唯一写入源 = claim）。
- 2026-10-02（manifest 库内化裁决）：manifest.md 文件形态判消亡——DB 一次到位（+`feature_documents` 第七域表，架构基线 §3 同步修订六表→七表）；features 表瘦身（四锚点列移除，提案锚点归 proposals.doc_path）；追溯矩阵留 M3 随管线立表；技能经 tool 读写（SC7 缝延伸至 feature/文档域）；过渡期 manifest.md = 旧线工件，新旧并行直至 M3 自举。
- 2026-10-02（命名规范裁决）：动词 API 采用动词+名词命名（addTask / claimTask / submitTask / transitionTask / queryTask / registerFeature / transitionFeature / upsertFeatureDoc / createProposal / transitionProposal…），全文与架构基线 §3 同步；verb 列值不变（= API 名动词前缀）；tech-research 历史引用映射见 db-schema.md §6-25。
- 2026-10-02（transitionTask 定位裁决）：transitionTask = 人类逃生通道（UI 专属、from≠to + reason 必带、不进 agent tool 面；§3.1 矩阵收窄为 agent 动词机器校验面）；agent 面 = addTask / claimTask / submitTask / queryTask，executor 受阻出路唯一 = submitTask result=blocked；SC7 断言扩池（插件无 transitionTask tool）；老 forge `forge task transition` agent 用法拆分映射（预研 §2 待补记）。
- 2026-10-02（面分治裁决）：人类 API 不封装 tool——UI 直调宿主能力面（RPC）：transitionTask / transitionFeature；agent 面 = tool 封装；单一写入路径准确表述 = 两面上溯同一 core 动词函数（门 = core，非同一传输层）。
- 2026-10-02（登记即推进裁决）：upsertFeatureDoc 单事务内聚 feature 相位推进（doc_kind→phase 单调映射：prd 族→prd、design 族→design，只进不退）；技能不显式推相位（transitionFeature = 人类纠偏面的自然推论）；task-driven 推进（tasks / in-progress / completed 触发器）列为 §7-5 子问待裁决。
- 2026-10-02（task-driven 修补裁决，§7-5 子问③关闭）：统一相位推导机——status = archived ∨ combine(docPhaseMax, taskDerived)；触发器 = addTask / claimTask / submit 钩子 / upsertFeatureDoc；回退边合法（completed 追加任务 → tasks）；快照 + 派生不变量断言（∀ 非 archived：status ≡ derive(feature_documents, tasks)，单测 + CI）；quick-tasks 式无文档任务流天然支持。
- 2026-10-02（proposals 表审核裁决，§7-1 关闭）：五态（+under-review 评审期显式化：draft→under-review→accepted|rejected、打回修订、superseded；裁决写 decided_at）；sc_check_json 砍（M3 eval 随迁移加列）；transitionProposal = agent 面 tool 记录用户裁决；CHECK 保留（封闭裁决分类学）。proposal↔feature 关联重设计：文件系统同名约定退役 → 身份 FK（`features.proposal_id → proposals.id`，registerFeature 单步原子、发现面扫描回填、1:1 惯例留 1:N 空间）；身份与名称分离（两表 uuid id PK + slug 自然键 UNIQUE）；feature.slug 因任务键承载实践不可变（约束记账）。
- 2026-10-02（挂尾三项裁决，七域表收官）：tasks priority / estimated_time 均保留（就绪选择候选输入 + autoconfig 语义完整性）；同 feature 边 CHECK 认可（§6-15 转正）；task_records.verb 去 DB CHECK（TS 单源，§6-25 判据落地——可扩展词汇，动词面增长零迁移）。
- 2026-10-02（db_meta 裁决，schema 审核全闭环）：db_meta 不保留——孤儿/失配/数据损坏场景显式不处理（不可恢复性接受）；flatten 碰撞改注册时检查（目标目录已存在且非同工作区幂等重注册 → 拒绝；原像记录 = 中央 projects.ws_path）。七域表 + 一基建表（schema_meta）定稿，八项开口移交 tech-design。
- 2026-10-02（hash8 消歧裁决，升级上条）：扁平化目录名 = `{flatten}(@{hash8})`（sha-256 前 8 hex、小写）——结构性消歧取代「碰撞即拒绝」：flatten 碰撞双方各自独立注册，拒绝仅兜底 hash 自身极端碰撞（中央 ws_path 精确比对）；目录名 O(1) 自证。总纲数据模型与存储术语约定同步细化。
- 2026-10-02（对抗审计修复）：两轮审计（内部一致性 19 项 + 宪法符合性 17 项 + 3 假设翻转）机械修复全数落库——§3.1 矩阵拆面（agent 机器校验面 / 人类通道）、环校验双 flag 判据与 B.5-1 合法构造、相位推导机触发器闭包（补 transitionTask）+ combine 精确定义 + 断言时机、SC6③ 双数据源、SC7/SC8 断言精确化、hash8/descPath/六表/计数残留清理（含总纲与基线回写）、§7 增 11–14 项（刷新判据 / 迁移失败策略 / 会话头部缝 / S8–S10 spike）、Key Risks 增 6 项；**设计裁决项**（in_progress 恢复协议 / block-source 原样映射 / 老 forge 语义处置表 C1–C11 / 类型词汇归一 / proposals 库属）起草于 db-schema 附录 C，待用户裁定。
- 2026-10-02（处置表裁决一）：C1–C5、C12 认可、C6 链深 ≤6——claimTask in_progress 幂等重入（外环重派本体）；addTask --block-source 单事务同置源 blocked（verb='auto-block'，崩溃窗口消灭）；transitionTask 终态转移挂恢复钩子；--force 砍 + 记录瘦身记偏离；模板族 = TaskType 唯一词汇。SC-M2 增中断恢复走查。余项（C7–C11 / F10 / S8–S10）详解后裁定。
- 2026-10-02（处置表裁决二，附录 C 全清）：C7/C9/C10/C11 认可；**C8 迁移校验功能、校验新产物**——新只读动词 validateStore（派生不变量全量 / 边集无环复核 / liveness / 记录链完整性 / 拓扑可分层，输出违例清单；agent 面 tool + UI 诊断入口；启动全库断言统一于此）；F10（移动找回 + proposals 库属）挂起待下次决策（§7-15）。**老 forge 语义迁移清单至此闭合（C1–C12 全处置）。**
- 2026-10-02（F10 裁决，§7-15 关闭）：①移动找回机制采纳（注册三态检查 + 疑似移动确认对话框 + 认领 = 目录改名 + 中央行更新，库零修改——移动 ≠ 损坏边界划清，兼作 S10 UI 兜底）；②proposals 留每工作区 + 演进触发器（N 工作区提示 + git 提案文档为最终一致性锚；M3+ 成日常痛点再议中央化）。
- 2026-10-02（§7 批量裁决，§6-35）：边纠错不进 M2；registerFeature/upsertFeatureDoc M2 仅 core API + UI 直调、M3 封 tool；非终态 → archived 放开；**feature_records 第八域表**（feature 域审计入工作区库，存储不交叉原则，基线 §3 同步八表）；库文件名 forge.db；digest = sha-256 前 12 hex；localId 混合分配（数值 + fix-/disc- 前缀）；就绪选择 = 分支延续优先 + priority → 创建序（沿一条分支执行，遇阻塞换支）。
- 2026-10-02（spike 排程 + S9② 裁决，§6-36/§7-14）：S8（会话 id 可得性）/ S9①（仓外发现率）/ S10（path 稳定性）三个 spike 确认 PRD 前执行；S9② = proposals 发现面扫描建行（docs/proposals/ → createProposal，frontmatter 初值单向阀门——SC4 proposal 浏览锚点有源）。**至此：36 项裁决、八域表、附录 C 全处置、F10 闭合；tech-design 余四开口（§7-6/11/12/13）。**
- 2026-10-02（worktree 同项目发现，§6-37）：项目 = repo、工作区 = checkout——解析 .git 三态（主 checkout / worktree / submodule 独立）得 repo_root 分组键；中央 projects + repo_root_path 列（M2 动中央域的显式例外，前向软迁移）；快照 + 对账重解析；兄弟枚举提示；两级归属只落中央域与 UI（每工作区库独立不变）；呈现形态 = §7-16 开口。
- 2026-10-02（判定图落稿 + 执行上下文两列，§6-38）：worktree 判定图（三态解析 → 分组 → 动态自愈）入 db-schema §0 注册机械细则；task_records 增 `branch`（事件时 HEAD 分支）/ `worktree`（事件时工作区路径）事件级快照——只读 .git 解析（与判定器同族），审计行自证执行来源；与「库不含自身路径」（§6-33）张力消解 = 身份 vs 历史事实（认领零库修改不变）；中途换支两行异值 = 诚实审计。
- 2026-10-02（对话界面执行上下文，§6-39）：会话头部须展示当前分支/worktree——数据源 = 实时 .git 解析（解析器族第三消费面：事件快照 / 分组聚合 / 实时现值），断言 = 与 `.git` 实际值一致、切分支后更新；§7-13 会话头部缝扩为同缝双内容（挂接任务 + 执行上下文，含展示双态），刷新复用 §7-11 通道；SC6③ 总纲与 M2 双级增补。
- 2026-10-02（**范围对齐：计划外功能点后移 M3**）：以 brainstorm 定稿 + 路表 M2 行为基线梳理——**后移**：worktree 项目域全族（§6-37/§7-16——中央 repo_root_path 例外随之移 M3，中央域恢复完全不动）、task_records 执行上下文两列（§6-38）、会话头部执行上下文展示（§6-39/SC6④）、feature_records 表（§6-35④，M2 = 七表落地）、疑似移动认领对话框（F10-①，M2 = 拒绝 + 手工指引）；**承重保留**：validateStore（断言基建）、proposals 发现扫描（SC4 数据源）、相位推导机（列表/直读写路径）。设计定稿不回退，db-schema 标注「M3 交付」，全部 = 前向软迁移形态；新增「范围对齐」节 + Out of Scope 顺延块，SC6③ 三处条文与 Key Risk/Next Steps 同步收窄。
- 2026-10-05（**hash8 连接符修订**）：目录名 = `{flatten}@{hash8}`（原 `-` 连接 → `@` 连接——消歧后缀与 flatten 内连字符视觉分离，防歧义）；M2 proposal / db-schema / PRD / 原型 / 总纲同步。\n- 2026-10-05（**对账卡移出裁决**）：概览页签对账卡完整 UI 移出 M2——用户裁决：漂移 / 找回类概念不进用户视野（防心智负担），M2 聚焦核心功能；机制面（reconcileAtStartup 静默自愈 + 记账日志）保留不动，未来可视化再显式立项（非顺延承诺）。Proposed Solution ③ / Scope ③ / Out of Scope 三处同步；天然弹性项表述随之收缩（文档 tab 打磨仍为弹性项）。
- 2026-10-05（**代码核对修订**，基线 = HEAD fix-40 + 工作树 fix-41/42 在途；核对结论 = 提案/db-schema 与代码的关键假设全部成立，缝/机制/pin/七态词汇逐项验证）：①Scope 节中央域条文对齐范围对齐裁决——「例外：projects + repo_root_path 列」残留改 strike 注记（原行漏改，与 Proposed Solution/Out of Scope/db-schema §0 矛盾）；②Evidence/Key Risks 回填：P1 MVP 门已过（4.2 dogfood 四连绿 + 4.3 冒烟两连绿），M2 执行前置已满足（风险行「episode 4 待执行」同步标消解）；③tech-design 必答增补两条：每工作区 DB 目录派生单源化（core 派生 + RPC 下发展示串，消 apps/web form-model 自算双源——现状展示串无 hash8）与任务域服务面形状（forgeProjects 扩展 vs 新服务 + cwd→forge.db 多句柄路由 + boot 桥三处联动）；④S8 spike 收窄（主会话侧 knowledge 插件 exec.agent.session.id 生产验证在案，实测面 = 子会话 exec ctx 一次 dump——db-schema §7-14 同步）+ db-schema §2.4 增「M2 落地 DDL 剥离 branch/worktree 两列」显式提示（八表定稿形态照抄陷阱）。
