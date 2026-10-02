# Contract Eval Report: knowledge-recall-flywheel — Iteration 1

## Document Identity

| Item | Value |
|---|---|
| Journey | `knowledge-recall-flywheel`（High risk, golden path） |
| Contract files | `step-1` ~ `step-8`（8 files, 11 Outcomes: 8 happy + 2b/2c/3b/4b/4c/4d/4e/7b/7c/8b derived） |
| Iteration | 1（no previous report） |
| Surface type | web（rule: `gen-journeys/rules/surface-web.md`；required_outcomes = validation-error + session-expired） |
| Handbook | `design/page-map.md`（存在，Web 锚点 = `page`） |
| Fact Table | `.forge/fact-table.json`（42 条） |
| Design domain model | `design/er-diagram.md` + `design/tech-design.md`（PROJECTS / KNOWLEDGE_ENTRIES / KNOWLEDGE_RECALL_LOGS / APP_KEY_LOGS / SCHEMA_META + dsh 侧 workspace/session） |
| Scorer stance | adversarial（Senior QA Engineer persona；每处扣分附引文） |

---

## Phase 1 — Reasoning Audit（pre-score anchors）

**Q1: 8 份 Contract 是否忠实分解 SC-MVP 飞轮旅程？**
是。8 个 happy step 与 journey Happy Path 1:1 对应；10 个 edge case（2b/2c/3b/4b/4c/4d/4e/7b/7c/8b）全部落位为 Outcome 且带 `溯源` 注释回指 journey 步号；Setup 承载物完整迁移：Q1/Q2 逐字入 Step 3/4e/8b、事件基线 = 0 入 Step 1/7/8、场景隔离（2b/2c/4d 专属工作区独立启动）逐 Outcome 声明、120s 观察窗 / ≤2 重发 / 能力面降级策略完整落在 Step 4 State。Derived Outcomes 中 validation-error 实步落位（3b），session-expired 的 N/A 裁决**只存在于 journey.md**，8 份 Contract 零记录（见 D1/D5 扣分）。

**Q2: Outcomes 互斥且可被下游测试脚本生成器执行？**
互斥性大体成立：2b/2c/3b/4d 以知识目录三态 / 输入空态 / 无关库隔离显式区分。两处弱化：4b/4c 前置逐字等价（仅靠 Input 有无域前缀区分——见 D3）；执行性缺口三处：能力面「contract 直测通道」未指明实现缝（2/4b/4c 三处断言悬空）、Step 5「内容基于命中知识」无判定 oracle、4d「无使用事件落库」与 shipped 哨兵行行为直接冲突（见 blindspots 1–3）。

**Q3: 跨 Contract 状态引用是否悬空或矛盾？**
算术一致：事件基线 0 → Step 7「召回次数 = 1、覆盖条数 = 1、徽章 = 1」→ 8b「次数 = 2、覆盖 = 2、K1 保持 1、K2 = 1」，链口径全程统一。**发现一处真实悬空**：Step 4e Side-effect 声明「该链按链口径记 1 次，供 8b」，而 8b 前置要求「统计 1/1」且由 8b 自己发送 Q2——若 4e 的 Q2 链与 8b 同会话，8b 前置不可达；4e 未像 2b/2c/4d 那样声明场景隔离，也未声明执行顺序（见 D6 扣分与 blindspot）。

**Q4: Journey invariants 在每份 Contract 中成立？**
成立。五条 invariant 逐字复载于全部 8 文件；链口径 vs shipped 逐调用计数（RECALL_LOG_RECORDED）的分歧在 4/7/8 三处以 fact-note 显式标注为「缺陷信号设计」——spec-pinning 策略自洽，不构成 invariant 违反；只读纪律、append-only、三页签不重置（Step 6 实步断言）均未被任何 Outcome 触犯。

---

## Phase 2 — Rubric Scoring（verification stance）

### Dimension 1. Completeness（完整性）— 145/150（min 90 ✅）

