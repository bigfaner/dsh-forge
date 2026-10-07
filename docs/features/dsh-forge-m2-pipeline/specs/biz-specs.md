---
feature: "dsh-forge-m2-pipeline"
generated: "2026-10-07"
status: draft
---

# Business Rules: dsh-forge M2 —— forge 管线接管（状态层转正 + 插件执行链 + 任务/文档视图）

> 提取源：prd/prd-spec.md、prd/prd-user-stories.md、design/tech-design.md（proposal 裁决已内化于 PRD/设计）。
> 目标文件映射为 non-interactive 自动集成裁决（[auto-specs]）。

## 任务状态与生命周期

### BIZ-001: 状态机七态封闭与转移纪律

**Rule**: tasks 任务状态七值封闭（CHECK 约束）；agent 面 = 转移矩阵推导（claim/submit 拥有的边）；人类通道 transitionTask from≠to 任意 + reason 必带（空因拒绝留场）；转移校验先于写、单事务全成全败。
**Context**: agent 机器校验面与人类逃生通道分治（SC7 单测锚：from 匹配 / transitionTask from≠to + reason 必带）。
**Scope**: [CROSS]
**Source**: prd-spec §In Scope ① / tech-design §Interface 1·10

→ docs/business-rules/task-pipeline.md

### BIZ-002: 依赖终态守卫

**Rule**: claimTask 前置满足集 = {completed, skipped}（终态集封闭）；未满足即拒绝（ERR_DEPENDENCIES_UNMET，data 带未满足清单）；task_edges 无环。
**Context**: 派发只在依赖全部到终态后发生；满足 = 读时派生（边持久不删），守卫与恢复钩子共用同一满足语义。
**Scope**: [CROSS]
**Source**: prd-spec §In Scope ①·§Goals SC7 / tech-design §Interface 1

→ docs/business-rules/task-pipeline.md

### BIZ-003: fix 链语义

**Rule**: executor 受阻 = submitTask result=blocked（reason 必带）→ 任务 in_progress→blocked；addTask --block-source 单事务三件（fix 任务行 + 依赖边 + 源任务置 blocked，record verb='auto-block'）——三者原子无半成品；fix 链深 ≤6（超限拒绝并提示人工介入）；恢复钩子反查后继——fix 终态（completed/skipped）且源任务前置全满足 → blocked→pending（record verb='auto-restore'，边保留不删）；依赖环构造拒绝并回报完整环路径（ERR_CYCLE_DETECTED）。
**Context**: 单点失败不断链：自动建修复任务、自动恢复原任务，人工只在链深超限时介入。
**Scope**: [CROSS]
**Source**: prd-spec §Flow Description 流程一 5-6 / tech-design §动词内聚不变量 / user-stories Story 3

→ docs/business-rules/task-pipeline.md

## 派发与恢复

### BIZ-004: 就绪选择与防双派发

**Rule**: 就绪选择仅扫 pending 池，序 = 分支延续优先 → priority → 创建序；in_progress 幂等重入仅限显式 taskRef 或 links 已含本会话——无 taskRef 的盲选不领 in_progress（双 dispatcher 并发不双派发）。
**Context**: 并发与重入域收敛：claim 语义在多会话并发下保持单执行者。
**Scope**: [CROSS]
**Source**: tech-design §Interface 1 动词内聚不变量

→ docs/business-rules/task-pipeline.md

### BIZ-005: 中断恢复 = 幂等重入

**Rule**: executor 会话中断（record 缺失）→ dispatcher 外环再 claimTask 同一任务 = 无状态转移（仍 in_progress）、返回按当前状态重新合成的 dispatchPrompt（digest 新值）；恢复出口 = dispatcher 外环（record 缺失 → 按当前状态重派），产品不内建恢复机制。
**Context**: 中断只损失时间不损失状态，无需人工清理。
**Scope**: [CROSS]
**Source**: prd-spec §Flow Description 流程一 7 / user-stories Story 4

→ docs/business-rules/task-pipeline.md

### BIZ-006: 应用零编排

**Rule**: 应用自身不发起任何编排动作（web 无编排逻辑，代码审计断言）；派发循环 / fix 链 / 恢复出口全部 = agent 技能侧（plugin-forge skills 的 dispatcher 外环）。
**Context**: 工作台是读取/调度面而非编排器；编排智能归 dsh 会话域。
**Scope**: [CROSS]
**Source**: prd-spec §In Scope ②·user-stories Story 2 AC3 / tech-design §Integration Specs

