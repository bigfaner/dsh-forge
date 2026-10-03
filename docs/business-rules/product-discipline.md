---
title: "产品纪律规则"
domains: [direct-read, projection, read-only, offline, telemetry, migration]
---

# 产品纪律规则

> 跨里程碑的产品级宪法纪律（继承自重构总纲，P1 起机械执行）：数据直读、只读、离线、最小数据面、无迁移。

## 数据直读

### BIZ-product-001: 无投影直读（SC2）

**Rule**: 状态全部直读——项目记录 / 知识索引 / 使用事件来自数据库或缓存直读，会话列表实时读 dsh 账本（零缓存零副本）；禁止 watch/fs 监听驱动的回流模块与快照同步表；知识索引是唯一明文豁免的派生缓存（按需一次性重建，绝不落知识目录）。
**Context**: 投影/回流层是旧线 M1–M4 打磨上限被封死的结构性根因（教训①同源）；直读由 lint 禁令（watch 类依赖拦截）+ 运行断言机械执行。
**Source**: feature/dsh-forge-p1-mvp BIZ-007（prd-spec §Goals 无投影纪律 / proposal SC2）

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

**Rule**: 单机产品无遥测；数据追踪仅两类——使用事件（召回执行点）与补偿/对账记账日志（app_key_logs 关键一致性事件）；无种子数据。
**Context**: 数据面最小化是单机产品边界的一部分；事件仅服务产品内功能（召回 tab / 热度）。
**Source**: feature/dsh-forge-p1-mvp BIZ-010（prd-spec §Data Requirements）

### BIZ-product-005: 模型凭证不经手

**Rule**: 模型 API 凭证归 dsh profile 域——产品不经手、不存储、不展示。
**Context**: 安全边界划分：凭证生命周期完全归 dsh，产品零接触面。
**Source**: feature/dsh-forge-p1-mvp BIZ-011（prd-spec §Security Requirements）

### BIZ-product-006: 零代码新分支、无数据迁移

**Rule**: 零代码新分支宪法——不迁移旧分支数据，新旧并行直至旧线自然废弃；分支不含旧工作台视图 / 投影层代码（白名单 = 壳层基建与可复用工具 + vendor fallback 与打包/CI 资产模式）。
**Context**: 旧线「上游 home 增强层」路线已废止；迁移旧数据会把旧结构缺陷带入新线。
**Source**: feature/dsh-forge-p1-mvp BIZ-012（prd-spec §Data Requirements / proposal SC8）