| Criterion | Score | Justification |
|---|---|---|
| 四维非空 | 50/50 | 11 个 Outcome 全部含非空 Preconditions / Input / Output / State，且 Side-effect 显式给出（无一处省略默认）。逐项核过 8 文件。 |
| Journey Invariants | 50/50 | 8/8 文件均有 `## Journey Invariants` 节且 ≥1 条（实际 5 条逐字复载）。 |
| happy path + surface 必察派生 | 45/50 | 边界覆盖丰富（10 个派生 Outcome）。validation-error 实步落位 step-3 blank-question-blocked 并引规则（「Web surface 必察项 validation-error 的实步承载」）。扣 5：session-expired 必察项的 N/A 处置只存在于 journey.md（"**session-expired** — N/A：单机产品无登录会话 / 过期概念"），8 份 Contract 文件均无该处置记录，仅以 `requires_auth: false` 锚点隐式承载——仅消费 contracts/ 的下游看不到裁决理由。 |

### Dimension 2. Semantic Purity（语义纯度）— 190/200（min 120 ✅）

| Criterion | Score | Justification |
|---|---|---|
| 自然语言，无代码/正则 | 80/80 | 全套零 regex / CSS 选择器 / XPath / 框架断言调用；无 data-testid 泄漏（页面锚点字段除外，属 frontmatter 约定）。 |
| 前置为声明式状态 | 55/60 | 前置绝大多数为纯状态（如「知识目录已配置且为空（无任何知识文件；依 Setup 场景隔离独立启动，与 2b 未配置态可区分）」）。扣 5：Step 4 success 前置内嵌测试策略指令「真实模型往返非确定——观察窗内无链可重发（见 State）」——「可重发」是 harness 动作而非系统状态，策略应整体归 State/注记位（该步确实也在 State 重复声明，前置处的复述属程序性泄漏）。 |
| 无实现耦合 | 55/60 | State 维以系统行为为主。扣 5：Step 1 State 直接点名存储内部「应用库 projects 行写入（workspace 外键一致）；dsh registry 注册在场」与 Step 4「使用事件落应用状态层（知识召回日志表）」——表名/registry 内部位点入维；虽为设计自身词汇（应用状态层），仍属"how"侧描述，宜表述为「项目记录入应用状态层」级别。 |

### Dimension 3. Precondition Exclusivity（前置条件互斥性）— 140/150（min 90 ✅）

| Criterion | Score | Justification |
|---|---|---|
| 前置互异 | 50/60 | 扣 10：Step 4「domain-prefix-filter-correct」与「prefix-omitted-all-domain」前置语义等价——前者「知识库同时存在前端域与后端域知识条目（基线 Setup 即满足）；能力面 contract 通道可用」vs 后者「能力面 contract 通道可用（同 4b 通道）；前后端域条目并存」，且 fixture_spec 逐字相同；两者仅靠 Input（带/不带域前缀）区分。实际生成无歧义（Input 判别干净），但违反「无两个 Outcome 共享语义等价前置」的字面规则；宜将「查询携带域前缀/省略域前缀」前置于前置态或以前置字段显式分化。7/7c、8/8b 为顺序子步型重叠（不同措辞、不同衔接终态），不另扣。 |
| 前置足以唯一定位 Outcome | 50/50 | 给定前置 + 输入，11 个 Outcome 均唯一可选；无两可场景。 |
| 错误/边界 Outcome 显式触发条件 | 40/40 | 全部边界 Outcome 声明触发态：2b「未配置」、2c「已配置且为空」、3b「输入框为空或仅空白字符」、4d「全字段不含「部署」「构建」」、7c「索引未命中该知识（已被外部删除）」。 |

### Dimension 4. Fact Alignment（事实依据）— 140/150（min 90 ✅）

