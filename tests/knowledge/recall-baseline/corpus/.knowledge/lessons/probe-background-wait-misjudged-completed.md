---
title: worker 长探针禁后台等待——分阶段同步执行防终态误判
summary: >-
  worker 内以后台监控形态等待长时探针会被循环机械误判 completed（spawn 无 settlement，bug
  36dce4ba）；长探针应拆为分阶段同步执行——每阶段 run-once 独立取证，全部完成后一并结算。
keywords:
  - worker
  - 探针
  - 后台等待
  - 终态误判
  - 分阶段同步
domainPath: .knowledge/lessons/
来源容器: loop-card-task-context
来源任务: first-pass 知识沉淀（1.6）；事件源自 1.3/003-worker-aborted
bug id: 36dce4ba-5b3b-4abe-8d6c-2cf9dfad6e51
id: probe-background-wait-misjudged-completed
status: unconfirmed
type: pitfalls
version_ts: '2026-11-05T00:00:00.000Z'
---

# worker 长探针禁后台等待——分阶段同步执行防终态误判

## 适用条件

- worker 需运行长耗时探针/取证脚本（分钟级）并等待其完成后再结算的任务形态。
- 现机械下 worker 会话静默即可能被判终态，长等待无心跳保活时成立。

## 反例边界

- 短命令（秒级 run-once）同步执行不受影响；分阶段跑法下各阶段同为 run-once 短段，不触发此误判。
- 本条针对「等待后台任务」形态，不否定一切后台 job（宿主侧可自行收割的不在此列）。

## 做法

- 探针按取证面拆段（如 rerun / audit / screenshot），每段一条同步 run-once 命令，证据按段落盘。
- 修复排期前（bug 36dce4ba），走查类任务简报显式声明「探针分阶段同步执行」。

## 来源锚点

- `logs/loop-card-task-context/1.3/003-worker-aborted/error.log`（spawn 无 settlement）。
- 同容器 004~011 改分阶段跑法后未复现——正例对照在档。
