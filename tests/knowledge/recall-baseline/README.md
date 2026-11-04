# 召回基线（recall-baseline）

提案 `knowledge-stage2-write-gateway` §2.5——阶段②召回基线防线（121 篇零引用不重演）。

## 组成

| 文件 | 职责 |
|---|---|
| `questions.json` | 题库快照（人工定标一次，可回归复跑） |
| `harness.ts` | 临时装配：复制仓内真实 `.knowledge` 语料（121 篇收编快照）→ 自持库 + rebuild + 服务面 |
| `scoring.ts` | 自动判分 + 零污染门 + RECALL_LOGS 观测面 |
| `recall-baseline.test.ts` | vitest 回归入口（knowledge-journeys 项目挂载） |
| `baseline-floor.json` | 命中率回归下限（固化锚） |

## 题库

- **规模/分层**：129 题（conventions 45 / examples 24 / lessons 60），每域 ≥15。
- **题源**：真实会话沉淀抽取为主（121 篇 `.knowledge` 语料即 1.6 收编的真实任务/bug 会话知识沉淀，台账 `proposals/knowledge-stage2-write-gateway/ingest/slug-id-ledger`；sourceRef 记 source_task/source_bug，缺席记 ingest-ledger）+ 人工补题（manual——同义改写/自由文本/域路由盲区样本）。
- **判分口径**：每题锁定标准答案条目 id 集；命中 = search Top-5 含任一标准 id；`rank` 记首个标准 id 位次。
- **查询形态**：关键词单/双词、自由文本子串、域前缀路由——对应 agent 真实检索习惯（tool 指南：先高信号短词）。

## 判分与门

- **自动判分**：`runBaseline()` 逐题 `search(limit 5)`，报告含分域/分源命中率、misses 归因（`zero-hit` = 检索路由未召回 / `rank-miss` = 召回在但排序挤出）。
- **零污染门**（硬红）：一切 answerId 必须在索引内（悬空锚 = 污染）；跑批全落临时目录临时库，不触任何持久层。
- **观测面**（数据源 = `KNOWLEDGE_RECALL_LOGS`）：`observeFromRecallLogs()` 直读召回账——调用数、条目命中热度（frontmatter_id 聚合）；三问通过条目当前 = 全量 unconfirmed 收编语料。

## 基线定标记录

| 轮次 | 命中率 | 说明 |
|---|---|---|
| 首轮 | 88.4%（114/129） | 15 zero-hit 归因：13 题多词 keyword 未按受控词表切 token，校准查询词 |
| 复跑 | 97.7%（126/129） | 校准后连续两轮 ≥70% 达标 → 固化 |
| 固化验证 | 98.4%（127/129） | ≥ floor 0.97 复现；余 2 miss = M06/M08 有意保留的同义改写归因样本 |

目标口径 Top-5 ≥70%（提案）；floor = 0.97，跌破即回归破坏（先归因再复测）。

## 复跑

```sh
npx vitest run --project knowledge-journeys tests/knowledge/recall-baseline
# 判分报告落盘指位（缺省临时目录）：
KNOWLEDGE_BASELINE_REPORT_DIR=<dir> npx vitest run --project knowledge-journeys tests/knowledge/recall-baseline
```

注意：`questions.json` 修订须走 node JSON 往返（禁 PowerShell Set-Content——BOM 即坏档，仓内判例 `committed-json-artifacts-byte-verified-no-bom`）。
