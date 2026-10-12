---
name: quick-tasks
description: 突击直挂入口——单轮内把一行需求变成提案（createProposal mode=blitz）加可派发任务清单（addTask source=proposal）；无 PRD、无设计、无阶段门，免 eval。
---

# 快速突击（quick-tasks）

一次性突击规划：从一行需求出发，单轮内完成提案注册（proposal）+ 直挂任务清单（task list），全程走管线工具。这是远征链（expedition）的反面：无 PRD、无设计文档、无阶段门。执行期的门禁纪律不豁免——worker 照样 compile/lint/test 并如实结算；豁免的只是规格仪式。

<HARD-GATE>
突击语义——以下均为硬规则，创建即记录：
- **一律 `mode: "blitz"`。** 本技能创建提案时写入血缘，绝不让 mode 悬空。
- **整数 local id，无阶段门。** 任务用 `addTask` 自动分配的纯数字 id——不要创建
  分阶段的 `doc-summary` 或 `gate` 任务（那是远征拆解的形态），也不要自造 `T-*`/
  阶段前缀 id。
- **免 eval。** 不建 `eval-journey` / `eval-contract` 任务，不排 test 管线链
  （gen/eval 阶段仅远征使用）。工作确需表层验证时允许一个普通 `test-run` 任务。
- **绝不建 feature 行。** 用户接受提案后直接进任务阶段——绝不在此调用
  `registerFeature`。
- **绝不跨容器等待。** 任何 `task_desc` / `acceptance_criteria` 不得写"等另一容器
  的任务落地"——容器相互独立，管线看不见、守不住也恢复不了这种等待（只会退化成
  worker 级阻塞加人工裁决）。后续工作确需另一容器的更早交付物（同文件、分层产出）
  时，停在建任务之前，把选择交给用户：并入同一容器，或串行派发（前一个容器结算后
  再注册依赖容器）。绝不创建等待型任务。
</HARD-GATE>

## 第 0 步：补全步

范围 / 影响 / 边界不明时，先向用户问清一轮（改哪些包、影响哪些调用方、边界在哪），再动手建提案与任务。不拿模糊范围猜任务——一轮问答的成本远低于事后返工。

## 第 1 步：读请求

拿下一行需求加用户给的上下文，诚实判断适配性：突击适合有界、理解充分的需求。若需
要 PRD、设计或规格资产才能定夺，明说并建议远征路线（brainstorm）——由用户裁决，不
悄悄吞下超界范围。

## 第 2 步：建提案

```
createProposal { slug: "<kebab-slug>", title: "<short title>", mode: "blitz" }
```

状态初始为 `draft`（默认）。`rel_path` 可选——仅在提案文档已存在或用户要求时附加；
一行需求不需要 `proposal.md` 即可推进。

### 五段突击提案模板（不含风险段，60 行指导值）

用户要求成文时，`proposal.md` 按以下五段写作：

1. **问题**：现状哪里不行，一段说清，避免叙事膨胀。
2. **方案**：优先 mermaid 图（`flowchart` / `sequenceDiagram`）表达结构与流程，
   文字只做精简补充。
3. **改动范围**：按包粒度列出要动的文件/模块。
4. **影响范围**：改动波及的运行时面/调用方/下游，与改动范围分开列。
5. **验收**：可客观核验的验收点清单。

不含风险与缓解段——那是远征 brainstorm 的保留段。

## 第 3 步：拆任务

目标导向拆解原则：**每个任务完成一个清晰、明确的目标**——一句话能说清该任务交付什
么、怎样算完成；说不清就说明还没拆到位，继续拆或先回补全步。

从请求推导扁平任务清单：

- 每个可独立验证的产出一个任务；1–2h 量级；**每任务 ≤6 条验收标准**（更多 = 按功能
  边界拆）。
- `acceptance_criteria` = 可客观核验的条目——它们构成提交时的证据门，每条都必须能
  由真实运行验证。
- 类型按**产出物**归入封闭词表：可编译或可运行 → `coding-feature` /
  `coding-enhancement` / `coding-cleanup` / `coding-refactor`；仅不可编译产物
  （`.md`、`.yaml`、`.json`、`.sql`……）→ `doc`。表层验证 → `test-run`。绝不手工
  指派 `coding-fix`（仅修复链生成），也绝不用 eval/gen 类型（见上免 eval）。
- `depends_on` = 同提案内前置任务的 local id；接住每次 `addTask` 返回的 `local_id`
  再给后续任务接线。默认线性，仅在明确并行时才分叉。
- 优先级：P0 阻塞其余；P1 对应核心诉求；P2 打磨。

### 方法论速查（拆解前快问）

- **KANO**：区分基本需求/期望需求/兴奋需求——先保基本，砍兴奋，防止范围膨胀。
- **MoSCoW**：Must / Should / Could / Won't 排任务——P0=Must、P1=Should、
  P2=Could，Won't 本轮明说不做。
- **帕累托**：找贡献 80% 价值的 20% 任务——首批只派高杠杆项。
- **XY 快问**：用户要的是 X，别拿他指定的方案 Y 当需求——建任务前确认真实目标。

## 第 4 步：建任务清单

每次调用都携带提案容器对：

```
addTask { source_kind: "proposal", source_slug: "<proposal slug>",
          title: "...", type: "...", priority: "P1", estimated_time: "1-2h",
          task_desc: "...", acceptance_criteria: ["...", "..."],
          depends_on: ["<prior local_id>"], vars: ["KEY=VALUE"] }
```

创建后做量级审计：多动词标题拆分、验收标准跨无关领域的拆分、请求的每个验收点至少
被一个任务覆盖。

## 第 5 步：汇报交接

汇报建好的任务图（任务键、类型、依赖）与提案的自然身份。裁决权在用户：用户接受
（经提案 UI 或会话内明示）后由 `transitionProposal` 记录——接受后任务即可经
run-tasks 直接派发，中间没有 feature 阶段。

## 文档风格公约

- **mermaid 优先**：结构与流程用图表达，文字做补充而非替代。
- **文字精简**：一段一个含义，无歧义短语，不留废话。
- **不留调整修复叙事**：文档写最终态，不写"原来如何、后来改成什么"的过程史。

## 输出清单

- [ ] 提案以 `mode: "blitz"`（draft）注册
- [ ] 每个任务带 `source_kind: "proposal"` + 提案 slug
- [ ] 仅整数 id；零 `doc-summary` / `gate` / eval / gen 任务
- [ ] 每任务 ≤6 条 AC；每条 AC 可客观核验；每任务一个清晰目标
- [ ] 依赖构成 DAG（环会被服务端拒绝）
- [ ] 任何 task_desc / AC 中零跨容器引用（改为合并或串行）
- [ ] 未创建或暗示 feature 行
