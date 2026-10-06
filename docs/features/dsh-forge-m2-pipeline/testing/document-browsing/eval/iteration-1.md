# Eval Report: journey/document-browsing — Iteration 1

- **Eval type**: journey (rubric scale 1150, target 975, every dimension ≥ min threshold)
- **Surface**: web (rule: `gen-journeys/rules/surface-web.md`)
- **Target**: `docs/features/dsh-forge-m2-pipeline/testing/document-browsing/journey.md`
- **Cross-referenced**: prd-spec.md (SC4, 流程三, In Scope ③), prd-user-stories.md (Story 5), prd-ui-functions.md (UF-2), design/tech-design.md (Interface 4, Integration #5, Dependencies)
- **Scorer stance**: adversarial; every assertion treated as unverified until traced; every deduction cites the document
- **Date**: 2026-10-07

## Final Score

| Dimension | Score | Min Threshold | Pass |
|---|---|---|---|
| 1. Completeness | 169/200 | 120 | YES |
| 2. Semantic Purity | 184/200 | 120 | YES |
| 3. Precondition Exclusivity | 125/150 | 90 | YES |
| 4. Fact Alignment | 110/150 | 90 | YES |
| 5. Surface Fitness | 84/150 | 90 | **NO** |
| 6. Internal Consistency | 142/150 | 90 | YES |
| 7. Workflow Coverage | 118/150 | 90 | YES |
| **Total** | **932/1150** | **975 + all thresholds** | **NO** |

**Verdict: FAIL.** Below target on both conditions: total 932 < 975, and Surface Fitness 84 < its min threshold 90. Highest-leverage fix is the web-mandatory derived outcomes gap (same systemic failure as sibling journeys task-dispatch-pipeline and interrupted-dispatch-recovery in their iteration 1).

---

## Phase 1 — Reasoning Audit (pre-score anchors)

1. **Story mapping is faithful and the best-grounded of the feature's journeys.** The 5-step happy path maps one-to-one onto PRD Story 5 and 流程三: Step 1 = browsing the feature sub-tab doc list; Step 2 = 流程三.2 (dock doc tab + docRel dedup + canonical path bar); Step 3 = the mermaid/erDiagram acceptance anchor; Step 4 = 「在编辑器中打开」; Step 5 = Story 5 AC2 (仓外同构). Spot-checks verify near-verbatim against prd-ui-functions.md UF-2: 「行尾 › 箭头」= UF-2.1; 「回退占位卡（源码 + 回退注记）」= UF-2.4; 「零命中…一等展示，非错误」= Story 5 AC2.
2. **The journey correctly resolves a source conflict without acknowledging it.** Story 5 AC1 says 「右侧只读**抽屉**呈现」 while PRD In Scope ③ / 流程三 / UF-2 all say dock **独立文档 tab**（UF-2: 「非抽屉」）. The journey follows the doc-tab form (correct per the requirement layer's resolved truth) but silently — a downstream reader citing Story 5 alone would see a contradiction.
3. **Edge anchoring is correct** — unlike both evaluated siblings (which mislabeled 3b). 5b is a variant of Step 5's action, 2b/2c of Step 2's, 3b of Step 3's. Steps 1 and 4 carry no edge variants.
4. **Risk level Low is correct**: the workflow is read-only browsing throughout; the only external effect (editor jump) is explicitly carved out as non-writing.
5. **Real defects found**: (a) web-mandatory derived outcomes (`validation-error`, `session-expired`) neither present nor N/A-annotated; (b) one constructible precondition overlap (2b ∩ 2c); (c) zero `source: inferred` / rule-citation annotations; (d) Story 5 AC4 (file-system-level zero-write walkthrough) demoted from outcome to invariant; (e) uncovered PRD flow pieces (close-tab return, 仓内 proposal/PRD browsing, ↻ 重读).

---

## Phase 2 — Dimension Scoring

### 1. Completeness — 169/200

**Metadata (49/50).** Frontmatter complete: kebab-case name `document-browsing`, `risk_level: "Low"` (valid value, justified — the content is read-only browsing, matching the document's own criteria comment 「Low = Workflow is read-only or purely observational」), `surface_types`/`surface_keys` non-empty, three `sources` including prd-ui-functions.md, `generated` present. No material defect.

**Steps complete with required fields (75/80).** All 5 happy steps carry `**User Action**` + `**Expected Result**` and form a coherent ordered sequence. Deduction (−5): Step 3's action is purely observational — 「**User Action**: 查看文档中的 mermaid 图（erDiagram）」 — no interaction occurs; the step's substance is entirely its expected render, weakening it as an executable action for a downstream agent (same class as the passive-reception step docked in the interrupted-dispatch-recovery eval). Step 1's 「浏览…文档行」 is similarly observational but at least has list-rendering as an observable.

**Outcomes cover happy path plus required derived scenarios (45/70).** Happy path fully covered; 4 edge cases present and each maps to a real PRD-mandated boundary (零命中 = Story 5 AC2; 悬空 = SC-branch / 流程三.4; 去重 = UF-2.2; mermaid 回退 = UF-2.4) — good boundary selection. Deductions: (a) the web surface's `required_outcomes` (`validation-error` + `session-expired`) produced **zero** derived outcomes and **zero** consideration records — no N/A note, no rule citation, nothing; (b) Step 4 (「在编辑器中打开」) has no edge variant despite a designed rejection path (tech-design: openExternal 「先经桥校验路径在册」…「越界即拒」); (c) no close-tab scenario although 流程三.3 / UF-2.6 specify 「chip × 关闭 → 回概览或开始页」.

### 2. Semantic Purity — 184/200

**Natural language, no code/regex (74/80).** No regex, CSS/XPath selectors, or framework assertion calls anywhere. Deduction: expected results embed mechanism/verification parentheticals rather than observations — Step 3: 「mermaid 代码块渲染为图（erDiagram = 验收锚；mermaid 库懒加载）」 mixes the test-anchor label and the loading mechanism into the user-visible outcome (a user observes a rendered diagram, not 「库懒加载」); Step 1: 「文档行经真实发现链建行（注册 / 首次打开只读扫描按目录约定）」 states data provenance methodology inside an outcome.

**Preconditions declarative (58/60).** Setup bullets and all four edge `**Precondition**` fields are states, not procedures (「项目目录内无任何约定文档（零命中）」, 「该文档的 tab 已打开」). Clean; −2 for Setup's 「仓外项目夹具：按目录约定预置目录结构」 being a fixture recipe rather than a state description (minor, Setup's nature).

**No implementation coupling in steps (52/60).** Step actions stay user-level (浏览 / 点击 / 查看 / 跳转 / 切换). Coupling lives in expected results: 「按 docRel 去重」 (technical dedup key), 「canonical 路径栏」, 「经真实发现链建行」 — all PRD's own vocabulary (prd-spec uses them verbatim), so the coupling is inherited from source, but per the rubric bar ("not… API endpoint details") the parentheticals pull outcomes toward implementation. Invariant 1 carries verification methodology inline: 「（文件系统级监控验证，SC3 回归；…）」.

### 3. Precondition Exclusivity — 125/150

**Distinctness across outcomes (48/60).** One ambiguous pair. Step 2b's precondition: 「文档引用悬空（模拟分支切换后文件不在当前分支）」; Step 2c's: 「该文档的 tab 已打开」. These are orthogonal dimensions (file existence × tab state), and the combined state is constructible: open a doc (tab opens, per Step 2), switch branches so the file dangles (2b's own trigger), then click the same row again — both preconditions hold, yet the expected results diverge in framing (2b: 「只读缺省渲染并标注悬空」 vs 2c: 「激活已有 tab（不新开）」), and nothing states whether the activated tab re-reads (showing the dangling placeholder) or shows stale content. A tester cannot determine which outcome applies. −12 (narrower intersection than the dispatch journey's two pairs, which cost −20 combined there).

**Sufficient to uniquely select an outcome (40/50).** Unique selection fails exactly in the 2b ∩ 2c corner; all other combinations separate cleanly: 5b (no docs at all) excludes every click-based outcome; 3b's 「mermaid 源非法或渲染失败」 requires content present, which 2b (file gone) excludes.

**No missing preconditions for error/boundary outcomes (37/40).** All four edge cases state explicit triggers; 2b even includes the fixture recipe hint 「模拟分支切换后文件不在当前分支」 — better than the sibling journeys. −3: 3b's 「mermaid 源非法或渲染失败」 is a two-cause disjunction whose boundary (what counts as 渲染失败 vs 非法源) is undefined, and no boundary outcome exists at all for Step 4's jump failure.

### 4. Fact Alignment — 110/150

**Factual claims traceable (52/60).** Document-level traceability exists (frontmatter `sources`; Overview cites 「PRD Story 5；业务流程三；SC4；UI Function 2」), and every spot-checked claim verifies: 「整行可点（行尾 › 箭头）」 = UF-2.1; 「dock 开出独立文档 tab（按 docRel 去重）」 = 流程三.2 / UF-2.1-2; 「只读徽标」 = Story 5 AC1; 「回退占位卡（源码 + 回退注记）」 = UF-2.4 verbatim; 「跳转…（跳转不写文件）」 = Story 5 AC1/AC4; 「零命中…空态（一等展示，非错误）」 = Story 5 AC2 verbatim; 「不崩溃、不写入、不删行（SC-branch）」 = Story 5 AC3. Deductions: no per-claim trace markers anywhere in the document (no fact references, no UNKNOWN markings — the annotation convention is entirely absent); two silent extrapolations presented as fact — invariant 3's 「文件恢复后可正常打开」 (PRD only mandates 不删行; recovery-on-restore is inferred from tech-design's 「行此后稳定（悬空 ≠ 缺行）」) and Step 3b's 「不影响文档其余部分渲染」 (inferred from tech-design's per-segment rendering 「md 段经 MarkdownDoc,mermaid 段经 MermaidDiagram」, not stated in any PRD/UF text).

