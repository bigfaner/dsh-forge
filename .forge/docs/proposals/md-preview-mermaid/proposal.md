---
title: "dock 文件预览 md 渲染 mermaid 图（官方预览径全覆盖）"
status: draft
---

# 提案：md-preview-mermaid（blitz）

## 症状

会话中点开 md 文档（文件引用 → dock 预览 tab），文内 ```mermaid 代码块按普通代码块呈现、不渲染成图（todo.md #45；走查人 2026-10-11 会话复现）。

## 根因（2026-10-11 勘面）

- md 打开有两条径：官方预览径（`dsh-resource://file/session/...` → 官方 `ui-sidebar-documentpreview` 内建 Markdown 渲染器 → `MarkdownText`）与产品 dswf-doc tab 径（已有 mermaid 渲染，e2e 绿）。
- 官方全线零 mermaid 支持（`@deepseek-ai/*` 全包 grep = 0 命中）；产品渲染件从未接到官方预览径——不是渲染坏了，是没接线。
- 官方预览器有正规扩展缝：`ctx.documentPreviews.register`（`priority: 'extension'` 恒胜 builtin；README 明文）+ keyed slot `sidebar.right.tab.document`；内建 Markdown 留在下拉可切回。

## 方案（三裁决：会话路径根因 / 全覆盖 / mermaid 全图型）

产品经扩展缝注册 extension 带 md 渲染器接管默认预览 body：复用既有 `doc-segments` 分段 + `MermaidDiagram` 懒加载（strict + 失败回退占位卡）；一次注册全覆盖（会话引用、工作区文件 tab 同径）；官方预览既有能力零退化（分页增量/wrap/重读/自动刷新/路径头/下拉切回/本地相对图片）。弃选：上游诉求（pin 窗口不可控）/ 不修引导（未解未诉）/ 截流地址开 dswf-doc（丢官方 chrome、发明平行模式）。

## 验收锚

1. 含 erDiagram 的 md 经预览打开 → `data-dswf-doc-mermaid-svg` 在场（e2e）
2. 非法 mermaid 源 → `data-dswf-doc-mermaid-fallback` 回退占位卡，tab 不炸（e2e）
3. 无 mermaid 的 md → 正文渲染/wrap 与现状零退化（e2e + 单测）
4. 渲染器下拉含内建 Markdown 可切回、选择保持（e2e）
5. 懒加载纪律：零静态 import mermaid、唯一动态装载径、strict——结构 pin 扩池

## 风险要点（详版见任务）

跨页半开 fence（分段器既有语义：归正文、页补齐自动成图，单测钉）；内建行为退化（对照官方 MarkdownBody 逐 prop 对齐 + e2e 锚）；装载纪律破防（复用唯一装载径 + pin 扩池）。
