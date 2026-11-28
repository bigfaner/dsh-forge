---
title: "Monorepo 结构与边界约定"
domains: [monorepo, pnpm, project-references, module-boundary, base-business, layering, plugin]
---

# Monorepo 结构与边界约定

> 工件布局、基础/业务二分依赖铁律、运行期边界、修改落点——全部机械执行（lint/扫描器），越界即 G0 红。

## 布局

### TECH-monorepo-001: 工件布局与构建

**Requirement**: pnpm workspace 承载六工件——`apps/host`（Electron 薄宿主，main ~100 行纪律：仅 profile 组装 / boot / IPC / 窗口，无业务；profile 含 presets/ 预设底稿——见 conventions/preset-assembly.md）、`apps/web`（自有 vite 入口 + `dsh-client-web` 壳内核，只调 RPC 不含写逻辑）、`packages/core`（数据内核：唯一 SQLite 句柄持有者——中央 state.db + 每工作区 forge.db 多句柄；forge 域 + 知识域 + settings 域服务）、`plugins/knowledge`（dsh 插件：召回 tool + 系统提示词知识段）、`plugins/task-loop`（dsh 插件·任务循环包：工具族十四员[10 任务动词 + batch_add_tasks + impl_checkpoint 三员 + dispatch_task/stop_task_loop] + forge:dispatch-loop 系统提示段 + 派发核心 src/dispatch-core[claim/assemble/spawn/settle/guard/循环独占守卫] + 派发循环驱动器 src/loop[driver/registry/injection/escalation——awaiting-verdict 挂起/协作面注入/结束通知] + spawn 进程树守卫 src/spawn/job-tree.ts[worker 任意终态 Job Object 整树回收] + triage 分诊 + 事件日志 sink/log-listener[`{slug}/dispatch.jsonl` 唯一写者] + skills[to-tasks/submit-task/rescue-task-loop] + experts 内置专家档案层）、`plugins/spec`（dsh 插件·规格包：spec 域 tool[create/update/query/transition/list-specs + goal/milestone/roadmap 族] + 系统提示段 host/prompt + skills[grilling/fix-bug/investigate-bug] + experts 内置专家档案层）。另有 `lib/*` 公共包群（api/db/diag/util/path/git/ui/status-machine——契约与基元归 lib）与 root 级 `plugins/*` 插件目录。包名 `@dsh-forge/*`；TS project references；构建 = `tsc -b` 拓扑序 + vite（web）+ electron-builder（host）。
**Source**: feature/dsh-forge-p1-mvp TECH-001（tech-design §Architecture §Layer Placement / §Monorepo 工程规范）+ feature/dsh-forge-m2-pipeline（tech-design §Layer Placement，drift 修订：五工件 → 七工件 +path-key +plugin-forge）+ feature/dsh-forge-m3-bootstrap-presets（tech-design §Overview·§Layer Placement，drift 修订：七工件 → 八工件 拆双包）+ plugins-remediation-m1-legacy-retirement 阶段 B（旧双包退役，管线能力归位 `plugins/task-loop` / `plugins/spec` 聚合）+ plugins-remediation-m2b（path-key 退役归 `lib/path`；contracts 并入 `lib/api` 按域子路径）

## 模块边界

### TECH-monorepo-002: 基础/业务二分与依赖铁律

**Requirement**: 子模块标注定位（基础 = 无 forge/知识业务语义的可复用机制；业务 = 领域语义载体；装配 = 无逻辑组装点）。三条铁律机械执行（oxlint no-restricted-imports + 零依赖扫描器，越界即 G0 红）：① 基础 ↛ 业务（含类型 re-export 转发）；② 业务 → 基础单向允许；③ 同级业务互禁（core 内 forge ↔ knowledge——oxlint no-restricted-imports 机械执行；web 内 views/ 间跨视图互禁——经 `zones/` 槽位与 `rpc/` 解耦）。改动判据：实现功能若「必须改基础子模块才能完成」→ 几乎必然是业务代码放错层；基础子模块只接受缺陷修复 / 性能 / 有 ≥2 消费方证据的新基础能力，此类改动在执行记录显式标注「基础变更」。
**Source**: feature/dsh-forge-p1-mvp TECH-002（tech-design §依赖铁律 / oxlint.config.ts）

### TECH-monorepo-003: 运行期边界

