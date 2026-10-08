---
title: Forge设置分区成组+Provider选项接原生模型目录 & 概览tab内容填充整tab
status: draft
---

# 提案：forge-settings-overview-ui-fixes（blitz）

三条用户裁决（2026-10-08 会话直述），均为有界 UI 修复——无 PRD/设计面，任务直挂提案。

## 裁决一：Forge设置分区——worker 设置项成组

> 「所有 worker 设置项放一起，不是一个设置项一条分隔线。」

- 现状：`apps/web/src/views/settings/forge-settings.css` 的 `.dswf-fs-row`（Provider/Model/Reasoning 三行）每行 `border-bottom`——一设置项一条分隔线。
- 改法：删行级 `border-bottom`；分隔线只留 worker 小节级（`.dswf-fs-part` 的 `border-top`）。
- 任务：1.1。

## 裁决二：Forge设置分区——Provider 选项从 dsh 原生「模型」设置装载

> 「provider 的可选项从 dsh 原生的设置项-模型加载。」

- 现状：`ForgeSettingsSection.tsx` 硬编码 `WORKER_PROVIDER_CATALOG`（dsh-openai/dsh-deepseek 两行），与宿主实际配置脱节。
- 数据源（dsh 源码 `Z:\project\github\deepseek-harness` 已核实）：client 经 `ctx.remote.session.modelCatalog()` 取宿主代模型目录——`packages/api/session-controller/src/index.ts:309`，返回 `RemoteResult<ModelCatalog>`，`groups: [{id(=provider 路由 id), name, models:[{id,…}]}]`；官方模型选择器同源（`packages/client/ui-model-selection/src/client/catalog.ts:56`）。
- 改法两段：
  1. `plugin.ts` `registerSettingsSection` 登记行加 inject face 递达 `loadModelCatalog`——惰性 `ctx.reflect.get('remote.session')`（复用本文件 `buildOpenSessionOrchestrator` 的反射配方），调用 `modelCatalog()` 解信封，`groups → [{provider, models}]`；
  2. `ForgeSettingsSection.tsx` 候选纯函数目录参数化（缺省 = 静态目录回退面），UI state 增 `catalog`，装载壳 mount 装载（失败静默回退），Body 选项生成消费之。
- 任务：1.2（依赖 1.1）。

## 裁决三：dock 项目概览 tab——内容填充整个 tab

> 「dockkit>项目概览tab：内部不要设置最大宽度，内容填充整个tab.」

- 现状：`OverviewTab.tsx` 内部定宽面板（默认 560px 钳制 400–920 + 左缘拖拽手柄）右贴 dock——dock 宽于 920 时内容不满 tab。
- 改法：退役整套内部定宽/拖拽（resize 手柄、`style width`、`OverviewFrameProps.width/onDragWidth/onResetWidth`、`overview-model.ts` 五个宽度导出）；`overview.css` 面板 `flex:1` 填满。任务抽屉自有调宽面（`clampDrawerWidth`）不动；e2e 锚 `[data-dswf-ov-panel]` 保留。
- 任务：1.3。

## 任务清单

| 任务 | 标题 | 依赖 | 估时 |
|------|------|------|------|
| 1.1 | Forge设置分区：worker 设置项成组——去掉逐行分隔线 | — | 0.5-1h |
| 1.2 | Forge设置分区：Provider 选项从 dsh 原生模型目录装载 | 1.1 | 2-3h |
| 1.3 | 项目概览 dock tab：去内部定宽/拖拽——内容填充整个 tab | — | 1-2h |

## 附注

- 本提案创建时 `createProposal` tool 报 `INVALID_TOOL_OUTPUT: value is not lossless JSON`——写路径已落库（DB 行在场），报错发生在返回值校验层；根因与修复另立提案 `tool-row-lossless-json-fix`。
- 本文件补挂时提案行 `rel_path` 已为 NULL 且管线无改写动词——文档区经 slug 扫描（`listProposalDocs`）仍可发现本文件。
