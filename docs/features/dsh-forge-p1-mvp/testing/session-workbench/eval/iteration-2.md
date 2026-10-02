# Eval Report: session-workbench (Journey) — Iteration 2

- **Document**: `docs/features/dsh-forge-p1-mvp/testing/session-workbench/journey.md`
- **Feature**: dsh-forge-p1-mvp
- **Surface**: web (SURFACE_RULE: gen-journeys `rules/surface-web.md`)
- **Scorer persona**: Senior QA Engineer (adversarial)
- **Rubric**: journey.md (1150 pts, 7 dimensions, target 975, per-dimension min thresholds)
- **Iteration**: 2 (previous: `eval/iteration-1.md`, score 882 — FAIL)
- **Verified against**: prd-user-stories.md (Story 2), prd-spec.md (流程二, Security Requirements, 无遥测/单机), prd-ui-functions.md (UF-1/2/4/5/7 including States/Validation Rules/User Interaction Flow tables), proposal.md (Key Scenario 日常会话, SC1, SC6①②), gen-journeys `rules/golden-path.md` (golden_path flag semantics), sibling journeys knowledge-recall-flywheel / knowledge-browsing / project-registration-compensation (deferral targets + Derived Outcomes convention).

---

## Phase 0 — Previous Attack-Point Resolution Verification

Each iteration-1 attack verified against the current text. Scored independently on today's content; no credit for effort.

