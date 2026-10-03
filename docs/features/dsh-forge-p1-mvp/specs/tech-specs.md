---
feature: "dsh-forge-p1-mvp"
generated: "2026-10-03"
status: draft
---

# Technical Specifications: dsh-forge P1（MVP）—— 走线架 + 知识飞轮第一圈

> 提取源：design/tech-design.md、docs/architecture/web-ui-composition.md、代码实测复核（2026-10-03，fix-15 后）。
> 目标文件映射为 non-interactive 自动集成裁决（[auto-specs]）。

## Monorepo 结构与边界

### TECH-001: 五工件布局与构建

**Requirement**: pnpm workspace 承载五工件——`apps/host`（Electron 薄宿主，main ~100 行纪律：仅 profile 组装 / boot / IPC / 窗口，无业务）、`apps/web`（自有 vite 入口 + `dsh-client-web` 壳内核，只调 RPC 不含写逻辑）、`packages/contracts`（跨工件类型与常量，零逻辑零依赖）、`packages/core`（数据内核：唯一 SQLite 句柄持有者，forge 域 + 知识域双模块双服务）、`packages/knowledge`（dsh 插件：召回 tool + 系统提示词知识段）。包名 `@dsh-forge/*`；TS project references；构建 = `tsc -b` 拓扑序 + vite（web）+ electron-builder（host）。
**Scope**: [CROSS]
**Source**: tech-design §Architecture §Layer Placement / §Monorepo 工程规范

→ docs/conventions/monorepo-structure.md

### TECH-002: 基础/业务二分与依赖铁律

**Requirement**: 子模块标注定位（基础 = 无 forge/知识业务语义的可复用机制；业务 = 领域语义载体；装配 = 无逻辑组装点）。三条铁律机械执行（oxlint no-restricted-imports + 零依赖扫描器，越界即 G0 红）：① 基础 ↛ 业务（含类型 re-export 转发）；② 业务 → 基础单向允许；③ 同级业务互禁（core 内 forge ↔ knowledge；web 内 views/session ↔ views/knowledge——跨视图经 `zones/` 槽位与 `rpc/` 解耦）。改动判据：实现功能若「必须改基础子模块才能完成」→ 几乎必然是业务代码放错层；基础子模块只接受缺陷修复 / 性能 / 有 ≥2 消费方证据的新基础能力，此类改动在执行记录显式标注「基础变更」。
**Scope**: [CROSS]
**Source**: tech-design §依赖铁律 / oxlint.config.ts

→ docs/conventions/monorepo-structure.md

### TECH-003: 运行期边界

**Requirement**: ① renderer（apps/web）禁 import `@dsh-forge/{core,knowledge}`——只经 IPC RPC（contracts 通道常量）与数据内核通信（`scripts/lint-imports.mjs` 机械执行，行尾 `// raw-import` 豁免须在执行记录说明理由）；② knowledge 插件对 core 只依赖 `forgeKnowledge` 服务类型（运行期 Cordis `inject` 解析，无实现级 import，插件可独立发版）；③ core 包内知识域 ↛ forge 域（目录边界 + lint，为未来知识域抽包保留边界）；④ core / knowledge 不进任何 import 图给 web——经 profile 装配进入运行时。
**Scope**: [CROSS]
**Source**: tech-design §包间协作规则 / scripts/lint-imports.mjs

→ docs/conventions/monorepo-structure.md

### TECH-004: 修改落点速查（唯一落点）

**Requirement**: 每类改动有唯一落点——注册流程/补偿链/对账 → `core/src/forge`；知识解析/索引/召回/热度 → `core/src/knowledge`；schema 变更 → `core/src/db`（迁移）+ `contracts/dto`（类型同步）；新 RPC 通道 → `contracts/{channels,dto}` + `web/src/rpc` + core 对应域（三处一体，禁单侧私改）；新视图/新流程 → `web/src/views|flows`（渲染进 `zones/` 槽位）；三区机制/视图互换/页签跟随 → `web/src/zones`；领域组件/官方组件封装 → `web/src/components`；profile/boot/窗口/IPC 注册 → `apps/host` 对应子模块；agent tool/知识段文本 → `packages/knowledge` 对应子模块。
**Scope**: [CROSS]
**Source**: tech-design §修改落点速查

