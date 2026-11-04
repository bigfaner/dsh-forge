---
title: 专家档案工具面名实核对——frontmatter tools 须与插件注册工具面一致
summary: >-
  内置专家 frontmatter 声明的 tools 必须与插件实际注册的工具面（如 plugin-forge
  FORGE_TOOL_NAMES）名实一致；交付自测须显式核对二者，不能只信提案承诺。判例 cd369951：提案 AC9 承诺
  getBug/listBugs/聚合只读，专家实际只持 [read,grep,glob]，深挖靠主会话预取注入，评审才发现。
keywords:
  - expert-squad
  - frontmatter
  - tools
  - 工具面
  - 名实一致
  - 交付自测
domainPath: .knowledge/lessons/
来源容器: recurrence-signal-tiering
来源任务: 1.6 / 1.8
bug id: cd369951（修复 2d54c664）
id: expert-frontmatter-tools-must-match-registered-faces
status: unconfirmed
type: pitfalls
version_ts: '2026-11-05T00:00:00.000Z'
---

# 专家档案工具面名实核对

## 教训

1. 专家 frontmatter `tools` 是对外契约，必须与插件实际注册的工具面逐项核对（plugin-forge 即 `FORGE_TOOL_NAMES`）。
2. 提案 AC 承诺的工具能力不能当作已实现事实——交付自测要含「frontmatter ↔ 注册面」一致性检查，缺口即缺陷。
3. 名实不符的隐性代价：能力缺口被主会话预取注入临时补齐，表面能跑，实际偏离设计（专家该自持的查询面落在主会话），评审前不易暴露。

## 适用条件

- 任何以 frontmatter 声明能力、由插件注册提供实际工具面的架构。
- 交付自测清单中若无此核对项，即为缺口。

## 反例边界

- 主会话预取注入若本身是设计决策（提案明示），不构成缺陷；判据是提案承诺与实现的偏差，不是注入行为本身。
