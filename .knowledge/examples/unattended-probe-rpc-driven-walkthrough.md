---
title: 无人值守探针走查的 RPC 驱动降级判例
summary: 无人值守环境下 composer/dock 官方 GUI 入口不可判读（insertText 零效果、发送钮 disabled 形态、派发按钮缺席），走查驱动降级为官方 commands HTTP transport POST /api/commands/execute 提交 /run-dag-tasks——环境局限声明为非产品缺陷判定面，产品面判定以行为证据本体。
keywords: [走查, 无人值守, RPC 驱动, 环境局限, playwright]
domainPath: .knowledge/examples/
来源容器: loop-message-consolidation
来源任务: first-pass 复盘（1.8）
bug id: 无
---

# 无人值守探针走查的 RPC 驱动降级判例

## 场景

1.17 真机走查：需在无人值守探针环境驱动真实派发循环并取证面板行为。

## 做法

- 会话创建走官方 GUI 形态（startSession(workspaceId)，binding 官方直通）。
- 循环触发不经 composer：官方 commands HTTP transport `POST /api/commands/execute` 提交 `/run-dag-tasks`。
- 走查文档显式声明环境局限段（composer insertText 零效果 / dock 按钮缺席 = 探针环境限制，非缺陷判定面）。
- 断言落在可判读面：面板展开/折叠/拖移、任务轨行、截图双主题归档。

## 可复用点

- GUI 入口不可判读 ≠ 功能不可验收；换官方驱动通路，判定对象不变。
- 环境局限必须与产品缺陷显式切分，避免走查结论被探针环境污染。
