# Spec：项目概览 dockkit 对齐 apps/web 形态（spec 子 tab + 差异修复）

> 状态：awaiting_approval（修订版 v2——并入 2026-11-24 圆桌四专家评审修订包）
> 圆桌纪要：.forge/roundtables/overview-dockkit-alignment/roundtable.md

## 用户旅程

用户在官方 dsh 宿主上使用 plugins/project + plugins/task-loop 组装的项目概览 dockkit，发现其形态与 dsh-forge 应用（apps/web）的项目概览严重不符：项目头（名称+目录信息）缺席、spec 子 tab 缺席、概览底部叠着 task-loop AC 进度段造成两份任务观感。根本需求 = 插件版概览逐项对齐 apps/web 形态：恢复项目头、子 tab 归一为 spec | 任务 | Bug、拔除 AC 段、平移 forgeDirs/forgeResolvePath 双工具。意图 = enhancement（既有移植版概览的修复与补全）。

## 裁定留痕

- 本 Spec 终结 2026-11-14「提案子 tab 退役 + feature 门关闭」裁定（overview-model.ts:21 注释为证）的残留面：提案子 tab 以 spec 子 tab 形态重生、feature 子 tab 彻底移除（用户裁决 2026-11-23/24）；该注释属退役残留，随 G2 一并清除。
- 项目头 = 项目名称 + forgeDirs 5 行目录信息，**不含会话统计**（用户裁决 2026-11-23）。
- task-loop 单装形态 overview-tab.tsx **保留不动、暂不处理**（用户裁决 2026-11-24）；其后续完善另立需求。

## 方案

- **现状事实**：插件版概览主体 = project 插件自 apps/web 平移的完整版（ov-head/sticky-bar/bug-tab/drawer 组件全在）；头缺席因 UI 数据路走 preload transport（`window.dshForge.invoke`）官方宿主不通。
- **项目头**：head 数据路改走 forgeProjects/forgeDirs Typert namespace；内容 = 名称 + forgeDirs 5 行（workspaceRoot/forgeDir/docs_root/task_home/worktrees），无会话统计；中文状态 chips 随头恢复自然对齐。头摘要（features.list+tasks.stats 合成）随「无统计」裁决退役，但 **status-chips/tasks 子 tab 的 stats 数据源保留**——两者切分，不得顺手砍任务计数。overviewHeadRows 与 dirHeadRows 双实现收敛单源。
- **子 tab 结构**：OVERVIEW_SUBTABS = spec | 任务 | Bug；feature 移除 = 删 OVERVIEW_FEATURE_ENABLED 门 + overview-data features 分支 + feature-tab 目录整树（8 文件），非翻布尔。
- **spec 子 tab**：交互形态按 apps/web 提案子 tab（状态 chips 行 + 列表行[标题+状态 tag+打开入口] + 展开元数据）。数据源 = plugins/spec 的 forgeSpecs Typert namespace（list/detail；SpecCardDto: slug/title/specStatus/tiers/goalCount/acCount/updatedAt；mode/谱系/作者无等价物不映射）。六态中文：草稿/送审中/已批准/进行中/待验收/已完成。失败两支分开验收：typed 拒绝（spec 插件缺席）= 错误条；ws null = 静默空态。刷新 = 进入 tab 拉取 + 既有 nonce/订阅机制；无 spec-changed 事件缝则以手动刷新兜底并注释声明。
- **AC 段拔除**：收口三处——project dock-tabs.tsx 子槽声明+renderSlot+import、task-loop dock-tabs-face 注入面、lib/ui ui-seams 双常量（breaking，lib-ui semver bump）；knowledge-dir 槽同表共存不得回归。
- **双工具**：project host 注册 forgeDirs + forgeResolvePath（官方宿主当前零供数——plugins/forge 聚合包零 registerTool，已核销），消费 anchors.ts 注册表单源；装配期同名守卫（现查 tools 面、先在者胜、跳过 diag warn）；anchors.ts 所有权文案改口（declaredBy → plugin-project、forge.* 保留表述改「目录事实注册表权威 = plugin-project」）。

## 改动范围（file 粒度）

- `plugins/project/ui/dock-tabs/overview/overview-model.ts` —— 子 tab 集、feature 门删除、提案态重写、11-14 注释清除
- `plugins/project/ui/dock-tabs/overview/overview-data.ts` —— 头路 Typert 化、features 分支删除、headRows 单源化
- `plugins/project/ui/dock-tabs/overview/overview-client.ts`、`plugins/project/ui/rpc.ts`、`plugins/project/ui/dock-tabs/typert-transport.ts` —— specs namespace 映射与 forgeSpecs 消费族（SEG_NAMESPACE 六族表加一行）
- 新增 `plugins/project/ui/dock-tabs/overview/spec-tab.tsx`（+子件，参照 apps/web proposal-tab 形态）
- `plugins/project/ui/dock-tabs/dock-tabs.tsx` —— AC 段插槽收口（:387 声明/:416 renderSlot/import）
- `plugins/task-loop/ui/dock-tabs-face.tsx` —— AC 段注入面收口（overview-tab.tsx 单装简版不动）
- `lib/ui/src/ui-seams.ts` —— DSWF_OVERVIEW_AC_PROGRESS_SLOT/OVERVIEW_AC_PROGRESS_ENTRY_KEY 双常量退役（breaking）
- 删除 `plugins/project/ui/dock-tabs/overview/feature-tab/` 目录整树（8 文件）
- `plugins/project/host/tools/forge-paths.ts`（新增，参照主检出 packages/plugin-forge/src/tools/forge-paths.ts）+ `plugins/project/host/index.ts`（注册点 + 同名守卫）+ `plugins/project/host/dirs/anchors.ts`（所有权文案改口）
- 测试翻转面（逐文件）：dock-tabs.test.tsx:331、OverviewTab.test.tsx:317、sticky-bar.test.tsx:39、overview-model.test.ts:37/45；remote.generated-pin.test.ts:74 随契约变动核对
- 版本：project/task-loop/lib-ui 三包各 semver bump 同提交
- 复用核销：目录 registry/declare merge（anchors.ts 既有）；forgeSpecs Typert（既有 namespace）；forge:proposals 通道复活不可行（官方宿主无提案域 DB）

## tiers 交付档位

`ui | api`——ui = 真机走查（判定以 data-* 机读锚清单为准，截图留盘 .forge/docs/proposals/<slug>/walkthrough/，AGENTS 1.8 安装+版本双校验后取证）；api = forgeSpecs 客户端层集成测试（复用 plugins/spec 六端点契约快照零新写）+ 工具单测。配比参考（圆桌 test-master）：unit 60 / 集成 25 / 结构 pin 10 / 真机 5；G2/G4 纯静态渲染语义不写 e2e。

## Goals/AC

（见管线 replace_spec_goals 记录——本文件与管线 Goals/AC 同源渲染）