→ docs/conventions/monorepo-structure.md

## 数据与契约

### TECH-005: 单一 SQLite 句柄与单写路径

**Requirement**: `better-sqlite3` 仅在 `packages/core`（`db/` 子模块 = 句柄唯一落点，无域语义）；SQLite 写只经 core 服务（UI 与 plugin 同门，单一写入路径）；打开时设 `journal_mode = WAL` + `foreign_keys = ON`；schema 经 `schema_meta` 前向迁移（单事务原子应用 DDL + 版本行，任一步失败整体回滚；旧应用打开新 schema 拒绝）；SQL 一律 prepared statements。
**Scope**: [CROSS]
**Source**: tech-design §Architecture / packages/core/src/db/{open,schema,transaction}.ts

→ docs/conventions/rpc-and-contracts.md

### TECH-006: 共享类型唯一源（contracts）

**Requirement**: 跨工件类型与常量全部定义于 `packages/contracts`——RPC DTO、frontmatter 契约常量、错误码、IPC 通道名；两侧各自引包（防 schema 漂移）。定位铁律：纯类型与纯常量，零逻辑零依赖（「描述业务形状但不实现业务」）。
**Scope**: [CROSS]
**Source**: tech-design §包间协作规则第 4 条 / packages/contracts/src/*.ts

→ docs/conventions/rpc-and-contracts.md

### TECH-007: IPC 通道族与 allowlist

**Requirement**: 产品 RPC 通道三族：`forge:projects/*`（register/list/get/update/reconcile）、`forge:knowledge/*`（browse/listEntries/entryDetail/heat/sessionRecall——仅浏览面）、`forge:fs/*`（listDir——UF-3 文件浏览器只读目录列举，本机目录读取经 RPC，renderer 不开 Node fs 通道）；通道名常量归 contracts，main 侧 allowlist 唯一源校验、未知通道拒绝（electron-ipc-security 约定：contextIsolation、无 remote content）；`search` / `readAbstract` 走 agent 面插件 tool 不经 web RPC（双门分工）；dsh 自有面经 `__DSH_TRANSPORT__` carrier。
**Scope**: [CROSS]
**Source**: tech-design §Interface 4 / packages/contracts/src/channels.ts

→ docs/conventions/rpc-and-contracts.md

### TECH-008: 服务 provide/inject 缝与 child 形态宿主

**Requirement**: core 以 `ctx.reflect.provide('forgeProjects' / 'forgeKnowledge', …)` 注册双服务；knowledge 插件 `inject: ['forgeKnowledge', 'tools', 'systemPrompt']`——对 core 面依赖 = forgeKnowledge 唯一（其余为 dsh 官方面），三服务齐备才加载。宿主 boot 为 child 形态（fix-1 起）：`ELECTRON_RUN_AS_NODE=1 --expose-internals` 子进程跑 dsh 宿主（官方 Desktop 同款），main 侧经 `{url, injections}` manifest + 产品双服务 RPC 代理面消费（DshHostHandle 面不变，main.ts 零感知）；direct-in-main 形态下 agent 工具派发恒挂起（4.2 dogfood 实证），禁回退。
**Scope**: [CROSS]
**Source**: tech-design §Overview 两条关键缝 / packages/core/src/service.ts / apps/host/src/boot/README.md

→ docs/conventions/rpc-and-contracts.md

## 错误处理

### TECH-009: typed error 契约与传播策略

**Requirement**: 能力面/服务层抛 typed error（错误码六值定义于 `contracts/errors.ts`：`ERR_WORKSPACE_CREATE` / `ERR_PROJECT_WRITE` / `ERR_COMPENSATION` / `ERR_ENTRY_NOT_FOUND` / `ERR_INDEX_STALE` / `ERR_INVALID_KNOWLEDGE_DIR`）→ RPC 边界序列化为 `{ code, message, data }` → UI 按 code 映射状态（空态/错误条/横幅）；补偿、对账与召回的关键异常永不抛断用户流程——降级为 app_key_logs 关键日志 + 对账提示；dsh 面异常原样透传（dsh 域归 dsh）。
**Scope**: [CROSS]
**Source**: tech-design §Error Handling / packages/contracts/src/errors.ts

→ docs/conventions/error-handling.md

### TECH-010: app_key_logs 关键日志纪律

**Requirement**: 仅记关键一致性事件（异常/失败/自动修复/孤儿发现），成功路径一律不记；level 仅 warn/error（无 info 流水）；scope 四值（compensation / reconcile / index / recall）；单事件单条——处置结果并入同条 `data_json`，不记过程流水；写仅经 db/ 句柄 prepared statement。
**Scope**: [CROSS]
**Source**: tech-design §Data Models / packages/core/src/forge/key-logs.ts

→ docs/conventions/error-handling.md

## 样式

### TECH-011: 令牌唯一（--dsw-*）

**Requirement**: 样式零裸值——色/字/距/圆角/阴影全部取 `--dsw-*` 令牌；令牌 lint（`scripts/lint-tokens.mjs`，G0 组成部分）扫描 CSS 与 TS/TSX 内联样式机械执行；豁免 = 行尾 `/* dsw-raw */`（CSS）/ `// dsw-raw`（TS），使用须在执行记录说明理由（布局刻度豁免注记制）；主题随官方令牌自动联动，不自维护主题态。
**Scope**: [CROSS]
**Source**: tech-design §样式风格纪律第 1/5 条 / scripts/lint-tokens.mjs

