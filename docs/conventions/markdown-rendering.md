---
title: "markdown 只读渲染防注入"
domains: [markdown, sanitize, content-injection, read-only-render, external-links]
---

# markdown 只读渲染防注入

## Markdown Rendering

### TECH-markdown-001: 不可信 markdown 只读渲染三禁

**Requirement**: 过程文档/任务描述/执行记录等仓内不可信 markdown 一律只读渲染:禁 raw HTML/脚本;禁外链跳转离开应用;文档经 IPC 返回纯文本,渲染走上游既有渲染组件或等价 sanitize 配置;渲染区无交互元素。
**Context**: markdown 内容注入缓解(威胁模型 T3);任何新增 markdown 面(M3 知识库/wiki 等)沿用本约定。
**Scope**: [CROSS]
**Source**: feature/dsh-forge-m2 TECH-007(prd/prd-spec.md §Security 边界约束;design/tech-design.md §Security T3;ui/ui-design.md 全局规则)