| # | Iteration-1 attack | Status | Evidence in current document |
|---|---|---|---|
| 1 | Web mandatory derived outcomes absent (D5.1 0/60; D1.3 −30; D4.2 −30) | **RESOLVED** | New section "## Derived Outcomes（Web Surface 必察项）": `validation-error` — "实步覆盖（Step 2c）… source: inferred（surface-web required_outcomes 必察项 × UF-4；PRD 未定义空消息行为）"; `session-expired` — "N/A：单机产品无登录会话 / 过期概念（PRD 单机安全边界，同兄弟 Journey 口径）；最近邻 = dsh 运行时不可用". New Step 2c exercises the block for real. "同兄弟 Journey 口径" verified: project-registration-compensation final revision carries the identical N/A reasoning. PRD Security ("本机运行…无远程暴露面", "无遥测（单机产品）") supports the N/A. |
| 2 | Step 2 dual entry point ambiguity (品牌行 或 新会话) | **RESOLVED** | "点「新会话」按钮，在对话 tab 输入 fixture 消息…（品牌行同属「新建会话」等价类，本步以按钮为代表，断言及于等价类——source: inferred）" — representative-entry + equivalence-class assertion scope declared. |
| 3 | Step 5 triple switch-back ambiguity | **RESOLVED** | "点 Step 4 会话行切回（覆盖口径：会话行为三切回入口代表——「新会话」/ 品牌行属新建类、Step 2 已行使——断言及于全部入口，source: inferred）" — matches UF-5's own entry enumeration ("再次点「新会话」/会话行/品牌行"). |
| 4 | Step 3 tool-call nondeterminism (B2) | **RESOLVED** | Step 2 now fixes the fixture message ("列出当前工作区根目录下的文件") and asserts "本轮含 ≥1 次工具调用（fixture 消息保证触发——source: inferred，供 Step 3 断言）". Residual: inference basis is circular (see D4.2). |
| 5 | Dock tab fixture missing → Step 6 assertion vacuous (B1) | **LARGELY RESOLVED** | Setup: "dock 页签 fixture：甲/乙各预置一个项目级页签（甲·页签 / 乙·页签）+ 全局页签常驻，可见集可区分". Distinguishability fixed. Residual: the preset channel is admitted undefined — executability gap (see D5.3 + blindspot BS1). |
| 6 | Setup vs Step 1c contradiction, no isolation (B6) | **RESOLVED** | Setup: "场景隔离：Step 1c 以全新用户数据目录独立启动，不与基线（甲/乙）叠加"; Step 1c precondition cites it ("依 Setup 场景隔离独立启动"). |
| 7 | Step 4b "新注册项目" unresolvable | **RESOLVED** | Setup: "乙 = 刚注册、零会话的新项目（供 Step 4b）"; Step 4b precondition: "打开的是项目乙（Setup 定义：刚注册、零会话）". Matches UF-1 States trigger ("新注册项目"). |
| 8 | Audit-channel language in Expected Results (实时读账本/零缓存零副本/恢复链路) | **RESOLVED** | Step 1 now: "以 dsh 行语言呈现（标题 / 状态点 / 相对时间），与 dsh 账本一致（数据来源注记见 Invariant 2）"; Invariant 2: "「实时读、零缓存零副本」为 UF-1 数据契约，属审计通道（代码审查承载），非浏览器可观察断言"; Step 4: "（「恢复链路」= Story 2 AC2 断言标签，非可观察行为）" — honest channel classification. |
| 9 | Step 4c precondition names internal operation | **LARGELY RESOLVED** | Precondition now leads declarative: "会话列表尚未就位（账本查询进行中的瞬态）". Residual: no deterministic lever to produce the transient (see D3.2/3.3). |
| 10 | 知识召回 tab never exercised, no deferral (D6.1/D7.3) | **RESOLVED** | Step 3: "知识召回 tab 由兄弟 Journey knowledge-recall-flywheel 承载（流程二第 2 条）"; Invariant 1: "（规则对三页签整体生效；知识召回 tab 由兄弟 Journey knowledge-recall-flywheel 行使）". Verified: the sibling's Step 6 + edges + invariant exercise the recall tab. |
| 11 | Retention claims lack observable probes (B5) | **RESOLVED** | Step 3: "探针：Step 2 往返转录仍在原位、会话未重建（标题未变）"; Step 5: "保留探针：① 草稿「待发问题」仍在输入框；② Step 4 会话转录仍完整呈现"; Step 6: "探针：会话面板不闪断、不回空态" (transient part see BS3). |
| 12 | Step 6 implicit dependency on Step 5 end state | **RESOLVED** | "（衔接 Step 5 终态：右栏展开、甲会话打开）". |
| 13 | `golden_path: false` frontmatter vs content (D1.1 −2 / D7.1 −4) | **NOT A DEFECT — deduction withdrawn** | Verified against gen-journeys `rules/golden-path.md` line 88: "At least one Journey has `golden_path: true` in frontmatter" — the flag is a per-feature-set designation, not a per-journey content claim. 5/6 journeys in this set are `false`; knowledge-recall-flywheel holds the set's `true`. Iteration-1 misread the convention; this iteration does not deduct. |
| 14 | Step 4b unclassified quality embellishments (D4.1/D4.3) | **RESOLVED** | "不报错、无空列表闪动——source: inferred（UF-1 仅定义占位态，质量项为派生）". |
| 15 | Round-trip wait/stability absent (D5.3 −10 component) | **PARTIALLY** | Audit-channel half fixed via Invariant 2; the round trip itself still has no stability consideration (−2 remains; the proposal's own risk table flags e2e round-trip stability). |
| 16 | B3 runtime-unavailable error path untested | **PARTIALLY ADDRESSED** | Acknowledged via nearest-neighbor mapping ("最近邻 = dsh 运行时不可用，属环境故障非过期") but no edge case and no explicit out-of-scope record; Setup treats availability as a precondition. Residual deduction in D7.2. |
| 17 | No new issues introduced? | **Verified clean** | All additions (fixture definitions, probes, Step 2c, isolation note, deferral notes, Derived Outcomes) checked against PRD sources — all sound. New findings this iteration are pre-existing gaps surfaced by deeper verification (Step 1 rail-expansion ambiguity) and downstream-executability patterns (BS1–BS3), listed below. |

---

## Phase 1 — Reasoning Audit (pre-score anchors)

1. **Workflow coverage**: Steps 1–6 cover the session-workbench workflow end to end and map verifiably onto Story 2's three ACs (AC1→Step 2, AC2→Step 4, AC3→Steps 5–6), 流程二 (items 1/3 direct; item 2's recall tab deferred with citation), and Key Scenario 日常会话. This is the primary workflow, fully executable as a narrative.
2. **Executability for a downstream test-gen agent**: strong. Fixtures are named (two projects with distinct session states, per-project dock tabs, deterministic fixture message), probes are concrete, isolation is declared, equivalence classes are scoped. Remaining executability frictions: (a) Step 1 expects 甲's session rows visible at first screen, but UF-1's flow reaches session rows only via "展开项目节点" and Step 4 performs that expansion as if it were still needed — the rail's expansion state at startup is unspecified; (b) the dock-tab fixture and the historical-session fixture have no defined seeding mechanism (the document itself admits "预置通道 PRD 未定义"); (c) Step 4c's transient window has no deterministic production lever.
3. **Observable vs non-observable**: cleanly separated now — audit-channel claims (实时读/零缓存零副本) are explicitly labeled as code-review assertions, and the 恢复链路 label is flagged as a PRD assertion tag, not behavior.
4. **Invariant audit**: no violations. Step 5 upholds Invariant 3 (verified against UF-5/UF-7 "强制隐藏（不可见）"), Step 6 upholds Invariant 4, Steps 3–5 uphold Invariants 1/5; Step 1c's zero-project run is consistent with Invariant 4 under the vacuous "当前项目页签 = ∅" reading and is explicitly isolated from the Setup fixture baseline.

