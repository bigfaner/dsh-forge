# Eval Report: journey/task-session-linkage — Iteration 1

- **Eval type**: journey (rubric scale 1150, target 975, every dimension ≥ min threshold)
- **Surface**: web (rule: `gen-journeys/rules/surface-web.md`)
- **Scorer stance**: adversarial; every deduction cites the document
- **Date**: 2026-10-07

## Final Score

| Dimension | Score | Min Threshold | Pass |
|---|---|---|---|
| 1. Completeness | 156/200 | 120 | YES |
| 2. Semantic Purity | 169/200 | 120 | YES |
| 3. Precondition Exclusivity | 117/150 | 90 | YES |
| 4. Fact Alignment | 94/150 | 90 | YES |
| 5. Surface Fitness | 64/150 | 90 | **NO** |
| 6. Internal Consistency | 132/150 | 90 | YES |
| 7. Workflow Coverage | 114/150 | 90 | YES |
| **Total** | **846/1150** | **975 + all thresholds** | **NO (Surface Fitness 64 < 90; total < 975)** |

**Verdict: FAIL.** Surface Fitness is below its min threshold (the web-mandatory derived outcomes were neither present nor considered), and the total is below 975.

---

## Phase 1 — Reasoning Audit (pre-score anchors)

1. **Workflow extraction is faithful and well-scoped.** The 4-step happy path maps cleanly onto PRD Story 6, prd-spec 流程四, SC6③, and UI Function 3. Spot-checks verify nearly verbatim: 「dock 开概览 tab + 切到任务子 tab + 选中 feature + 任务抽屉打开」 = UF-3 item 3; 「≤2 并排显示，超出以 +N 溢出菜单呈现」 = UF-3 item 2; 「pill 随 session id 即时变化」 = UF-3 item 4; dual-source assertion 「派发会话（挂接表）与执行会话（审计记录会话 id），双数据源分别断言」 = Story 6 AC1 / SC6③.
2. **Risk classification is sound.** Every action is viewing/navigation; the journey even declares 「挂接展示为只读浏览面（不写库、不造挂接）」. Low is correct per the stated criteria.
3. **Real defects found**: (a) Step 1 conflates two display surfaces with different data payloads — the list sub-row carries only a 挂接计数 (tech-design TaskCard) while the two-typed session display lives in the drawer (TaskDetail `sessions 双源分型`); (b) Step 2 asserts 「pill 分型展示（派发 ⟞ / 执行 ⟞）」 on the *dispatcher* session, but per `sessionLinks = links ∪ records.session_id` the 执行-type pill belongs to the executor sub-session, which no step ever views; (c) Step 4's 「另一会话」 is a dangling reference — Setup never establishes a second linked session; (d) web-mandatory derived outcomes (`validation-error`, `session-expired`) neither present nor marked considered/N-A; (e) zero `source: inferred` annotations, and 4b's 「不渲染空占位」 has no source basis anywhere in PRD/UI-functions/tech-design.

---

## Phase 2 — Dimension Scoring

### 1. Completeness — 156/200

**Metadata (50/50).** Frontmatter complete: kebab-case name, `risk_level: "Low"`, `golden_path: false` (feature-level golden path lives in `task-dispatch-pipeline`), `surface_types`/`surface_keys: ["web"]`, three `sources` (all exist on disk, including prd-ui-functions.md), `generated`. Low is justified by purely observational content.

**Steps complete (72/80).** All 4 happy steps carry `**User Action**` + `**Expected Result**` and form a coherent progression (task side → session side → navigation → reactivity). Deductions:
- Step 1 merges two display surfaces under one action and one outcome: 「在概览任务子 tab 查看该任务行（列表副行 / 详情抽屉挂接区）」 with expected 「挂接会话展示两类且与库一致……双数据源分别断言」. Per tech-design, `TaskCard` 副行承重 = 「挂接计数」 (count only); the two-typed session display exists only in `TaskDetail` 「sessions 双源分型」. A downstream e2e author directed at the list sub-row would write a test that cannot pass as written — the assertion target is ambiguous and half-unsupported (−6).
- Step 2's expected bundles a display assertion with a capability assertion (「pill 分型展示（派发 ⟞ / 执行 ⟞）」) that this session cannot fully exercise (see Fact Alignment / blindspot #1) — partially un-executable as written (−2).

