# Journey Eval Report — iteration 1

- **Document**: `docs/features/dsh-forge-m2/testing/dual-form-consistency/journey.md`
- **Rubric**: `skills/eval/rubrics/journey.md` (1150 pts, target 975, every dimension ≥ threshold)
- **Surface**: web (`rules/surface-web.md`); test strategy Web = balanced 50/50; mandatory derived outcomes: `validation-error` + `session-expired`
- **Scorer persona**: Senior QA Engineer (adversarial)
- **Verdict**: **PASS (narrow)** — Total 979/1150 (≥ 975) AND every dimension ≥ threshold (min = Fact Alignment 120, Surface Fitness 96, both ≥ 90). The margin is 4 points; the defects below are real and should still be fixed before contracts are generated from this document.

| Dimension | Score | Threshold | Pass |
|---|---|---|---|
| 1. Completeness | 170/200 | 120 | ✓ |
| 2. Semantic Purity | 196/200 | 120 | ✓ |
| 3. Precondition Exclusivity | 139/150 | 90 | ✓ |
| 4. Fact Alignment | 120/150 | 90 | ✓ (closest to threshold) |
| 5. Surface Fitness | 96/150 | 90 | ✓ |
| 6. Internal Consistency | 118/150 | 90 | ✓ |
| 7. Workflow Coverage | 140/150 | 90 | ✓ |
| **Total** | **979/1150** | 975 | **✓ (narrow)** |

---

## Phase 1 — Reasoning Audit (pre-score anchors)

**Chain check (problem → solution → evidence → success criteria)**: The journey addresses PRD Story 4 (双形态一致 — transition-period users alternating terminal/frozen-plugin and app forms must not corrupt data) and Story 3 AC2/AC3 (状态回流与来源标识). Step-level tracing is near-verbatim: Step 1 ← Story 4 AC1 + Story 3 AC2 ("终端侧刚完成一次任务状态变更,When 回到应用看板,Then ≤5 秒内可见"); Step 2 ← Story 4 AC2 verbatim (`forge task status` 输出与看板一致); Steps 3+4 ← Story 4 AC3 (交替各 ≥1 次变更 + SC7 校验); Step 5 ← Story 3 AC3 + In Scope 项目三分模型. The chain problem → solution → evidence → success criteria is sound, and the journey genuinely exercises the dual-form story it claims.

**Pre-score anchors recorded before rubric scoring**:

1. **Anchor A (surface-rule engagement entirely absent)**: Zero `surface-web required_outcomes 映射` comments and zero `source: inferred` annotations anywhere — the annotation convention both revised siblings adopted after their iteration-1 failures. Two unlabeled functional analogs exist (Step 3b state-machine rejection ≈ `validation-error`; Step 4b app-absent ≈ weak `session-expired`), but nothing on the page demonstrates the rules were considered.
2. **Anchor B (systematic edge misanchoring)**: 3 of 5 edges are filed under base steps whose actions they do not vary — 2b (terminal burst → board view) is a Step 1 variant filed under Step 2 (session change → terminal view, the exact inverse direction); 4b (启动应用并打开任务看板) varies Setup's app-running state, not Step 4's action (运行一致性校验); 5b (冻结插件变更后在应用看板查看) is a Step 1/3 variant filed under Step 5 (挂接状态完整性). Only 1b and 3b anchor correctly.
3. **Anchor C (no driving-face / oracle channel for a web-declared journey)**: Nearly every mutation trigger lives outside the browser — "人在终端执行一次任务状态变更" (Step 1), "人在终端执行 `forge task status`" (Step 2), "终端与挂接会话轮流对任务执行操作" (Step 3) — and expected results require non-web oracles ("终端输出与看板展示一致", "无第二事实源、无数据损坏"). The document states no mechanism by which a web e2e drives or observes any of this, unlike both revised siblings ("跨面断言口径…测试进程直读 fixture forge 文件或 stub CLI stdout"; "e2e 驱动面注记").
4. **Anchor D (mutation-heavy journey without fixture isolation)**: Setup nominates "同一 forge 项目…两侧共享同一 forge 数据" with no disposable-fixture/isolated-userData/cleanup statement, although the workflow mutates task state from both forms — the exact defect class both sibling i1 reports flagged and the revision fixed ("本旅程含任务状态变更(claim),不得以生产仓为承载").
5. **Anchor E (attribution hard case unpinned)**: Step 3's "终端与挂接会话轮流对任务执行操作" does not say whether alternation targets the SAME task. Source attribution for a terminal change on a task with an active attachment is the hardest case (tech-design Interface 3 来源判定序: actor 标记 → 挂接推断兜底 "变更任务存在 status='active' 的挂接 → [会话],否则 [终端]") — the journey's core promise "变更来源逐笔标记正确" is never exercised at its hardest point.
6. **Anchor F (structure sound)**: `risk_level: High` correct (task state mutation + data-corruption verification); 5 edges ≥ 5 happy steps (High-risk density rule satisfied); `golden_path: false` correct feature-level delegation to `task-session-execution-loop`. No hallucination-class claim found (unlike session-loop i1): every headline behavior is PRD-verbatim.

