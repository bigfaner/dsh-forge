---
title: 入口静默缺席无告警——装配缺席也须 emitDiag，取证发现后挂主会话裁决
summary: 真机走查发现「＋ 添加项目」入口在 dev 实机点击无任何 dialog 呈现，控制台也无告警——静默失败违反可观测性纪律（AGENTS §7：不得以 fail-soft 吞掉为由静默失败）。取证改走 preload RPC 真身完成验收，入口缺陷本身作为待裁决项如实挂出，不就地猜修。
keywords: [静默失败, emitDiag, 可观测性, 取证降级, 待裁决]
domainPath: .knowledge/lessons/
来源容器: project-manual-order
来源任务: first-pass 复盘（1.4）
bug id: 无
---

# 入口静默缺席无告警（walkthrough/batch1 判例）

现象：受信 CDP 点击 `[data-dswf-nav="add-project"]` 两次，无 dialog/overlay DOM、无「流程宿主缺席」告警。

两课：

1. **可观测性缺口即缺陷候选**：流程入口装配缺席（或预期内未装配）时至少应有 emitDiag 告警；完全静默让取证者无法区分「坏了」与「预期缺席」，只能靠源码核销。
2. **取证者不就地修**：入口是否缺陷超出本任务范围——取证改走等价路径（preload RPC 真身 `forge:projects/register` 完成注册验收），缺陷本身挂主会话裁决，不越权猜修。
