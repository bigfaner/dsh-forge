---
title: "任务管线规则"
domains: [task, state-machine, dispatch, audit, fix-chain, worker, ac-gate]
---

# 任务管线规则

> 任务域（每工作区任务库 forge.db）的域不变量：状态机纪律、派发与恢复、审计 append-only、面分治授权、发现面单向吸收、任务-会话挂接双源。

## 状态机与转移

### BIZ-task-001: 状态机七态封闭与转移纪律

**Rule**: tasks 任务状态七值封闭（CHECK 约束）；agent 面 = 转移矩阵推导（claim/submit 拥有的边）；人类通道 transitionTask from≠to 任意 + reason 必带（空因拒绝留场）；转移校验先于写、单事务全成全败。
**Context**: agent 机器校验面与人类逃生通道分治（SC7 单测锚：from 匹配 / transitionTask from≠to + reason 必带）。
**Source**: feature/dsh-forge-m2-pipeline BIZ-001（prd-spec §In Scope ① / tech-design §Interface 1·10）

### BIZ-task-002: 依赖终态守卫

**Rule**: claimTask 前置满足集 = {completed, skipped}（终态集封闭）；未满足即拒绝（ERR_DEPENDENCIES_UNMET，data 带未满足清单）；task_edges 无环。
**Context**: 派发只在依赖全部到终态后发生；满足 = 读时派生（边持久不删），守卫与恢复钩子共用同一满足语义。
**Source**: feature/dsh-forge-m2-pipeline BIZ-002（prd-spec §In Scope ①·§Goals SC7 / tech-design §Interface 1）

### BIZ-task-003: fix 链语义

**Rule**: executor 受阻 = submitTask result=blocked（reason 必带）→ 任务 in_progress→blocked；addTask --block-source 单事务三件（fix 任务行 + 依赖边 + 源任务置 blocked，record verb='auto-block'）——三者原子无半成品；fix 链深 ≤6（超限拒绝并提示人工介入）；恢复钩子反查后继——fix 终态（completed/skipped）且源任务前置全满足 → blocked→pending（record verb='auto-restore'，边保留不删）；依赖环构造拒绝并回报完整环路径（ERR_CYCLE_DETECTED）。
**Context**: 单点失败不断链：自动建修复任务、自动恢复原任务，人工只在链深超限时介入。
**Source**: feature/dsh-forge-m2-pipeline BIZ-003（prd-spec §Flow Description 流程一 5-6 / tech-design §动词内聚不变量）

## 派发与恢复

### BIZ-task-004: 就绪选择与防双派发

**Rule**: 就绪选择仅扫 pending 池，序 = 分支延续优先 → priority → 创建序；in_progress 幂等重入仅限显式 taskRef 或 links 已含本会话——无 taskRef 的盲选不领 in_progress（双 dispatcher 并发不双派发）。
**Context**: 并发与重入域收敛：claim 语义在多会话并发下保持单执行者。
**Source**: feature/dsh-forge-m2-pipeline BIZ-004（tech-design §Interface 1 动词内聚不变量）

### BIZ-task-005: 中断恢复 = 幂等重入

**Rule**: executor 会话中断（record 缺失）→ dispatcher 外环再 claimTask 同一任务 = 无状态转移（仍 in_progress）、返回按当前状态重新合成的 dispatchPrompt（digest 新值）；恢复出口 = dispatcher 外环（record 缺失 → 按当前状态重派），产品不内建恢复机制。
**Context**: 中断只损失时间不损失状态，无需人工清理。
**Source**: feature/dsh-forge-m2-pipeline BIZ-005（prd-spec §Flow Description 流程一 7 / user-stories Story 4）

## 审计与派生

### BIZ-task-006: 每动词审计 append-only

**Rule**: 每次写动词一行审计记录（task_records）；append-only 双触发器机械防线（UPDATE/DELETE 即 ABORT）；claim 记派发会话 id + 挂接行、submit 记执行会话 id；success submit 摘要必带、blocked submit 原因必带。
**Context**: 「每次写自动审计」是状态层可信的基础；改删审计被数据库层机械拒绝。
**Source**: feature/dsh-forge-m2-pipeline BIZ-007（prd-spec §Goals SC7·§Data Requirements / tech-design §Data Models）

