---
title: 阶段门只看任务类型不看依赖边：验证类卡位于实现链上游即成环
summary: >-
  task-loop 容器实现链阶段门规定验证类卡（test-run / validation-* /
  eval-*）须等同容器所有实现类卡终态才可领，且只看类型不看依赖边。拆解时若给位于实现链上游的卡标了 validation-* 类型（如「跑
  install
  更新锁文件并核验」），即与下游实现任务互相等待成环，循环空转至轮数上限后挂起。规避：拆解按「卡产不产出交付物」归类而非按「带不带核验性质」；已成环须改类型后
  pause_task 重建 claim 快照再 resume。
keywords:
  - task-loop
  - phase-gate
  - 阶段门
  - validation-code
  - 任务类型
  - 拆解
  - 死锁
  - to-tasks
  - gatedpending
  - 依赖环
id: task-loop-phase-gate-validation-code-to-tasks-gatedpending
status: unconfirmed
version_ts: '2026-11-28T02:02:39.902Z'
updated: '2026-11-28T02:02:39.902Z'
type: lessons
procedure: true
---
# 阶段门与任务类型的交互：验证类卡不得位于实现链的上游

## 现象

把某张任务标成 `validation-code`（或 `validation-ux` / `test-run` / `eval-*`）后，`dispatchTask resume` 立即挂起，报：

> N 张验证卡被容器实现链阶段门持有 K 轮（实现链未收口）

`task_stats` 显示 `gatedPending > 0`。循环空转数轮后挂起，等人工处置。

## 机制

task-loop 有「容器实现链阶段门」（`plugins/task-loop/host/domain/tasks/phase-gate.ts`）：

- **验证类 V** = `test-run`、`validation-code`、`validation-ux`、`eval-contract`、`eval-journey`（词表单点 `lib/api/src/labels.ts` 的 `VALIDATION_TASK_TYPES`）
- **实现类 I** = 全集 − V − `gate`
- **gate 单列**，不入 V 也不入 I——既不被门扣，也不扣别人
- 门谓词：**V 卡可领 ⇔ 同容器内所有 I 卡（非 fix/disc 谱系）均终态（completed/skipped）**

设计意图是「实现全部收口后才做验证」。它只看类型，不看依赖边。

## 成环条件

拆解时给一张卡标了 V 类型，而它在依赖图上位于某张 I 卡的**上游**：

```
I 卡(实现) ──前置──▶ V 卡(验证)
                 ▲
                 └── 阶段门：V 等 I 全终态
```

I 卡等 V 卡完成，V 卡等 I 卡全终态——环。循环机械等待至轮数上限后挂起；改类型后直接 resume 仍被拦（re-entry 复用旧 claim 快照，见 `suspended-loop-reentry-reuses-stale-claim-snapshot`）。

## 判例

容器 `plugins-remediation-m1-legacy-retirement`（2026-11-28）：

- 2.4「跑 pnpm install 更新锁文件并反查消失的依赖」因带「核验」性质被标 `validation-code`
- 它是 2.5 的前置，2.5 是 3.1 的前置，3.1–3.3 为阶段 C 实现任务
- → 3.x（I）等 2.4（V），2.4（V）等 3.x（I）全终态
- 改 2.4 为 `coding-fix` 后 `gatedPending` 归零

## 规避

**拆解期**（to-tasks 选 type 时）：

1. 先问「这张卡产不产出交付物」。产出文件改动（含锁文件、配置）的是实现，选 I 类类型；「验证」仅指不产出交付物、只对既有交付物做断言的动作。
2. 「带核验性质」≠ 验证类。一张卡既改东西又核验，按它**产出什么**归类。
3. 对每张 V 类卡检查：依赖图上它的下游有没有 I 卡。有 → 要么改类型，要么把依赖方向反过来（验证应在实现之后，这正是门的本意）。
4. 收口门（`gate`）不受此约束，可安全依赖全部实现任务。

**已成环时**：改类型 → `pause_task` 丢弃旧 claim 快照 → `dispatch_task resume`（只改类型不 pause 无效）。

## 与 to-tasks 技能的关系

to-tasks 的类型映射只列了类型值，未提阶段门。拆解者需自行对照 `VALIDATION_TASK_TYPES`。
