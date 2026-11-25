---
title: 工具白名单凭印象写反——承重语义必须源码核销
summary: >-
  官方 tools.restrict 的 allow = keep-only：deny 底座无法「恒保留」不在 allow
  名单内的工具。expert-squad-forge 首版把交集语义写反成承重机制，评审读源码纠出。教训：限制机制的语义组合不得凭印象推导。
keywords:
  - ToolRestriction
  - keep-only
  - 语义写反
  - 源码核销
  - Blocker
domainPath: .knowledge/lessons/
来源容器: expert-squad-forge
来源任务: first-pass 复盘（1.7）
bug id: 无
id: official-restrict-allow-keep-only-misread
status: unconfirmed
type: pitfalls
version_ts: '2026-11-05T00:00:00.000Z'
---

# 交集语义写反（B1）教训

## 经过

首版 proposal 断言「deny 底座恒保留管线工具」：认为 `{allow: 档案白名单, deny: forge 底座}` 组合下管线工具经底座保留。官方语义实为 allow（keep only）+ deny（remove）——allow 不含即拒，管线工具先被 allow 面滤除，deny 无从保留。

## 修法（判例）

派发组装期：`allow = 档案 tools ∪ 管线必备用具集`（并集保底），`deny = 既有收窄面`（照旧）。公式须在方案图、强制面表、交互面、纳入清单、风险、验收全部同口径（该案共六处）。

## 教训

承重机制的语义组合先读官方源码 admits 判定再落笔；「想当然的交集直觉」是最贵的一类提案期 Blocker。
