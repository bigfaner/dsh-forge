---
title: mermaid 门控/parse/render 判据分叉：detector 在场 ≠ 可出图
summary: >-
  mermaid 门控头词在册且 parse 双绿不代表 render 可出图——detector/parse/render
  三级判据不蕴含；门控扩表的验收锚必须落渲染出口，渲染失败须 emit 诊断不得静默降级。
keywords:
  - mermaid
  - 门控
  - parse
  - render
  - 判据分叉
  - 静默降级
id: mermaid-parse-render-detector
status: confirmed
version_ts: '2026-11-21T04:09:50.253Z'
updated: '2026-11-21T04:09:50.253Z'
type: pitfalls
procedure: true
candidate_of: doc-surface-conventions
confirmed_at: '2026-11-22T15:34:52.583Z'
---
# 翻车链

门控头词表补齐（detector 实测 12.1.0 全量）后 C4Dynamic fence：门控 `validateDocFences ok:true`、判决面 parse 双绿，但宿主 DOM 增强链路零 figure 零 enhanced 标记（同页 venn-beta/flowchart-elk 出图对照实证）——bug 852332e3。

# 根因与判据

mermaid 图型存在**三级判据**：detector 注册（头词可识别）→ parse（语法可解析）→ render（可出图，依赖 shape 渲染装配/配置）。三级**不蕴含**：detector 在场 + parse 绿不代表 render 可用。门控补齐只覆盖第一级；「能力已支持」的验收必须落到渲染出口（figure/enhanced 标记），不能停在校验出口。

# 规避

- 门控扩表的验收锚 = 渲染出口实测（web e2e 出图断言），校验面单测只证第一级。
- 渲染失败路径须有诊断缝（MermaidRenderOutcome 归一 + onRenderFail），fail-soft 降级 ≠ 静默——降级必须 emit 可归因信号。
