---
title: "产品架构约束(两级插件 · 数据内核 · CLI 演进)"
domains: [architecture, plugins, two-tier-plugin, product-config, data-kernel, cli-retirement, skill-hosting]
---

# 产品架构约束(两级插件 · 数据内核 · CLI 演进)

## Product Architecture

### TECH-product-arch-001: 两级插件模型——forge 核心 = 必备插件,启停语义仅第三方插件

**Requirement**: forge 各项能力(任务看板、知识库、管线、文档存储适配器……)以 dsh 客户端插件形式交付,壳不焊死功能;插件分两级——**forge 核心 = 必备插件**(内置 bundle 分发、不可禁用、不可被第三方修改、仅作者维护升级);**第三方 = 扩展插件**(用户经 `dsh plugin add` 自装,与必备插件同机制共存、互不垄断)。「可启停/禁用回归纯壳」语义仅适用于第三方插件;任何执行点判定「必备」所依据的插件身份清单必须派生自产品级配置,禁止以壳代码常量重现。
**Context**: 2026-09-21 用户定向——forge 核心为差异化价值必备,不可被用户摘除;扩展性经自有槽位向第三方开放;修正原「一切皆插件 = 全部可启停」语义。
**Scope**: [CROSS]
**Source**: proposals/dsh-forge/proposal.md 架构约束 1(2026-09-22 修订);proposals/ui-plugin-foundation/proposal.md §Proposed Solution

- 必备插件消费基座槽位(ui-slots)+ 复用 dsh 客户端组件体系(不自建第二套,见 ui-reuse.md),并贡献自有槽位供第三方扩展工作台。
- 「不可禁用」执行点已裁决(2026-09-22 M2 D2)= 双层防护:产品清单 mandatory 只读分区 + 运行时启停覆盖文件(`<userData>/plugin-runtime.json`,schema `{disabled: []}` 仅纳第三方,违规条目剔除 + log)+ host-profile 单一写路径守卫(对 mandatory 禁用请求拒绝 + log);裁决约束 = 执行点输入必须为产品配置派生数据,否则即重新引入「清单焊死壳代码」缺陷。
- 验收口径:M2 SC6(必备插件无可用禁用通道;第三方 fixture 禁用仅退出其注入内容,数据零损坏);M2 G6/UF6/Story7 已按两级模型记账(2026-09-22 修订)。

### TECH-product-arch-002: 插件装配 = ui-plugin-foundation 基座,产品级配置为唯一事实源

**Requirement**: 插件清单(bundle 清单)为产品级配置,是插件树唯一事实源,不得焊死壳代码(产品级配置文件 `apps/desktop/resources/plugin-bundles.json`,随包分发、构建期产物、运行时零写入);dsh 插件机制为唯一装配机制,内置(profile bundle 清单)与运行时(`dsh plugin add`)双形态同机制,不发明旁路;运行时启停读写同一配置,但产品清单条目对运行时启停只读;ui-plugin-foundation 基座(至少 spike + bundle 配置化)硬前置 M2 UI 插件任务。
**Context**: M2 全部 forge 能力 UI 以插件形态交付的工程前置;版本对齐纪律必须在第一个自有插件诞生前建立(dist-tag `latest` 停旧版的实测陷阱)。
**Scope**: [CROSS]
**Source**: proposals/ui-plugin-foundation/proposal.md(In Scope/交付件 ③);features/dsh-forge-m2 manifest Dependencies

- 运行时启停 UI = M2 UF6,读写同一产品级配置;产品清单对其只读,防第二写入方破坏产品清单。
- 对齐线依赖(`@deepseek-ai/dsh-client-*` 宿主契约族)一律 exact 且 ≡ `vendor/upstream.lock.json` 的 `desktopHostVersion`(当前 `0.1.6-alpha.2`,vendored SHA `c36ba648`);禁裸包名与 `^`;cordis(peer)为独立版本线单列管理;断言接入 CI/质量门,错配即红灯。
- 开工门槛映射:基座任务 2(bundle 配置化)+ 任务 5(装配 spike)完成,M2 UI 插件任务方可开工;基座交付件(配置装配/版本断言/工程模板)不重复实现。

