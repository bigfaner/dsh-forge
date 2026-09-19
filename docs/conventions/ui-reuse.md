---
title: "UI 沿用最大化(dsh 上游复用)"
domains: [ui, reuse, dsh-upstream, desktop-shell, locale]
---

# UI 沿用最大化

### TECH-ui-reuse-001: UI 面优先沿用 dsh 上游既有实现

**Requirement**: 一切 UI 面优先沿用 dsh 已有实现;新增 UI 仅在上游确无对应物时自研,且风格与上游一致。
**Scope**: [CROSS]
**Source**: /learn entry 2026-09-19

- 主功能面(会话/聊天/审批/计划/设置/文件树/workspace 切换)100% 复用上游 client UI 插件族,经 carrier 接入,零重写、零改动(M1 已冻结为验收口径,见 SC7)。
- 壳级或应用级新增面优先参照上游 apps/desktop 同类实现先例(更新提示 update-coordinator、locale 机制、对话框模式)。
- 自研 UI 前必须先核对上游无对应物,并在任务执行记录中说明核对结论。
- 壳层自有文案中英双语,经上游 locale 机制提供,不自建文案通道。
- 背景:用户 2026-09-19 PRD 阶段定向;源 dsh-forge-m1 PRD Functional Specs「UI 沿用最大化原则」。
