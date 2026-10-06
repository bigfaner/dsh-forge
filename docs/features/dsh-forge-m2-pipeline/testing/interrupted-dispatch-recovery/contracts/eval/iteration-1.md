# Contract Eval Report — interrupted-dispatch-recovery / iteration 1

- **Eval type**: contract | **Surface**: web | **Date**: 2026-10-07
- **Scored files**: `contracts/step-1-reclaim-interrupted-task.md`, `contracts/step-2-receive-resynthesized-brief.md`, `contracts/step-3-execute-and-settle.md`
- **Cross-checked against**: `../journey.md`（不变量）· `.forge/fact-table.json`（M2_CLAIM_REENTRY / M2_CLAIM_GUARDS / M2_CLAIM_Z1_EXIT / M2_CLAIM_RECORD_SHAPE / M2_LINKS_WRITE_SOURCE / M2_DISPATCH_PROMPT_COMPOSITION / M2_SUBMIT_INPUT_VALIDATION / M2_SUBMIT_FROM_GATE / M2_AGENT_TRANSITION_MATRIX / M2_RUN_TASKS_RECOVERY_BRIEF / M2_EVENT_PUSH_CHAIN）· `design/page-map.md`（锚点）· `design/er-diagram.md` + `design/schema.sql`（实体模型）· 源码 `packages/core/src/forge/tasks/{claim,state-machine,submit,prompt/compose}.ts`、`packages/plugin-forge/skills/run-tasks/SKILL.md`
- **Verdict**: **857 / 1100 — 未过 935 门**（各维度均高于最低阈值，总分不足）。需要修订后重评。

---

## Phase 1 — Reasoning Audit（评分前独立判断）

**A1（严重）Step 3「manual-disposal-claim-rejected」对 blocked 情形断言错误。**
Preconditions 收录 blocked（"如人工置 blocked 或 skipped——状态已非 in_progress"），Output 断言 "状态机转移校验拒绝非法领取（from 不匹配——agent 面矩阵：非 pending/blocked 态不可转 in_progress）"。但 `state-machine.ts:24` 明确 `blocked: ['in_progress', 'pending']`，`claim.ts:209-232` 对 blocked 任务显式 taskRef claim 会**成功转移 blocked→in_progress**。Output 括号内规则本身承认 blocked 可转 in_progress，与该 Outcome 的拒绝前提自相矛盾——对 blocked 半边前提集，此 Outcome 事实上是错的（仅 skipped/suspended/completed/rejected 会被拒）。

**A2 Step 1「record-present-no-misredispatch」的判别状态无数据模型依据。**
"任务 in_progress 且执行记录在场（executor 正常执行中，record 未缺失）"——按 run-tasks SKILL.md Step 3 Verify 与 M2_RUN_TASKS_RECOVERY_BRIEF，"record" = submit 结算行，且 **in_progress ⟺ record 缺席**；record 在场 ⟺ 已结算（completed/blocked）。不存在"in_progress 且执行记录在场"的库态；fixture 字段 `executionRecord: 在场` 在 task_records 六动词（add/claim/submit/auto-block/auto-restore/transition）中无对应行类型。且"executor 正常执行中"+"dispatcher 外环调 claimTask"违反派发铁律"Dispatch is a blocking call"（执行中外环阻塞在 Step 2，不会去 claim）。Journey 1b 原样继承此措辞，但 Contract 层经代码侦察应当锐化而未锐化。

**A3 Step 2 success 前提对冲、输出无条件。**
Preconditions "任务库状态在中断窗口内**可能**已变化" vs Output "digest 新值（与中断前简报相异可判）"。`prompt/compose.ts` 为纯函数（入参 slug/localId/type/priority/coverage/phaseSummary/blockers/markers，**无任何时间变量**）——库态未变则重合成简报逐字节相同、digest 相同。前提不强制产出；fixture 也未声明制造状态增量（如某前置变终态、PHASE_SUMMARY 出现）的约束。下游按此规格生成的测试在静态状态下会得到相同 digest 而失败。

**A4 Step 2 两 Outcome 前提重叠**：success 的 "重入领取已发生（reclaimed=true）" 在 repeated-interruptions 场景同样成立；区分仅靠中断次数，而两者前提均未声明次数判别。

**A5 三个 Contract 的 web 锚点全部为空**（`page: ""`），而 page-map.md 存在 6 条锚目；Step 3 Side-effect 引用 web 面"概览即时见 completed"（对应 `dswf-overview`）却未锚定。

