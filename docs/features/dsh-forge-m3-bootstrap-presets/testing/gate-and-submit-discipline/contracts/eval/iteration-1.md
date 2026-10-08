# Contract Eval Report — gate-and-submit-discipline / iteration 1

- **Scorer**: adversarial contract scorer (rubric `skills/eval/rubrics/contract.md`, 1100 pts, target 935)
- **DOC_DIR**: `docs/features/dsh-forge-m3-bootstrap-presets/testing/gate-and-submit-discipline/contracts/`（3 files, 13 Outcomes）
- **Surface**: web（rule `gen-journeys/rules/surface-web.md`；handbook `design/page-map.md` 在场）
- **Date**: 2026-10-08；ITERATION = 1（无前轮报告）

## Verdict

**SCORE: 952/1100 — PASS**（target 935；全维度过门槛）

| Dimension | Score | Threshold |
|---|---|---|
| Completeness | 147/150 | 90 ✓ |
| Semantic Purity | 182/200 | 120 ✓ |
| Precondition Exclusivity | 120/150 | 90 ✓ |
| Fact Alignment | 121/150 | 90 ✓ |
| Surface Fitness | 78/100 | 60 ✓ |
| Internal Consistency | 142/150 | 90 ✓ |
| Anchor Integrity | 80/100 | 60 ✓ |
| Fixture Specification | 82/100 | 60 ✓ |

---

## Phase 1 — Reasoning Audit

结构忠实度良好：旅程 3 个 happy step + 4 个 edge（1b/1c/2b/3b）在合约中一一对应（success / ac-evidence-missing / invalid-transition-rejected / nonconforming-message-rejected / gate-failure-fix-chain），无漏步；每份合约含 4 条旅程不变量逐字复述；另有 6 个推断性边界 Outcome（summary-missing-rejected / blocked-reason-required / gate-args-all-or-none / gate-summary-missing / blocked-submit-skips-doors / task-not-found），全部带 `<!-- source: inferred -->` + fact_id + file:line 推理注——溯源纪律显著优于本 feature 兄弟旅程（worker-provisioning 全组仅 1 处显式 fact_id）。

预评分锚点（后经维度核验证实）：

1. step-3 `gate-failure-fix-chain` 与 `blocked-submit-skips-doors` 前置状态区重叠（同一「gate 任务失败走 blocked 结算」世界两 Outcome 同时可选）；
2. 提交规范族主张（AGENTS.md 约定优先 / 常识级回退 / 失范拒绝）在事实表中零溯源，且未引直接相关事实 M3_CORE_SKILLS_NO_GIT（commit 纪律由 submit-task skill 承载）；
3. step-1/step-2 frontmatter `page` 为空串而 handbook 在场（任务抽屉记录面可作锚——td-commit/ev-verb 锚族在场）；
4. fixture 伪字段：`blocked_reason` 被声明为 Task 字段，与自述「reason 为审计单源，不写列」及 M3_SUBMIT_BLOCKED_REASON 矛盾；
5. step-3 唯一 web 锚步的维度值零 web 可观测量（无按钮/抽屉/会话跳转语言）。

事实面对账（.forge/fact-table.json，139 条）：M3_SUBMIT_AC_GATE、M3_SUBMIT_GATE_DOOR、M3_SUBMIT_GATE_ALL_OR_NONE、M3_SUBMIT_SUMMARY_REQUIRED、M3_SUBMIT_BLOCKED_REASON、M3_SUBMIT_FROM_IN_PROGRESS、M2_SUBMIT_FROM_GATE、M2_SUBMIT_INPUT_VALIDATION、M2_SUBMIT_RECORD_SHAPE、M3_SUBMIT_COMMIT_HASH、M3_SUBMIT_ACTOR_PLUGIN_TOOL、M3_BLOCK_SOURCE_ATOMIC、M3_RESTORE_HOOK、M3_WORKER_TOOL_MATRIX、M2_TOOL_FACE（slug+local_id 定位）——推断 Outcome 的全部机制主张与事实表一致；除下述提交规范族外未发现与事实矛盾的主张。

