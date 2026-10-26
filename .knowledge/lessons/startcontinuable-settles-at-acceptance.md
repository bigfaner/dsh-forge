---
title: startContinuable 接受点即结算，无成果回传通道
summary: ctx.subagents.startContinuable 在子会话 inbox 接受首条 prompt 时即 resolve，仅返回 {childId, messageId}，不等待不收集结果；成果呈现走官方子会话记录，追问走 dsh-tool-subagent-control send_message——不得画成同步返回成果。
keywords: [startContinuable, continuable, subagent, 结算语义, send_message]
domainPath: docs/conventions/official-mechanics-interception.md
来源容器: expert-squad
来源任务: 评审 B2 → 1.15 实现（review-tech-report v4/三审）
bug id: 无
---

# startContinuable 接受点即结算

## 翻车点

设计时序图把「子会话成果」画成 `startContinuable` 的同步返回（`SUB-->>T: 子会话成果`），官方契约（`@deepseek-ai/dsh-subagent` 包 continuation.ts:104、types.ts:52-58）是该调用在 inbox 接受点结算、"neither waits for nor collects a result"——continuable 子会话没有 run/result 通道，成果不可能经返回值到达委派方。

## 正解

- 委派工具返回「已派发 + childId + 追问指引」即结算。
- 成果经官方子会话记录可见；追问续聊经 `send_message`（回复回会话流，continuation 同上下文）。
- `subagent/end` 事件（含 lastAssistantMessage）只可驱动面板状态面，不得作为成果回传通道。