---

## Phase 2 — Rubric Scoring (verification stance)

### Dimension 1: Completeness (完整性) — 195/200 (min 120: PASS)

| Criterion | Score | Justification |
|---|---|---|
| 1.1 Metadata | 50/50 | `journey: "session-workbench"` kebab-case ✓; `risk_level: "Medium"` valid and matches the in-doc classification rubric ("multi-step interaction without irreversible side effects" — sessions are created, nothing deleted) ✓; sources, generated, surface_types/keys populated ✓. `golden_path: false` verified as set-level convention (golden-path.md: "At least one Journey has `golden_path: true`"), not a defect. |
| 1.2 Steps complete | 76/80 | All 12 steps (6 happy + 6 edge) carry User Action + Expected Result in a coherent ordered sequence ✓; multi-entry ambiguities resolved by equivalence-class declarations (Steps 2, 5) ✓; Step 3's precondition is now deterministic via the Step 2 fixture ✓. −4: Step 1's Expected Result includes "项目甲会话行以 dsh 行语言呈现（标题 / 状态点 / 相对时间）" but its action is only "启动应用进入工作台首屏" — per UF-1 flow ("展开项目节点 → 显示该项目会话列表") and Step 4's own action ("左栏展开项目甲节点，点击历史会话行"), reaching session rows requires an expansion whose state at first screen is never established; a downstream agent must guess whether to expand 甲 before asserting. |
| 1.3 Outcomes: happy + required derived | 69/70 | Happy path ✓; boundary/state coverage thorough (1b collapse, 1c hero zero-project, 2b empty session, 4b placeholder, 4c skeleton) ✓; mandatory derived outcomes handled — validation-error by real Step 2c (including the whitespace-only boundary: "输入框为空或仅空白字符"), session-expired by reasoned N/A ✓. −1: the validation-error pattern's correct-and-retry half is never exercised — after "不发送——无消息上屏、无 agent 往返；空会话引导态保持，焦点仍在输入框", no step sends a valid message from the blocked state to close the loop (Step 2's valid send precedes 2c conceptually but is a different session state). |

### Dimension 2: Semantic Purity (语义纯度) — 196/200 (min 120: PASS)

| Criterion | Score | Justification |
|---|---|---|
| 2.1 Natural language, not code/regex | 78/80 | No regex, selectors, or assertion calls anywhere ✓; outcomes are user/system-observable states ✓. −2: Step 1 still embeds "与 dsh 账本一致（数据来源注记见 Invariant 2）" in the Expected Result — the pointer to Invariant 2's audit-channel classification is the right treatment, but the sentence leaves "一致" reading as a browser assertion until the reader follows the pointer. |
| 2.2 Preconditions declarative | 58/60 | All six edge preconditions lead with state declarations: "左栏处于展开态（~240px）", "应用零项目记录（首用状态；依 Setup 场景隔离独立启动）", "新建会话尚未发送任何消息", "对话 tab 输入框为空或仅空白字符", "打开的是项目乙（Setup 定义：刚注册、零会话）", "会话列表尚未就位（账本查询进行中的瞬态）" ✓. −2: the 4c parenthetical still names the internal operation ("账本查询进行中") as the state's definition rather than its surface symptom. |
| 2.3 No implementation coupling in Steps | 60/60 | Actions are clean UI operations (click rail entries, switch tabs, type draft, expand dock) ✓; Invariant 2's former architecture-coupling ("零缓存零副本" as a web assertion) is now explicitly reclassified as a code-audit channel, removing the coupling concern ✓. |