### TECH-product-arch-003: 产品数据内核(SQLite 入 Electron 壳)——方向声明

**Requirement**: 任务索引、项目↔会话挂接、工作台自有状态(项目注册表/视图状态)以 SQLite 置于 Electron 侧存储,提供数据 API(特别是任务 CRUD);M2 已落地(D1 裁决:自有状态 + 派生快照均入 SQLite,v1,`<userData>/workbench/workbench.db`);落地后 forge 文件仍为唯一事实源(应用只读消费),SQLite 不产生第二事实源——权威切面(结构化任务状态以 SQLite 为权威)为 M3 设计域(2026-09-23 T1 SoT 分治裁决,读路由按列开关渐进切换,见 TECH-data-kernel-001)。
**Context**: 2026-09-21 用户定向——M2 看板首屏/状态回流的文件扫描成本与挂接关系结构化存储所迫;诚实声明:数据内核进壳偏离官方壳极小产品 API 面模式,是产品壳(非兼容壳)的自主选择。
**Scope**: [CROSS]
**Source**: proposals/dsh-forge/proposal.md 架构约束 3;features/dsh-forge-m2 prd DF005/DF001(2026-09-22 记账)

- 数据内核扩大的 preload IPC 面逐项过 electron-ipc-security.md 约束(origin-lock、typed、版本化、最小必要面),API 面随 M2/M3 设计逐项评审。
- 项目三分模型的「工作台自有项目文件」即落于此内核,独立存放、不与 forge 数据混放。
- M2 记账:DF005(工作台自有状态 → 产品数据内核,Format = SQLite 方向声明,任务索引为派生)、DF001(spawn CLI 为过渡,查询面未来可切数据 API)。
- **M3 落地(2026-09-25 记账)**:权威切面已交付——`task` 表(SQLite 权威,7 态 CHECK)+ `data_authority` 读路由(files | sqlite)落地,见 BIZ-coexistence-003 / docs/business-rules/sot-migration.md。

### TECH-product-arch-004: forge 能力形态演进——CLI 退役,终点 = 应用 API + dsh tool

**Requirement**: forge 特色能力以必备能力随产品交付;CLI 为过渡形态(插件宿主半身 spawn Go CLI,经标准 rpc 暴露,二进制随包分发)→ 演进终点 = **应用 API(Electron 数据内核)+ dsh tool,CLI 不保留**;任务调度机制(领取分配、依赖解析、状态机编排)插件化——可随产品演进替换,不动数据内核。
**Context**: 2026-09-21 用户定向——形态终态对齐应用化路线;与 Claude Code 插件退役(M4 完成)为两条独立退役线。
**Scope**: [CROSS]
**Source**: proposals/dsh-forge/proposal.md 架构约束 4 / 路线图 M4

- M2 即过渡形态:应用看板经 spawn CLI 只读查询 + prompt 获取(DF001),写操作仍由 agent 会话/终端执行。
- 形态细节由 M2 SC8(dsh 插件机制 vs forge skill/hook/subagent 语义等价性 spike)与 M4 设计定;spike 结论未出前禁止假设结论。
- **M3 收口(2026-09-25 记账)**:终点形态已落地——ForgeBridge/spawn CLI 链退役,应用出包与执行链零 forge CLI 依赖(SC1/G1 断言);任务写集/读集/知识系/偏好/阶段/提案均经 dsh tool + 内核 API;forge 仓 CLI 停止发布与 CC 插件最终收口归 M4。

### TECH-product-arch-005: 插件工程产物 vendor-free 纪律(机器门禁)