→ docs/conventions/styling.md

### TECH-012: 官方件优先与形态对齐

**Requirement**: 官方现成件（ui-primitives 原子 + ui-* 组件）一律复用、禁止重造（按钮/输入/弹层骨架/页签/列表行）；自绘仅限官方无对应的领域组件（知识卡片/域树行/召回分组行等）且必须吃令牌、行语言对齐官方；交互形态不发明平行模式（抽屉对齐 dockkit 形态、列表行对齐 sidebar 行语言、弹层/菜单对齐 popover 模式）；排版刻度不自创（令牌取值），布局尺寸以原型结构为准、视觉细节以官方为准（冲突时布局结构不变、视觉让官方）。
**Scope**: [CROSS]
**Source**: tech-design §样式风格纪律第 2/3/4 条

→ docs/conventions/styling.md

## 质量门

### TECH-013: G0–G2 门定义

**Requirement**: G0 = 静态门（`pnpm lint`：oxlint 三铁律 + import 扫描器（RPC 边界 + SC2 watch 禁令）+ 令牌 lint + 规则自证 lint-selftest（负样例种植→拦截断言→清理）+ `tsc -b`）；G1 = 契约面 pin 回归（boot manifest 形状、slot 洞名、registry API 语义、`ctx.systemPrompt.section` 注册、`forgeKnowledge` 服务注入、官方 ui-* props、profile 目录形状）；G2 = e2e 池（Playwright `_electron`）；全绿为里程碑门。
**Scope**: [CROSS]
**Source**: tech-design §Testing Strategy / package.json scripts / oxlint.config.ts

→ docs/conventions/quality-gates.md

### TECH-014: 上游依赖精确 pin 与契约面 pin 池

**Requirement**: 上游 dsh npm 包全部精确 pin（0.2.0-rc.2）+ lockfile 入库，P1 期不开升级窗口（升级走窗口纪律）；Electron 精确 `44.0.0`（`node-addon-require-builtin` 指纹门仅接受 43.0.0/44.0.0/45.0.0-alpha.6）；契约面清单逐项 pin 测试（G1 池，新契约面随任务入池）。
**Scope**: [CROSS]
**Source**: tech-design §Dependencies / §契约面清单

→ docs/conventions/quality-gates.md

### TECH-015: e2e 断言零删改台账与覆盖率目标

**Requirement**: e2e 断言零删改台账（断言只增不删不改，继承旧线纪律）；core（双域）单测覆盖率 80%；会话链路走真实 dogfood 冒烟（低成本模型，每门必跑），UI 断言走 smoke 迁移可控 seam。
**Scope**: [CROSS]
**Source**: tech-design §Overall Coverage Target / §Per-Layer Test Plan

→ docs/conventions/quality-gates.md