**A6 Step 3 缺 submit 输入校验边界**（ERR_SUMMARY_REQUIRED / ERR_REASON_REQUIRED，事实 M2_SUBMIT_INPUT_VALIDATION 在场）与**恢复跑校验失败→blocked** 边界（run-tasks SKILL.md："If verification fails, submit `result=blocked`"；"recovery run again ends without a submit record → count as failed cycle"）。

**A7 Fixture 漂移**：伪字段名（`verbs`/`claimRows`/`executionRecord`——schema 实际列为 `verb`）；Task 的 parent 声明为 Project，而 ER 模型为 `FEATURES ||--o{ TASKS`（feature_id 显式 FK），Feature 实体缺席所有 fixture_spec，但播种任何 Task 都必须先有 Feature 行（FK NOT NULL + claim 对 feature 缺席 fail-loud）。

**A8（公允记录）**：事实对齐面整体质量高——reclaimed=true / 重入行 from/to 空 / links 幂等不增行 / 写后事件发射（重入也发射、Z1 不发射）/ ERR_DEPENDENCIES_UNMET 带 unmet 清单 / 四段构成与 digest 口径 / VERIFY-ONLY 恢复纪律，均与代码和事实表吻合；两个 inferred Outcome 带准确代码行引证；跨步骤状态衔接（reclaimed→简报→结算）一致。

---

## Phase 2 — Rubric 评分

### 1. Completeness（完整性）— 135 / 150

| 子项 | 得分 | 说明 |
|---|---|---|
| 四维非空 | 50/50 | 全部 9 个 Outcome 的 Preconditions/Input/Output/State 均非空，Side-effect 显式（缺省 "none"）。逐一核验无缺。 |
| Journey Invariants | 50/50 | 三份文件均有 `## Journey Invariants` 且各 4 条，与 journey.md 逐字一致。 |
| 覆盖 happy + 派生边界 | 35/50 | journey 三条 edge（1b/2b/3b）全覆盖，Step 1 另派生 2 个风险 Outcome。扣分：(a) Step 3 缺 submit 输入校验边界——web 面 validation-error 被裁定 N/A（"submitTask = agent 面 tool 调用，无 web 表单"），但 tool 面等价边界真实存在（M2_SUBMIT_INPUT_VALIDATION："result=success with empty summary -> ERR_SUMMARY_REQUIRED"），是 validation-error 精神应落点处，-10；(b) 缺恢复跑校验失败边界——SKILL.md 明确定义 "verification failure -> result=blocked"（不重做、走 fix 链），Step 3 Preconditions 自己引用了 VERIFY-ONLY（"恢复简报指示 VERIFY-ONLY——不重做"）却不给其失败分支建 Outcome，-5。 |

### 2. Semantic Purity（语义纯度）— 175 / 200

| 子项 | 得分 | 说明 |
|---|---|---|
| 自然语言、无 regex/选择器 | 65/80 | 无 regex/CSS/XPath/框架断言调用。但 State 值下沉到存储层细节："tasks.task_status = completed"（step-3）、"重入 claim 记录的 dispatch_digest 列 = 新值"（step-2）、"task_records 新增 claim 重入行（from/to 为空……）"（step-1）——列级耦合描述"落在哪"而非"产出什么"。Output 中 "（data 带未满足前置清单）" 引用 RPC 错误信封字段。扣 15。 |
| 前提为声明式状态 | 60/60 | 全部 Outcome 前提均为声明式状态描述，无 setup 指令式写法。 |
| 无实现耦合 | 50/60 | claimTask/submitTask 为旅程既定的公开动词（可接受）；扣分项为列名级内部细节（task_status / dispatch_digest / from/to / session_id 列）与表名内嵌进维度值。扣 10。 |

### 3. Precondition Exclusivity（前置条件互斥性）— 120 / 150

