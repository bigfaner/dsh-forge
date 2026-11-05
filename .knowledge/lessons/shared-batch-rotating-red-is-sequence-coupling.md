---
title: 批内轮转单发红 + 隔离恒绿 = 共享序列耦合
summary: >-
  共享 launch 批 run 中不同用例轮流单发红、且 --grep 隔离 run
  恒绿——这是序列耦合（上用例沉降窗竞速）的签名，不是用例固有缺陷；收口走局部重试 helper（瞬态窗对策），不放宽断言。
keywords:
  - e2e
  - 序列耦合
  - 轮转红
  - 竞速
  - 重试helper
domainPath: .knowledge/lessons/
来源容器: e2e-fast-shared-launch
来源任务: first-pass 知识沉淀（1.13）；audit-xsq-batch.md 批次一/二a/四a/五
bug id: 无
id: shared-batch-rotating-red-is-sequence-coupling
status: unconfirmed
type: pitfalls
version_ts: '2026-11-05T00:00:00.000Z'
---

# 批内轮转单发红 + 隔离恒绿 = 共享序列耦合

## 病征签名

- 共享会话批 run 中，同族用例**轮转单发红**（run5 红 6b、run6 红 5b、run7 红 5b…），失败点漂移不定；
- 同用例 `--grep` 隔离 run **恒绿**（且秒级快）；
- 拦截体常为上用例的沉降残留（会话面沉降窗拦截子 tab 点击、回退 overlay 残留拦截 picker 行、hover rowaction 可见性竞速）。

三者同时成立即判序列耦合，勿按用例固有缺陷修产品代码，也勿放宽断言时限。

## 收口配方

spec 内局部 helper 包住易竞速导航：概览 dock 重开重试 ×3（`openOverviewSubtab`）、芯片菜单重选重试（`selectWorkspaceWithRetry`）。原则：**瞬态窗对策，非断言放宽**——轮内 30s/15s 超时门原样保留。若收口需改 `e2e/support/` 支撑层（如重播种级 renderer 复位），超出 spec 改动边界时如实上报待跟进，不越界顺手改。

## 反例边界

- 隔离 run 也红 = 用例自身问题，不属此类。
- 两形态（原始/迁移）同断言同红 = 存量红，归产品侧 follow-up，见迁移归因条目。

## 依据

批次二a tdp 三例轮转红、批次四a mode T3（拦截体实证 `.dswf-fb-item` picker 行）、批次五 sidebar T3——均隔离 run 绿；批次四a 序列态收口 helper 落地后 run1 的 3 例序列红全数转绿。见 `.forge/docs/proposals/e2e-fast-shared-launch/audit-xsq-batch.md`。