---

## Phase 2 — Rubric Scoring

### 1. Completeness — 147/150

- **四维非空（0-50）= 50**：13 个 Outcome 的 Preconditions / Input / Output / State 全部非空；Side-effect 全部显式给出（含 "none（提交纪律通道）" 默认语义）；Invariants 可选且 success Outcome 携带。无缺失。
- **Journey Invariants（0-50）= 50**：3 份合约均有 `## Journey Invariants` 且各含 4 条，与旅程 4 条不变量逐字一致。
- **happy + surface 派生（0-50）= 47**：happy Outcome 每步在场；web 必选派生 validation-error / session-expired 三份文件头部均有显式裁决注释，且 validation-error 语义有承载（step-1：「拒绝形态由功能断言 Outcome 承载：ac-evidence-missing / summary-missing / blocked-reason-required 同门」——符合规则「error message / not submitted / correct and retry」语义）。扣分：session-expired 三份全判 N/A 且**无任何本地化承载 Outcome**——本旅程域内存在真实邻近边界（worker 会话中断后的幂等重入与缺记录恢复，M2_CLAIM_REENTRY / M2_RUN_TASKS_RECOVERY_BRIEF 事实在场），兄弟旅程 worker-provisioning 对同类无登录态场景做了本地化落点（config-timing-boundary），本组未做（-3）。

### 2. Semantic Purity — 182/200

- **自然语言非代码/regex（0-80）= 80**：全文无 regex、无 CSS/XPath 选择器、无框架断言调用。
- **前置为声明式状态（0-60）= 58**：前置总体声明式（「工作区 AGENTS.md 已移除（未配置态）」为正确形态）。扣分：step-1 blocked-reason-required 前置「任务执行受阻，**worker 走 blocked 结算径**」与 step-3 blocked-submit-skips-doors 前置「**worker 走 blocked 结算**（reason 在场）」——将输入侧的动作路径选择写进前置槽（-2）。
- **无实现耦合（0-60）= 44**：维度值系统性内嵌内部标识（可逐字引用）：
  - step-1 success State：「task_records 新增 submit 行（**files / gate / commit_hash 结构化负载；actor=plugin-tool**）」——表名 + 行结构 + 内部 actor 常量；
  - step-1 ac-evidence-missing：「**ac_json 非空**」「缺测试证据——**gate.test 不为真**」——列名 + 参数字段名（旅程原文为「带 AC 清单」「未附任何测试证据」）；
  - step-3 task-not-found Input：「**slug/local_id 未命中在库行**」；step-3 success Preconditions：「**task_type=gate**、pending 且依赖满足」；
  - step-2 gate-args-all-or-none：「gate 载荷只给了部分布尔（如仅 **compile 与 test**）或单给 **coverage**」——参数面内部形状。
  这些主张与事实表相符且部分继承自旅程词汇（commit_hash / gate_json 旅程原文即有），作为审计面断言对象有设计动机，但 actor 常量、列名、参数字段名超出了旅程词汇（约 -16，按 rubric「not internal function calls, database queries」口径；较 worker-provisioning 的 -22 略轻——本组无文件路径与写机制叙述）。

### 3. Precondition Exclusivity — 120/150