| 子项 | 得分 | 说明 |
|---|---|---|
| 同 Step 内前提互异 | 40/60 | Step 1 四个 Outcome 以（record 缺失？/前置终态？/taskRef 模式/会话归属）清晰分区 ✓；Step 3 以 in_progress vs 非 in_progress 干净互斥 ✓。Step 2 的 success 与 repeated-interruptions-idempotent 一对重叠："重入领取已发生（reclaimed=true）"在多次中断场景同样为真，判别需数中断次数而前提未声明（fixture 也同样只写 min_count 2）。按 -20/模糊对计。 |
| 前提足以唯一选定 | 40/50 | Step 1 outcome 2 的判别量（"执行记录在场"且 in_progress）不对应任何真实库态（见 A2）——下游 agent 无法构造出只命中该 Outcome 而不命中 interrupted 态的数据状态（两态在 task_records 层面不可区分）。扣 10。 |
| 边界 Outcome 显式给触发条件 | 40/40 | prereq-regression（"中断期间某前置依赖状态回归非终态"）、foreign-session（"挂接于另一会话…无就绪 pending"）、manual-disposal（"中断期间任务被人工转移"）均显式。 |

### 4. Fact Alignment（事实依据）— 95 / 150

| 子项 | 得分 | 说明 |
|---|---|---|
| 事实声明可溯源 | 50/60 | 主体断言全部对得上事实表与代码（见 A8）。扣分：outcome 2 的 "executionRecord: 在场（executor 正常执行中的活跃记录）" 无事实/模式依据且未标 UNKNOWN——事实表的口径是 record 在场 ⟺ 已结算态（M2_RUN_TASKS_RECOVERY_BRIEF："Record present (settled status) -> loop proceeds normally"），-10。 |
| inferred 声明带规则依据 | 35/50 | 两个派生 Outcome 有 `source: inferred` + reasoning 且代码行引证准确（claim.ts:131/15-17/187-189 均核实无误）✓。但 rubric 要求注明**触发派生的 required_outcomes 规则**；web 两规则（validation-error/session-expired）是以文件头注释整体裁定 N/A，未与具体 Outcome 关联，派生依据是风险推理而非表面规则。扣 15。 |
| 无未分类幻觉断言 | 10/40 | **3b 为未分类且被事实反驳的断言**：对 blocked 任务 claimTask 会被拒——M2_AGENT_TRANSITION_MATRIX（blocked→in_progress 合法 agent 边）与 claim.ts 实现均反驳；该 Outcome 无 fact 引用、无 inferred 注记。按幻觉断言 -30。 |

### 5. Surface Fitness（Surface 适配）— 80 / 100

| 子项 | 得分 | 说明 |
|---|---|---|
| 表面强制派生 Outcome | 30/40 | validation-error / session-expired 在三份文件均有显式裁定注释（"web-surface-required adjudication: … N/A — claimTask = agent 面 tool 调用，无 web 表单"）——已"考虑"。扣分：Step 3 的 N/A 裁定无视 tool 面既存输入校验边界（ERR_SUMMARY_REQUIRED / ERR_REASON_REQUIRED），validation-error 的精神落点被漏掉。扣 10。 |
| 表面得当语言 | 25/35 | 无错误表面语言（无 DOM 选择器混入）✓，但整套维度值为 tool 调用/审计表语言，web 面（用户交互、页面元素）词汇几乎缺席——唯一 web 面引用 "写后事件发射（概览即时见 completed）" 也未展开成页面断言。对声明的 web surface 而言适配偏弱（根因是旅程本身为 agent-tool 面，裁注已解释，酌情扣 10）。 |
| TUI 超时（非 TUI） | 25/25 | 不适用，满分。 |

### 6. Internal Consistency（一致性）— 110 / 150

| 子项 | 得分 | 说明 |
|---|---|---|
| 不变量在每个 Contract 成立 | 30/60 | 四条 journey 不变量无一被契约行为违反（Step 3 落 completed 是既定结算而非重入效应）。但两处 Outcome 内部失洽：(a) 3b 自相矛盾——前提收 blocked，Output 自引规则 "非 pending/blocked 态不可转 in_progress" 却同时断言对 blocked 拒绝，-20；(b) Step 2 success 前提 "可能已变化"（或然）支撑不了 Output "digest 新值……相异可判"（必然），-10。 |
| 跨 Contract 状态引用一致 | 40/50 | reclaimed=true（step 1 产出）→step 2 前提；"重派简报已领取（digest 新值）"（step 2 产出）→step 3 前提；TaskRecord 计数衔接吻合 ✓。扣分：文件尾 `## Fixture Specification` 汇总块与 Outcome 级 fixture_spec 漂移——step-3 尾块仅约束 `verb: "claim"`，而 3b 需要 transition 行（"claim（中断前）+ transition（人工处置行，actor='ui'）"）；同列多名（verb/verbs/claimRows）。扣 10。 |
| 前提可由前步 State 达成 | 40/40 | 逐步核验可达（含边界态变体）。 |

