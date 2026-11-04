---
title: TDD 红相证据先落盘再实现——纯逻辑状态机改动的正确验证次序
summary: >-
  纯逻辑状态机类提案实施时先证新用例红（转移矩阵放行前新边用例必红）、红相输出落盘留证，再实现转绿——红相证据是「测试确在验新行为」的可信凭证，实现后无法事后补证。
keywords:
  - TDD
  - 红相
  - 状态机
  - 先证红
  - 证据落盘
domainPath: .knowledge/lessons/
来源容器: blocked-verdict-restore-primitive
来源任务: 1.2（判例）；沉淀于 1.7
bug id: 无
id: tdd-red-phase-evidence-on-disk-first
status: unconfirmed
type: lessons
version_ts: '2026-11-05T00:00:00.000Z'
---

# TDD 红相证据先落盘再实现——纯逻辑状态机改动的正确验证次序

## 判例

- 1.2（submit.ts from 先验放行 + 理由必带校验）走 TDD 红相先行：先写新用例跑红、红相输出落盘 `logs/blocked-verdict-restore-primitive/1.2/001-red-phase/out.txt`，再实现转绿。该任务首提 success，零返工。
- 对照：同容器 1.1/1.3/1.5 未落盘过程证据，证据只在 submit 记录与 commit hash 中——复盘判「门禁证据落盘应成为每个 coding 任务的标准动作」。

## 教训

1. 改状态机/校验矩阵类纯逻辑时，新边/新拒绝格用例先跑红并留盘：红相输出证明用例在放行前确实失败，排除「测试恒绿」的假守护。
2. 证据落盘时点在实现前，实现后红相不可复现（代码已转绿），事后再想证已无从取证。
3. 长输出按轮次落 `{task_logs}/{事件子文件夹}/`，summary 只带路径。

## 出处

- `logs/blocked-verdict-restore-primitive/1.2/001-red-phase/out.txt`；retro-first-pass.md §4。
