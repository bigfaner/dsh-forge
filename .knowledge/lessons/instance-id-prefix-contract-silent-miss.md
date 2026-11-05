---
title: 插件实例 ID 寻址契约——registerRoot 必传包名前缀，缺省回落短前缀致配置键静默不命中
summary: expert-squad 专家配置键为「层前缀
keywords:
  - 实例 ID
  - registerRoot
  - 前缀回落
  - 配置键不命中
  - 寻址契约
domainPath: docs/conventions/plugin-service-presence-detection.md
来源容器: expert-squad-default-routing
来源任务: disc-1/fix-3（AC4 case2 覆写例初版 key 不生效根因）
bug id: 0b83e3aa-e827-4c94-896a-fe6fab919aa3
id: instance-id-prefix-contract-silent-miss
status: unconfirmed
type: pitfalls
version_ts: '2026-11-05T00:00:00.000Z'
---

# 实例 ID 寻址的前缀契约缺口

## 教训

- 「配置键写了但精确不命中」优先查**写读两侧的键拼接是否同源**：写侧从 registry 现成实例 ID 回显、读侧 registerRoot 前缀缺省回落，两侧前缀不同即结构性失配，全程零告警。
- 契约收口：注册根时显式传完整包名前缀（commit `8e24e9c4`，expert-squad 0.9.2），不依赖缺省回落。

## 适用条件

- 任何以「前缀 # 键」做配置寻址的注册/消费对（专家路由、per-instance 覆写等）。
- 反例边界：裸键（跨层共享语义，如工作区启停）不受此契约约束——粒度不同是有意设计，不统一改前缀寻址。