### 7. Anchor Integrity（锚点完整性）— 70 / 100

Handbook `design/page-map.md` 存在（6 锚目：dswf-overview / dswf-doc / 任务详情抽屉 / 转移状态对话框 / 会话头挂接 pill 行 / 注册表单派生行），本维度正常计分。

| 子项 | 得分 | 说明 |
|---|---|---|
| 锚点字段完整 | 10/40 | 三份文件 `anchors.web.page` 均为空串（`page: ""`、`last_anchor_sync: ""`）。空值 = 无效值：3 × (-10)。Step 3 Side-effect 引用的 "概览" 即 `dswf-overview` 锚目，属可锚定而未锚定；Step 1 写挂接表（会话头 pill 数据源）亦可锚 `会话头挂接 pill 行`。 |
| 锚点值匹配 handbook | 30/30 | 无非空值，故无错配。 |
| Handbook 内部一致 | 30/30 | 6 页面各具独立注册缝，无重复路由/冲突导航；"Route Guard 不适用——dock tab 注册制" 与各条目自洽。 |

#### Missing Anchor Fields

| Contract | 缺失/空置字段 | 期望值（依据 handbook） |
|---|---|---|
| step-1-reclaim-interrupted-task.md | `page`（空）、`last_anchor_sync`（空） | `dswf-overview` 或 `会话头挂接 pill 行`（挂接表写入的可观察面） |
| step-2-receive-resynthesized-brief.md | `page`（空）、`last_anchor_sync`（空） | 无直接页面交互，若维持空置须补 N/A 裁注（类比 web-surface-required 裁定） |
| step-3-execute-and-settle.md | `page`（空）、`last_anchor_sync`（空） | `dswf-overview`（"概览即时见 completed" 的断言面） |

#### Handbook Conflicts

无——page-map.md 未发现同页异径/冲突定义。

### 8. Fixture Specification（前置数据声明）— 72 / 100

| 子项 | 得分 | 说明 |
|---|---|---|
| 实体完整性（否决项） | 40/40 | 契约文本引用的实体（Project/Task/TaskRecord/TaskSessionLink/TaskEdge）均在相应 Outcome 的 fixture_spec.entities 中声明，且与 ER 模型实体一一对应（projects/tasks/task_records/task_session_links/task_edges）。Feature 未被契约文本引用，按否决项字面（"Preconditions/Input/State 引用而 entities 缺席"）不触发否决——但见下一行。 |
| 关系与约束覆盖 | 15/35 | (a) Task 的 parent 声明为 Project（"relationship_type: has_many, parent_entity: Project"），而 ER 为 `FEATURES ||--o{ TASKS`（feature_id 显式 FK）；Feature 为播种 Task 的必备前置实体却在全部 fixture_spec 缺席——关系声明错挂父实体/跳过中间实体，-10。(b) field_constraints 使用非 schema 伪字段（`verbs`、`claimRows`、`executionRecord`——实际列为 `verb`，且无 executionRecord 列），-10。 |
| 最小数据量 | 17/25 | step-2 repeated-interruptions 声明 TaskRecord min_count 2，而场景为 "连续多次中断……digest 逐次可判新值"——演示 ≥2 轮恢复、各带相异 digest 需 ≥3 行 claim（或显式声明测试运行期增行）。2 行只够再演示一轮。-8。 |

---

## Cross-Dimension Coherence

- 3b blocked 矛盾同时在 Fact Alignment（-30，外部事实反驳）与 Internal Consistency（-20，Outcome 自引规则自相矛盾）计扣——两处为同一缺陷的两个面，均已单独引用原文。
- validation-error 裁定（Surface Fitness -10）与缺失 submit 校验边界（Completeness -10）同源：N/A 裁定漏掉 tool 面等价物。
- 锚点空置（Anchor -30）与表面语言薄弱（Surface -10）同根因：journey 为 agent-tool 面而被标 web surface。修订的正解不是硬造 DOM 断言，而是把确有 web 可观察面的 Step 3（概览 tab）与 Step 1（挂接 pill 数据源）锚到 handbook 条目，并为纯 tool 步骤补锚点 N/A 裁注。

## Phase 3 — Blindspot Hunt（rubric 未覆盖处）

