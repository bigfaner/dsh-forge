---
title: 「无 X 断言」类核销结论必须穷尽全部测试面
summary: >-
  否定式核销（如「工具测试无 description 文本断言」）的检索面必须穷尽仓内全部测试树——根 tests/contract + 包内
  packages/*/tests/ + src/*.test.ts 全域 grep；只查单一树得出的「无」不可作为核销/放行依据。判例：bug
  39bc78c0。
keywords:
  - 否定核销
  - 测试面穷尽
  - grep 范围
  - 影响面判定
  - 核销口径
domainPath: .knowledge/conventions/
来源容器: prompt-scoping-and-desc-trim
来源任务: 交叉核验共识（三路评审 + 主会话处置记录）
bug id: 39bc78c0
id: negative-claims-exhaust-all-test-surfaces
status: unconfirmed
type: conventions
version_ts: '2026-11-05T00:00:00.000Z'
---

# 「无 X 断言」类核销结论必须穷尽全部测试面

## 规则

- 下「无 X 断言 / 无 X 引用」结论前，grep 范围至少覆盖：

  1. 根 `tests/contract/`；
  2. 全部包内测试 `packages/*/tests/`；
  3. 就地测试 `src/*.test.ts`（各包内同查）。

- 只查了部分测试树 = 否定结论不成立；「无」的证明义务天然重于「有」。

## 判例

「工具测试无 description 断言」核销只查根 tests/contract——pin-dispatch-injection 落在包内 tests/contract 的 3 例断言被漏（bug 39bc78c0），核销失真、3 例漏收口。

## 适用条件

- 任何以否定式断言为前提的核销、评审放行、影响面判定。

## 反例边界

- 肯定式结论不受穷尽义务约束：任一测试树命中一例即足以证伪「无」，无需继续扫全域。

## 来源锚点

- 容器 prompt-scoping-and-desc-trim（交叉核验共识：三路评审 + 主会话处置记录）；bug 39bc78c0。
- 配套口径：`gate-closure-sweeps-package-internal-contract-suites.md`（收口清点范围）。
