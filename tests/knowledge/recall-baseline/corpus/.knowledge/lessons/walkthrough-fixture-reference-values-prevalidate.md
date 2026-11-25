---
title: 走查夹具引用值写入前须对合法域前置校验
summary: >-
  走查夹具中引用外部目录键值（如执行专家键 squad/dev-walk）未校验合法性即写入，循环按设计派生 fix
  任务拒绝，白耗一轮修正波次——夹具落盘前先对权威目录做一次存在性检查，可省整波。
keywords:
  - 走查
  - 夹具
  - 前置校验
  - 专家键
  - 修正波次
domainPath: .knowledge/lessons/
来源容器: loop-card-task-context
来源任务: first-pass 知识沉淀（1.6）；事件源 walkthrough/batch-1/VERDICT.md 偏差 1
bug id: 无
id: walkthrough-fixture-reference-values-prevalidate
status: unconfirmed
type: pitfalls
version_ts: '2026-11-05T00:00:00.000Z'
---

# 走查夹具引用值写入前须对合法域前置校验

## 适用条件

- 夹具数据携带指向权威目录/词表的引用值（专家键、服务键、事件名、命令名等）的走查任务。
- 派发简报不校验此类值合法性时成立（信息层成因，非产品缺陷）。

## 反例边界

- 夹具值即被测对象本身（以非法值触发守卫为验收目标）时不适用——那是有意构造的反例输入。
- 仅覆盖「引用值应来自封闭集合」类；自由文本字段无从校验。

## 做法

- 夹具写入前对权威来源（内建专家目录等）做一次存在性检查，非法即改用合法键。
- 建议进走查类任务简报模板：列出夹具中所有引用型字段及其校验来源。

## 来源锚点

- `.forge/docs/proposals/loop-card-task-context/walkthrough/batch-1/VERDICT.md` 偏差 1（`squad/dev-walk` 非法 → fix 任务拒绝 → 改 `doc-reviewer` 直证通过）。
- `retro/first-pass.md` 波次 4 归因（信息层 1/6 波）。