**Requirement**: ① renderer（apps/web）禁 import `@dsh-forge/{core,knowledge}`——只经 IPC RPC（`@dsh-forge/lib-api` 通道常量）与数据内核通信（`scripts/lint-imports.mjs` 机械执行，行尾 `// raw-import` 豁免须在执行记录说明理由）；② 插件族对 core 只依赖服务接口类型（faces.ts 结构化最小面，运行期 Cordis `inject` 解析，无实现级 import，插件可独立发版）；③ core 包内知识域 ↛ forge 域（目录边界 + lint，为未来知识域抽包保留边界）；④ core 与插件族（task-loop/spec/knowledge/project 等）不进任何 import 图给 web——经 profile 装配进入运行时。
**Source**: feature/dsh-forge-p1-mvp TECH-003（tech-design §包间协作规则 / scripts/lint-imports.mjs）+ feature/dsh-forge-m2-pipeline（tech-design §提示词与技能资产，drift 修订：单插件 → 插件族）+ feature/dsh-forge-m3-bootstrap-presets（tech-design §边界与依赖变化 1-2，drift 修订：+spec 包 + driver 白名单）+ plugins-remediation-m1-legacy-retirement 阶段 B（边界清单去旧双包，机械禁令以 scripts/lint-imports.mjs 现值为准）

### TECH-monorepo-005: web 双入口零运行时共享（client bundle 自含）

**Requirement**: apps/web vite 双入口（index.html 壳 + client-plugin 第二入口产物 forge-client.js）之间互禁 runtime import——壳树（client-plugin/ 外）与 client 树任何方向 import 共享模块，rollup 即拆公共 chunk，forge-client.js 变 ESM（`import{…}from"./assets/…"`）破坏 classic script 形状（模块系统以 `<script>` 装载，语法错误 load 照常触发 → 「loaded without registering」web boot 报障）。跨入口值需求 = 字面量/纯函数镜像复制（`main.ts` 插件 id 先例）+ plugin.test 字面量同源 pin；type-only import 豁免（编译期擦除零图影响）；测试文件豁免（不入构建图）。机械面：tests/structure/web-shell.test.ts 跨入口 import 边界扫描 + apps/web/src/build/client-bundle-shape.ts 产物形状断言（vite 构建期 pin——import/export 检测须含最小化零空格花括号/星号形态）。
**Scope**: [CROSS]
**Source**: /learn entry 2026-10-11

## 修改落点

### TECH-monorepo-004: 修改落点速查（唯一落点）

**Requirement**: 每类改动有唯一落点——注册流程/补偿链/对账 → `core/src/forge`；任务域动词/状态机/相位/validate/读面 → `core/src/forge/tasks`；feature/proposal/docs 小域服务 → `core/src/forge/small-domains`；forgeSettings 设置域服务 → `core/src/forge/settings`；每工作区库句柄/迁移序列/发现面扫描/派生目录 → `core/src/forge/workspace`；知识解析/索引/召回/热度 → `core/src/knowledge`；schema 变更 → `core/src/db`（中央迁移）或 `core/src/forge/workspace/migrations`（工作区库迁移）+ `lib/api` 对应域 DTO（类型同步）；新 RPC 通道 → `lib/api/{channels,对应域 dto}` + `web/src/rpc` + host `ipc/` 注册 + core 对应域（三处一体，禁单侧私改）；新视图/新流程 → `web/src/views|flows`（渲染进 `zones/` 槽位）；三区机制/视图互换/页签跟随 → `web/src/zones`；领域组件/官方组件封装 → `web/src/components`；profile/boot/窗口/IPC 注册 → `apps/host` 对应子模块；预设底稿/boot overlay 物化/首启预置 → `apps/host/src/profile`；agent tool/知识段文本 → `plugins/knowledge`；任务循环工具族（含 dispatch_task）/系统提示段/派发核心与循环驱动器/spawn 进程树守卫/事件日志 sink 与监听器/执行链 skills → `plugins/task-loop`；规格域 tool（spec/goal/milestone/roadmap 族）/系统提示段/规格技能 → `plugins/spec`。
**Source**: feature/dsh-forge-p1-mvp TECH-004（tech-design §修改落点速查）+ feature/dsh-forge-m2-pipeline（tech-design §Layer Placement，drift 修订：任务域/插件落点入表）+ feature/dsh-forge-m3-bootstrap-presets（tech-design §Layer Placement·§Integration Specs，drift 修订：M3 落点入表）+ plugins-remediation-m1-legacy-retirement 阶段 B（落点改指 `plugins/task-loop` / `plugins/spec`）+ plugins-remediation-m2b（contracts 落点改指 `lib/api` 按域子路径）
