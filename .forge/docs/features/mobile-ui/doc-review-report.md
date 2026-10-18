---
created: 2026-10-20
reviewer: doc-review（任务 mobile-ui/1.22）
scope: prd 三件套 / design 六件 / testing 三旅程 / 批次摘要
---

# 文档评审报告：mobile-ui 全文档集

评审口径：完整性（覆盖面无缺件）、一致性（跨文档口径同源）、可追溯性（AC↔设计↔测试链路可回溯）。

## 一、总评

文档集整体质量高：PRD→设计→测试链路完整（tech-design 含 PRD Coverage Map，旅程带 sources 回溯）、ADR 决策带候选与权衡、wire 契约以真实样本实证（wire-samples 37 类与正文口径一致）。发现的问题集中在**通道契约撤销后未回改的残留引用**与**批次实现演进未回写手册**两类漂移。

## 二、逐文档问题清单

### 必修（跨文档口径冲突/缺件）

| # | 文档 | 位置 | 问题 |
|---|---|---|---|
| M1 | design/api-handbook.md | §二「受影响的既有 API」表 | 与 §一 自相矛盾：§二称「allowlist 增 4 通道」、`REMOTE_CHANNELS` 枚举 `+task-action, +session-links, +workers`、Deps 注入面含 transitionTask/sessionLinks/workers——但 §一/1.2 已裁定 task-action/workers 撤销、session-links 延后，唯一新增 = `read-state`。tech-design「契约数据模型」与 §一 一致。§二须按收敛结论回改（增 1 通道 + worktree 三通道放行） |
| M2 | design/screen-map.md | #3/#7/#8 数据源列 | 引用已撤销/延后通道：#3 `forge:remote/session-links`（延后可选）、#7 `task-action`（撤销→composer `/` 仲裁）、#8 `forge:remote/workers`（撤销→官方面派生 `session.list` 过滤 + `subagent/catalog` 投影）。与 tech-design/api-handbook/批次实现三处漂移 |
| M3 | design/api-handbook.md | 全文 | 手册缺批次实现新增的 `forge:proxy/*` 通道族条目：`forge:proxy/commands-list`、`commands-execute`、`session-list`、`file`、`user-questions-answer`（batch-1/3 摘要与 journey 均引用）。手册作为 API 正本须补条目（payload/data 形状取批次①录制 fixtures 钉死值） |
| M4 | design/schema.sql | L21 | 错引「见 api-handbook 1.3」——read-state 读写契约在 §1.1，1.3 是透传通道 |
| M5 | design/er-diagram.md | 「未读计算」节 | `unread = tailSeq − lastReadSeq`（差值公式）与 AD-6/R10-F1/schema.sql「可见事件白名单计数器」口径冲突（机械事件不计 → 差值公式虚大）。统一为计数器口径 |
| M6 | features/mobile-ui/（根） | 缺 batch-2-summary.md | batch-1/batch-3 摘要在盘，批次②（任务 1.9–1.15，走查记录在 proposals/mobile-ui/walkthrough/1-9/1-12/1-13/）无批次交付摘要——文档集缺件，G4/G5 批次②对照无承载文档 |

### 建议（不阻塞，可豁免）

| # | 文档 | 位置 | 问题 |
|---|---|---|---|
| S1 | design/tech-design.md | 「流程时序 2」 | sequenceDiagram 引用未声明参与者 `API`，且 alt 分支内混入指令发送路径（P→API 两条消息在「校验通过/失败」分支之外语义悬空）——建议拆清指令发送前置与守卫回执两段 |
| S2 | prd/prd-spec.md、prd/user-stories.md | G2 / US-2 | 「750ms→5s」为提案级单段口径，tech-research R1.4 已精化为官方三值（250/750/5000）——PRD 侧建议加注「正本 = 官方三值，见 tech-design SSE 契约」，避免实现对照时误用 PRD 数值 |
| S3 | testing/ | 目录 | 仅 3 旅程覆盖 US-2/3/4；tech-design T3 列出的抽屉未读/hero 确认框/任务意图守卫/worker 双形态/文档阅读旅程未生成（批次②③面）——属测试规划补齐项，随 gen-journeys 后续批次收口 |

### 豁免记录

| 项 | 理由 |
|---|---|
| wire-samples.md 截断样本（220 字符/数组 3 项） | 文件头已声明「T1 单测 fixture 以同法提取的未截断样本为准」，截断为文档可读性设计，非缺陷 |
| batch-1-summary.md 任务 1.5/1.6 commit 对应按提交时序推断 | 摘要已自述为低风险假设，符合如实上报口径 |
| tech-design AD-4 等节内嵌「评审修正/真实日志发现」过程注记 | 属设计决策留痕（ADR 溯源价值），不适用 doc-style「不留修复叙事」公约——该公约约束呈现当前事实的文档叙事，不约束 ADR 证据链 |

## 三、可追溯性核查结论

- PRD Coverage Map（tech-design 尾表）US-1～US-10 逐条有设计元素映射，无悬空 AC。
- 3 份旅程 frontmatter sources 均可回溯至 user-stories/ui-functions/proposal 具体锚点。
- 批次①③摘要 G1–G5 对照带证据索引，批次②缺摘要（见 M6）。

## 四、处置

- M1–M6 已反馈为修复任务（doc-fix，见任务图）。
- S1–S3 记录豁免/移交：S1、S2 随 M 组修复顺带处理不单开任务；S3 移交 gen-journeys 测试管线批次。
