---
title: 承重机制未钉死不放行 breakdown
summary: 技术评审中，凡是被下游任务承重的机制（结算语义、装配归属、取值点），必须在设计文档钉死唯一落点后才放行拆任务；「两头都占」的表述等同未设计。
keywords: [tech-design, review, breakdown, 官方缝, 承重机制]
domainPath: docs/conventions/reuse-official-mechanisms.md
来源容器: expert-squad
来源任务: 评审环节（B1/B2，review-tech-report.md）
bug id: 无
---

# 承重机制未钉死不放行 breakdown

## 判据

- 机制在文档中有两种并行口径、或「设计只核销了官方 app 内先例、本 host 可用性未核销」→ 视为未钉死。
- 时序图与官方 API 契约逐字比对：官方「接受点即结算、不等待不收集」一类结算语义必须在时序图中如实呈现，不得画成同步返回。

## 实证

expert-squad 评审两次拦下 Blocker，均属此类：

- B1：D2 转发事件登记行要求落在官方 pin 包内，与「零改制官方包」自相矛盾——返工为「fetch 即时 + 5s 轮询主案」，矛盾消除。
- B2：`startContinuable` 被画成同步返回子会话成果，官方契约实为接受点即结算——返工为「工具返回 childId 即结算 + send_message 续聊」。

两次返工均发生在 breakdown 之前，实现期修正波次为 0。放行前多一轮评审返工，远便宜于实现期推翻任务结构。