**Inferred claims have required_outcomes rule support + `source: inferred` (20/50).** Zero `source: inferred` annotations and zero citations of the web surface's `required_outcomes` rules exist in the document. The derived boundary outcomes that do exist (5b, 2b, 2c, 3b) are all PRD-grounded, so none needed the annotation — but the web-mandatory derivations that the rule requires were not performed and their absence is not justified, leaving the inference mechanism entirely unused.

**No hallucinated unclassified claims (38/40).** No claim contradicts PRD/design; the two extrapolations above are reasonable inferences from the cited source set but technically unclassified.

### 5. Surface Fitness — 84/150 (BELOW THRESHOLD 90)

**Mandatory derived Outcomes (12/60).** The web rule requires `validation-error` and `session-expired` to be **considered for every Web Journey**. Both are absent in their specified form and neither is marked considered/inapplicable:
- `validation-error`: this journey contains no form and no user input field, so a genuine instance may not exist — **but the document never says so**. An explicit reasoned N/A annotation citing the rule was the minimum bar. The closest unlabeled analog is Step 3b (invalid content → error display localized to the element, surrounding content unaffected) — weaker than the dispatch journey's analogues because no retry-by-user exists.
- `session-expired`: completely absent and unannotated. The thematic analog is Step 2b (resource vanishes mid-session → graceful degradation, no data loss, entry preserved) — adjacent, never linked to the rule.
Per the rubric ("Score 0 if mandatory Outcomes are completely absent"), a strict reading scores 0; the 12 points credit the implicit analogues, matching sibling calibration (interrupted-dispatch-recovery: 15; task-dispatch-pipeline: 18, both with stronger analogues).