- **前置互异（0-60）= 45**：step-1 五个 Outcome 以 result（success/blocked）、状态（in_progress/非 in_progress）、载荷（summary/reason/证据）三轴互斥，且 summary-missing 显式挖除 AC 区（「任务为普通任务（无 AC 清单或已附证据）」）——构造良好。真实重叠一对在 step-3：`gate-failure-fix-chain` 前置「gate 任务执行结果为失败」与 `blocked-submit-skips-doors` 前置「gate 类型任务（或带 AC 任务）执行受阻，worker 走 blocked 结算（reason 在场）」——「执行失败」与「受阻走 blocked 结算」可同刻为真（fix 链唯一入口即 blocked submit → addTask --block-source），两 Outcome 前置同时成立（-15）。
- **前置足以唯一定选（0-50）= 40**：上述重叠场景下仅凭前置无法唯一定选，需靠断言侧重（fix 链恢复 vs 双门不拦）事后消歧（-10）。其余场景（含 step-2 三元、step-3 task-not-found 的键错位）定选唯一。
- **边界 Outcome 显式触发条件（0-40）= 35**：12 个边界 Outcome 中 11 个显式陈述触发态（「任务实际状态与 submit 假设不符（如已被转移出 in_progress——pending / blocked / 终态）」等）。最弱者：gate-failure-fix-chain 前置「gate 任务执行结果为失败」未钉死结算形态（result=blocked？还是 success 带红布尔？两径门行为不同——后者过摘要门直接 completed），触发条件欠定（-5）。

### 4. Fact Alignment — 121/150

- **事实主张可溯源（0-60）= 42**：六门机制主张（AC 门/摘要门/空摘要/空因/all-or-none/from 门）经推断 Outcome 的 reasoning 注完成 fact_id + file:line 溯源——优于兄弟旅程。两类缺口：
  1. **提交规范族零溯源**：step-1 success「提交信息从其约定（AGENTS.md 约定优先）」、step-2 success「回退模型常识级 Conventional Commits」、step-2 nonconforming-message-rejected「拒绝（提交历史可审计——不产生无规范提交）」——事实表无任何 AGENTS.md / 提交信息校验条目，三处主张既无 fact_id 也未标 UNKNOWN/inferred；且直接相关事实 **M3_CORE_SKILLS_NO_GIT**（「core skill catalog 无 git 条目——commit discipline carried by submit-task skill」，即纪律为技能侧而非系统门）在场而未被引用 adjudicate（-10）。
  2. 旅程锚定 Outcome（success / 各 edge）本体不带 fact_id 映射（与 worker-provisioning 同型缺口，本组因推断侧标注良好略轻，-8）。
- **推断主张有规则支撑 + source: inferred（0-50）= 47**：6 个推断 Outcome 全带 `<!-- source: inferred -->` 与含 fact_id 的 reasoning 注。字面偏差：rubric 要求引用 required_outcomes 规则，本组的推导依据是代码侦察事实而非 surface 规则（规则已裁 N/A）；validation-error 语义经头部裁决注释间接挂接（「拒绝形态由功能断言 Outcome 承载」），链条成立但间接（-3）。
- **无未分类幻觉主张（0-40）= 32**：未发现与事实表矛盾的机制主张。一处未分类且承重：step-2 nonconforming-message-rejected 将「失范提交被拒」断言为确定性系统行为（Output「拒绝……纠正后可过」+ State「无失范提交产生」），而服务侧仅见 commit_hash 透传（M3_SUBMIT_COMMIT_HASH）、提交信息根本不进入 submitTask 参数面——该「拒绝」无系统门可触发，未标 UNKNOWN 也未说明承载通道（-8）。

### 5. Surface Fitness — 78/100

- **必选派生 Outcome 在场（0-40）= 30**：validation-error / session-expired 作为字面 Outcome 全组缺席，三份文件均有显式裁决注释且理由具体（「worker tool 结算面非 web 表单」「无登录态；结算状态落库即时，无会话凭据路径」）——按 surface 规则「must be considered」口径为已考虑并裁决；validation-error 语义由功能断言 Outcome 族承载。但较兄弟旅程（step-1 实落 unconfigured-placeholder + 本地化 config-timing-boundary 得 40）本组无任何实落/本地化承载（-10）。
- **surface 恰当语言（0-35）= 23**：本旅程 2/3 步为 worker tool 面（submitTask 结算），维度用工具调用语言属旅程本形；但 step-3 是唯一 web 锚步（page「概览 · 任务子 tab」+ layout「概览三子 tab（task-tab 工具栏「派发」按钮）」），其 Input 却为「派发一个 gate 类型任务（如契约面/审计类检查）并待其结算」——零页面元素、零用户交互、零异步等待语言，而 handbook 在场的可观测面充足（派发按钮亮起态 M3_DISPATCH_BUTTON_RULES / 执行中任务跳转派发会话 / 抽屉 submit 行 commit+gate 锚族 M2_E2E_ANCHOR_SET td-commit·td-cov·ev-verb）。锚在场而语言面缺席（-12）。
- **TUI 超时（0-25）= 25**：非 TUI 面，满分（backward-compatible）。

