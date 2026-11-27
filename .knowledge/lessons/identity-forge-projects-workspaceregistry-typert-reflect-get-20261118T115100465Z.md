---
title: 跨插件缝消费先查仓内在役同缝先例——官方语义分析不充分，装配实况只在本仓代码
summary: >-
  消费跨插件服务/官方缝时先检索本仓在役同缝先例（grep 缝键+知识库），命中即复用配方；外部官方语义分析不充分——projectId
  实际语义由本仓装配形态决定（forge 签发 ID ≠ workspaceId）。判例：identity 缝两轮真机返工，第三轮查 task-loop
  同缝在役实现一次命中。
keywords:
  - 跨插件服务
  - 缝键
  - 先例检索
  - identity
  - forge.projects
  - workspaceRegistry
  - 官方宿主
  - typert
  - 点分键
  - reflect.get
id: identity-forge-projects-workspaceregistry-typert-reflect-get
status: confirmed
version_ts: '2026-11-18T11:51:00.465Z'
updated: '2026-11-18T11:51:00.465Z'
type: lessons
procedure: true
confirmed_at: '2026-11-22T15:34:52.583Z'
---
# 判例：forgeSpecs identity 缝官方宿主两轮返工（bug b990aa94 → ac27ab1a）

## 现象

Typert 端点 projectId → wsPath 解析在官方 dsh web 宿主两轮失败：
- 第一轮（fix-2）：假设「官方宿主 projectId ≡ workspaceId」，主源 workspaceRegistry + 回落 camelCase `forgeProjects`——真机双双 miss。
- 第二轮（fix-3）：仓库内已有 task-loop 同缝在役正解（点分 `forge.projects` 键 + `ctx.reflect.get` 取缝 + `getProject(id).wsPath` 窄面），一次命中即通。

## 根因

消费跨插件服务/官方缝时，先做外部调查假设、后想到查仓库——而本仓 task-loop 对**同一缝**已有官方宿主真机在役实现，且 knowledge/project 插件有同族判例。外部调查（官方源码语义）必要但不充分：**本仓装配形态下的实况（谁签发 projectId、注册键点分形态）只有本仓在役代码能回答**——本案 projectId 是 forge 签发 ID ≠ workspaceId，纯官方语义分析无法得出。

## 规避（同缝先例检索前置）

1. 消费跨插件服务键/官方缝前，先做两步检索：① grep 缝键（注意点分形态如 `forge.projects`）找本仓在役消费者；② 查 .knowledge/ 同族判例。
2. 命中先例 → 直接复用其配方（取法、键名、窄面形状）；零命中才做外部调查。
3. 外部调查结论落地前，用判别实验（一次廉价调用）验证假设，再全面实现——本案「registry 首行 id 调端点」型实验可在第一轮就证伪。

## 关联

- 正解配方锚：plugins/task-loop/host/index.ts:100（reflect.get(PROJECT_SEAM_KEY)）、host/assembly/typert-remotes.ts:111-115（窄面）。
- AGENTS §1.6 跨插件在场性检测为不变约束（现查零缓存），本判例补充的是**取法来源优先级**。