1. **[blindspot] digest 新值断言按当前规格不可靠成立**——step-2 Preconditions "任务库状态在中断窗口内可能已变化（动态信息按当前库状态取数）" vs Output "digest 新值（与中断前简报相异可判）"。`compose.ts` 纯函数无时间变量，库态不变 ⇒ digest 相同；事实表 M2_DISPATCH_PROMPT_COMPOSITION 括注 "re-synthesis on re-entry yields new digest" 相对代码本身过强。契约必须补**强制增量条件**（如"某前置在中断窗口内变终态"或"PHASE_SUMMARY 首次注入"）并落进 fixture 约束，否则下游测试天然不稳。
2. **[blindspot] 无界重入与派发纪律的止步规则脱节**——step-2 "每次均无状态转移（仍 in_progress，reclaimed=true），每次返回重合成简报" 未与 run-tasks 铁律相交："If the recovery run again ends without a submit record, count it as a failed cycle — do not loop recoveries" + "3 consecutive failed cycles → STOP"。按此契约生成的执行器测试会违反真实派发纪律（无上限循环恢复）。
3. **[blindspot] outcome 2 把技能层纪律归到工具层行为**——"Input: dispatcher 外环调 claimTask 尝试领取 / Output: 按 record 在场判定非中断态"：claimTask 从不检查 record 在场（claim.ts：解析→守卫→合成→重入或转移），判定住在外环 Verify（按状态）。对该 Input 写针对 claimTask 的测试实际会走 outcome 1 的幂等重入路径——Outcome 不可按字面测试。
4. **[blindspot] 本会话盲选重入路径无 Outcome**——事实 M2_CLAIM_REENTRY："Blind claim (no taskRef) only re-enters an in_progress task already linked to THIS session (latest link preferred)"。dispatcher 会话重启失忆后（拿不出 taskRef）的真实恢复路径恰是它；契约只覆盖显式 taskRef 重入（step 1）与他-session 不领取（outcome 4），中间这条主路径缺位。
5. **[blindspot] main-session 任务变体未约束**——SKILL.md："MARKERS: main-session tasks are the exception — execute the brief in the dispatching session itself"。main-session 任务的中断恢复无 executor 子会话，派发模型不同；fixture 未对 mainSession 字段做任何约束。

---

## Final Score

| 维度 | 得分 | 门槛 | 结果 |
|---|---|---|---|
| Completeness | 135/150 | 90 | 过 |
| Semantic Purity | 175/200 | 120 | 过 |
| Precondition Exclusivity | 120/150 | 90 | 过 |
| Fact Alignment | 95/150 | 90 | 过（贴线） |
| Surface Fitness | 80/100 | 60 | 过 |
| Internal Consistency | 110/150 | 90 | 过 |
| Anchor Integrity | 70/100 | 60 | 过 |
| Fixture Specification | 72/100 | 60 | 过 |
| **Total** | **857/1100** | **935** | **未过** |

## Revision Priorities（按分值影响排序）

1. **修 3b**：把 blocked 从拒绝前提中拆出（blocked 显式 claim 会成功转移回 in_progress——可另立 Outcome 或改前提为 skipped/suspended/completed/rejected），消除 Output 自引矛盾（+50 上限：Fact 30 + Consistency 20）。
2. **修 outcome 2 判别态**：改为事实口径（executor 已正常结算/外环 Verify 见终态 → 不重派），或明确定义"执行记录"所指行类型（+10 Exclusivity、+10 Fact）。
3. **补 Step 3 两个边界 Outcome**：submit 输入校验（ERR_SUMMARY_REQUIRED/ERR_REASON_REQUIRED）与恢复跑 VERIFY-ONLY 失败→result=blocked（+10~15 Completeness，+10 Surface）。
4. **锚点落值或裁注**：step-3 → `dswf-overview`；step-1 → 挂接 pill 行或裁注；step-2 补 N/A 裁注；填 `last_anchor_sync`（+30 Anchor）。
5. **Step 2 success 前提补强制增量**并把 digest 相异条件写进 fixture 约束（+10 Consistency，测试可行性）。
6. **Step 2 两 Outcome 前提加次数判别**（"首次重入" vs "≥2 次中断"）（+20 Exclusivity）。
7. **Fixture 修正**：Feature 实体补入并改挂 Task 父关系；伪字段名改 schema 实列（verb）；repeated 场景 min_count ≥3；inferred Outcome 补 required_outcomes 裁定关联；尾块与 Outcome 级 spec 对齐（+20+ Fixture/Fact）。