### 6. Internal Consistency — 142/150

- **不变量在每份合约成立（0-60）= 52**：无合约行为违反四不变量；门行为与不变量一致（ac-evidence-missing 落「不得过 submit 门」、success 落 commit_hash/规范）。一处未裁决的时态张力：不变量「**submit 记录恒含 commit_hash**」 vs step-3 blocked-submit-skips-doors State「submit 记录含 reason（可附失败 gate 载荷原样落账）」与 gate-failure-fix-chain State「gate 任务 blocked（reason 落审计）」——受阻结算的 submit 行对 commit_hash 缄默；若受阻径可无提交（无 commit 可携），「恒含」不变量逐字执行将判违约，合约未做范围限定（success 结算恒含）或裁决（-8）。
- **跨合约引用一致（0-50）= 50**：step-2「另一任务由 worker 完成并自检」与 step-1 完成首任务闭环（journey Setup「两态可切换」承载 AGENTS.md 状态翻转）；step-3 gate 任务独立入场；无悬挂引用。
- **前置可由前步 State 达成（0-40）= 40**：step-1 in_progress → completed 后，step-2 新任务 in_progress（AGENTS.md 移除为 Setup 级文件态翻转）可达；step-3 pending+依赖满足为独立种子态。全链可达。

### 7. Anchor Integrity — 80/100

Handbook（design/page-map.md）在场，web 必填锚字段 = `page`。

- **锚字段完整（0-40）= 20**：step-3「概览 · 任务子 tab」对应 handbook 页条目 ✓；**step-1 与 step-2 `page: ""` 均为空串**（route/requires_auth/layout 同空）——两步的结算结果在 web 面有真实观察缝（任务抽屉记录区：M2_E2E_ANCHOR_SET 的 td-commit / td-cov / ev-verb 锚族，挂于「概览 · 任务子 tab」页），page-map 条目可作锚却留空；且头部裁决注释只裁了派生 Outcome，未对空锚给 N/A 理由（-10 × 2，按 missing field 计）。`route: ""` 全组为空与 handbook「M3 无新路由」一致，不计错。
- **锚值匹配（0-30）= 30**：step-3 非空 page 值与 handbook「概览 · 任务子 tab（UF-3 = M2 复刻 + 诊断 + 派发）」名称段精确匹配；layout 描述与 handbook 工具栏结构（[诊断] + [派发]）一致。
- **handbook 内部一致（0-30）= 30**：page-map 无同名页冲突路由/重复定义。

### 8. Fixture Specification — 82/100

- **实体完整性（0-40）= 40，veto 未触发**：语义核验——Task / WorkspaceDir 均对应设计域模型（tasks 表 / 工作区目录态），且各 Outcome 前置所需种子实体（任务态 + AGENTS.md 两态 + git 可用 + 键错位在库行）全部声明。与 worker-provisioning 触发 veto 的形态（前置明文引用父会话 model、State 断言 worker 会话工具面）对照：本组前置/状态值不引用任何会话实体的属性（「已被 worker 领取」编码为 task_status=in_progress）；task_records submit 行与事件日志条目为**操作产物**（SUT 创建）而非种子前置，不属于 fixture 声明义务——此 adjudication 显式记录以备复核。
- **关系与约束（0-35）= 17**：多实体 Outcome（step-1/2/3 的 Task + WorkspaceDir）均无 `relationship_type` / `parent_entity` 声明（Task housed-in WorkspaceDir/容器，如 tasks 表 UNIQUE(slug, local_id) 的容器辖域）——-10。伪字段约束：step-1 blocked-reason-required 声明 Task 字段 `blocked_reason`，与其自述 State「（reason 为审计单源，**不写列**」及 M3_SUBMIT_BLOCKED_REASON（no blocked_reason column write）直接矛盾；step-2 `commit_message` / `gate_payload` 亦非 Task 实体字段（commit 信息属仓态、gate_json 落 task_records 行）——约束未对齐声明实体的字段面（-8）。
- **最小数量（0-25）= 25**：各 Outcome 单任务场景 min_count 1 充分；task-not-found 声明 1 条键错位在库行 ✓；step-2「另一任务」为跨步新种子，步内 1 正确。

