---
title: 工作区隔离 = canonical key 前缀 + 双取值点钉死
summary: 官方 storage 无工作区隔离时，用 key 前缀 disabled/<canonicalWorkspacePath>/<expertId> 承担隔离；取值点按消费面分双路钉死——tool 面取 agent scope cwd，fetch 路由取 client 显式 workspace 参数（zod 门），杜绝进程级 cwd 串域。
keywords: [storage, 工作区隔离, canonical path, key 前缀, zod]
domainPath: .knowledge/examples/
来源容器: expert-squad
来源任务: 1.5/1.10（Q2/Q3 核销，phase-1/2-summary.md）
bug id: 无
---

# 工作区隔离 = canonical key 前缀 + 双取值点钉死

## 判例

- canonical 判据锚定官方 `realpathNormalize(header.cwd)`（`workspace/src/entity.ts:122-143`）同语义 + 缓存。
- 双取值点：tool 面读调用 agent scope 的 cwd；fetch 路由要求 client 显式携带 `workspace` 参数，`workspaceParamSchema` zod 门在 handler 逻辑前校验。
- 单一「进程 cwd」取值会把 A 工作区的禁用状态泄漏到 B（Q2 原风险）；缺记录 = 启用，仅存禁用记录。
