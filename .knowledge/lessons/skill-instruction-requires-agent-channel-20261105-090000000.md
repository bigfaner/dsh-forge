---
title: 技能指示的方法必须有 agent 可达通道
summary: 技能文本指示 agent 调用的任何方法，必须存在 agent 真实可达的通道（tool/RPC）——服务面方法注册 ≠ agent 可达；发布前 grep 生产消费者验证。
keywords: [技能, tool 通道, 可达性, 服务面]
type: lessons
status: unconfirmed
id: skill-instruction-requires-agent-channel
version_ts: 2026-11-05T09:00:00.000Z
来源容器: knowledge-stage2-write-gateway
来源任务: 1.5/1.10/1.11 评审链
bug id: 6ca979cf
---

# 技能指示的方法必须有 agent 可达通道

distill 技能指示 agent「经宿主 wiring 调用 mergeKnowledge」，但该法既非 tool 也非 RPC——全仓唯一消费者是测试，「自动执行」悬空。三轮评审才抓到（architect 结构面）。

判例：**技能/SKILL 文本中每个「调用 X」动词，交付核销时必须 grep X 的生产消费者**——服务面注册（bridge 白名单/类型锚）只是类型存在性，不是调用通道。同类校验应进技能交付 AC。