### BIZ-task-007: feature 相位 = 推导机派生快照

**Rule**: feature 相位不由人写——upsertFeatureDoc / addTask / claimTask / submit 钩子 / transitionTask / auto-restore 触发器闭包内聚重算（单调只进）；写事务内增量断言承重漂移防护 + validateFeatureTasks 一次只校验一个 feature 的任务子图（五类检查：派生不变量 / 无环 / liveness / 记录链完整性 / 拓扑可分层）。
**Context**: 相位是派生值不是输入值；批量校验语义移交流程层（发现面逐 feature 送校），动词面恒单 feature。
**Source**: feature/dsh-forge-m2-pipeline BIZ-008（prd-spec §In Scope ①·§Monitoring Requirements / tech-design §Interface 1）

## 面分治（授权）

### BIZ-task-008: 人类通道与 agent 通道面分治

**Rule**: transitionTask / transitionFeature = 人类逃生通道（UI 直调 RPC，不封装 tool——插件 0 注册，代码审计断言；M3 起 transitionFeature 维持收窄不进 tool 面，setProposalMode 亦 = UI 专属正门且 agent tool 面无模式改写动词）；addTask / submitTask / createProposal / registerFeature / upsertFeatureDoc / validateFeatureTasks = agent tool 面（M3 拆两包分置：核心六 tool 含 dispatchTask；spec 三 tool）；transitionProposal = 双面（M3 修订：tool + RPC forge:proposals/transition——评审发生在 agent 会话时技能代笔）；claimTask tool 已退役并入 dispatchTask 复合动词（M3——core API 保留，由 dispatchTask/桥/回放消费；dispatchTask = dispatcher 专用，worker 面不含）；actor 由通道语境服务端推断（tool = 'plugin-tool' + exec ctx sessionId；RPC = 'ui'），输入面不收（防越权标注）。
**Context**: 两个薄 Controller 汇于同一 core 动词门（单一写入路径的准确表述 = 面分治）；SC7 断言面；M3 drift 修订（tech-design §Interface 4·drift 记账 1/2）。
**Source**: feature/dsh-forge-m2-pipeline BIZ-009（prd-spec §In Scope ①② / tech-design §Interface 7-8·§交互四）+ feature/dsh-forge-m3-bootstrap-presets（tech-design §Interface 4，drift 修订）

## 发现面与数据吸收

### BIZ-task-009: 发现面单向吸收

**Rule**: 注册 / 首次打开只读扫描按目录约定建行——docs/features/<slug>/ → features 行 + feature_documents 全类文档索引、docs/proposals/<slug>/proposal.md → proposals 行；manifest frontmatter 初值单向阀门（吸收后 DB 为 SoT，外部改动不回流）；行此后稳定（悬空 ≠ 缺行）；显式刷新不做（用户裁决）；逐目录隔离容错（非 UTF-8 / frontmatter 畸形 / 非法目录名 → 跳过该文件 + 工作区 app_key_logs warn，不阻断整体）。
**Context**: SC4 数据来源 = 真实发现链（S9① 实证）；无种子数据、无迁移。
**Source**: feature/dsh-forge-m2-pipeline BIZ-010（prd-spec §In Scope ①·§Data Requirements·DF003 / tech-design §交互三）

### BIZ-task-010: 零迁移宪法（任务域实例）

**Rule**: 无批量/命令式旧仓任务迁移工具与旧→新同步路径（代码审计）；发现面单向吸收白名单 = 旧线 manifest 的 title/status + 文档索引三字段（显式清单豁免）；旧仓任务文件原地未被改动（断言）。
**Context**: 宪法裁决（SC8）：新旧并行直至旧线自然废弃，迁移会把旧结构缺陷带入新线。
**Source**: feature/dsh-forge-m2-pipeline BIZ-011（prd-spec §Goals SC8·§Data Requirements）

## 挂接

### BIZ-task-011: 任务-会话挂接双数据源