**Happy + required derived scenarios (34/70).** Happy path fully covered; three boundary outcomes present (1b id distinctness, 2b overflow, 4b empty state) — a reasonable read-only edge set. Deductions:
- The surface rule's mandatory derived outcomes (`validation-error`, `session-expired`) produced **zero** outcomes and **zero** consideration records — no N/A note, no rule citation, nothing. For a read-only viewing journey both are plausibly N/A, but the rule's minimum bar is explicit consideration and the document is silent (−24).
- Derived-boundary depth is thin for the web surface: no overflow-menu interaction outcome (2b stops at 「+N 溢出菜单呈现」 — presence only, contents/navigation untested), no mixed-type pill display, no exactly-2 boundary (−12).

### 2. Semantic Purity — 169/200

**Natural language, no code/regex (70/80).** No regex, CSS/XPath selectors, or framework assertion calls. Deduction: outcomes embed verification methodology rather than observation — Step 1 「双数据源分别断言」, Step 2 「且与库中挂接行一致（e2e 断言）」. These are PRD-mandated assertion anchors (SC6③'s own wording), so extraction is faithful, but the *how to verify* leaks into the *what is observed* (−10).

**Preconditions declarative (55/60).** Setup and all three edge preconditions are states, not procedures (「该会话挂接任务数 >2」, 「会话未 claim 过任何任务（无挂接行）」). Minor: 1b's precondition carries a provenance justification parenthetical 「（……S8 实证子会话 id 形态可得）」 — annotation material, not state (−5).

**No implementation coupling in steps (44/60).** Coupling is present but confined: Setup 「挂接表 task_session_links 与审计 task_records 已在每工作区库」 (DB table names); Step 1 「派发会话（挂接表）与执行会话（审计记录会话 id）」; Step 2 「与库中挂接行一致」; invariant 1 「task_session_links = 派发会话；task_records.session_id = 执行会话」 (column-level). All inherited from PRD SC6③'s dual-source discipline; Steps 3 and 4 are pure UI behavior, which keeps this from scoring lower (−16).

### 3. Precondition Exclusivity — 117/150

**Distinctness across outcomes (44/60).** No conflicting pair among the three edges (2b and 4b are cleanly separated by link count 0 vs >2). Two weaknesses:
- **1b ≡ Step 1 happy state.** 1b's precondition 「完整派发链（dispatcher 主会话 + executor 子会话……）」 is semantically identical to the Setup state under which happy Step 1 runs. Both outcomes co-apply (they are complementary assertions, not alternatives) — benign for test ambiguity but the rubric's distinctness bar is not met (−8).
- **Step 4 vs 4b link-state overlap.** Step 4's 「切换到另一会话」 never states whether that session has links; if it does not, Step 4's expected 「pill 随 session id 即时变化」 degenerates into 4b's 「无挂接 pill 展示」 — the happy and boundary outcomes are not separated by an explicit precondition on the target session (−8).

**Sufficient to uniquely select (40/50).** 2b and 4b select uniquely; 1b cannot be distinguished from the happy path by state alone; Step 4's target-session state is unspecified (−10).

**Missing preconditions for error/boundary outcomes (33/40).** All three edges state explicit triggers. Missing boundary: the overflow threshold's edge value — 「该会话挂接任务数 >2」 tests only N≥3; the N=2 case (two pills side by side, no overflow — the classic off-by-one for 「≤2 并排」) has no outcome pinning it (−7).

### 4. Fact Alignment — 94/150

**Factual claims traceable (42/60).** Document-level traceability exists (frontmatter `sources`; Overview cites 「PRD Story 6；业务流程四；SC6③；UI Function 3」 — all verified). Most behavioral claims verify verbatim against prd-ui-functions UF-3 and Story 6. Deductions:
- **Step 1 surface/payload conflation.** 「列表副行 / 详情抽屉挂接区」 presents 「展示两类……双数据源分别断言」 as if both surfaces carry the two-typed display; tech-design pins the list sub-row to 挂接计数 (`TaskCard` 副行承重：「挂接计数」) and the typed display to `TaskDetail` 「sessions 双源分型」. The list half of the claim is untraceable to any source (−10).
- **Step 2 dual-type claim on dispatcher session.** 「pill 分型展示（派发 ⟞ / 执行 ⟞）」 — per tech-design 「sessionLinks …… links ∪ records.session_id 双源分型」, the dispatcher session satisfies links (派发) while the 执行 type is keyed to the executor sub-session's record; no step reaches an executor session, so the asserted display has no exercised basis (−8).
- No per-claim trace markers anywhere (no fact references, no UNKNOWN markings) (−0 additional; counted via the above).

**Inferred claims with rule support + `source: inferred` (20/50).** Zero `source: inferred` annotations exist; zero edge cases cite a `required_outcomes` rule as derivation basis. 2b is actually source-grounded (UF-3 item 2 — factual), but 4b's behavioral detail is a derivation with no rule citation and no annotation. The web rule's mandatory derivations were not performed at all, so the annotation mechanism is entirely absent.

**No hallucinated unclassified claims (32/40).** One clear unclassified extrapolation: 4b's 「无挂接 pill 展示（不渲染空占位）」 — the 「不渲染空占位」 behavior appears in none of the three cited sources (nor tech-design); it is presented as fact without classification. No claim contradicts the sources.

### 5. Surface Fitness — 64/150 (BELOW THRESHOLD 90)

**Mandatory derived outcomes (0/60).** The web rule requires `validation-error` and `session-expired` to be considered for every Web Journey. Both are absent, and neither is marked considered/inapplicable:
- `validation-error`: this journey contains no form, no input, no rejection path of any kind — there is not even a semantically adjacent outcome (unlike the dispatch journey's tool-rejection cases). Nothing to grant partial credit for.
- `session-expired`: completely absent, no N/A annotation with reasoning — for a local single-user workbench it is almost certainly genuinely inapplicable, **but the document never says so**. Per the rubric (「Score 0 if mandatory Outcomes are completely absent」), this criterion scores 0.

**Test strategy proportions (30/50).** Web guidance is balanced 50/50 Contract/Journey. The browser-side journey-smoke half is well served (Steps 2–4 exercise rendering, navigation, session switching), and the dual-source DB-consistency assertions carry contract flavor. But total outcome density is low (7 scenarios), the contract-side variations are thin (3 edges, none interacting with data-shape variation beyond count), and the deepest contract assertion (dual-source per-side) is conflated across two surfaces (Step 1).

**Environment/execution assumptions (34/40).** Realistic where present: dock-tab navigation, session switching, pill clicking, no DOM-structure or CLI-style assumptions; the 「与库一致（e2e 断言）」 pattern is executable via the repo's replay-executor e2e approach. Deduction: the async dimension of 「pill 随 session id 即时变化」 (RPC query on session switch; live pill update on new claim via 事件订阅 per tech-design) is untouched — no wait-stategy or update-timing consideration for the one reactive assertion the journey makes (−6).

### 6. Internal Consistency — 132/150

**Invariants hold in every step (56/60).** All four invariants checked against all 7 scenarios: read-only browsing holds (Step 3's click is navigation only); direct-read/no-second-source matches Steps 1–2 and 4b; pill-reactivity invariant is exactly Step 4/4b; dual-source consistency holds in Steps 1–2 and 1b. No violations. Minor: invariant 1's 「分别断言」 is methodology stated as invariant (form, not substance) (−4).

**Cross-step references consistent (36/50).** One real defect and two minor ones:
- **Step 4's 「另一会话」 is dangling.** Setup establishes exactly one complete dispatch — dispatcher session + executor sub-session. Step 4 「切换到另一会话查看其头部」 with expected 「pill 随 session id 即时变化（不残留上一会话的挂接展示）」 requires the target session to *have* pills, but Setup never establishes a second linked session, and the journey never says whether 「另一会话」 is the executor sub-session or some third session. If it is an unclaimed session, Step 4 collapses into 4b (−9).
- 2b's 「该会话挂接任务数 >2」 silently extends beyond Setup's single dispatch (needs ≥3 claims) with no note that edges may require additional fixture state (−3).
- Edge-to-step numbering convention (Nb = variant of Step N) is otherwise correctly used (1b→1, 2b→2, 4b→4) (−0 additional; the 2b/Step-2 referent session differs but the action is the same viewing operation).

**Risk level consistent (40/40).** Low = 「Workflow is read-only or purely observational」 — every action is a view or a navigation click; the journey even pins 「不写库、不造挂接」. Exact match.

### 7. Workflow Coverage — 114/150

**Golden Path existence (54/60, no veto).** Although frontmatter declares `golden_path: false` (the feature-level Golden Path is the dispatch pipeline, partitioned to the sibling journey), this journey contains a contiguous 4-step sequence covering PRD Story 6 end-to-end (task-side view → session-side view → pill navigation → reactivity) with domain-level operations (「查看任务行」「点击会话头挂接 pill」「切换到另一会话」), semantically mapped to UF-3's interaction flow and 流程四. No API-level step descriptions. Minor dock: Step 1's dual-surface slash blurs which user operation the golden path performs (−6).

**Multi-step coverage depth (30/50).** Genuinely cross-entity (task↔session, both directions, plus navigation into the overview tab and drawer). But within its own scope several meaningful variations are missing: the executor-session side of the session-header display (the 执行 ⟞ pill is never rendered in any walked step), overflow-menu interaction (only 「+N 溢出菜单呈现」 presence), mixed 派发+执行 pill display in one header, and re-claim dedup rendering (see blindspot #4). No state transitions by nature (read-only) — depth must come from display variations, and only 3 are present.

**Workflow completeness vs PRD/Design (30/40).** Story 6 AC1 → Step 1 + 1b ✓; AC2 → Step 2 ✓; UF-3 items 2/3/4 → 2b/Step 3/Step 4+4b ✓. Gap: UF-3 item 1 「双数据源分型：派发 ⟞ / 执行 ⟞」 is only half-covered — the 派发 half via Step 2, the 执行 half asserted in text but never exercised (no step views an executor sub-session, whose header is the only natural home of the 执行 pill). SC6③'s 「会话头部展示挂接任务」 is likewise verified only for the dispatcher session.

---

## Phase 3 — Blindspot Hunt

1. **[blindspot] 执行-side pill asserted but never exercised.** 「pill 分型展示（派发 ⟞ / 执行 ⟞）」 (Step 2) — per tech-design 「sessionLinks …… links ∪ records.session_id 双源分型」, the 执行 ⟞ pill renders on the *executor* sub-session's header, yet no step ever views an executor sub-session. As written on the dispatcher session the dual-type expectation is unverifiable (and risks a false test). Must add an executor-session step or restrict Step 2's expectation to the 派发 type.
2. **[blindspot] Step 4's target session is unpinned.** 「切换到另一会话查看其头部」 — the journey never establishes or identifies a second *linked* session; the natural choice (executor sub-session) would simultaneously resolve blindspot #1, but the text leaves the referent dangling, letting the happy reactivity assertion silently degrade into 4b's empty state.
3. **[blindspot] Overflow menu is asserted present, never opened.** 「≤2 并排显示，超出以 +N 溢出菜单呈现」 (2b) — the user value is in the menu's contents (the N hidden links, correct tasks, clickable to the same pill→drawer navigation as Step 3); asserting only the 「+N」 badge leaves the most bug-prone part untested. The N=2 exact boundary (no overflow) is also untested.
4. **[blindspot] Re-claim dedup display untested.** tech-design: 「task_session_links | UNIQUE(task_id, session_id) | 唯一写源 = claim(upsert-ignore)」 — after an interrupted-dispatch re-claim (same dispatcher session claims the same task again, covered by the sibling journey on the write side), the session header must not render duplicate pills for one task. No outcome here pins the dedup rendering — the classic duplicate-pill bug for exactly this widget.
5. **[blindspot] Live pill update path untested.** Story 6 AC2's own Given frames the display as post-claim (「该会话 claim 过任务后查看会话头部」), and tech-design engineers an event-subscription path for it (「renderer 订阅(概览/文档 tab/会话头 pill)→ 重取活跃查询」) — but this journey only ever observes linkage *after the fact*; a new claim landing on an already-rendered session header (pill appears without remount) has no outcome. The journey's 「即时」 vocabulary is spent on session switching (Step 4) while the write-side reactivity is unassigned.
6. **[blindspot] Pill click for a task whose feature tab context is ambiguous.** Step 3's expected 「选中 feature + 任务抽屉打开」 presumes the overview's feature pill switch lands on the linked task's feature; no outcome covers a pill whose task belongs to a *different* feature than the overview's currently selected one (the navigation must re-target feature selection — an easy state-carryover bug given invariant 3's own concern with residue).

---

## Attack Summary (what must improve for iteration 2)

1. **[surface-fitness] Highest priority — gates the pass condition.** Add web-mandatory derived outcomes (`validation-error`, `session-expired`) or explicit, reasoned N/A annotations citing the web surface rule — currently 「must be considered for every Web Journey」 produced nothing.
2. **[fact-alignment]** Fix Step 1's surface conflation: 「列表副行 / 详情抽屉挂接区」 — the list sub-row carries 挂接计数 only (TaskCard), the typed dual-source display lives in the drawer (TaskDetail `sessions 双源分型`); split into two outcomes or pin the assertion to the drawer.
3. **[fact-alignment / workflow-coverage]** Exercise the 执行 ⟞ pill: add an executor sub-session step (or repoint Step 4's 「另一会话」 there) so 「pill 分型展示（派发 ⟞ / 执行 ⟞）」 is verifiable; restrict Step 2 to the 派发 type.
4. **[internal-consistency]** Pin Step 4's target session (linked, second session established in Setup or by reference to the executor sub-session).
5. **[fact-alignment]** Mark 4b's 「不渲染空占位」 with `source: inferred` + basis, or ground it; add `source: inferred` annotations for derived edges per the rubric's inference-classification mechanism.
6. **[completeness / blindspots]** Deepen web boundaries: overflow-menu open + contents + navigation; N=2 exact boundary; mixed-type header; re-claim dedup render; live pill update on new claim.
