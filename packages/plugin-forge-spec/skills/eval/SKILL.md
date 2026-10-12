---
name: eval
description: 按评分细则给 Journey 或 Contract 文档集打分——内联评分-守门-修订循环，报告落 testing/<journey>/.eval-report.md；低于目标的工件阻塞下游管线阶段。
user-invocable: false
---

<!--
  M3 eval survivor list (OQ#3 — decided in task 3.2, 2026-10-07):
  KEPT: journey, contract (task types eval-journey/eval-contract exist; gen-contracts and
        gen-test-scripts gate on this skill's report).
  CUT:   proposal / prd / design / ui (no M3 consumer — no task types, no auto-run config,
         chain does not wire them); consistency (prerequisite manifest.md is dead in M3);
         validate-code / validate-ux (validation-* dispatch templates are self-contained —
         M2/M3 precedent: template-driven, not skill-driven).
  Architecture trim: scorer/reviser subagent orchestration removed — worker tool faces
  deny delegation, so the loop runs inline in the invoking session. Rubrics inlined below.
-->

# 评审（eval）

按该类型的评分细则给文档质量打分，以目标分守门，允许时修订，写出报告。M3 幸存两类：
`journey` 与 `contract`。

## 参数

| 参数 | 缺省 | 说明 |
|---|---|---|
| `--type` | 必填 | `journey` 或 `contract` |
| `--target` | 细则目标分（journey 975 / contract 935） | 通过阈值；派发模板钉 850 |
| `--iterations` | 1 | 修订循环上界；交互式可用可升到 3 |

## 必备文档

| 类型 | 目标 |
|---|---|
| `journey` | `testing/<journey>/journey.md` |
| `contract` | `testing/<journey>/contracts/step-<N>-<action>.md` 全部 |

缺失 → 呈报缺失工件并停止；告知用户由哪个技能产出。

## 上下文模式

- **派发任务（eval-journey / eval-contract）**：只评分——派发简报禁止修改被评文件。
  评一次、写报告；低于目标则本任务以发现清单结算 blocked（返工由 fix 链承接）；
  此处不得自行修订。
- **交互会话**：内联循环——评分 → 守门 → 修订（仅被评文档）→ 复评，至多
  `--iterations` 次；达到/超过目标分即提前停止。

循环始终在被调会话内内联运行（worker tool 面拒绝委托；不假设 subagent 编排）。

## 魔鬼代言人速查

评分前先扮演反方——**找扣分理由是本分内工作，不是给作者面子**：

- **先找反例再给分**：逐维度先列"这条为什么可能不及 min"，列不出反例才给满分档。
- **质疑事实对齐**：每个步骤/期望都问一句"PRD/手册里真有这条吗？"——臆造行为
  （invented behavior）一律扣，不因写得合理而放过。
- **追问语义纯度**：见到 regex、选择器、框架断言字样直接扣——"看起来像实现"与
  "是实现"同罪。
- **挤前置条件的重叠**：逐 Outcome 试构造一个同时满足两条前置条件的系统状态；
  构造得出即排他性失分。
- **宁低勿高**：拿不准的维度取低档并在发现清单里写明理由——评分诚实条款禁止
  把不及 min 的维度凑到达标。

## Rubric: journey (1150 · target 975 · pass = total ≥ target AND every dimension ≥ min)

| 维度 | 分值 | 下限 | 核查内容 |
|---|---|---|---|
| 完整性 | 200 | 120 | kebab-case 名称 + 有效且论证过的风险级；每步有动作 + 有序序列内 ≥1 条 happy-path 结果；按表面所需覆盖 happy path 之外的边界/错误结果 |
| 语义纯度 | 200 | 120 | 结果用自然语言（无 regex/选择器/断言调用）；前置条件声明式（状态而非搭建过程）；步骤内无实现耦合 |
| 前置条件排他性 | 150 | 90 | 步内各结果经前置条件可分辨、不重叠 |
| 事实对齐 | 150 | 90 | 步骤/期望与其引用的 PRD/用户故事一致；无臆造行为 |
| 表面适配 | 150 | 90 | 步骤符合声明的表面类型；表面约定被遵守 |
| 内部一致性 | 150 | 90 | 不变式相对步骤成立；边界用例引用真实 happy-path 步骤；无自相矛盾 |
| 流程覆盖 | 150 | 90 | 用户目标端到端达成；步骤之间无未解释的缺口 |

## Rubric: contract (1100 · target 935 · pass = total ≥ target AND every dimension ≥ min)

| 维度 | 分值 | 下限 | 核查内容 |
|---|---|---|---|
| 完整性 | 150 | 90 | 每 Outcome 六维度齐备；含 Journey 不变式节 |
| 语义纯度 | 200 | 120 | 描述符为自然语言；无 regex/框架断言泄漏 |
| 前置条件排他性 | 150 | 90 | 逐步 Outcome 两两互斥 |
| 事实对齐 | 150 | 90 | 锚点与期望同所引手册/源真值一致 |
| 表面适配 | 100 | 60 | 断言按表面类型措辞（cli 用退出码/stdout、api 用状态码/payload、web/mobile 用视觉） |
| 内部一致性 | 150 | 90 | 状态维度可组合；不变式与 journey 一致 |
| 锚点完整性 | 100 | 60 | 有手册时锚点在位；与步骤匹配或显式留空——绝不臆造 |
| Fixture 规格 | 100 | 60 | 每 Outcome 的前置条件带声明式 fixture_spec 且 ≥1 实体 |

评分诚实：逐维度从文档内证据给分；绝不把不及格维度凑整到目标分——任一维度低于
min 即判不通过，与总分无关。

## 报告

报告写到 `testing/<journey>/.eval-report.md`（此文件就是 gen-contracts /
gen-test-scripts 核对的 gate 工件）：总分带量表、逐维度表（分值/min/状态）、带严重度
与文档位置引用的发现清单、结果行（`PASSED` / `FAILED (below target|dimension <min>)`），
修订过的运行附分数演进。然后在会话/任务输出中呈报结果。

## 下一步

journey 达标 → `gen-contracts`；contract 达标 → `gen-test-scripts`。
交互模式下低于目标 → 按循环修订复评；任务模式下低于目标 → 携发现清单结算 blocked。
