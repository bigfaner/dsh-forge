---
title: "打开新会话"预填/诊断消息 @ 锚点修正——指向真实 forge 文档根
status: draft
intent: bug-fix
created: "2026-10-09"
---

# 提案：open-session-prefill-anchor-fix（blitz）

> 用户直述（2026-10-09）：「提案文档在：@.forge\docs\proposals\dsh-forge-m3.5-knowledge-consolidation。
> 所以下面打开新会话构造的消息错误：@docs/proposals/dsh-forge-m3.5-knowledge-consolidation/ …」

## 问题

「打开新会话」四条消息通道（UF-1.4 提案预填 / UF-4.5 feature 预填 / UF-3.5 任务失败诊断 /
validateFeatureTasks 子图诊断）的首行 `@path` 锚由 `apps/web/src/views/overview/message-format.ts`
的 `pathLine()` 硬编码为 `@docs/features|proposals/<slug>/`。但 `@` 引用按**会话工作区根**解析，
文档事实源在 **projects.forge_dir**（标准布局 `<ws>/.forge`，注册时可仓外）之下的
`docs/{features,proposals}/<slug>/`。

- 提案文档存于旧 `docs/proposals/`（工作区根）时期锚点**侥幸成立**；
- 文档根迁至 `.forge/docs/`（M3 后标准）后，锚点指向不存在的路径——agent 收到悬空引用
  （或误指旧目录遗留提案）。

根因潜伏自 M3 4.1：单测只断言字面快照、e2e 只断言草稿文本（`toContainText('@docs/...')`），
从未校验锚路径可解析。

## 修复方案（数据驱动锚）

1. **纯函数**：`MessageContainer` 增可选 `docsRoot?: string`（`@` 锚前缀）；新增导出
   `docsRootOf(workspaceDir, forgeDir)`——归一口径镜像 `form-model.ts` 的
   `normalizeDirPath`/`isForgeDirExternal`（`/`→`\`、大小写不敏感、段边界敏感）：
   - forge 目录在仓内（`<ws>\.forge`）→ `.forge/docs`（工作区相对、正斜杠）；
   - forge 目录 = 工作区根 → `docs`；
   - 仓外 → 绝对路径正斜杠 + `/docs`。
   - `pathLine` 改 `@${docsRoot ?? 'docs'}/...`（缺省回退兼容面）。
2. **四通道接线**：OverviewFrame 以 `head.workspaceDir/forgeDir` 推导并下传
   （提案/feature 预填 + OverviewTasksContext 子图诊断）；TaskDrawer 经 OverviewDockBody
   fail-soft 装载项目行推导（任务失败诊断）。
3. **测试**：锚用例三分支 + 组件断言 `@.forge/docs/...` 首行；e2e 断言同步
   （夹具 forge_dir = `<ws>/.forge`）。
4. **规格文档同步**：M3 PRD 消息体示例 / ui-design v16 段 / page-map 预填行改新锚并注记
   推导口径；testing/ 历史工件（旅程/契约/eval）按时间点事实保留不动。

## 任务清单

| 任务 | 标题 | 依赖 | 估时 |
|------|------|------|------|
| 1 | 消息体 @ 锚数据驱动——docsRootOf 推导 + 四通道接线 + 单测/e2e 断言 | — | 3-5h |
| 2 | M3 规格文档预填锚点同步（PRD 示例 + ui-design/page-map） | 1 | 0.5-1h |
| 3 | e2e 面级回归——overview-entry-new-session 全 spec 真宿主运行 | 1 | 2-3h |

## 附注

- `docs/`（工作区根）下的 M1–M3 历史 feature/proposal 目录为旧布局遗留，本提案不迁移、
  仅修正消息锚推导（数据驱动后两种布局都正确解析）。
