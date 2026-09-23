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

### TECH-ui-reuse-002: 上游导航槽位注入与视图键寻址(无路由 SPA)

**Requirement**: 上游 SPA 无路由——新增顶级视图经上游导航槽位注入:`main`(keyed 槽,root scope,ui-layout 声明)+ `sidebar.panellist`(list 槽,ui-sidebar 声明),注册契约 `key/id/order/label`;视图切换经 `ctx.layout.selectPanel` 回写共享控制器;页面族用视图键寻址(page-map 惯例,如 `workbench/overview|tasks|features`),视图切换状态会话期内存、不持久化进路由系统;禁自建导航旁路(插件内自绘 rail 仅最后兜底)。
**Context**: M1 spike-3 证外部通道不可用;M2 spike-1 定形槽位对;新增页面族(M3+)沿用。
**Scope**: [CROSS]
**Source**: feature/dsh-forge-m2 TECH-006(design/tech-design.md §Overview D3/§Integration Specs;design/spike-1-findings.md §1;design/page-map.md;packages/plugins/forge-workbench/src/client/contract.ts)