**Rule**: 派发会话 = task_session_links（claim upsert-ignore 唯一写源，UNIQUE(task_id, session_id)）；执行会话 = task_records.session_id（submit 记）；两侧展示分别与库一致（双数据源分别断言）；会话 id 两形态混存，相异判勿前缀判型。
**Context**: 执行痕迹可追溯——哪个任务在哪个会话里做过（S8 实证子会话 id 可得且与主会话相异可判）。
**Source**: feature/dsh-forge-m2-pipeline BIZ-012（prd-spec §Goals SC6③·§Flow Description 流程四 / tech-design §Data Models）

## 提交门与 feature 域审计（M3 起）

### BIZ-task-012: submitTask AC/测试证据与 gate 摘要双门

**Rule**: 带 AC 任务（ac_json 非空）submit 时 gate.test !== true → 拒绝（ERR_TEST_EVIDENCE_REQUIRED，错误信息逐行含 AC 清单）；type=gate 任务缺数字摘要 → 拒绝（ERR_GATE_SUMMARY_REQUIRED）；通过后转移 + record（gate_json/commit_hash）；提交定式 = submit 记录含 commit_hash 且提交信息符合 Conventional Commits（配置 AGENTS.md 时从其约定、缺省回退模型常识——两态分别断言）。
**Context**: 自举开发的每一步都有质检环（db-schema §6-24/§6-31 兑付）。
**Source**: feature/dsh-forge-m3-bootstrap-presets BIZ-007（prd-spec §Goals SC7·§Flow Description 流程四 6 / tech-design §Interface 1·图 8）

### BIZ-task-013: feature 域每动词审计伴随（feature_records）

**Rule**: feature 域全部动词（registerFeature / transitionFeature / upsertFeatureDoc / 成链内聚）每次写入伴随 feature_records 审计行（verb = 事件名 TS 单源、actor 三值 CHECK = plugin-tool/ui/core、前后态）；append-only 双触发器机械防线（UPDATE/DELETE 直接 ABORT）——与 task_records 同构。
**Context**: 「每次写自动审计」扩展到 feature 域（SC6 表断言对象）。
**Source**: feature/dsh-forge-m3-bootstrap-presets BIZ-008（prd-spec §In Scope ③·§Data Requirements DF005 / tech-design §Data Models）

## worker 授权与派发纪律（M3 起）

### BIZ-task-014: worker 授权收窄与逃生通道

**Rule**: 一切 worker 全局拒绝交互/委派/待办/呈现四语义族（ask-user / delegation / todo / present——实名表见 conventions/task-domain.md TECH-task-006）；worker 的 forge 工具面 = submitTask + addTask 恰两动词（claimTask/queryTask/dispatchTask 不入 worker 面）；skill 不拒（组合继承目录按需加载）；worker 遇重大问题经 addTask 逃生通道——前缀按语义二分：disc-N（独立问题，不阻塞源任务）/ fix-N（走 fix 链协议：block_source 单事务、链深 ≤6、恢复钩子——M2 机制回归），自身任务以 blocked 收尾并引用新任务。
**Context**: worker 既能干活又不越权（不问用户、不派生子代）；受阻上报径完整。
**Source**: feature/dsh-forge-m3-bootstrap-presets BIZ-009（prd-spec §In Scope ①·§Flow Description 流程四 5 / prd-user-stories Story 5）

### BIZ-task-015: 派发仅按 DAG 就绪序——无单任务直接执行入口

**Rule**: 任务派发只支持按 DAG 依赖顺序领取就绪任务（dispatchTask 就绪选择机械序）；UI 与 tool 面同语义——无指定单个任务直接执行的入口（用户裁决 2026-10-08）；派发指令只携带容器标识（「/run-tasks <容器标识>」单行最小消息——dispatchTask 唯一必要参数 = contextSlug）。
**Context**: 消灭跳序执行旁路；派发入口两途（工具栏按钮/会话内 run-tasks）汇入同一 dispatcher 循环。
**Source**: feature/dsh-forge-m3-bootstrap-presets BIZ-010（prd-spec §In Scope ②·§Flow Description 流程四 1 / prd-user-stories Story 4A）
