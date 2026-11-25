---
title: 程序守门 / agent 判断切分——分类零机械零配置
summary: >-
  缺陷归类、能力类别判断等语义动作全部留 agent（triage
  语义分类、主会话裁决），程序只承担确定性面（结构化校验、计数、拦截、搬运、探测）。errorType 不做机械匹配：机械只做词表收敛（登记应答携带
  distinct errorType 参考集合），归类始终是语义判断——已实现并经静态断言（全 packages 零 errorType 匹配路径）+
  单测验证。
keywords:
  - 职责切分
  - 零配置
  - 词表收敛
  - errorType
  - 语义分类
domainPath: .knowledge/conventions/
来源容器: loop-recurrence-hardening
来源任务: 提案 2.5/2.7 + 收口验证 1.8（AC3/AC6/AC10）
bug id: 无
id: program-gate-agent-semantics-split-zero-config
status: unconfirmed
type: conventions
version_ts: '2026-11-05T00:00:00.000Z'
---

# 程序守门 / agent 判断切分（零机械分类）

## 切分原则

- **程序（core/plugin-forge 代码）**：结构化校验、计数、拦截、搬运、探测——可机判、防绕过、零语义。
- **agent**：分类、判断、建议、委派、裁决——语义面。程序永不判断语义，agent 永不越过闸门。

## 落地形态（已验证）

- 分类输入给足，不预判：triage 持有 blocked 归类、recurrence 链计数两信号 + 只读台账工具（getBug/listBugs），语义分类后在升级载荷给专业建议（归类/处置/目标建议/证据指针）；写面结构性不可达。
- errorType 词表收敛：recordBug 登记应答以工具面包装 `{card, errorTypeSuggestions}` 携带 distinct 集合（BugCard 零改动），工具描述写「复用既有词优先、避免同义异词」纪律；无规则集文件、无类别映射、无机械匹配路径（静态断言 grep 级实测）。
- 升级路由零专家键：产品代码零感知专家在场性，委派决策全留主会话（守卫只发中立提示）。

## 边界

- 结构化信号（recurrence 链、同缝计数、归类字段 presence）仍由程序闸门承载——零机械分类 ≠ 零程序守门。
- 载荷完备性可结构断言，归类内容语义质量不设机检（声明豁免）。
- 语义动作落文档契约（SOP/技能）时，验收走文档对照断言，不硬造机检。