| Criterion | Score | Justification |
|---|---|---|
| 事实声明可溯源或标 UNKNOWN | 55/60 | 溯源纪律强：4/7/8 三处 fact-note 精确引用 `RECALL_LOG_RECORDED` / `RECALL_TAB_STATS` / `HEAT_AGGREGATION` 并如实披露 shipped 与旅程口径分歧；UNKNOWN 标注到位（token 阈值「阈值设计期定，UNKNOWN」、动词明细「动词取值 UNKNOWN，见 Invariants」、2c「知识段注入口径 UNKNOWN……分歧交设计期裁决」）。扣 5：Step 4d Output 断言「无使用事件落库（未发生召回；召回 tab 保持占位态，与 Step 7b 互证）」——与 fact `RECALL_LOG_RECORDED`「zero-hit search writes sentinel row (entry_id NULL, hit_count 0)」直接矛盾；fact-note 虽披露为「口径裁决点」，但断言行本身无口径限定词，属「被事实反驳且未在断言文本内标 UNKNOWN/裁决」的声明（对比 7/8 的「断言失败即缺陷信号」式显式 pin，4d 缺同等处置）。 |
| inferred 声明含规则依据 + source: inferred | 45/50 | 2b（「source: inferred（不注入为 Story 4 AC1 的反向派生，无 PRD 原文）」）、2c（inferred + UNKNOWN）、4b（「source: inferred，测试基建契约」）合规。扣 5：step-3 blank-question-blocked 注释引规则（「Web surface 必察项 validation-error 的实步承载」）但 Contract 侧未落 `source: inferred` 字样（仅存在于 journey Derived Outcomes）；4c 同病（仅「同 4b 通道」回指）。EMPTY_SEND_GUARD 事实可反向支撑 3b 却未引——非幻觉但标注链不完整。 |
| 无未分类幻觉 | 40/40 | 未发现无分类来源的行为发明；所有非常识断言均可回溯 journey / PRD AC / fact-note / inferred+UNKNOWN 四类之一。 |

### Dimension 5. Surface Fitness（Surface 适配）— 96/100（min 60 ✅）

| Criterion | Score | Justification |
|---|---|---|
| 必察派生 Outcome 在场 | 36/40 | validation-error：实步承载于 step-3 blank-question-blocked，断言完整（「不发送——无消息上屏、无 agent 往返、无检索链与使用事件；空会话引导态保持，焦点仍在输入框」）且引 surface 规则 ✓。session-expired：N/A 裁决合理（单机产品无登录会话，page-map `Auth: none`，与兄弟旅程同口径），每文件 `requires_auth: false` 锚点编码该事实；但 N/A 处置文本仅存于 journey，Contract 套件内零记录（与 D1 第 3 项同根因——rubric 两维度重复检查，两处各扣小幅）。 |
| Surface 恰当语言 | 35/35 | 纯用户交互语汇：「点『新会话』按钮」「切到会话『知识召回』页签」「点一条知识分组行」「查看 K1 卡片」；页面元素（统计头/分组行/热度徽章/抽屉/占位）；异步语义（「agent 开始处理」「等待 agent 完成回答」+ 120s 观察窗）符合 web 语境；零 DOM/选择器泄漏。能力面步骤（4b/4c）显式声明 UI 无入口的降级理由，不冒充 web 交互。 |
| TUI 超时项 | 25/25 | 非 TUI surface，满分（规则明示 non-TUI full marks）。 |

### Dimension 6. Internal Consistency（一致性）— 135/150（min 90 ✅）

| Criterion | Score | Justification |
|---|---|---|
| Invariants 在每份 Contract 成立 | 60/60 | 五条 invariant 无一被违反；链口径（一次命中检索链 = 1 次召回）在 4/7/8 全程一致并以「缺陷信号设计」显式 pin shipped 分歧——套件内部自洽。热度算术（K1=1、K2=1、统计 1/1→2/2、次数与覆盖分离）与「heat = 事件计数」invariant 同源一致。 |
| 跨 Contract 状态引用一致 | 35/50 | 衔接链 1→2→3→4→5→6→7→8 逐环核对无悬空（Step 2 终态「系统提示词知识段注入」↔ Step 3 前置「会话已建立（系统提示词含知识段，衔接 Step 2）」等）。扣 15：**4e→8b 状态污染**——Step 4e Side-effect「使用事件落应用状态层（该链按链口径记 1 次，供 8b）」声明其事件供 8b 消费，而 8b 前置为「同一会话中已发生过一次召回（衔接 Step 7 终态：tab 有 K1 条目，统计 1/1）」且 Input 自行「发送 Q2 触发对 K2 的新一次召回」：若 4e 的 Q2 链落在同会话，则 8b 前置应为 2/2 而非 1/1，前置不可达；4e 既未声明场景隔离（对比 2b/2c/4d 的「专属工作区独立启动」），也未声明在 golden 主线中的执行顺序——「供 8b」语义悬空（是「供 8b 复用同型断言」还是「该事件计入 8b」不可判定）。 |
| 前置与前序 State 变化相容 | 40/40 | 除上述 4e/8b 外，各步前置均恰为前步终态（pending_question / last_round / recall_history / UsageEvent chain_count 衔接逐一对得上）；Step 1 的索引断言后置代理（Step 8 网格呈现 K1/K2）在 Step 8 success 中兑现。 |

