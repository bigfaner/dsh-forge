---
title: actor 硬编码时审计溯源降级为单向可分约定，须知情接受
summary: >-
  审计写径 actor 硬编码（如 core 恒写 'ui'）且 session_id 不透传时，通道溯源只能靠 reason
  前缀承担——而前缀标签的赋值权在 agent 自身，机械不可核验。正确处置：提案如实声明「恒 'ui' +
  前缀单向可分」，把失效面从「无任何标记」收窄到「标记可能失真」，知情接受并记录更优键（session_id
  透传）为未来松绑方向，而非硬造与源码不符的审计口径。
keywords:
  - 审计
  - actor 硬编码
  - reason 前缀
  - 单向可分
  - 自我声明
  - 溯源
domainPath: .knowledge/lessons/
来源容器: implicit-stage-approval
来源任务: 评审 B1 + 形式化验证（verification/report.md P4、report-round2.md V-2）
bug id: 无
id: audit-actor-hardcoded-provenance-degrades-to-one-way-prefix
status: unconfirmed
type: lessons
version_ts: '2026-11-05T00:00:00.000Z'
---

# 审计溯源的自我声明降级处置

## 经过

提案首版声明经新 tool 写入的 feature_records 审计行「actor 归 plugin-tool 写径口径」——实读 `features.ts` 发现 `appendFeatureRecord` 中 actor 硬编码 `'ui'`、`transitionFeature` 不传 sessionId，零 core 改动前提下 actor 恒为 'ui'。评审判为 Blocker（审计陈述失实）。两轮验证进一步定性：reason 前缀是唯一可区分信号且为**单向可分**（有前缀 ⇒ tool 通道；无前缀 ⇒ UI 人工与违规写入不可分），「显式指令」标签真实性机械不可检测（需跨出 DB 对照对话史）。

## 修法（判例）

- 接受现状口径：提案改写为「actor 恒 'ui'（core 零改动），溯源由 reason 必带承担」，AC 如实断言 actor='ui'。
- 前缀升格为 tool parse 层机械强制（regex `^(隐式赞同|显式指令)：`），杜绝「无标记」这一更差形态。
- 标签失真风险（agent 可对隐式流转贴「显式指令」标签）知情接受并写进提案，替代方案（core 加可选 actor/sessionId 入参）显式标为「越界、仅记录」——不因追求完美审计键偷偷扩大改动面。

## 教训

- 审计口径必须源码核销后才落笔；「应该会是 plugin-tool 吧」级别的写法直接产出评审 Blocker。
- 当溯源键 = 自我声明时，务实目标是最强可写形态（收窄失效面 + 机械强制在场），不是消除残余风险——消除需动 core，须走显式改口而非暗改。

## 反例边界

- 若 core 服务本就透传 sessionId/actor（如 `appendFeatureRecord` 支持但服务面不收是本案特例），优先推动服务面加参——但那属于 core 语义改动，须显式改口提案范围，不属本条「知情接受」路径。
