---
title: 真机取证以数据面为准，不以渲染面为准
summary: >-
  dev 宿主消息列表在指令回执后不主动刷新，下一条消息触发渲染才补显——曾因此把「audit 只读零变更」误判为失败；取证口径改为「发送后再读消息流」。UI
  渲染滞后 ≠ 行为失败，判定必须落在数据面证据（消息流数据、盘面实况、快照 diff）上。
keywords:
  - 渲染滞后
  - 取证口径
  - 数据面
  - dev 宿主
  - 误判
domainPath: .knowledge/lessons/
来源容器: workspace-artifact-governance
来源任务: 1.4（真机走查）
bug id: 无
id: data-plane-over-render-plane-in-forensics
status: unconfirmed
type: pitfalls
version_ts: '2026-11-05T00:00:00.000Z'
---

# 真机取证以数据面为准，不以渲染面为准

## 规则

真机走查判定行为成败时，证据取数据面：

- 消息类：发送后**读消息流数据**（transcript/消息列表接口），不等渲染；
- 文件类：盘面快照 before/after diff；
- 状态类：管线状态查询结果。

渲染面（截图里看不见、列表没刷新）只作展示佐证，不作成败判据；截图在渲染补显后补拍即可。

## 实证

1.4 走查中 dev 宿主（main 宿主同现象）消息列表在 `/forge-dir-audit` 回执后不主动刷新，audit 曾被误判失败；改「发送后再读消息流」后判定恢复正常，最终 audit 全 AC 通过（shot-17、transcript-audit-full.txt）。

## 反例边界

- 交付物本身就是渲染行为（UI 布局、动画、视觉验收）时，渲染面即数据面，截图仍是主证据——本判例只适用于「行为已发生、仅展示滞后」的场景。
