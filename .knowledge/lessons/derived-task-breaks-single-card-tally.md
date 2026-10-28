---
title: 「恰一张」类断言必须按循环实例边界圈定
summary: loop-message-consolidation 首轮走查 AC3 FAIL 的根因之一：派生 fix 复盘任务也走异常唤醒径，使挂起消息 3→2 卡仍非「恰一张」——计数断言必须先以循环实例（startup ↔ 结算/停止配对）圈定范围，否则派生任务与重开循环都会造成假阴性/假阳性。
keywords: [恰一张, 计数断言, 循环实例, 派生任务, 走查]
domainPath: .knowledge/lessons/
来源容器: loop-message-consolidation
来源任务: first-pass 复盘（1.8）
bug id: 无
---

# 「恰一张」类断言必须按循环实例边界圈定

## 翻车点

首轮（1561d7fe）AC3 断言「挂起唤醒恰一张」实测 2 张：任务 1.1 一条 + 派生复盘任务 1.2 一条。修复把 3 卡压到 2 卡仍不达「恰一张」——**卡数与断言口径本身错位**。

## 判例

- 计数类断言（settle tally、suspend occurrences）先定义实例边界：以最近一枚循环级 progress 事件（startup）为界，区间内计数。
- 派生任务（auto-fix / fix-N 复盘）继承同一循环的唤醒径，属合法消息，不应计入「循环自身异常卡」口径——或断言改为「每循环实例每径至多一张」。
- 长循环 + 派生任务叠加时（badge 110→111），小球/行数断言同理按实例边界对账。

## 出处

walkthrough/1-4-prev-1561d7fe/rerun-20261028.md AC3；walkthrough/1-4/rerun-20261028.md AC ①-③。