**Test strategy proportions (38/50).** Web guidance is balanced 50/50 Contract/Journey. Unlike both evaluated siblings (contract-heavy skew, 30-32/50), this journey is genuinely journey-smoke shaped: every step is a browser flow (browse → click → view render → external open → switch project), which is the correct shape for the web surface. Contract-grade behaviors (dedup on docRel, mermaid parse fallback, empty state) are embedded as edge outcomes rather than separated. Deduction: the contract half is only implicitly present — no outcome isolates a single component/interaction behavior for Contract-level testing depth.

**Surface-specific environment/execution assumptions (34/40).** Realistic where present: dock-tab browser interaction, async lazy-loaded mermaid rendering (no fixed timeouts), multi-tab state, cross-project switching. No CLI-style or unrealistic assumptions. Deductions: the surface rule's async handling guidance (wait strategies for render stability, animation completion before asserting the diagram) is untouched — Step 3 asserts a rendered diagram with no stability consideration; no browser-state hygiene between the 仓内 → 仓外 project switch (Step 5) is considered.

### 6. Internal Consistency — 142/150

**Invariants hold in every step (57/60).** All four invariants checked against all 9 scenarios: 只读纪律 holds everywhere, and Step 4's 「跳转不写文件」 correctly matches invariant 1's own carve-out 「显式「在编辑器中打开」跳转除外——跳转不写文件」; docRel dedup is consistent between Step 2 and 2c; 悬空 tolerance matches 2b; 仓内/仓外同构 matches Step 5. No violations. −3: invariant 3's second clause 「文件恢复后可正常打开」 is asserted but no step or edge exercises it (untestable as written — see blindspot #2).

