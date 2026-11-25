---
title: 宿主重启后基线采样须先发回合触发组装
summary: >-
  宿主重启后，新装配的首个 system/message 要等该宿主上有会话发出回合才落盘——直接 dump
  取不到新装配基线。采样前先在该宿主发一条消息触发组装，再 dump。判例：1.1 基线阻塞（装载面时序缺口）。
keywords:
  - 基线采样
  - 宿主重启
  - 装配时序
  - system message
  - dump
domainPath: .knowledge/lessons/
来源容器: prompt-scoping-and-desc-trim
来源任务: 1.1 基线阻塞（装载面时序缺口）
bug id: 无
id: baseline-dump-after-restart-needs-triggered-turn
status: unconfirmed
type: facts
version_ts: '2026-11-05T00:00:00.000Z'
---

# 宿主重启后基线采样须先发回合触发组装

## 规则

- 宿主重启（或换装配）后，首个 system/message 落盘以「该宿主上有会话发出回合」为前提——组装是回合触发，不是启动即落。
- 采样程序：先在该宿主发一条消息触发组装 → 再 dump 会话的 system/message 面 → 以此为前后对照基线。

## 判例

prompt-scoping-and-desc-trim 1.1 基线阻塞：重启后未触发回合即采样，装载面时序缺口导致基线不可得。

## 适用条件

- 重启 / 换装配后取 system prompt / 工具 description 基线做前后对照时。

## 反例边界

- 宿主未重启、或该宿主已发过回合（装配已组装落盘）时无此时序缺口，直接 dump 即可。

## 来源锚点

- 容器 prompt-scoping-and-desc-trim 任务 1.1（交叉核验共识：三路评审 + 主会话处置记录）。