---

## Phase 2 — Rubric Scoring

### 1. Completeness — 170/200

**1a. Journey metadata (50/50)** — Name `dual-form-consistency` kebab-case ✓; `risk_level: High` valid and justified (workflow mutates task state from both forms and verifies data integrity — exactly the rubric's High criteria) ✓; High-risk edge density rule satisfied (5 edges ≥ 5 happy steps) ✓; `surface_types`/`surface_keys` populated ✓; sources list all three PRD files ✓; `generated` present ✓; `golden_path: false` consistent with feature-level delegation ✓. Full marks.

**1b. Steps complete with required fields (75/80)** — All 5 happy steps have User Action + Expected Result and form a coherent ordered sequence matching Story 4's AC order. Deduction −5: Step 3's action is not deterministically executable by a downstream agent:

> "**User Action**: 双形态交替各执行 ≥1 次读写向变更操作(终端与挂接会话轮流对任务执行操作)"

Which operations (claim? transition? submit?) on which tasks (the same task or different tasks — the choice determines whether source attribution is exercised, see Anchor E) is unspecified. The sibling session journey names its operation precisely ("agent 在会话中提出执行一次任务 claim"); this step mirrors the PRD's looseness without operationalizing it.

**1c. Outcomes cover happy path + required derived scenarios (45/70)** — Boundary/error outcomes present and thematically strong (already-open board, high-frequency burst, simultaneity, offline window, frozen-plugin compat). Deductions:
- −15: the surface-web **mandatory** derived outcomes are present only as unlabeled functional analogs with zero evidence of consideration (Anchor A). `validation-error` analog = Step 3b's "如未满足前置则被 CLI 拒绝" (a state-machine rejection, not a labeled derivation); `session-expired` analog = Step 4b (weak — app-absent, not session expiry). Neither is derived from, cited to, or reconciled with the web `required_outcomes` rules.
- −6: the degraded-reflow boundary is absent. The ≤5s bound is this journey's core metric (asserted in Steps 1, 1b, 2b and invariant 2), yet the breach case — a terminal change arriving with the perception chain broken (>5s, watcher/sync failure) — has no edge. The sibling session journey covers the session-side analog explicitly (its Step 5b, sync-error toolbar + last-good board + rescan recovery); the terminal-side analog belongs here.
- −4: the attribution-under-overlap boundary is absent (Anchor E): Step 3b asserts state-machine handling but never asserts the surviving change's source mark is correct under overlap.

### 2. Semantic Purity — 196/200

**2a. Natural language outcomes (78/80)** — No regex, CSS/XPath selectors, or framework assertion calls anywhere; outcomes describe what the user observes. Dock −2 (pipeline-consistent with both siblings): Step 2's expected result is phrased as a cross-face comparison mechanism rather than an observation — "终端输出与看板展示一致" (see also blindspot B2).

**2b. Preconditions declarative (60/60)** — Setup bullets and all five edge Precondition fields are declarative states ("应用未启动时,终端侧已执行任务状态变更", "终端侧使用冻结插件(3.x)形态操作同一项目"). No procedural code. Full marks.

**2c. No implementation coupling in steps (55/60 → 58/60)** — Steps are user-level domain operations; `forge task status`, "[终端]/[会话]", "冻结插件(3.x)" are all PRD-verbatim domain terms. Unlike the session sibling, terminal actions here ARE the domain (dual-form usage), so their presence is not coupling. Dock −2: Step 4's action references a named test artifact — "对交替操作后的 forge 数据运行一致性校验(SC7 验收脚本往返断言)" — PRD-anchored ("(SC7 脚本断言)") but a test-process action rather than a domain operation; a web journey step should frame the user/system observation and leave the script to the contract stage.

### 3. Precondition Exclusivity — 139/150

**3a. Distinct across outcomes (60/60)** — The five edge preconditions are mutually distinct and specific: board-already-open (1b), terminal burst (2b), simultaneous same-task ops (3b), app-not-running window (4b), frozen-plugin form (5b). No overlapping pair among the edges.

**3b. Sufficient to uniquely select (44/50)** — Dock −6: Step 1 and Step 1b collapse under the declared Setup. Setup establishes "应用(已注册激活、看板打开)" — the board is OPEN by default — and 1b's differentiator is exactly "任务看板处于打开状态(非首个加载)", which is then identical to the Setup state. Step 1 ("人在终端执行一次任务状态变更,随后回到应用看板查看(不重启应用)") never states the board was NOT open at change time, so a runner cannot determine whether Step 1 and 1b are different scenarios at all. 1b only adds value if Step 1 is pinned to the complement (board closed / app backgrounded at change time). Fix: state Step 1's precondition explicitly.

**3c. No missing preconditions for error/boundary outcomes (35/40)** — Every edge states its trigger ✓. Dock −5: a missing enabling condition for the journey's own core claim — "变更来源逐笔标记正确([会话]/[终端])" (Step 3) is only meaningfully tested if at least one terminal-side change targets a task with an active session attachment (the inference-fallback trap, Anchor E). Setup guarantees "应用侧至少有一个已挂接的会话可执行任务操作" but never guarantees the terminal ops touch the attached task, so the hardest attribution case can silently go unexercised.

### 4. Fact Alignment — 120/150

**4a. Factual claims traceable (52/60)** — Traceability is strong: nearly every expected result is PRD-verbatim (≤5s ← G3/Story 3 AC2/Story 4 AC1; 来源[终端]/[会话] ← Story 3 AC2/操作主体模型; `forge task status` 一致 ← Story 4 AC2; 无第二事实源、无数据损坏 ← Story 4 AC3/SC7; 挂接回溯 ← Story 3 AC3; 工作台自有状态独立存放 ← In Scope/UF5; 3.x 冻结插件互不破坏 ← prd-spec 继承约束 verbatim; 首次注册扫描 ← Data initialization). Deductions:
- −4: Step 2b's "变更逐笔回流,无丢失、无错误合并" — "感知不丢失" traces to prd-spec Concurrency, but "无错误合并" (no mis-merged/coalesced changes) is an unverified claim with no source and no UNKNOWN marking.
- −4: Step 4b's parenthetical "(首次注册/启动扫描既有 forge 数据建立视图)" extends the PRD fact — "首次注册项目时扫描既有 forge 数据…建立视图" (first-registration only) — to a startup rescan for an already-registered project. Startup-rescan behavior is not in any PRD source (it is an implementation/tech-design reality); presented as fact without annotation.

**4b. Inferred claims have rule support + `source: inferred` (28/50)** — The document contains clearly derived boundary content and *none* of it carries a `source: inferred` annotation or a `required_outcomes` citation (Anchor A):
- Step 3b "后到操作按 forge 状态语义处理(如未满足前置则被 CLI 拒绝)" — the CLI-rejection illustration goes beyond "可重合操作…由 forge 状态机保证一致性" (操作主体模型);
- Step 2b "无错误合并;最终状态与 forge 数据一致" — burst-merging semantics derived, uncited;
- Step 4b startup-scan extension (see 4a) — derived, uncited;
- the mandatory web outcomes (validation-error / session-expired) are neither derived-from nor excluded-by the surface rules.
Half credit: the derivations are individually sensible and several are partially PRD-grounded; the annotation discipline required by the rubric is entirely absent. (Calibration: session i1 = 25/50, board i1 = 28/50, both zero-annotation.)

**4c. No hallucinated unclassified claims (40/40)** — Full sweep found no inverted or invented behavior (the class that cost session-loop −30): every headline claim is PRD-verbatim; the derived clauses are sensible inferences (scored under 4a/4b); invariant 2's unconditional ≤5s matches PRD G3's own unconditional phrasing, so it is traceable as written (its scope defect is charged in 6a). No −30 instances.

### 5. Surface Fitness — 96/150

**5a. Mandatory derived outcomes present (30/60)** — `validation-error` and `session-expired` are the two mandatory web outcomes. On the page: `validation-error` analog = Step 3b's "如未满足前置则被 CLI 拒绝" (a moderate functional analog — invalid-operation rejection — but further from the rule's form-validation sense than session i1's disabled-entry-with-reason); `session-expired` analog = Step 4b (weak — app-absent-during-changes, not session expiry mid-workflow). Neither is labeled, derived from, or reconciled with the web rules; the workflow has no forms, but "considered" must be demonstrable, not implicit. Calibration: session i1 = 35/60 (two analogs, one strong); board i1 = 20/60 (one weak + nothing); 30/60 sits correctly between. Not scored 0 — the boundary content is not "completely absent".

**5b. Test strategy proportions (38/50)** — Web balanced 50/50: journey side is strong (5 contiguous real dual-form operations). Contract side: 5 boundary edges is decent density, but distribution is uneven — the Step 1 family is rich (1b, 2b), Step 3 has 3b, while Step 2 (terminal-view consistency — a hot step with natural alternates like terminal view during app-side burst, or `forge task status` mid-transition) has NO genuine variant (2b is misfiled, see 6b), and Steps 4/5 have only misfiled edges. Dock −12: hot steps 2/4/5 lack contract-grade alternates and there is no timing/degradation boundary at all.

**5c. Realistic web environment/execution assumptions (28/40)** — The web-observable half is realistic (view board, changes visible ≤5s, source badges, detail view, app restart). Dock −12: for a journey declared `surface_types: ["web"]`, the mutation triggers of Steps 1, 2, 3 and edges 1b/2b/3b/4b/5b all execute outside the browser and the document gives the downstream generator no driving mechanism or fixture seam whatsoever:

> "**User Action**: 人在终端执行一次任务状态变更,随后回到应用看板查看(不重启应用)"

> "**User Action**: 应用侧挂接会话刚完成任务操作后,人在终端执行 `forge task status`"

Additionally Steps 2 and 4 contain no browser interaction at all (pure terminal observation / script execution). The mitigation exists in the project's own established conventions — tech-design §Testing SC7 ("e2e 内真实 forge CLI 写 + 应用读") and the siblings' Setup notes ("跨面断言口径…测试进程直读 fixture forge 文件或 stub CLI stdout(浏览器侧不自行观测 CLI 输出)"; "e2e 驱动面注记…以 fixture 任务文件变更 + FORGE_ACTOR 标记模拟") — none of which this document references. Charged lighter than a straight per-step multiplication (session i1: −10 for ONE undrivable step) because cross-surface operation is legitimately this journey's domain, but zero mechanism notes across ~6 trigger sites is the weakest surface adaptation of the three journeys.

### 6. Internal Consistency — 118/150

**6a. Invariants hold in every step (48/60)** — Invariants 1 and 3 (forge SoT; 工作台自有状态独立存放) hold across all steps and edges; Step 5's parenthetical is consistent with invariant 3. Dock −12 on invariant 2, stated absolutely:

> "看板免手动刷新:任何一侧的变更 ≤5 秒内在看板可见且标记正确来源([会话]/[终端])"

Step 4b's premise ("应用未启动时,终端侧已执行任务状态变更") breaches it by construction — during that window no board exists, so the change is NOT visible ≤5s and the invariant lacks an "应用运行期间" scope clause. Additionally, 4b's expected result ("既有变更在初始加载时正确反映") never asserts source marks for the offline changes, leaving invariant 2's "标记正确来源" undefined at initial load. Not charged at the −40 violation rate: 4b is a legitimate edge that defines the recovery path (startup reflects); the defect is the invariant's missing scope, mirroring session i1's invariant-4 finding (−15 there; lighter here because no behavior is invented and the recovery is defined).

**6b. Cross-step references consistent (30/50)** — The `Step Nb` naming implies variant-of-Step-N (template: "Each edge case references a happy path step (variant)"); gen-contracts indexes contracts as `step-N-*.md`. Three of five edges are misanchored:
- "Step 2b: 终端高频连续变更" — Precondition ("终端侧短时间内连续执行多笔任务状态变更") and User Action ("保持看板打开,观察任务状态回流") make it a variant of **Step 1** (终端变更回流看板), not Step 2 (应用会话变更在终端一致) — the source and observation faces are the exact inverse. −10 (unambiguous).
- "Step 4b: 应用未运行期间发生的终端变更" — action "启动应用并打开任务看板" varies the Setup's app-running state, not Step 4's action ("对交替操作后的 forge 数据运行一致性校验"); a startup-scan edge would land in the consistency-script step's contract file. −5.
- "Step 5b: 冻结插件(3.x)数据格式兼容" — action "冻结插件侧执行任务变更后,在应用看板查看" is a Step 1/Step 3 variant, not a variant of Step 5 (查看挂接状态完整性). −5.

Only 1b and 3b anchor correctly. (Calibration: session i1 −22 for 5/6 misanchors; board i1 −10 for 1 misanchor.)

**6c. Risk level consistent (40/40)** — High is exactly right: the workflow performs task state mutations from both forms, concurrent operations, and data-corruption verification. Matches the template's High criteria and the rubric's expectation.

### 7. Workflow Coverage — 140/150

**7a. Golden Path existence (60/60, veto not triggered)** — Semantic verification performed: the 5 contiguous domain-level steps map onto Story 4's AC sequence (Step 1 ← AC1, Step 2 ← AC2, Steps 3+4 ← AC3) plus Story 3 AC2/AC3 — a primary user story's core workflow, not merely 3+ steps. Steps reference domain operations (执行任务状态变更、查看看板、交替操作、校验数据一致性、查看挂接状态), not API mechanics. Constraint A and Constraint B both satisfied. (`golden_path: false` is correct feature-level delegation to `task-session-execution-loop`; the veto tests content, which qualifies. Step 4's verification step advances Story 4's actual goal — "不担心数据损坏" — so it is not a prohibited verification-only pad.)

**7b. Multi-step coverage depth (45/50)** — Strong: cross-form state transitions (Step 3), burst handling (2b), true concurrency on one task (3b), offline window with recovery (4b), cross-version format compatibility (5b), integrity verification (Step 4), restart persistence (Step 5). Dock −5: the degraded-reflow variation is missing — the >5s/perception-chain-failure face (the failure mode of this journey's own core SLA) has no step or edge, while the session-side sibling covers its analog in depth.

**7c. Workflow completeness against PRD scope (35/40)** — Story 4 AC1–AC3 all covered ✓; Story 3 AC2/AC3 covered ✓; SC7 ✓; G3 ✓; 操作主体模型's "可重合操作由 forge 状态机保证一致性" covered (3b) ✓. Dock −5: 操作主体模型's other promise — "看板对每笔变更标记来源[会话/终端]" — is asserted only in the easy cases; under overlap (3b) and same-task alternation (Step 3, ambiguous per Anchor E) the marking's correctness is never pinned, and 4b leaves offline-change marking undefined. Acceptable decompositions (no penalty): SC7 script mechanics → Step 4; session-side reflow → `task-session-execution-loop`; read-only board faces → `task-board-browsing`.

### Cross-dimension coherence check

- **Mandatory-outcomes omission** legitimately spans Completeness 1c (−15, coverage), Surface Fitness 5a (surface-rule compliance), and Fact Alignment 4b (annotation discipline) — the same three-facet split both sibling i1 reports used. Each sub-score reflects its own facet only.
- **Driving-face gap** charged once (5c −12); the assertion-observability facet is the rubric-external blindspot B2, per the board i1 precedent. Not double-counted.
- **Attribution hard case** charged across two distinct facets: 3c −5 (enabling precondition missing) and 7c −5 (PRD marking-guarantee completeness); not charged in 7b. Facets are distinct per sibling precedent (board i1 split fixture gaps the same way).
- **Degraded-reflow absence** charged in 1c (−6, missing boundary outcome) and 7b (−5, missing variation depth) — the same split board i1 applied to loading-state (1c + 7c). Documented here to make the stacking explicit.
- **Invariant 2 scope** charged once in 6a; its PRD traceability is intact (4a uncharged for it) because G3 itself is unconditional. **4b startup-scan** charged once in 4a (unverified-unmarked) with the annotation facet in 4b's instance list — the two 4a/4b charges cover 无错误合并 and 启动扫描 respectively, no stacking.
- **Misanchoring** charged once in 6b; preconditions themselves remain distinct and selecting (3a unaffected), mirroring board i1.

---

## Phase 3 — Blindspot Hunt ([blindspot] = outside all rubric dimensions)

1. **[blindspot] Test-data safety: a mutation-heavy journey with no fixture isolation.** Setup nominates an unspecified shared project — "同一 forge 项目同时被应用(已注册激活、看板打开)与终端(冻结插件/forge CLI)操作,两侧共享同一 forge 数据" — while Steps 1/3 (and edges 2b/3b/5b) perform real task state mutations from both forms. There is no disposable-fixture, isolated-userData, or cleanup/rollback statement anywhere. Both sibling journeys adopted the convention after their i1 failures ("测试承载 = 一次性 fixture 项目:临时目录 + 隔离 userData、测试后清理;本旅程含任务状态变更(claim),不得以生产仓为承载"), and the project's e2e history documents the isolated-userData requirement (single-instance lock). No rubric dimension evaluates test-data isolation. *Fix: add the disposable-fixture Setup bullet.*

2. **[blindspot] Cross-surface oracle channel unspecified.** Expected results require oracles a browser-level test cannot observe on its own: "终端输出与看板展示一致" (Step 2 — CLI stdout), "无第二事实源、无数据损坏" (Step 4 — forge files), "最终状态与 forge 数据一致" (2b). The document never states the verification channel; the sibling convention ("校验通道 = 测试进程直读 fixture forge 文件或 stub CLI stdout") exists precisely for this. Adjacent to, but not covered by, 5c (environment realism vs assertion observability — the board i1 report drew the same line). *Fix: add the oracle-channel Setup bullet.*

3. **[blindspot] Source-mark survival across app restart is undefined.** Invariant 2 promises "任何一侧的变更 ≤5 秒内在看板可见且标记正确来源", and Step 4b's recovery path asserts only "既有变更在初始加载时正确反映" — whether offline terminal changes receive a [终端] mark at initial load (retroactive attribution via actor records vs 挂接推断) is asserted nowhere and marked UNKNOWN nowhere. This journey owns the source-marking story; the restart window is its unique territory (the session sibling only covers session-side live marking). *Fix: assert the marking expectation in 4b or mark it UNKNOWN for product decision.*

4. **[blindspot] Burst-reflow observability is a flakiness trap.** Step 2b expects "变更逐笔回流,无丢失、无错误合并;最终状态与 forge 数据一致" under "短时间内连续执行多笔任务状态变更". With N rapid changes, per-change visibility (each intermediate state renderable before supersession?) versus coalesced final-state rendering is undefined — an e2e asserting per-change observation will flake on fast fixtures, and one asserting only the final state silently weakens "逐笔回流". The interplay between invariant 2's per-change ≤5s window and burst supersession needs an explicit observability rule. No rubric dimension covers assertion timing semantics. *Fix: define the per-change observation window or scope the per-change assertion to the change-event stream rather than rendered intermediate states.*

---

## Revision Priorities (for reviser) — recommended despite PASS, given the 4-point margin

1. **Surface-web required_outcomes engagement** (protects 5a/1c/4b): add explicit mapping/exclusion comments for `validation-error` (→ Step 3b state-rejection analog) and `session-expired` (→ Step 4b or a reasoned exclusion), and annotate derived clauses (2b 无错误合并, 3b CLI 拒绝, 4b 启动扫描) with `source: inferred` + basis.
2. **Re-anchor edges** (fixes 6b −20): 2b → Step 1 variant; 4b and 5b → their true base steps (or explicit "variant of Step N" annotations).
3. **Scope invariant 2** to 应用运行期间/感知链健康, and define or mark UNKNOWN the source marking for offline changes at initial load (fixes 6a −12, blindspot 3).
4. **Add Setup bullets**: disposable fixture + isolated userData + cleanup; cross-surface oracle channel; e2e driving-face note for terminal/session-side triggers (fixes 5c −12, blindspots 1–2).
5. **Pin Step 1's board state** (closed vs open at change time) to separate it from 1b (fixes 3b −6); operationalize Step 3 (which operations, same-task alternation ≥1) to guarantee the attribution hard case is exercised (fixes 1b −5, 3c −5, 7c −5).
6. **Add the degraded-reflow edge** (terminal change with broken perception chain: >5s, sync-error indication, rescan/restart recovery — mirror the session sibling's Step 5b semantics) (fixes 1c −6, 7b −5).

**Final: 979/1150 — PASS (narrow; total ≥ 975 and all dimensions ≥ threshold). Revision still recommended before gen-contracts consumes this document.**
