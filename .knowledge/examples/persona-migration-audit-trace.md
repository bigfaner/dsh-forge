---
title: 迁移类交付的来源分层留痕范式
summary: >-
  大批量文本迁移（矩阵→档案 20 类）不做逐字节基线，改用三层可审计留痕：实战历史分层（frontmatter type 全量统计，出现即有历史）+
  有历史类逐类型对照表（title/creed 逐字、类型级指引去向逐条）+ 未使用类新撰评审 + 机器门批量核验。
keywords:
  - 迁移
  - 留痕
  - 分层
  - 对照表
  - 机器门
domainPath: .knowledge/examples/
来源容器: expert-squad-forge
来源任务: first-pass 复盘（1.7）
bug id: 无
id: persona-migration-audit-trace
status: unconfirmed
type: lessons
version_ts: '2026-11-05T00:00:00.000Z'
---

# PERSONA_VARIANTS → 20 预设档案迁移留痕范式

## 结构

1. **分层依据**：`docs/features/*/tasks/*.md` frontmatter `type:` 全量统计（192 条）——出现过即认定有实战历史 → 13 有/7 无，分界可机器复核。
2. **逐类型对照表**：矩阵出处行号、title/creed 逐字保留、类型级 gate/workflow 去向逐条注明（persona-migration-audit.md 13 行表）。
3. **新撰评审留痕**：未使用类按类型语义独立成文，同族档案以红线条款互斥，7/7 过 parseExpertFile 同口径机器门（expert-draft-review.md + experts-gate-check.txt 20/20 PASS）。

## 效果

风险 2「迁移行为回归」以可审计留痕收口，替代不可行的逐字节基线（结构已变）——提案期风险缓解策略被走查证明正确。
