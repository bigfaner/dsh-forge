---
title: "RPC 与契约面约定"
domains: [rpc, ipc, contracts, channel, sqlite, service-injection]
---

# RPC 与契约面约定

> 数据访问单门（SQLite 单句柄单写路径）、共享类型唯一源、IPC 通道族与 allowlist、Cordis 服务注入缝。

## 数据访问

### TECH-rpc-001: 单一 SQLite 句柄与单写路径

**Requirement**: `better-sqlite3` 仅在 `packages/core`（`db/` 子模块 = 句柄唯一落点，无域语义）；SQLite 写只经 core 服务（UI 与 plugin 同门，单一写入路径）；打开时设 `journal_mode = WAL` + `foreign_keys = ON`；schema 经 `schema_meta` 前向迁移（单事务原子应用 DDL + 版本行，任一步失败整体回滚；旧应用打开新 schema 拒绝）；SQL 一律 prepared statements。
**Source**: feature/dsh-forge-p1-mvp TECH-005（tech-design §Architecture / packages/core/src/db/{open,schema,transaction}.ts）

## 契约唯一源

### TECH-rpc-002: 共享类型唯一源（contracts）

**Requirement**: 跨工件类型与常量全部定义于 `packages/contracts`——RPC DTO、frontmatter 契约常量、错误码、IPC 通道名；两侧各自引包（防 schema 漂移）。定位铁律：纯类型与纯常量，零逻辑零依赖（「描述业务形状但不实现业务」）。
**Source**: feature/dsh-forge-p1-mvp TECH-006（tech-design §包间协作规则第 4 条 / packages/contracts/src/*.ts）

### TECH-rpc-003: IPC 通道族与 allowlist

**Requirement**: 产品 RPC 通道三族：`forge:projects/*`（register/list/get/update/reconcile）、`forge:knowledge/*`（browse/listEntries/entryDetail/heat/sessionRecall——仅浏览面）、`forge:fs/*`（listDir——文件浏览器只读目录列举，本机目录读取经 RPC，renderer 不开 Node fs 通道）；通道名常量归 contracts，main 侧 allowlist 唯一源校验、未知通道拒绝（electron-ipc-security 约定：contextIsolation、无 remote content）；`search` / `readAbstract` 走 agent 面插件 tool 不经 web RPC（双门分工）；dsh 自有面经 `__DSH_TRANSPORT__` carrier。
**Source**: feature/dsh-forge-p1-mvp TECH-007（tech-design §Interface 4 / packages/contracts/src/channels.ts）

## 服务注入缝

### TECH-rpc-004: 服务 provide/inject 缝与 child 形态宿主

**Requirement**: core 以 `ctx.reflect.provide('forgeProjects' / 'forgeKnowledge', …)` 注册双服务；knowledge 插件 `inject: ['forgeKnowledge', 'tools', 'systemPrompt']`——对 core 面依赖 = forgeKnowledge 唯一（其余为 dsh 官方面），三服务齐备才加载。宿主 boot 为 child 形态：`ELECTRON_RUN_AS_NODE=1 --expose-internals` 子进程跑 dsh 宿主（官方 Desktop 同款），main 侧经 `{url, injections}` manifest + 产品双服务 RPC 代理面消费（DshHostHandle 面不变，main.ts 零感知）；direct-in-main 形态下 agent 工具派发恒挂起（dogfood 实证），禁回退。
**Source**: feature/dsh-forge-p1-mvp TECH-008（tech-design §Overview 两条关键缝 / packages/core/src/index.ts / apps/host/src/boot/README.md）