### Dimension 7. Anchor Integrity（锚点完整性）— 95/100（min 60 ✅）

Handbook `design/page-map.md` 存在，Web 锚点字段 = `page`。锚点映射表：

| Contract | page | route | requires_auth / layout | 判定 |
|---|---|---|---|---|
| step-1 | 添加项目（两段模态流程） | modal/add-project | false / 覆盖中区的模态 | 与手册 §添加项目 逐字匹配 ✓ |
| step-2~7 | 工作台·会话视图（默认态） | workbench/session | false / WorkbenchLayout（左 rail / 中会话面板 / 右 dock） | route/layout/auth 精确 ✓；page 见下 |
| step-8 | 工作台·知识库视图（浏览页签） | workbench/knowledge | false / WorkbenchLayout（左 rail / 中知识面板全宽） | route/layout/auth 精确 ✓；page 见下 |

| Criterion | Score | Justification |
|---|---|---|
| 锚点字段完整 | 40/40 | 8/8 文件 frontmatter `anchors.web` 含非空 page + route + requires_auth + layout（超出 web 必察的 page 单字段）；`last_anchor_sync` 一致。 |
| 锚点值匹配手册 | 25/30 | step-1 与手册标题逐字一致；step-2~8 的 page 值 vs 手册标题 `"工作台 · 会话视图（默认态）"` / `"工作台 · 知识库视图（浏览页签）"`——`·` 两侧空格不一致（7 文件 × 2 个相异值），字节级精确匹配会失联；虽经 route 可唯一消解且为全套件族统一生成器约定（session-workbench / knowledge-browsing 同形），按「值须精确匹配手册条目」规则扣分（-5，低于 -10/处的整额，因唯一可消解 + 族约定缓解，与兄弟评测同口径）。 |
| 手册内部一致性 | 30/30 | 三个页面定义无重复/冲突 route；视图态与模态标识互斥；无同页不同义。 |

### Dimension 8. Fixture Specification（前置数据声明）— 67/100（min 60 ✅，veto 未触发）

**Veto check（entity completeness）— NOT triggered，裁定记录**：veto 触发条件为「Contract 前置/输入/状态变更中**引用**的 entity_type 缺席 fixture_spec.entities」。按维度题义（前置数据声明）逐 Outcome 核对：所有作为前置态引用的类型均已声明——step 1/7/8 的 UsageEvent 经 entities 或 state_requirements（prerequisite_entity）声明；Step 2b/2c 的隔离态经 state_requirements 声明。操作**创建**的实体（step 2 的会话、step 1 的 projects 行）为后置断言非前置 fixture，字面 veto 不适用（与 project-registration / session-workbench 评测同裁定）。但存在「操作必需而既未引用也未声明」的反向缺口（step 4d，计入下项）。

