---
title: 复验类任务交付模板——逐 AC 证据锚点 + HEAD 锚定的独立复验报告
summary: >-
  fix 链收口后的独立复验，最高质量形态是逐 AC 列证据锚点（git show --stat 逐提交、定向测试全绿日志、产物字节数级在盘核验），末尾给结论
  + 复验时点 HEAD hash——无代码改动也要明示「无代码改动」。
keywords:
  - 复验
  - fix 链
  - 证据锚点
  - HEAD 锚定
  - 模板
domainPath: .knowledge/examples/
来源容器: expert-headhunter-tools
来源任务: first-pass 知识沉淀（1.6）；范本为 fix-2/001-reverify/reverify-report.md
bug id: 无
id: reverify-report-evidence-anchor-template
status: unconfirmed
type: lessons
version_ts: '2026-11-05T00:00:00.000Z'
---

# 复验类任务交付模板——逐 AC 证据锚点 + HEAD 锚定的独立复验报告

## 结构（fix-2 判例）

1. 逐 AC 一节：每条 AC 配独立可查的证据锚点——提交在链与改动面用 `git show --stat <hash>` 逐提交核验；测试给全量计数（25 文件/441 用例全过）+ 日志文件；在盘产物核验到字节数级。
2. 结论节：三项 AC 判定汇总 + 「复验时 HEAD = <hash>」锚定时点。
3. 声明面：复验未改代码时明示「无代码改动」，与源任务解除阻塞的因果写清。

## 适用条件与边界

- 适用于 fix 链末端、对源任务 blocked 成因做独立复核的任务形态。
- 复验发现实际缺陷时不套用本模板收口——转回 fix 链修后再验。
- 证据锚点须他人可独立重放（命令 + 路径），仅描述性「已验证」不构成锚点。

## 来源锚点

- `logs/expert-headhunter-tools/fix-2/001-reverify/reverify-report.md`（范本本体，154s 一次通过）。
- 同目录 `vitest-run.log`；容器复盘 1.5 W3 节评其为「本容器质量最高的执行产物」。
