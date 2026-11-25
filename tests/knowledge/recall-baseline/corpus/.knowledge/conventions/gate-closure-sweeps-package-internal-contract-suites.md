---
title: 质量门收口必须覆盖包内 contract 套件
summary: >-
  pin 面（工具 description / 锚定面）变更的收口清点范围 = 根 tests/contract +
  packages/*/tests/contract 全部包内套件——只跑/只查根套件即放行会漏包内 pin 用例。判例：dispatchTask 描述改写后
  pin-dispatch-injection 3 例包内用例漏收口（bug 39bc78c0）。
keywords:
  - 质量门
  - contract 套件
  - pin 面
  - 包内测试
  - 收口清点
domainPath: .knowledge/conventions/
来源容器: prompt-scoping-and-desc-trim
来源任务: 交叉核验共识（三路评审 + 主会话处置记录）
bug id: 39bc78c0
id: gate-closure-sweeps-package-internal-contract-suites
status: unconfirmed
type: conventions
version_ts: '2026-11-05T00:00:00.000Z'
---

# 质量门收口必须覆盖包内 contract 套件

## 规则

- contract 套件的 pin 面不止根 `tests/contract` 一处：`packages/*/tests/contract` 同为 pin 面收口必查。
- 收口清点逐套件列明（根 + 各包），不以「根套件绿」代全量绿。

## 判例

prompt-scoping-and-desc-trim 改写 dispatchTask 描述后，pin-dispatch-injection 的 3 例包内 contract 用例漏收口（bug 39bc78c0）——核销理由「工具测试无 description 断言」只查了根套件，包内断言面未入清点。

## 适用条件

- 任何改工具 description / pin 锚定面（system prompt 面、工具注册面）的变更收口。

## 反例边界

- 纯 core 状态层改动、不触 pin 锚定面的变更不在此收口范围。

## 来源锚点

- 容器 prompt-scoping-and-desc-trim（交叉核验共识：三路评审 + 主会话处置记录）；bug 39bc78c0。
- 配套口径：`negative-claims-exhaust-all-test-surfaces.md`（否定式核销的检索面穷尽义务）。