| Criterion | Score | Justification |
|---|---|---|
| Entity completeness（veto 项，语义对照设计域模型） | 25/40 | `Project` ↔ PROJECTS ✓、`KnowledgeEntry` ↔ knowledge_entries ✓、`Session` ↔ dsh 侧会话实体（设计承认的外部 SoT：er-diagram `session_id "dsh 会话 id（tab 分组键）"`）✓。三处扣分：① `entity_type: "UsageEvent"`（step 1/7/8）为旅程域别名——设计实体名为 KNOWLEDGE_RECALL_LOGS，schema.sql/er-diagram 无 UsageEvent 实体名，程序化对照失败（散文「每次召回即记一次使用事件」可语义消解）（-5，与 knowledge-browsing 评测同口径）；② `WorkspaceDirectory`（step 1）非设计域模型实体——ER 图五表 + dsh workspace 之外，工作区目录是文件系统输入，属生成器级抽象（-5，与 project-registration 评测同口径）；③ step 4d 操作必需的 Session 缺席：Input「在对话 tab 发送 Q1（search 未获命中为该库态下的确定前置，非用户动作）」必须在会话中执行，fixture_spec 仅声明 Project（knowledge_dir 约束），Session 实体既未引用也未声明（-5）。 |
| 关系与约束覆盖 | 25/35 | belongs_to + parent_entity 声明一致（KnowledgeEntry→Project / Session→Project / UsageEvent→Session(K2 链)）；字段约束具体可落地（keyword_fixture / body_length / domain_layout / system_prompt / pending_question / recall_history / index_state）。扣 10：UsageEvent 仅声明 `parent_entity: "Session"`（step 7）与 `parent_entity: "KnowledgeEntry"`（step 8），而设计中 knowledge_recall_logs 的 NOT NULL 强制外键是 project_id，entry_id/session_id 均为可空/非外键列（er-diagram：`entry_id ... 可空：零命中哨兵行/条目已重建`）——强制的 UsageEvent→Project 关系全程未声明（规则：多实体缺关系声明 -10；与 knowledge-browsing 评测同病同口径）。另注（不另扣，避免 nitpick 堆叠）：2b/2c 以 `prerequisite_entity: "KnowledgeEntry"` 承载「不与基线叠加」的隔离要求——以前置实体名表达"缺席维度"，语义牵强但可读。 |
| 最小数据量声明 | 17/25 | step 1 KnowledgeEntry min 3（K1+K2+后端若干）✓；4b/4c min 2（前后端并存）✓；8b min 2（K1+K2）✓；7c 单条目 + 外部删除预置 ✓。扣 8：step 4d 缺 Session 声明致场景不可行（无会话无法在对话 tab 发送 Q1）——under-declared（规则 -8/实体）。 |

---

### Deduction Rule Applications（汇总）

| Rule | Application |
|---|---|
| Invariant violation -40 | 未适用（无违反） |
| Hallucinated unclassified claim -30 | 未适用（未发现） |
| Surface type violation -25 | 未适用 |
| Precondition overlap -20/对 | 4b/4c 对：按「等价但 Input 判别干净」部分适用 -10（D3c1） |
| Missing anchor field -10/处 | 未适用（8/8 齐备非空） |
| Anchor value mismatch -10/处 | page 标题 `·` 空格系统性不一致（2 相异值 × 7 文件）：族约定 + route 可消解缓解，整额 -10 降至 -5（D7c2） |
| Handbook conflict -15 | 未适用 |
| Entity completeness veto | 未触发（裁定见 D8；创建型实体非前置 fixture） |
| Missing relationship -10 | UsageEvent→Project（NOT NULL FK）缺声明（D8c2） |
| Under-declared min_count -8 | step 4d Session（D8c3） |
| 另：D1c3 -5、D5c1 -4（session-expired 处置未回抄套件）；D2 -5-5；D4c1 -5、D4c2 -5；D6c2 -15（4e/8b 污染） | 见各维 |

### Cross-Dimension Coherence Check

- session-expired 处置缺席在 D1c3（-5）与 D5c1（-4）双扣——rubric 两维度重复检查同一必察项，两处独立判据（结构完整性 vs surface 规则符合），非同分池重复扣（与 knowledge-browsing 评测先例一致）。
- 4d 的哨兵行矛盾在 D4c1（断言口径）与 blindspot 3（生成器红灯后果）分立：D4 扣断言文本，blindspot 只记下游后果，不重复扣分。
- 4e/8b 污染在 D6c2 扣分一次；其「稳定性策略作用域」侧面独立为 blindspot 4（rubric 无该维度，不扣分）。
- UsageEvent 在 D8c1（命名）与 D8c2（关系）各扣不同判据；4d Session 在 c1（声明缺席）与 c3（min_count 不可行）同理——先例（knowledge-browsing coherence 节）明示该分摊方式。
- 未发现一处缺陷被用于撑起两个维度的同一 criterion。

---

## Phase 3 — Blindspot Hunt（rubric 未覆盖的 QA 域失败模式）

