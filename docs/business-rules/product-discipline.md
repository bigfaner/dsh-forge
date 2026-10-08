---
title: "产品纪律规则"
domains: [direct-read, read-only, offline, telemetry, migration, orchestration, bootstrap]
---

# 产品纪律规则

> 跨里程碑的产品级宪法纪律（继承自重构总纲，P1 起机械执行）：数据直读、只读、离线、最小数据面、无迁移。

## 数据直读

### BIZ-product-001: 无投影直读（SC2）

**Rule**: 状态全部直读——项目记录 / 知识索引 / 使用事件来自数据库或缓存直读，会话列表实时读 dsh 账本（零缓存零副本）；禁止 watch/fs 监听驱动的回流模块与快照同步表；知识索引是唯一明文豁免的派生缓存（按需一次性重建，绝不落知识目录）。
**Context**: 投影/回流层是旧线 M1–M4 打磨上限被封死的结构性根因（教训①同源）；直读由 lint 禁令（watch 类依赖拦截）+ 运行断言机械执行。
**Source**: feature/dsh-forge-p1-mvp BIZ-007（prd-spec §Goals 无投影纪律 / proposal SC2）

### BIZ-product-007: 任务域直读与刷新判据

**Rule**: 任务 / feature / proposal 状态全部从每工作区库直读（数据来源断言，无第二来源）；任务域 watch / 回流 / 快照同步模块 = 0（代码审计）；「即时」判据 = 写入返回后单次重取即见新值（无 watch、无同步延迟）+ 事件延迟上限 500ms。
**Context**: SC2 直读纪律扩展到任务域（M2）；刷新走写推送事件而非轮询（事件链形态见 conventions/rpc-and-contracts.md TECH-rpc-007）。
**Source**: feature/dsh-forge-m2-pipeline BIZ-014（prd-spec §Goals SC2·§Flow Description 流程一 8 / tech-design §Overview 关键机制 1）

## 只读与离线

### BIZ-product-002: 只读纪律（SC3 起步）

**Rule**: 应用全程对代码仓与文档位置（forge 目录）零写入；知识目录在无写入面期间亦只读（写入 tool 与 UI 编辑属后续里程碑）；以文件系统级监控验证。
**Context**: 工作台是「读取/调度面」而非「写入面」——防与 git/编辑器/用户手工流冲突。
**Source**: feature/dsh-forge-p1-mvp BIZ-008（proposal §Non-Functional Requirements / SC-NFR）

### BIZ-product-003: 离线自足（SC-NFR）

**Rule**: 应用自身静态资源与运行时不依赖网络分发——无远程脚本 / 字体 / 样式请求（断言）；agent 模型调用属 dsh 会话域，不在此列。
**Context**: 单机桌面产品的信任基线；也排除 CDN 供应链面。
**Source**: feature/dsh-forge-p1-mvp BIZ-009（proposal §Non-Functional Requirements / SC-NFR）

## 数据面边界

### BIZ-product-004: 无遥测、最小数据追踪

**Rule**: 单机产品无遥测；数据追踪仅四类——使用事件（召回执行点）、补偿/对账记账日志（app_key_logs 关键一致性事件）、任务/feature 动词审计记录（每工作区库 task_records + feature_records，每动词一行 append-only；claim 记派发会话、submit 记执行会话）与 agent 面业务事件日志（M3 起 `logs/{slug}.jsonl` 容器维度运营日志——tasksHome/userData 域，非代码仓；形态见 conventions/event-logging.md TECH-event-001）；无种子数据。
**Context**: 数据面最小化是单机产品边界的一部分；事件仅服务产品内功能（召回 tab / 热度 / 任务时间线 / 容器全程串联）。M2 起任务域审计入列（drift 修订：两类 → 三类）；M3 起 feature 域审计与事件日志入列（drift 修订：三类 → 四类）。
**Source**: feature/dsh-forge-p1-mvp BIZ-010（prd-spec §Data Requirements）+ feature/dsh-forge-m2-pipeline（prd-spec §Data Requirements）+ feature/dsh-forge-m3-bootstrap-presets（prd-spec §Data Requirements·§Security，drift 修订：三类 → 四类）

### BIZ-product-005: 模型凭证不经手

**Rule**: 模型 API 凭证归 dsh profile 域——产品不经手、不存储、不展示。
**Context**: 安全边界划分：凭证生命周期完全归 dsh，产品零接触面。
**Source**: feature/dsh-forge-p1-mvp BIZ-011（prd-spec §Security Requirements）

### BIZ-product-006: 零代码新分支、无数据迁移

**Rule**: 零代码新分支宪法——不迁移旧分支数据，新旧并行直至旧线自然废弃；分支不含旧工作台视图 / 投影层代码（白名单 = 壳层基建与可复用工具 + vendor fallback 与打包/CI 资产模式）。
**Context**: 旧线「上游 home 增强层」路线已废止；迁移旧数据会把旧结构缺陷带入新线。
**Source**: feature/dsh-forge-p1-mvp BIZ-012（prd-spec §Data Requirements / proposal SC8）

## 编排与一致性可视化边界

### BIZ-product-008: 应用零编排

**Rule**: 应用自身不发起任何编排动作（web 无编排逻辑，代码审计断言）；派发循环 / fix 链 / 恢复出口全部 = agent 技能侧（plugin-forge skills 的 dispatcher 外环）。
**Context**: 工作台是读取/调度面而非编排器；编排智能归 dsh 会话域。
**Source**: feature/dsh-forge-m2-pipeline BIZ-006（prd-spec §In Scope ②·user-stories Story 2 AC3 / tech-design §Integration Specs）

### BIZ-product-009: 对账可视化不进用户视野

**Rule**: 漂移 / 找回类概念不进用户视野（防心智负担）；启动对账机制保留静默自愈 + 记账日志；未来可视化须显式立项再入范围。
**Context**: 2026-10-05 用户裁决（对账卡 UI 移出 M2 范围，提案同步记账）。
**Source**: feature/dsh-forge-m2-pipeline BIZ-015（prd-spec §Out of Scope）

## 自举纪律（M3 起）

### BIZ-product-010: 自举纪律（M4 起自身开发）

**Rule**: M4 起剩余功能一律用 dsh-forge 自身开发（SC-M3 门 = M3.5 作为首个自举 feature 端到端走查：评审接受 → 成链 → 远征会话派发开发 → 任务/执行记录 100% 入自身 forge.db → 全景可见）；全程零 manifest.md 生成——无会话时代的补偿物 = 第二事实源，消亡论证同族适用于显式「当前容器」状态文件（M3 裁决：不实现 state.json 等价物；跨会话记忆真需求出现时随 worktree 族伴生裁决）。
**Context**: 总纲自举纪律从纸面变现实；飞轮第一批真实数据入库。
**Source**: feature/dsh-forge-m3-bootstrap-presets BIZ-011（prd-spec §What ④·§Goals SC8 / tech-design §老 forge state.json 形态对应）