### Dimension 3: Precondition Exclusivity (前置条件互斥性) — 136/150 (min 90: PASS)

| Criterion | Score | Justification |
|---|---|---|
| 3.1 Preconditions distinct across Outcomes | 58/60 | Every step binds exactly one Expected Result; the six edge preconditions are mutually distinct (expanded rail / zero projects / unsent message / empty-or-whitespace input / sessionless project / list not yet loaded) — no two outcomes share or overlap a precondition ✓. −2: the within-step outcome-selection mechanism the criterion protects is never exercised structurally (one outcome per step throughout); Step 2c's OR-trigger ("为空或仅空白字符") is the only multi-condition precondition and it still selects exactly one outcome. |
| 3.2 Sufficient to uniquely select an Outcome | 42/50 | Step 5's former three-entry ambiguity is resolved by the 覆盖口径 declaration; Step 2c's OR precondition selects one outcome unambiguously; Setup now pins the state Step 6 depends on. −8: (a) Step 4c's precondition "会话列表尚未就位（账本查询进行中的瞬态）" cannot be deterministically arranged — nothing controls ledger-query timing, so whether the outcome is reachable depends on luck (−5); (b) Step 1's outcome presupposes 甲's session rows are visible without stating the rail expansion state that makes them visible (−3, shared root with D1.2). |
| 3.3 No missing Preconditions for error/boundary Outcomes | 36/40 | All six edge cases state preconditions, and the two former gaps are closed (Step 6's distinguishability now rests on the Setup dock fixture; Step 4b's identity is pinned to Setup's 乙) ✓. −4: fixture-backed preconditions lack setup levers — the dock fixture admits "预置通道 PRD 未定义" (no defined mechanism produces "甲·页签"), and Setup's "甲含至少一个历史会话（完整转录）" names no seeding path either; a boundary/edge outcome whose enabling fixture cannot be constructed is under-preconditioned for execution. |

### Dimension 4: Fact Alignment (事实依据) — 143/150 (min 90: PASS)

Independent verification: every load-bearing claim checked against sources. Verified verbatim matches: rail composition and dsh 行语言 fields (UF-1), ~240px/56px + 悬停提示 (UF-1 Position/Flow), 「暂无会话」placeholder + 新注册项目 trigger (UF-1 States), 行级骨架 + 账本查询进行时 (UF-1 States), hero + 「＋添加项目」CTA (UF-2), 空会话=引导输入 and 恢复中骨架 (UF-4 States), 三页签切换不重置 (UF-4 Validation), 知识模式右栏隐藏（已展开也隐藏）+ 按记忆恢复 + 会话草稿保留 (UF-5), dock 默认收起轨道归零 / 可见集=当前项目+全局 / 切回恢复含展开态 / 强制隐藏不可见 (UF-7), Story 2's three ACs, 流程二, SC1/SC6①②, Key Scenario 日常会话. No counterfactual claim found.

| Criterion | Score | Justification |
|---|---|---|
| 4.1 Factual claims traceable / UNKNOWN | 55/60 | Document-level "**PRD 溯源**: Story 2…UF-1（rail）、UF-4…UF-5…UF-7…SC1、SC6①②" is present and survives claim-by-claim verification ✓. −5: no per-claim fact_id or UNKNOWN mechanism — traceability is batch-level, so an auditor must manually match each assertion (e.g., "轨道归零") to its UF source; the doc-set convention tolerates this, but the rubric asks for per-claim traceability. |
| 4.2 Inferred claims with rule support + source: inferred | 48/50 | Six inferred annotations, each with a stated basis: Step 2 equivalence class, Step 2 fixture/tool-call guarantee, Setup dock fixture ("P1 页签占位为主，UF-7；source: inferred——预置通道 PRD 未定义"), Step 4b derived quality items ("UF-1 仅定义占位态，质量项为派生"), Derived Outcomes ×2 ("必察项 × UF-4", "必察项 × PRD 安全边界映射") ✓ — this is the convention the sibling set established, applied consistently. −2: "本轮含 ≥1 次工具调用（fixture 消息保证触发——source: inferred）" justifies the guarantee by the fixture's own design (circular); the reasoning basis should cite agent tool-calling behavior for a directory-listing request, not the fixture that presupposes it. |
| 4.3 No hallucinated unclassified claims | 40/40 | Zero unclassified claims beyond sources found — all formerly bare quality embellishments now carry inferred annotations, and every factual claim matched PRD/proposal text during verification. |

### Dimension 5: Surface Fitness (Surface 适配, web-parameterized) — 142/150 (min 90: PASS)

| Criterion | Score | Justification |
|---|---|---|
| 5.1 Mandatory derived Outcomes present | 58/60 | Both surface-web mandatory outcomes handled: `validation-error` by real Step 2c (precondition covering empty AND whitespace-only, expected result asserting no-send, no round trip, guidance intact, focus retained) and by the Derived Outcomes entry citing "surface-web required_outcomes 必察项 × UF-4"; `session-expired` by reasoned N/A with nearest-neighbor mapping ("单机产品无登录会话 / 过期概念（PRD 单机安全边界…）；最近邻 = dsh 运行时不可用"), both `source: inferred` ✓. The 0-rule does not fire. −2: surface-web's validation-error pattern includes "user can correct and retry" — the block is asserted but the retry leg is never exercised (cross-manifestation of the D1.3 residual, primary hit taken once here). |
| 5.2 Test strategy proportions (Web: balanced 50/50) | 48/50 | 12 scenarios split cleanly: contract-extractable component rules (collapse/expand, hero empty state, session placeholder, list skeleton, empty-input block, tab-switch no-reset) and journey-smoke material (round trip, resume, view swap, project switch) — proportions respected ✓; the named probes (①②) improve extractability. −2: Steps 5/6 remain composite multi-assert blocks, coarser-grained than the other steps for contract extraction. |
| 5.3 Environment/execution assumptions realistic | 36/40 | Browser interaction model ✓; async handled with skeletons for the two read paths (Step 4 "恢复期间呈加载骨架"; Step 4c "呈现行级骨架") ✓; dsh runtime availability declared in Setup ✓. −4: (a) the dock-tab fixture presumes a seeding channel the document admits is undefined ("预置通道 PRD 未定义") and UF-7 defines no user action that creates a project-scoped tab — the fixture is realistic in intent but unconstructible as specified (−2, blindspot BS1); (b) the flow's longest async operation, the real agent round trip, still carries no stability/wait consideration despite the proposal's own risk table flagging e2e round-trip stability (−2). |

### Dimension 6: Internal Consistency (一致性) — 145/150 (min 90: PASS)

| Criterion | Score | Justification |
|---|---|---|
| 6.1 Invariants hold in every Step | 60/60 | No violations found. Step 5 upholds Invariant 3 ("知识模式下右栏隐藏（已展开也隐藏）" = UF-5/UF-7 verbatim); Step 6 upholds Invariant 4 with the fixture-backed distinguishable sets; Steps 3–5 uphold Invariants 1/5 with concrete probes; Invariant 2 is correctly reclassified as an audit channel; Invariant 1's recall-tab scope is explicitly delegated ("知识召回 tab 由兄弟 Journey knowledge-recall-flywheel 行使"), eliminating the former vacuous third. Step 1c's isolated zero-project run is consistent with Invariant 4 under the current-project-tabs-empty reading and is excluded from the fixture baseline by the isolation statement. |
| 6.2 Cross-Step references consistent | 45/50 | All references resolve: Step 3 → Step 2 fixture ✓; Step 4/4b → Setup 甲/乙 definitions ✓; Step 5 → "Step 4 会话行" and "Step 4 会话转录" ✓; Step 6 → "衔接 Step 5 终态：右栏展开、甲会话打开" ✓; Step 1c → Setup isolation ✓; sibling deferrals (knowledge-recall-flywheel, knowledge-browsing) verified to exist and cover the deferred scopes ✓. −5: (a) Step 1 expects "项目甲会话行…呈现" at first screen while Step 4's action treats "左栏展开项目甲节点" as the prerequisite for reaching session rows — the two steps imply different default expansion states without the document stating which holds (−4); (b) Step 5's "切回后右栏按记忆恢复原展开态（页签条仍可见）" — the "仍" reads as if the strip never hid, in mild tension with the same step's "知识模式下右栏隐藏（已展开也隐藏）" and UF-7's 强制隐藏=不可见; the intended meaning (strip visible again once restored) is recoverable but the phrasing invites misreading (−1). |
| 6.3 Risk level consistent | 40/40 | Medium = multi-step interaction without irreversible side effects — exact: sessions and drafts are created/preserved; nothing is deleted or mutated irreversibly. |

### Dimension 7: Workflow Coverage (工作流覆盖度) — 141/150 (min 90: PASS; veto NOT triggered)

| Criterion | Score | Justification |
|---|---|---|
| 7.1 Golden Path existence (veto) | 60/60 | Veto not triggered. Happy Path Steps 1→6 form a contiguous domain-level sequence semantically matching Story 2 (AC1 → Step 2 "完成一次真实 agent 往返"; AC2 → Step 4 "全部消息与工具调用按时间序完整呈现"; AC3 → Steps 5–6 retention/tab-follow), 流程二 (1: "dock 页签集跟随项目切换，面板状态不打断" → Step 6; 2 → Steps 2–3 + deferred recall tab; 3 → Step 4), and Key Scenario 日常会话. Steps reference domain operations (发起会话、切页签、恢复会话、切视图、切项目), not API calls. `golden_path: false` frontmatter verified as the set-level designation convention (knowledge-recall-flywheel is the set's designated Golden Path Journey), not a content contradiction — no deduction. |
| 7.2 Multi-step coverage depth | 44/50 | Beyond the golden path: cross-entity state interactions (projects × sessions × dock tabs × view states × drafts), retention/restore semantics across both switch axes, and six edge states (collapse, hero, empty session, empty-input block, sessionless placeholder, loading skeleton) — deep coverage. −6: no error-recovery branch anywhere — failed send / runtime unavailable is the workflow's most probable real-world failure, is acknowledged only as a classification note ("最近邻 = dsh 运行时不可用，属环境故障非过期"), and has neither an edge case nor an explicit out-of-scope record. |
| 7.3 Completeness against PRD scope | 37/40 | Story 2's three ACs fully covered; 流程二 item 2's recall-tab residue now explicitly deferred with citation ("由兄弟 Journey knowledge-recall-flywheel 承载（流程二第 2 条）") — verified the sibling covers it. −3: UF-1's search-filter validation rule ("项目/会话搜索过滤…不改变选中态") is covered by no journey in the set and unmentioned here; auxiliary to Story 2, hence small, but it is a PRD-declared user-facing behavior with no owner. |

### Cross-dimension coherence check

- The fixture-constructibility root (dock tabs, historical transcript) manifests as D3.3 (−2 component), D5.3 (−2), and blindspot BS1/BS2 — single root, split manifestations, no double-count beyond the rubric's own criterion scopes.
- The correct-and-retry residual is taken once in D5.1 (primary) and once in D1.3 (completeness manifestation), mirroring iteration-1's root-cause splitting convention.
- The Step 1 expansion ambiguity is taken once in D1.2 (−4) and once in D6.2 (−4) as two distinct failure modes of the same sentence (missing enabling action vs cross-step contradiction) — consistent with how iteration-1 treated the Setup/1c contradiction (D6.2) alongside its executability cost.
- Withdrawn iteration-1 deductions (golden_path flag −2/−4) documented in Phase 0 #13 with the rule-file evidence; they do not bias iteration-2 totals in either direction.

---

## Phase 3 — Blindspot Hunt (QA-domain patterns outside rubric dimensions)

- **[blindspot] BS1 — fixture constructibility undefined for the dock-tab premise**: Setup: "dock 页签 fixture：甲/乙各预置一个项目级页签（甲·页签 / 乙·页签）+ 全局页签常驻，可见集可区分（P1 页签占位为主，UF-7；source: inferred——预置通道 PRD 未定义）". The document admits the preset channel is undefined, and UF-7's interaction flow contains no user action that creates a project-scoped tab (展开 / 切换项目 / 切回 only). Downstream, no UI path, seed file, or API is specified to materialize "甲·页签" — Step 6's core premise may be unconstructible against the shipped P1 build. Must improve: specify the seeding mechanism (e.g., pre-seeded application view-state store entry written by the test harness in Setup) or restate Step 6's assertion in terms of whatever the placeholder mechanism actually guarantees.
- **[blindspot] BS2 — completeness oracle lacks concrete expected shape**: Step 4: "完成后 Setup 预置历史会话的全部消息与工具调用按时间序完整呈现". "全部" is unassertable unless the preset transcript's shape is known — Setup says only "甲含至少一个历史会话（完整转录）" with no message count, tool-call count, or distinctive markers. A downstream test can only smoke-check non-emptiness, silently passing a transcript that drops half the messages. Must improve: define the fixture transcript concretely (e.g., ≥3 条消息 + ≥2 次工具调用，首末条含可识别标记串) so completeness and time-ordering have an oracle.
- **[blindspot] BS3 — transient-negative assertion not deterministically verifiable**: Step 6: "中区面板不打断——探针：会话面板不闪断、不回空态". "不闪断" asserts the absence of a transient visual state; browser automation can only stably assert final states (the panel content is still present, no empty-state element exists) — a flicker that comes and goes between polls is invisible to the test and a naive polling implementation flakes. Must improve: reframe the probe as assertable post-conditions (Step 4/5 transcript and draft still present immediately after the switch; no empty-state element rendered) or specify instrumentation (e.g., asserting no unmount via a stable element reference across the switch).

---

## Deduction Rule Applications

| Rule | Applied | Detail |
|---|---|---|
| Missing required field/section → 0 for dimension | Not applied | All sections present (Overview/Setup/Happy Path/Edge Cases/Derived Outcomes/Invariants); Derived Outcomes added this iteration. |
| Hallucinated unclassified claim −30 | Not applied | Zero unclassified claims; every beyond-source claim carries `source: inferred` with basis (verified against PRD). |
| Surface type violation −25 | Not applied | No CLI/API constructs; the former audit-channel mismatch is resolved by explicit channel classification in Invariant 2. |
| Invariant violation −40 | Not applied | No invariant violated by any step (Phase 1 #4 audit). |
| Precondition overlap −20/pair | Not applied | No overlapping precondition pair exists. |
| Golden Path veto | Not triggered | Golden path present and semantically verified against Story 2 / 流程二 / Key Scenario (D7.1). |
| API-level golden path steps −15/step | Not applied | All steps are domain-level user operations. |

---

## Final Summary

```
SCORE: 1098/1150
DIMENSIONS:
  Completeness: 195/200
  Semantic Purity: 196/200
  Precondition Exclusivity: 136/150
  Fact Alignment: 143/150
  Surface Fitness: 142/150
  Internal Consistency: 145/150
  Workflow Coverage: 141/150
```

**Verdict: PASS** (total 1098 ≥ 975; every dimension above its min threshold).

Iteration-1 verdict was FAIL at 882 with Surface Fitness 71 < 90. All fifteen scored attack points from iteration 1 are resolved or largely resolved (Phase 0 table); one iteration-1 deduction (golden_path flag) is withdrawn as a convention misread with rule-file evidence. Residual weaknesses are modest and listed for optional hardening, in priority order:

1. Fixture constructibility: define the seeding channel for dock tabs and the historical-session transcript (BS1/BS2, D3.3/D5.3 residual) — the largest remaining downstream-executability risk.
2. Step 1 rail-expansion state: state whether 甲's node is expanded at first screen, or add the expansion to Step 1's action (D1.2/D6.2).
3. Error-recovery: add a runtime-unavailable/send-failure edge or record explicit out-of-scope (D7.2 residual, iteration-1 B3 residue).
4. Step 4c: give the transient a deterministic production lever or mark it best-effort (D3.2 residual).
5. Micro: retry-after-block leg (D5.1), "（页签条仍可见）" phrasing (D6.2), fixture-guarantee circularity (D4.2), search-filter rule ownership (D7.3), "不闪断" reframing (BS3).