→ docs/business-rules/product-discipline.md

## 审计与派生

### BIZ-007: 每动词审计 append-only

**Rule**: 每次写动词一行审计记录（task_records）；append-only 双触发器机械防线（UPDATE/DELETE 即 ABORT）；claim 记派发会话 id + 挂接行、submit 记执行会话 id；success submit 摘要必带、blocked submit 原因必带。
**Context**: 「每次写自动审计」是状态层可信的基础；改删审计被数据库层机械拒绝。
**Scope**: [CROSS]
**Source**: prd-spec §Goals SC7·§Data Requirements / tech-design §Data Models

→ docs/business-rules/task-pipeline.md

### BIZ-008: feature 相位 = 推导机派生快照

**Rule**: feature 相位不由人写——upsertFeatureDoc / addTask / claimTask / submit 钩子 / transitionTask / auto-restore 触发器闭包内聚重算（单调只进）；写事务内增量断言承重漂移防护 + validateFeatureTasks 一次只校验一个 feature 的任务子图（五类检查：派生不变量 / 无环 / liveness / 记录链完整性 / 拓扑可分层）。
**Context**: 相位是派生值不是输入值；批量校验语义移交流程层（发现面逐 feature 送校），动词面恒单 feature。
**Scope**: [CROSS]
**Source**: prd-spec §In Scope ①·§Monitoring Requirements / tech-design §Interface 1

→ docs/business-rules/task-pipeline.md

## 面分治（授权）

### BIZ-009: 人类通道与 agent 通道面分治

**Rule**: transitionTask / transitionFeature = 人类逃生通道（UI 直调 RPC，不封装 tool——插件 0 注册，代码审计断言）；addTask / claimTask / submitTask / createProposal / transitionProposal = agent tool 专属（恒不上 RPC）；actor 由通道语境服务端推断（tool = 'plugin-tool' + exec ctx sessionId；RPC = 'ui'），输入面不收（防越权标注）。（M3 drift #1 台账同步，2026-10-08·任务 5.1：claimTask tool 已退役并入 dispatchTask 复合动词（core 服务 API 保留）；缺席面扩为 claimTask(spawnWorker)/transitionTask/transitionFeature/setProposalMode——setProposalMode = UI 专属 RPC 正门（agent 面无模式改写动词）；transitionProposal 改双面（RPC + tool）；恒不上 RPC 的写动词收窄为 addTask/submitTask/createProposal。新面常驻 pin = M3 tests/contract/pin-10-tool-faces.test.ts。）
**Context**: 两个薄 Controller 汇于同一 core 动词门（单一写入路径的准确表述 = 面分治）；SC7 断言面。
**Scope**: [CROSS]
**Source**: prd-spec §In Scope ①② / tech-design §Interface 7-8·§交互四

→ docs/business-rules/task-pipeline.md

## 发现面与数据吸收

### BIZ-010: 发现面单向吸收

**Rule**: 注册 / 首次打开只读扫描按目录约定建行——docs/features/<slug>/ → features 行 + feature_documents 全类文档索引、docs/proposals/<slug>/proposal.md → proposals 行；manifest frontmatter 初值单向阀门（吸收后 DB 为 SoT，外部改动不回流）；行此后稳定（悬空 ≠ 缺行）；显式刷新不做（用户裁决）；逐目录隔离容错（非 UTF-8 / frontmatter 畸形 / 非法目录名 → 跳过该文件 + 工作区 app_key_logs warn，不阻断整体）。
**Context**: SC4 数据来源 = 真实发现链（S9① 实证）；无种子数据、无迁移。
**Scope**: [CROSS]
**Source**: prd-spec §In Scope ①·§Data Requirements·DF003 / tech-design §交互三

→ docs/business-rules/task-pipeline.md

### BIZ-011: 零迁移宪法（任务域实例）

**Rule**: 无批量/命令式旧仓任务迁移工具与旧→新同步路径（代码审计）；发现面单向吸收白名单 = 旧线 manifest 的 title/status + 文档索引三字段（显式清单豁免）；旧仓任务文件原地未被改动（断言）。
**Context**: 宪法裁决（SC8）：新旧并行直至旧线自然废弃，迁移会把旧结构缺陷带入新线。
**Scope**: [CROSS]
**Source**: prd-spec §Goals SC8·§Data Requirements

→ docs/business-rules/task-pipeline.md

## 挂接（SC6③）

### BIZ-012: 任务-会话挂接双数据源

