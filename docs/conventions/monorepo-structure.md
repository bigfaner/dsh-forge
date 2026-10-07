---
title: "Monorepo 结构与边界约定"
domains: [monorepo, pnpm, project-references, module-boundary, base-business, layering, plugin]
---

# Monorepo 结构与边界约定

> 五工件布局、基础/业务二分依赖铁律、运行期边界、修改落点——全部机械执行（lint/扫描器），越界即 G0 红。

## 布局

### TECH-monorepo-001: 工件布局与构建

**Requirement**: pnpm workspace 承载七工件——`apps/host`（Electron 薄宿主，main ~100 行纪律：仅 profile 组装 / boot / IPC / 窗口，无业务）、`apps/web`（自有 vite 入口 + `dsh-client-web` 壳内核，只调 RPC 不含写逻辑）、`packages/contracts`（跨工件类型与常量，零逻辑零依赖）、`packages/core`（数据内核：唯一 SQLite 句柄持有者——中央 state.db + M2 起每工作区 forge.db 多句柄；forge 域 + 知识域）、`packages/knowledge`（dsh 插件：召回 tool + 系统提示词知识段）、`packages/path-key`（浏览器安全的路径键派生，零依赖）、`packages/plugin-forge`（dsh 插件：forge 管线 tool 半身 + forge:pipeline 系统提示段 + skills 执行链——M2 入仓过渡单包；deps 仅 contracts + path-key）。包名 `@dsh-forge/*`；TS project references；构建 = `tsc -b` 拓扑序 + vite（web）+ electron-builder（host）。
**Source**: feature/dsh-forge-p1-mvp TECH-001（tech-design §Architecture §Layer Placement / §Monorepo 工程规范）+ feature/dsh-forge-m2-pipeline（tech-design §Layer Placement，drift 修订：五工件 → 七工件 +path-key +plugin-forge）

## 模块边界

### TECH-monorepo-002: 基础/业务二分与依赖铁律

**Requirement**: 子模块标注定位（基础 = 无 forge/知识业务语义的可复用机制；业务 = 领域语义载体；装配 = 无逻辑组装点）。三条铁律机械执行（oxlint no-restricted-imports + 零依赖扫描器，越界即 G0 红）：① 基础 ↛ 业务（含类型 re-export 转发）；② 业务 → 基础单向允许；③ 同级业务互禁（core 内 forge ↔ knowledge；web 内 views/session ↔ views/knowledge——跨视图经 `zones/` 槽位与 `rpc/` 解耦）。改动判据：实现功能若「必须改基础子模块才能完成」→ 几乎必然是业务代码放错层；基础子模块只接受缺陷修复 / 性能 / 有 ≥2 消费方证据的新基础能力，此类改动在执行记录显式标注「基础变更」。
**Source**: feature/dsh-forge-p1-mvp TECH-002（tech-design §依赖铁律 / oxlint.config.ts）

### TECH-monorepo-003: 运行期边界

**Requirement**: ① renderer（apps/web）禁 import `@dsh-forge/{core,knowledge}`——只经 IPC RPC（contracts 通道常量）与数据内核通信（`scripts/lint-imports.mjs` 机械执行，行尾 `// raw-import` 豁免须在执行记录说明理由）；② 插件族对 core 只依赖服务接口类型（knowledge → `forgeKnowledge` 唯一；plugin-forge → `forgeTasks` + `forgeProposals` 两服务，faces.ts 结构化最小面——运行期 Cordis `inject` 解析，无实现级 import，插件可独立发版）；③ core 包内知识域 ↛ forge 域（目录边界 + lint，为未来知识域抽包保留边界）；④ core / knowledge / plugin-forge 不进任何 import 图给 web——经 profile 装配进入运行时。
**Source**: feature/dsh-forge-p1-mvp TECH-003（tech-design §包间协作规则 / scripts/lint-imports.mjs）+ feature/dsh-forge-m2-pipeline（tech-design §提示词与技能资产，drift 修订：单插件 → 插件族）

## 修改落点

### TECH-monorepo-004: 修改落点速查（唯一落点）

**Requirement**: 每类改动有唯一落点——注册流程/补偿链/对账 → `core/src/forge`；任务域动词/状态机/相位/validate/读面 → `core/src/forge/tasks`；feature/proposal/docs 小域服务 → `core/src/forge/small-domains`；每工作区库句柄/迁移序列/发现面扫描/派生目录 → `core/src/forge/workspace`；知识解析/索引/召回/热度 → `core/src/knowledge`；schema 变更 → `core/src/db`（中央迁移）或 `core/src/forge/workspace/migrations`（工作区库迁移）+ `contracts/dto`（类型同步）；新 RPC 通道 → `contracts/{channels,dto}` + `web/src/rpc` + host `ipc/` 注册 + core 对应域（三处一体，禁单侧私改）；新视图/新流程 → `web/src/views|flows`（渲染进 `zones/` 槽位）；三区机制/视图互换/页签跟随 → `web/src/zones`；领域组件/官方组件封装 → `web/src/components`；profile/boot/窗口/IPC 注册 → `apps/host` 对应子模块；agent tool/知识段文本 → `packages/knowledge`；forge 管线 tool/系统提示段/执行链 skills → `packages/plugin-forge`。
**Source**: feature/dsh-forge-p1-mvp TECH-004（tech-design §修改落点速查）+ feature/dsh-forge-m2-pipeline（tech-design §Layer Placement，drift 修订：任务域/插件落点入表）