**Requirement**: 自有插件与工程模板(packages/plugins/*、packages/templates/*)的构建产物(lib/)必须 vendor-free——任何模块说明符解析进本仓 vendor 树(vendor/ 或 packages/desktop-host-vendor/)、携带 vendor 路径段、或以 file: 协议指入仓内即为红灯;manifest 依赖声明同理不得携带 workspace:/link:/file: 或裸仓内路径(离开本仓即断)。模板 manifest 必须携带 version-stamp.json(外流侧同步证明)并以 engines["@deepseek-ai/dsh"] exact ≡ desktopHostVersion 声明目标宿主。门禁 = scripts/verify-plugins.mjs + tests/verify-plugins.spec.ts(vitest `pnpm test` CI 腿内运行),比对集显式封闭、不得为过门放水扩集。
**Context**: 插件产物在用户机器上必须可独立安装;仓内 vendor/工作区解析让产物离仓即静默断裂(与 dist-tag 陷阱同为实测教训,ui-plugin-foundation 任务 4/7 Hard Rule)。
**Scope**: [CROSS]
**Source**: features/ui-plugin-foundation 任务 4/任务 7(Hard Rule);scripts/verify-plugins.mjs 头注

- 插件(packages/plugins/*)可有 lib/ 产物但可省 version stamp;模板是源码脚手架,无 lib/ 要求,但 stamp 必备。
- 对齐线族(@deepseek-ai/dsh-client-*)exact ≡ desktopHostVersion 已由 TECH-product-arch-002 记账;本条覆盖其产物级/vendor-free 半面。

### TECH-product-arch-006: 常驻进程足迹 = 2

**Requirement**: 常驻进程足迹 = 2(Electron 壳 + dsh 宿主)不变;forge CLI 按需 spawn、执行完退出;不新增常驻进程/常驻监听依赖(文件感知用内建 fs.watch 递归 + 降级链,不引 chokidar);新增常驻进程须显式提案。
**Context**: M1 继承约束,M2 延续;与零网络监听、离线自足共同构成足迹纪律。
**Scope**: [CROSS]
**Source**: feature/dsh-forge-m2 TECH-009(prd/prd-spec.md §继承约束;design/tech-design.md §Overview/§Appendix Alternatives)

### TECH-product-arch-007: 渲染进程新增依赖只进插件 bundle(React 单实例)

**Requirement**: 渲染进程新增第三方 UI 依赖只进插件 bundle(不进壳、不进 preload);React 保持单一实例、版本对齐宿主模块表(经 host-profile 模块解析外置),插件不得引入第二 React 实例。
**Context**: 壳内核不因能力增减改动(G6);M2 实证 = @xyflow/react 仅入 packages/plugins/forge-workbench 依赖,apps/desktop 零新增。
**Scope**: [CROSS]
**Source**: feature/dsh-forge-m2 TECH-008(design/tech-design.md §Dependencies;D4 裁决)

### TECH-product-arch-008: 技能承载 = customSkillDirs(应用单写 + 前缀校验 + 漂移重写)

**Requirement**: forge 技能以 dsh 原生形态随插件 bundle(`resources/skills/`,扁平名寻址);承载路径 = 用户层 dsh 配置 `customSkillDirs`(skill-filesystem 消费),项目仓零新增文件;配置**仅应用写入**(boot/插件激活时 += 技能根,去重);**漂移校验**(路径存在 + 清单 hash)失败即重写;路径前缀必须 ∈ 插件安装目录(防任意目录注入技能面);修复失败 → `ERR_SKILL_DIR_SYNC` 日志 + 设置面告警(禁静默);应用负责版本升级时的路径同步维护(路径漂移 = 应用责任)。
**Context**: M3 D2 裁决(弃项目侧播种——零物化、项目仓零新增);威胁 T3 缓解;SC1 断言 15 必迁技能扁平名解析全部成功。
**Scope**: [CROSS]
**Source**: feature/dsh-forge-m3 TECH-007(prd/prd-spec.md §技能迁移划分表/DF006;design/tech-design.md §Interface 6;tasks/records/5.6、5.7)
