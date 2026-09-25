# T-eval-journey 执行记录

**日期**: 2026-09-25
**执行**: 主会话(MAIN_SESSION 任务,eval 编排铁律:主会话持有循环,scorer/reviser 均为子代理)
**配置**: target 850 / iterations 3(`forge config get eval.journey`;rubric 1150 分制 7 维度,维度下限 C/SP ≥120、其余 ≥90)

## 执行摘要

8/8 journey 全部过线,平均终分 1017/1150。5 条迭代 1 直接过门;3 条(explicit-sot-migration / out-of-repo-docs-root / dual-form-transition)因 Surface Fitness 低于 90 下限触发修订,迭代 2 全部过门(+155/+216/+228)。

编排方式:scorer 按批 ≤3 并发(防 429);主会话逐条门裁决(总分 ≥850 且全维度过下限);修订代理仅接收攻击点(单专家 qa,报告在 `testing/<journey>/eval/iteration-N.md`)。

## 结果表

| Journey | 初分 | 终分 | 迭代 | 门 |
|---|---|---|---|---|
| task-dispatch-execution-loop | 1015 | 1015 | 1 | PASS |
| preferences-tiered-override | 1021 | 1021 | 1 | PASS |
| proposal-board-browsing | 981 | 981 | 1 | PASS |
| session-native-ops-skill-addressing | 980 | 980 | 1 | PASS |
| stage-gates-cross-phase-context | 977 | 977 | 1 | PASS |
| explicit-sot-migration | 911(SF 68✗) | 1066 | 2 | PASS |
| out-of-repo-docs-root | 842(SF 62✗) | 1058 | 2 | PASS |
| dual-form-transition | 813(SF 54✗) | 1041 | 2 | PASS |

## 关键发现

1. 三条迭代 1 失败同一根因:web 必备派生 outcome(validation-error/session-expired)缺席或无映射注释。修订统一按 task-dispatch 兄弟惯例补 `<!-- surface-web required_outcomes 映射 -->` 注释或带理由 N/A(离线桌面壳无登录会话语义)。
2. 修订顺带修复的共性质量项:source: inferred 标注纪律、前置互斥化(拆分支/量化)、备份生命周期断言、deterministic 故障注入机制、harness vs 浏览器面断言口径拆分。
3. 残留(非阻断,已记录在各 iteration 报告):断言通道具体化、locale 无关锚点等 —— 属下游 /gen-contracts、/gen-test-scripts 的输入,非 journey 质量缺陷。

## 产物

- 汇总报告: `docs/features/dsh-forge-m3/testing/eval/eval-journey-report.md`
- 逐条评分报告: `testing/<journey>/eval/iteration-{1,2}.md`(5×iter1 + 3×iter1+iter2 = 11 份)
- 修订 journey 文档: 3 份(explicit-sot-migration / out-of-repo-docs-root / dual-form-transition 的 journey.md)

## 硬性验收

- [x] Eval report generated for all Journeys(8/8,无 eval-skipped,无解析失败)