**Rule**: 派发会话 = task_session_links（claim upsert-ignore 唯一写源，UNIQUE(task_id, session_id)）；执行会话 = task_records.session_id（submit 记）；两侧展示分别与库一致（双数据源分别断言）；会话 id 两形态混存，相异判勿前缀判型。
**Context**: 执行痕迹可追溯——哪个任务在哪个会话里做过（S8 实证子会话 id 可得且与主会话相异可判）。
**Scope**: [CROSS]
**Source**: prd-spec §Goals SC6③·§Flow Description 流程四 / tech-design §Data Models

→ docs/business-rules/task-pipeline.md

## 工作区库落位

### BIZ-013: 每工作区库派生单源与疑似移动保护

**Rule**: 任务库位置 = {dsh-forge-home}/{canonical-path 扁平化}@{hash8}（hash8 = 原路径 sha-256 前 8 hex 小写消歧后缀）；{dsh-forge-home} = env DSH_FORGE_TASKS_HOME > {userData}/forge-workspaces；派生函数落位 core 单源（deriveDir），注册表单展示串经 RPC 下发（与实际建库位置逐字一致——单源断言）；注册碰撞三态——正常新建 / 幂等复用（中央 ws_path 精确确认）/ 疑似移动拒绝（目标目录不存在 + 同扁平化主体异 hash8 → ERR_SUSPECTED_MOVE 于中央行落库之前抛出（拒绝零副作用）+ 手工指引：删孤儿目录或改回原名；不清理、不认领）。
**Context**: 表单不撒谎（SC2 单源断言锚）；裂库风险仅剩真实移动，注册时拒绝兜底（S10 实证全路径形态收敛）。
**Scope**: [CROSS]
**Source**: prd-spec §In Scope ①·§Flow Description 流程五 / user-stories Story 7 / tech-design §Interface 5

→ docs/business-rules/workspace-consistency.md

## 产品纪律扩展

### BIZ-014: 任务域直读与刷新判据

**Rule**: 任务 / feature / proposal 状态全部从每工作区库直读（数据来源断言，无第二来源）；任务域 watch / 回流 / 快照同步模块 = 0（代码审计）；「即时」判据 = 写入返回后单次重取即见新值（无 watch、无同步延迟）+ 事件延迟上限 500ms。
**Context**: SC2 直读纪律扩展到任务域；刷新走写推送事件而非轮询（见 TECH 侧写推送事件链）。
**Scope**: [CROSS]
**Source**: prd-spec §Goals SC2·§Flow Description 流程一 8 / tech-design §Overview 关键机制 1

→ docs/business-rules/product-discipline.md

### BIZ-015: 对账可视化不进用户视野

**Rule**: 漂移 / 找回类概念不进用户视野（防心智负担）；启动对账机制保留静默自愈 + 记账日志；未来可视化须显式立项再入范围。
**Context**: 2026-10-05 用户裁决（对账卡 UI 移出 M2 范围，提案同步记账）。
**Scope**: [CROSS]
**Source**: prd-spec §Out of Scope

→ docs/business-rules/product-discipline.md

## 特性内 UI 形态（LOCAL）

### BIZ-016: 概览三视图与搜索排序形态

**Rule**: 列表两行布局 / DAG SVG 贝塞尔连线 / 泳道七态横向列；中英双语搜索（IME 安全）；排序 = 活跃优先 ↔ 最新创建；子 tab 顺序 提案|feature|任务。
**Scope**: [LOCAL]
**Source**: prd-spec §Flow Description 流程二 / ui-design v17

→ stays in feature（ui-design.md / prd-ui-functions.md）

### BIZ-017: 任务详情抽屉模块化分区

**Rule**: 右侧滑入 420px；通用区 + 状态条件区（blocked → 阻塞原因）+ 按类型条件区（fix 链/覆盖率/测试面/质量门/评估结果——老 forge 21 种任务模板对齐）+ 执行时间线 + 挂接 + 转移。
**Scope**: [LOCAL]
**Source**: prd-spec §In Scope ③ / ui-design v17

→ stays in feature

### BIZ-018: SC-M2 门 dogfood 走查细则

**Rule**: 派发链端到端真实模型一条链不间断（含 fix 链一次 + 模拟中断恢复一次），对齐 P1 SC-MVP 门纪律。
**Scope**: [LOCAL]
**Source**: prd-spec §Goals SC-M2 门

→ stays in feature（里程碑验收口径）