1. **[blindspot] 能力面「contract 直测通道」无实现缝，三处断言对生成器悬空** — step-2 success：「系统提示词内容非浏览器可观察，本断言经能力面 / 插件契约通道承载」；step-4b：「以『前端』域前缀发起 search 查询——经能力面 contract 直测通道驱动（产品 UI 无直调检索原语的入口）」。fact `CH_KNOWLEDGE_SET` 明示 search/read-abstract **不是 RPC 通道**（browse 面 5 通道之外，仅 agent-face tool），fact `E2E_INFRA` 明示 e2e 仅有 `window.dshForge.invoke` RPC 探针且无直调/故障设施——「通道可用」是循环前置（通道可用因为通道可用），其物化方式（vitest 单测缝？dsh tool 驱动 harness？新建探针？）全文未指明。生成器必须自行发明基建才能落地 2 success / 4b / 4c 三个 Outcome。改进：每处指明通道机制与所属测试层（仿 FAULT_INJECTION_CONTRACT 的缝声明先例）。
2. **[blindspot] Step 5 回答内容断言无 oracle** — 「回答呈现于对话 tab 且内容基于命中知识」：自然语言模型输出非确定，「基于命中知识」无可执行判据（哪个词/短语构成"基于 K1"？）。fixture 未在 K1 摘要中植入哨兵串，生成器只能发明弱断言（如回答非空）→ 检索链与回答内容的因果沦为不可测。改进：K1 fixture 摘要植入唯一哨兵串并断言其出现在回答中。
3. **[blindspot] 4d 零行断言对 shipped 代码必然红灯** — Output「无使用事件落库（未发生召回；召回 tab 保持占位态，与 Step 7b 互证）」：fact-note 已承认「零命中 search 在 shipped 代码记哨兵行」，但与 7/8 的「断言失败即缺陷信号」式显式 pin 不同，4d fact-note 只留「口径裁决点」而未裁决——生成器按字面写「表空断言」即保证失败，且失败语义（缺陷 or 口径）不可分辨。改进：断言文本内联口径（如「无 entry_id 非空的事件行；哨兵行是否计入统计 = 裁决点，不入断言」）。
4. **[blindspot] 稳定性策略作用域只覆盖 Step 4，第二次真实往返裸奔** — 策略唯一落点 step-4 State：「观察窗 = 提问后 120s 内轨迹出现检索链，窗内无链 → 同一 fixture 问题重发 ≤2 次；仍无 → 降级能力面 contract 通道验证同等断言并记 flake」。但 4e（Q2 命中 K2）与 8b（「发送 Q2 触发对 K2 的新一次召回」）同为真实模型往返，均未携带或引用观察窗/重发/降级策略——孤立生成 8b 的脚本无任何等待与抖动预算，120s 窗在链路第二步即失效。改进：策略提升为旅程级 invariant 或在 4e/8b State 内联引用。
5. **[blindspot] 模型运行时中途故障无 Outcome 建模** — Setup 仅以环境前置兜底（「dsh 会话运行时可用（模型 API 凭证归 dsh profile 域，产品不经手）」），往返**进行中**失败（API 报错/中断）时的 UI 行为（错误面、消息持久化、可否重试）无任何 Outcome 覆盖——happy 与「无命中」之外的第三态（往返失败）是 web 异步面最常见真实失败模式，套件将其完全让渡给环境前置。改进：补 runtime-failure 边界 Outcome 或显式声明让渡理由（同 session-expired 的 N/A 记录式处置）。

---

## Final Summary

| Dimension | Score | Min | |
|---|---|---|---|
| 1. Completeness | 145/150 | 90 | ✅ |
| 2. Semantic Purity | 190/200 | 120 | ✅ |
| 3. Precondition Exclusivity | 140/150 | 90 | ✅ |
| 4. Fact Alignment | 140/150 | 90 | ✅ |
| 5. Surface Fitness | 96/100 | 60 | ✅ |
| 6. Internal Consistency | 135/150 | 90 | ✅ |
| 7. Anchor Integrity | 95/100 | 60 | ✅ |
| 8. Fixture Specification | 67/100 | 60 | ✅ |
| **Total** | **1008/1100** | **935** | ✅ PASS |

**结论**：1008 ≥ 935 且全维度过阈——通过。修订优先级：① 4e/8b 状态污染（D6，声明 4e 隔离或顺序）+ 能力面通道缝指明（blindspot 1）+ Step 5 oracle（blindspot 2）；② D8 三项（UsageEvent 命名/关系对齐设计实体、4d Session 声明）；③ 4d 哨兵行口径入断言文本（D4/blindspot 3）；④ session-expired 处置回抄套件（D1/D5）+ 稳定性策略作用域（blindspot 4）。