---

## Phase 3 — Blindspot Hunt（rubric 八维之外）

1. **[blindspot] 失范拒绝 Outcome 无可实现观察通道**。step-2 nonconforming-message-rejected Output：「拒绝（提交历史可审计——不产生无规范提交）；纠正后可过」+ Side-effect：「none（提交纪律通道）」。submitTask 参数面只携 commit_hash（M3_SUBMIT_COMMIT_HASH 透传），提交信息永不进入工具调用；若拒绝发生在 worker 技能自律（M3_CORE_SKILLS_NO_GIT：commit discipline carried by submit-task skill），则系统面无门可触发、无错误可观察——gen-test-scripts 拿不到断言落点（谁拒绝？在哪报告？）。合约必须指明断言载体（如 worker 会话转录中的自检拒绝、或测试 harness 直接检视 git log 的规范断言）并标注机制为技能侧，否则该 Outcome 产出不可执行测试。
2. **[blindspot] fix 链入链动作无执行主体，系统/技能边界未划**。step-3 gate-failure-fix-chain State：「gate 任务 blocked（reason 落审计）；**fix 任务入链**；修复完成后源任务自动恢复」。「fix 任务入链」需某 agent 调 addTask --block-source（dispatcher 外环 C4 分诊——应用零编排纪律下这是技能侧行为；task-pipeline.md「blocked submit→addTask --block-source 三件原子」），仅「源任务自动恢复」是系统钩子（M3_RESTORE_HOOK）。合约将外环技能行为与系统行为并置于同一 State 断言，未声明测试须模拟 dispatcher 完成入链——下游执行者无法区分哪些断言可直接落库验、哪些需先驱动外环。
3. **[blindspot] 事件 Side-effect 断言无时延容差**。三份合约多处 Side-effect：「task-submitted 事件落事件日志」「tool-error 事件落事件日志」——product-discipline 事件延迟上限 500ms（M2_EVENT_PUSH_CHAIN），合约未给等待/轮询语义；与 worker-provisioning 轮已盲点的 500ms 容差同类，不修订将直接产出时序 flaky 测试。

---

## 修订定向（供下一轮）

1. 拆分 step-3 重叠前置：`gate-failure-fix-chain` 前置钉死「结算形态 = result=blocked（reason 在场）」，`blocked-submit-skips-doors` 收窄为「双门门径断言专用（不带 fix 链断言）」或二者合并；
2. 提交规范族三处主张补溯源 adjudication：引 M3_CORE_SKILLS_NO_GIT 标注机制为技能侧（或标 UNKNOWN），并指明 nonconforming-message-rejected 的可观察断言载体；
3. step-1/step-2 补 page 锚（「概览 · 任务子 tab」——抽屉记录面）或在头部注释扩裁空锚 N/A 理由；
4. step-3 success 补最小 web 面语言（派发按钮态 / 抽屉 submit 行可观测量）；
5. fixture 伪字段整改：`blocked_reason`/`commit_message`/`gate_payload` 移出 Task 字段约束（或改挂 task_records/仓态载体），补 Task↔WorkspaceDir 关系声明；
6. 不变量「submit 记录恒含 commit_hash」补 success 结算范围限定或在受阻 Outcome 中裁决 commit_hash 可缺席。
