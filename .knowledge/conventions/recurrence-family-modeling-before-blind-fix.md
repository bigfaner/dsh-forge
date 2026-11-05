---
title: 同缝复发 ≥ 2 禁盲试 fix——先形式化建模定位家族共因
summary: >-
  复发家族逐 incident 单点修不触共因：写径家族第 5 次复发时前 4 次单点修均未触达 writeDraft 静默放弃与 fail-loud
  语义不对称这一共因，一次形式化建模即定位并给出判别实验。机制化为同缝判据（台账 recurrence 链计数 ≥ 2）程序软拒绝盲试 fix
  派发，收敛为升级建模排查——已实现并经单测 + e2e 四分支旅程验证。解除判据（建模报告落卷在场）的探测路径随装配代际不同：新装配读工作区根卷宗、旧装配读
  tasksHome 容器库目录，两处同放即双保险（bug 8b041612）。
keywords:
  - 复发家族
  - 形式化建模
  - 判别实验
  - 同缝计数
  - 盲试 fix
  - 解除判据
  - 落卷路径
  - 装配代际
domainPath: .knowledge/conventions/
来源容器: loop-recurrence-hardening；prompt-scoping-and-desc-trim（解除路径节）
来源任务: 提案本体（§1 证据 / fix-7 实证）+ 收口验证 1.8（AC2/AC11）；fix-1/1.6 T3 死锁排查
bug id: 8b041612（解除门探测缝错接，fixed @ 1f3a6910）
id: recurrence-family-modeling-before-blind-fix
status: unconfirmed
type: conventions
version_ts: '2026-11-05T00:00:00.000Z'
---

# 同缝复发 ≥ 2 禁盲试 fix，先建模排查

## 不变式

同一缝（台账 recurrence 链计数 ≥ 2）的缺陷**不再派发盲试 fix**：程序守卫软拒绝（claim/dispatch 派生态现算 `count≥2 ∧ 卷宗报告不在场`，零持久标记），收敛为升级排查——委派建模产出「状态机/不变式模型 + 候选根因 + 判别实验清单（成本序）」，fix 简报必含判别实验，逐条排除后才开修。

## 证据

- 写径家族第 5 次复发（fix-7 实证）：前 4 次单点修各堵一个拒绝条件，均未触达家族共因（`writeDraft` 静默放弃与 fail-loud 语义不对称）；一次形式化建模即定位共因并给出判别实验。
- 复发根因收敛四类：修复面不全、竞态/状态机无不变式、知识不传递、环境前提无断言——前两类是形式化验证主场。
- 本机制已落地 plugin-forge 并收口：同缝拦截单测三径 + e2e 回放旅程四分支链（拒绝 → 建模桩 → 报告回收 → 守卫放行）全绿（verification-1.8）。

## 解除判据的落卷路径（随装配代际）

「建模报告落卷在场」的探测位随装配代际不同——放错位置 = 报告在场但守卫恒判不在场，「落卷即放行」结构性不可达（bug 8b041612，判例 fix-1 被误拦 5 次成死锁）：

| 装配代际 | 探测路径 |
|---|---|
| 新装配（1f3a6910 后） | 工作区根 `.forge/docs/proposals/<slug>/issues/<localId>/`（ws_path 卷宗缝） |
| 旧装配（含安装版静态 profile 检出——修复未同步即在旧列） | tasksHome 容器库目录同路径（`deriveTaskStoreDir` 派生，incident 落盘缝） |

- 两处都放报告副本 = 新旧装配双保险；清理时两处同删。
- 适用条件：fix 链被同缝拦截需解除时。报告落点按当前宿主装配代际判定，宿主形态先辨（见 `lessons/dual-host-tasks-home-forge-db-write-heat.md`）。

## 边界

- 同缝判据以台账 recurrence 链为准（结构化、计入拦截）；scope 文件/服务缝重叠只是提示性信号，数据源不洁不阻断。
- 轻量问题（新问题/首轮复发，计数 < 2）不受影响，常规 fix 自闭环，不触发建模成本。
- 修复回填设家族覆盖声明闸门（resolveBug fix_approach 声明段 + 报告锚），防止「又单点修就标 fixed」。
- 主会话语义裁决（声明是否真答「为何覆盖全家族」）为 SOP 面，不设机检。
- 待核（bug `eacd22a3`，open）：claim 守卫恒传 `files: []`，同缝匹配实际未发生——无报告的 fix 会被全项目最重链误拦，上条「同缝判据以台账 recurrence 链为准」在修复前名不副实。证据：`proposals/prompt-scoping-and-desc-trim/postmortem-t3-recurrence-deadlock.md`。