**Cross-step references consistent (46/50).** Edge anchor numbering is correct throughout (5b→Step 5 action, 2b/2c→Step 2 action, 3b→Step 3 action) — the only journey among the three evaluated so far with zero mislabeled anchors. Deduction: Step 5's 「切换到仓外项目」 presumes a project-switching operation the document never grounds — per tech-design Integration #5 the overview's project context derives from the main-view session (knowledge-anchor ruling), so the reference to "the 仓外 project" presupposes navigation machinery no step or setup establishes (scored here as a dangling contextual reference; its executability impact is blindspot #3).

**Risk level consistent (39/40).** Low is correct and matches the document's own criteria: read-only browsing, no state mutation, the single external action explicitly non-writing.

### 7. Workflow Coverage — 118/150

**Golden Path existence (54/60, no veto).** Verified semantically: the contiguous 5-step sequence maps onto PRD Story 5's core workflow (「在概览页签的提案/feature 子 tab 浏览项目文档，点开只读文档…核对规格，并可跳转编辑器打开」 → 仓外同构) and 流程三. Step titles/actions use domain-level user operations (浏览、点开、查看、跳转编辑器、切换项目) — no API-level descriptions, so no per-step altitude penalty applies. `golden_path: false` correctly delegates the feature-level Golden Path to task-dispatch-pipeline (consistent with the sibling eval interpretation). Deductions: Step 3 is observational rather than operational; Step 5 is a second-project repetition of the same workflow rather than a deepening of the primary path.

**Multi-step coverage depth (35/50).** Covers cross-project (仓内/仓外) and cross-sub-tab (提案/feature, 仓外 only) workflows, doc-tab lifecycle open + dedup-activate, render fallback isolation, empty state, and dangling tolerance. Missing depth: tab lifecycle end (close → 回概览或开始页, specified in 流程三.3/UF-2.6), recovery after file restore, parallel multi-doc coexistence as an exercised scenario (only asserted as a parenthetical inside 2c), parent-row metadata expansion (UF-1 提案/feature 子 tab interaction that is this journey's entry surface).

**Workflow completeness against PRD/Design scope (29/40).** Story 5's four ACs: AC1 → Steps 1-4 ✓; AC2 → Step 5 + 5b ✓; AC3 → Step 2b ✓; AC4 (「走查一次全流程…文件系统级监控证明零写入」) is **demoted to invariant text** — 「只读纪律：应用对代码仓与文档位置零写入（文件系统级监控验证，SC3 回归…）」 — with no step or outcome executing the monitored walkthrough, so a downstream agent derives no testable case from an explicit AC. SC4's e2e scope 「仓内项目浏览 proposal/PRD/design」 is only partially honored: the journey opens only 「一篇 design 文档」 in-repo (proposal sub-tab and PRD doc-kind are exercised only in the 仓外 branch, Step 5); UF-2.3's ↻ 重读 affordance is uncovered.

---

## Cross-dimension coherence check

- Steps ↔ outcomes ↔ invariants are mutually aligned; risk level Low is coherent with content; edge anchoring is internally consistent. No cross-dimension contradiction found between steps and invariants.
- The dominant coherence gap radiates from the missing web-mandatory derived outcomes: it manifests as missing scenarios (Completeness −), an unused inference/annotation mechanism (Fact Alignment −), and surface-rule non-compliance (Surface Fitness −, below threshold). These are distinct facets scored separately per the rubric; the threshold failure is carried in Surface Fitness where it is most direct.
- Secondary coherence gap: PRD AC4's monitored zero-write walkthrough exists only as invariant-1 parenthetical text, so the Journey's strongest safety claim has no executable anchor — split between Workflow Coverage (−) and Internal Consistency (−3 on invariant testability).

---

## Phase 3 — Blindspot Hunt

1. **[blindspot] Dangling × 「在编辑器中打开」 interaction untested.** Quote: Step 2b 「只读缺省渲染并标注悬空（路径栏保留）；不崩溃、不写入、不删行」 — the dangling tab retains the path bar, and UF-2.3 places the 📁 editor button in that bar; Step 4 exercises the jump only for a healthy doc. Tech-design gates the jump by 「先经桥校验路径在册——…rel_path canonical 解析全集（越界即拒）」; whether a dangling file's jump succeeds, fails, or is disabled is a primary production bug class for this exact surface and has no outcome. The journey must add an edge for editor-open under dangling (and ideally the path-validation rejection path for Step 4).
2. **[blindspot] Recovery half of invariant 3 asserted but never exercisable.** Quote: 「悬空文档不崩溃、不写入、不删行（条目保留，文件恢复后可正常打开）」 — no step or edge restores the file and re-opens/re-reads. UF-2.3's ↻ 重读 button is the natural recovery observable and appears nowhere. As written, a test suite built from this journey can verify the tolerant degradation but never the promised recovery, and the unmarked inference 「文件恢复后可正常打开」 stays untested.
3. **[blindspot] Step 5's project switch is not executable by a downstream agent.** Quote: 「**User Action**: 切换到仓外项目，浏览其概览提案 / feature 子 tab并点开文档」 — per tech-design Integration #5, the overview's project context follows the main-view session/workspace (knowledge-anchor ruling); the document never says what user-level operation performs the switch (switch workspace in sidebar? switch session? reopen overview?). Ambiguous action = untestable step, the exact failure pattern the QA persona watches for.
4. **[blindspot] 「多文档可并存开多个 tab」 is smuggled into 2c without its own trigger.** Quote: Step 2c 「激活已有 tab（不新开）；多文档可并存开多个 tab」 — the second clause describes a *different* behavior (open a second, different doc → second tab) whose triggering action (click a different doc row) appears in no step or edge. A downstream agent testing only 2c's trigger (re-click the same row) never opens a second document, and the multi-tab coexistence claim goes unexercised.
5. **[blindspot] 懒加载 asserted as an outcome is unverifiable at journey level.** Quote: Step 3 「mermaid 代码块渲染为图（erDiagram = 验收锚；mermaid 库懒加载）」 — visiting only mermaid-containing docs cannot distinguish lazy from eager loading; the observable boundary is the zero-block case (tech-design: 「零块零加载」), which the journey never constructs. Either add a doc-without-mermaid observation or move the loading claim to annotation/contract level.
6. **[blindspot] Silent resolution of the 抽屉 vs doc-tab source conflict.** Quote: Step 2 「dock 开出独立文档 tab（按 docRel 去重）；内容呈现正文只读渲染 + canonical 路径栏 + 只读徽标」 — Story 5 AC1 (a cited source) says 「右侧只读抽屉呈现」 while UF-2 says 「非抽屉」. The journey correctly follows the resolved form but never notes the discrepancy, so a reader tracing the citation chain hits an unexplained contradiction.

---

## Attack Summary (what must improve for iteration 2)

1. **[surface-fitness]** Add web-mandatory derived outcomes (`validation-error`, `session-expired`) or explicit, reasoned N/A annotations citing the web surface rule — currently neither exists. Highest-priority fix: this alone fails the pass condition (84 < 90), exactly as in both evaluated siblings.
2. **[precondition-exclusivity]** Disambiguate 2b vs 2c for the constructible state (tab already open AND file dangling): state whether re-activating an existing tab re-reads content (dangling placeholder shown) or shows stale render, or restrict 2c's precondition to non-dangling docs.
3. **[workflow-coverage]** Promote Story 5 AC4 from invariant text to an executable outcome (full-walkthrough under file-system monitoring), cover 流程三.3's close-tab return (「chip × 关闭 → 回概览或开始页」), and exercise 仓内 proposal/PRD doc browsing per SC4's e2e scope (currently only 「一篇 design 文档」 is opened in-repo).
4. **[fact-alignment]** Mark design-derived claims (「文件恢复后可正常打开」, 「不影响文档其余部分渲染」) with `source: inferred` + basis; adopt a per-claim trace or UNKNOWN convention.
5. **[completeness]** Give Step 4 an edge variant (jump under dangling / path-validation rejection) and make Step 3 an interaction (or fold into Step 2) rather than a bare 「查看」.
6. **[semantic-purity]** Move mechanism/verification parentheticals (「mermaid 库懒加载」, 「erDiagram = 验收锚」, 「文件系统级监控验证，SC3 回归」) out of expected results into annotations; keep outcomes observational.
7. **[blindspots]** Add outcomes for: editor-open under dangling; file-restore recovery via ↻ 重读; multi-doc coexistence with its own trigger (click a different doc); a concrete user-level project-switch action for Step 5; the zero-mermaid-block lazy-load boundary.
