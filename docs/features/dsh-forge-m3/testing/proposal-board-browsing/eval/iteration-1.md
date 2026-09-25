# Journey Eval Report — iteration 1

- **Document**: `docs/features/dsh-forge-m3/testing/proposal-board-browsing/journey.md`
- **Rubric**: `skills/eval/rubrics/journey.md` (1150 pts, target 975, every dimension ≥ threshold)
- **Surface**: web (`rules/surface-web.md`); test strategy Web = balanced 50/50; mandatory derived outcomes: `validation-error` + `session-expired`
- **Scorer persona**: Senior QA Engineer (adversarial)
- **Verdict**: **PASS (marginal)** — Total 981/1150 (≥ 975); every dimension ≥ threshold. Margin is 6 points; the top attacks below are cheap to fix and the pass should not be read as "no material issues".

| Dimension | Score | Threshold | Pass |
|---|---|---|---|
| 1. Completeness | 159/200 | 120 | ✓ |
| 2. Semantic Purity | 192/200 | 120 | ✓ |
| 3. Precondition Exclusivity | 130/150 | 90 | ✓ |
| 4. Fact Alignment | 125/150 | 90 | ✓ |
| 5. Surface Fitness | 114/150 | 90 | ✓ (weakest dimension) |
| 6. Internal Consistency | 138/150 | 90 | ✓ |
| 7. Workflow Coverage | 123/150 | 90 | ✓ |
| **Total** | **981/1150** | 975 | **✓** |

---

## Phase 1 — Reasoning Audit (pre-score anchors)

**Chain check (problem → solution → evidence → success criteria)**: The Overview promises read-only browsing of `proposals/` (list with status/created/作者 + feature badges, detail + eval report rendering, badge jump to feature board, ≤5s external-change reflow, zero write entries). The 4 happy steps deliver exactly this, mapping 1:1 onto Story 6's four acceptance criteria (Step 1 ← AC1, Step 2 ← AC2, Step 3 ← AC3, Step 4 ← AC4) and onto UF5's interaction flow 1–4. Traceability line cites Story 6 / SC6 / UF5 / proposal Key Scenario「提案浏览」— all four verified to exist on disk (prd-user-stories.md Story 6; prd-spec.md SC6/G6/DF007; prd-ui-functions.md UF5; docs/proposals/dsh-forge-m3/proposal.md line 72). The chain is sound: the journey tests the story it claims, and the story is the feature's proposal-browsing deliverable.

**SC Consistency deep-dive**: This document contains no SC/In Scope sections (journey narrative, not proposal/PRD), so formal clustering does not apply; a full pairwise scan of Steps ↔ Edge Cases was run instead. No mutual-exclusion or direction-clash contradiction found. One **directional dependency** (not a contradiction) recorded: Step 3 presupposes the Step-2-selected proposal is feature-linked, which Step 2 never states — see Anchor B and scoring in 3b/6b.

**Pre-score anchors recorded before rubric scoring**:

1. **Anchor A (mandatory web outcomes unconsidered)**: `surface-web.md` requires `validation-error` + `session-expired` to be *considered* for every Web Journey. The document contains zero `required_outcomes` mapping annotations (grep of all HTML comments yields only the 4b `source: inferred` and the 4c `source: prd-spec Security` comments). Functional analogs do exist — 4b is precisely the family-documented session-expired analog (M2 dual-form-consistency contract maps `session-expired → …通道失效类比 = 看板感知链(watcher→indexer→事件推送)失败,映射为 FT-056 sync-error 工具栏指示 + 静默重试 + last-good 看板保留`), and 4c is an invalid-input-containment analog — but the journey nowhere acknowledges, labels, or reconciles them with the web rules. This is the same defect class the M2 iteration-1 eval flagged as "Web 强制派生零考虑" on siblings.
2. **Anchor B (unpinned selection → dangling presupposition)**: Setup deliberately builds a mixed fixture ("≥1 个关联 feature、≥1 个未关联"), but Step 2's action is "点击某提案条目" — which proposal? Step 3 then requires "提案的关联 feature 徽标" to exist, i.e. it silently presupposes the linked one was clicked. The happy-path chain 2→3 is under-determined at the document's own fixture.
3. **Anchor C (compound alternation in Step 4)**: "在应用外新增/修改提案文件(或 eval 报告)" merges at least four distinct observable scenarios (add proposal / modify proposal / add eval / modify eval — and each × list-view vs detail-view) into one step with a single Expected Result claiming identical behavior.
4. **Anchor D (positives verified)**: risk `Low` is correct (every step read-only; matches template criteria "Low = read-only or purely observational"); edge-case anchoring is correct (1b→Step 1, 2b→Step 2, 4b/4c→Step 4); `golden_path: false` is consistent with the feature-level rule (exactly one journey carries the flag — `task-dispatch-execution-loop` has `golden_path: true`); no claim was found that *contradicts* any source (unlike the M2 iteration-1 `updating`-timeout hallucination); both inline source annotations point at real grounds (4b's sync-error surface is verified as M2 fact FT-056 / 实现记录 5.5; 4c is prd-spec Security verbatim).
5. **Anchor E (unpinned eval-report location amid a real source conflict)**: UF5 Data Requirements place eval reports at "文档根 eval/", while prd-spec's 文档根数据模型 says `proposals/<slug>/`(proposal + eval). The journey's Setup/Steps never pin which path eval reports occupy for fixture purposes.

---

## Phase 2 — Rubric Scoring

### 1. Completeness — 159/200

**1a. Journey metadata (49/50)** — Name `proposal-board-browsing` kebab-case ✓; `risk_level: Low` valid and justified by content (all steps read-only browsing; zero write entries) ✓; `surface_types: ["web"]` / `surface_keys: ["web"]` populated ✓; `generated` date ✓; sources list the three PRD files ✓. Dock −1: the traceability line also leans on "proposal Key Scenarios「提案浏览」" but `docs/proposals/dsh-forge-m3/proposal.md` is not listed in `sources:` (verified to exist; should be cited where consumed).

**1b. Steps complete with required fields (70/80)** — All 4 happy steps have User Action + Expected Result and form a coherent ordered sequence (list → detail → jump → reflow). Deductions:
- −4: Step 2's action does not pin the selection the subsequent chain depends on: "**User Action**: 点击某提案条目" — with the mixed fixture, a downstream agent cannot know which entry to click for the happy path (linked) versus the 2b variant (unlinked).
- −4: Step 4 collapses ≥4 scenarios into one step with one outcome: "**User Action**: 在应用外新增/修改提案文件(或 eval 报告),回到提案看板" — a newly added proposal (new list row) and a modified eval report (detail content change) are different observables; one Expected Result asserts them equivalent without evidence.
- −2: Step 2's Expected Result bundles a follow-up navigation action into an outcome ("返回回到提案看板") — an action the user has not yet performed inside this step.

**1c. Outcomes cover happy path + required derived scenarios (40/70)** — Boundary content present: empty state (1b), unlinked proposal (2b), perception-chain degradation (4b), markdown injection (4c). Deductions:
- −15: surface-web mandatory derived outcomes (`validation-error`, `session-expired`) are neither present nor *considered* — no mapping annotation, no N/A justification anywhere (the family precedent for the considered-but-excluded pattern exists in M2 siblings). This facet is the coverage side of Anchor A; Surface Fitness 5a scores the surface-rule-compliance side and Fact Alignment 4b the classification side — three rubric facets of one omission, each charged once in its own dimension.
- −5: deletion flowback absent — "外部文件变更" naturally includes removing a proposal file; the journey models only 新增/修改 ("列表与详情 ≤5 秒回流变更" is asserted only for those). A watcher-driven view whose journey never tests removal is a classic QA miss.
- −4: UF5 defines a `loading` state ("加载指示 | 首次/切换项目") — a state from the journey's own cited source — with no step or edge.
- −6: malformed/partial input boundaries absent for a metadata-driven list: no edge for a proposal whose frontmatter lacks status/created/作者 (the very columns Step 1 asserts), and no edge for a proposal with no eval report (Setup guarantees only "≥1 个提案含 eval 评估报告", so eval-less detail views exist in the fixture but are never an outcome).

### 2. Semantic Purity — 192/200

**2a. Natural language outcomes (78/80)** — No regex, CSS/XPath selectors, or framework assertion calls anywhere; outcomes describe what the user observes. Dock −2: two Expected Results are phrased as verification oracles rather than observations — Step 1 "内容与文档根一致", Step 4 "回流内容与文件一致" (parity-with-source is the *check*, the observation is the displayed content matching the file).

**2b. Preconditions declarative (59/60)** — Setup items and all four edge Precondition fields are declarative states ("项目文档根 `proposals/` 为空(或不存在)", "感知链(watcher/扫描)故障,外部变更无法回流"). No procedural code. Dock −1: "(fixture 承载)" in Setup mixes test-mechanism vocabulary into a precondition statement.

**2c. No implementation coupling in steps (55/60)** — Steps are user-level throughout (切换 tab / 点击条目 / 点击徽标 / 在应用外修改文件). `MarkdownView 白名单` and `sync-error` are PRD/FT-verbatim domain vocabulary (UF5 validation rules and prd-spec Security use the former verbatim; FT-056 defines the latter as a user-visible state name), so they pass as domain language. Dock −5: the rendering *mechanism* is named inside three user-observable outcomes/invariants ("详情页呈现 proposal 正文与 eval 报告只读渲染(经 MarkdownView 白名单)…", invariant "渲染恒经 MarkdownView 白名单") and Step 4b's Expected Result specifies the recovery mechanism ("恢复或重启全量重扫后…") — mild how-not-what leakage in outcomes.

### 3. Precondition Exclusivity — 130/150

**3a. Preconditions distinct across outcomes (57/60)** — The four edge preconditions are pairwise distinct and each is exclusive against the Setup state (empty vs ≥2 proposals; unlinked vs linked-present; chain-broken vs 感知链就绪; malicious content vs normal). Dock −3: Step 1b bundles two different states into one precondition — "为空(或不存在)" — empty-directory and missing-directory are distinct system states asserted to produce one identical outcome without evidence; UF5's empty state is triggered by "proposals/ 为空" only.

**3b. Preconditions sufficient to uniquely select an outcome (37/50)** — Deductions:
- −8: at Step 2, given the Setup fixture and the action "点击某提案条目", both the happy outcome and the 2b outcome ("列表不显示 feature 徽标;详情浏览照常可用") are reachable — the outcome is selected by *which* proposal is clicked, and the step does not determine it. The journey's own 2b exists precisely because this choice matters, which proves the ambiguity is real, not hypothetical.
- −5: Step 4's alternation ("新增/修改提案文件(或 eval 报告)") presents multiple trigger conditions to a single outcome; the document gives no basis to treat a new list entry and an in-place content update as the same outcome.

**3c. No missing preconditions for error/boundary outcomes (36/40)** — All four edge cases state their trigger precondition ✓. Dock −4: Step 4b's precondition names an internal failure mode — "感知链(watcher/扫描)故障,外部变更无法回流" — with no hint of how a downstream run establishes it (M2 siblings pair this precondition with a seam note, e.g. "校验通道见 Setup"); as written the state is declarative but not constructible from the journey alone.

### 4. Fact Alignment — 125/150

**4a. Factual claims traceable (48/60)** — Traceability verified claim-by-claim against sources: tab order "概览/提案/Feature/任务" ← prd-ui-functions PRD 裁决 (2026-09-23) verbatim ✓; "≤5 秒回流"/"免手动刷新" ← SC6/G6/DF007/BIZ-workbench-005 ✓; "「暂无提案」+ 路径说明" ← UF5 empty state verbatim ✓; "无关联 feature 的提案不显示徽标…(正常态,非错误)" ← UF5 validation rule verbatim ✓; "跳转 feature 看板对应条目;可返回" ← UF5 flow 3 + navigation rules ✓; "渲染经 MarkdownView 白名单" ← prd-spec Security + UF5 ✓; "零状态写入口" ← SC6/UF5/BIZ-task-ops-001 ✓. Deductions:
- −6: annotation locality — only 2 of 8 steps carry inline source annotations; the remaining factual outcomes rely on the single journey-level traceability pointer. Accurate (verified), but per-claim grounding is the rubric's bar and six steps carry none.
- −6: eval-report location is left unpinned precisely where the cited sources conflict — UF5 says "文档根 eval/", prd-spec says "`proposals/<slug>/`(proposal + eval)"; Setup's "≥1 个提案含 eval 评估报告" commits to neither, leaving the fixture contract underspecified on a genuinely ambiguous fact instead of pinning one reading or marking it UNKNOWN.

**4b. Inferred claims have rule support + `source: inferred` (38/50)** — The document's one derived boundary outcome is honestly annotated:
> `<!-- source: inferred:感知链故障的失败面沿用 M2 口径(sync-error 工具栏指示 + 静默重试、保留最后良好视图);文件恒为事实源,看板为派生快照可重建 -->`

The cited M2 basis is real (verified: M2 FT-056 "sync-error toolbar indication with silent retry and retains the last-good board"; 实现记录 5.5), and the second annotation (4c) correctly classifies a factual claim to prd-spec Security. Dock −12: the rubric requires inferred boundary outcomes to cite the `required_outcomes` rule that mandated their derivation — Step 4b cites only cross-milestone precedent, with no surface-rule citation; and the two functional analogs that *are* web-rule territory (4b ≈ `session-expired` channel-failure mapping, 4c ≈ invalid-input family) carry no `surface-web required_outcomes 映射` annotation, which is this family's established convention (M2 siblings fixed exactly this in their iteration 2).

**4c. No hallucinated unclassified claims (39/40)** — Every remaining assertion was checked against Story 6 / SC6 / UF5 / prd-spec / business rules and either matches a source verbatim or falls under an existing annotation. No source-contradicting claim found (no M2-iteration-1-style inversion). Dock −1: Step 4b's Expected Result extends the annotated inference with an M3-specific recovery assertion — "恢复或重启全量重扫后与文档根文件一致" — whose "重启全量重扫" mechanism transfer to the *proposal* board is part of the same inference but stated as flat fact in the outcome text; the annotation covers the rationale, the outcome text does not flag itself as inferred.

### 5. Surface Fitness — 114/150 (weakest dimension)

**5a. Mandatory derived outcomes present (34/60)** — `validation-error` and `session-expired` are the two mandatory Web outcomes. Functional analogs exist: Step 4b is the degradation analog (per this family's own M2 mapping, session-expired's channel-failure analog *is* the perception-chain failure with sync-error + retry + last-good retention) and Step 4c is the invalid-input-containment analog (malicious content submitted via file, injection does not take effect). But: (i) neither is labeled, derived from, or reconciled with the web `required_outcomes` rules — zero mapping annotations in the document; (ii) the journey nowhere demonstrates it *considered* the rules and excluded/mapped them (the M2 sibling convention writes this out explicitly). Not scored 0 — the outcomes are not "completely absent" as functional analogs — but this is partial credit only, and it is the single largest fixable gap in the document.

**5b. Test strategy proportions (38/50)** — Web balanced 50/50: 4 journey-level happy steps + 4 edge variants is a plausible balanced skeleton, and the flowback step (4) plus badge navigation (3) give the journey-smoke side real substance. Dock −12: the contract side is thin — every step and edge carries exactly one single-line Expected Result with no per-step alternates (contrast the hot steps' multi-outcome treatment in sibling journeys); interaction-grade behaviors a 50% contract share would demand (badge affordance/clickability, list re-render on reflow, detail back-navigation affordance) are folded into prose.

**5c. Realistic environment/execution assumptions (42/50)** — Assumptions are realistic for browser automation over an Electron web view: DOM interaction via tabs/clicks, async ≤5s reflow windows (wait-for-condition, not fixed sleep implied), and the external-file trigger is a clean, controllable seam (filesystem write + UI assert) exactly as the M2 legs execute it. Dock −8: (i) no acknowledgment of async intermediate states — UF5's own `loading` state ("首次/切换项目") is never planned for, so a downstream test has no guidance on waiting through transitions (−3); (ii) Step 4b's trigger (induce watcher/scan failure) has no inducement seam or hint, unlike the M2 siblings' "校验通道见 Setup" pattern (−5).

### 6. Internal Consistency — 138/150

**6a. Invariants hold in every step (58/60)** — Invariant 1 (零状态写入口) holds across all steps and edges: Step 4's file changes are external to the app, not app write entries ✓. Invariant 2 (白名单) is honored by Steps 2/4c ✓. Invariant 3 is self-consistent by construction — it pre-declares the degradation clause ("感知健康时外部变更 ≤5s 回流,故障时保留最后良好视图") that Step 4b exercises, so 4b does not violate it ✓ (this is notably better drafting than the M2 iteration-1 invariant-4 self-contradiction). Dock −2: invariant 1's scope phrase "提案看板全页面" leaves Step 3's jump target (feature 看板) formally outside every invariant — harmless here since the feature board has its own journey, but the invariant set silently stops at the page boundary the workflow crosses.

**6b. Cross-step references consistent (40/50)** — Edge-case anchoring is correct (1b→Step 1, 2b→Step 2, 4b/4c→Step 4 — no M2-style misanchoring), and Step 2's return target matches UF5's navigation table (提案详情 → 提案看板) ✓. Dock −10: Step 3's reference is dangling in context — "点击提案的关联 feature 徽标" presupposes the proposal selected in Step 2 is feature-linked, a fact stated nowhere in the Step 2→3 chain (Setup only guarantees ≥1 linked proposal *exists*). A downstream consumer reading Steps 2–3 against the mixed fixture cannot resolve which entry the workflow is on. (Related field-quality dock taken in 1b/3b; this charge is specifically the broken cross-step reference.)

**6c. Risk level consistent (40/40)** — `Low` is exactly right: every step is read-only or observational; no state mutation anywhere; matches the template's Low criteria and the rubric's expectation ("A `Low` risk Journey should be read-only").

### 7. Workflow Coverage — 123/150

**7a. Golden Path existence (57/60, veto NOT triggered)** — Four contiguous domain-level steps semantically matching Story 6's acceptance criteria 1–4 and the proposal Key Scenario「提案浏览」(verified: "列表 → 详情 → eval 报告;feature ↔ proposal 互跳;外部变更 ≤5s 回流"): open proposal list → view detail with eval report → jump via feature badge → external-change reflow. Steps reference domain operations (browse/open/jump/flowback), not HTTP/API mechanics. Constraint A (3+ steps) ✓; Constraint B (semantic completeness, PRD terminology) ✓ — verified against Story 6, not merely step-counted. Note: this journey is not the feature's flagged Golden Path (`golden_path: true` lives on `task-dispatch-execution-loop` per the one-per-feature rule) — correctly so; the veto criterion's semantic test is satisfied within this document regardless. Dock −3: Step 4's compound alternation makes the path's final leg non-deterministic (which file, which change type), weakening the otherwise clean sequence.

**7b. Multi-step coverage depth (36/50)** — Real variation present: cross-entity interaction (proposal ↔ feature jump both directions with return), external-change reflow, degradation + recovery (4b), empty state (1b), security boundary (4c). Docks: no lifecycle-removal coverage (deletion flowback — the only "update the derived view downward" case), no concurrent-modulation cases (change arriving mid-detail-view vs mid-list-view are asserted identical), and the read-only domain legitimately caps state-machine depth — but the two former were available and absent (−14 total).

**7c. Workflow completeness against PRD scope (30/40)** — All four Story-6 ACs covered step-for-step ✓; UF5 interaction flow 1–4 ✓; all three UF5 validation rules covered (零写入口 → invariant 1; 白名单 → invariant 2 + 4c; 无徽标 → 2b) ✓; UF5 states: empty ✓ / populated ✓ / detail ✓ / **loading ✗**. Gaps within the journey's own claimed scope: loading state uncovered (−4); detail view of an eval-less proposal (fixture-guaranteed to exist, never an outcome) (−3); stale-badge jump — a proposal whose linked feature no longer exists, the natural hazard of the journey's own "管线早期形态" framing (unlinked-early → linked-late transitions rot) (−3).

### Cross-dimension coherence check

- **Anchor A charged once per facet**: Completeness 1c (−15, coverage), Surface Fitness 5a (34/60, surface-rule compliance), Fact Alignment 4b (−12, classification discipline) — three rubric-defined facets of one omission, mirroring the M2 iteration-1 coherence note; no double-charging within a dimension.
- **Step 2/3 ambiguity split across two dimensions deliberately**: 3b charges outcome-selection determinism, 6b charges the dangling cross-step reference — distinct defects (can't tell *which outcome* vs can't resolve *what the reference points to*), both rooted in Anchor B.
- **Step 4 alternation split**: 1b (action-field quality) and 3b (outcome uniqueness) — distinct facets, acknowledged.
- **Purity vs Fact Alignment cross-check**: `MarkdownView 白名单` / `sync-error` / `watcher` are PRD/FT-verbatim vocabulary, so they pass Semantic Purity as domain language while their claims remain traceable — no dimension conflict (same adjudication as M2 iteration-1).
- **Workflow Coverage 7a is consistent with the 1b/3b docks**: the path exists and is semantic; the *field determinism* is the defect, not the path.

---

## Phase 3 — Blindspot Hunt ([blindspot] = outside all rubric dimensions)

1. **[blindspot] File-parity assertions have no named verification channel.** Steps 1/2/4 and invariant 3 repeatedly assert parity with the document root ("内容与文档根一致", "回流内容与文件一致") — an oracle a browser-level test cannot observe on its own; the journey never states how (e.g., direct fixture-file read as oracle, the M2 siblings' "校验通道见 Setup" pattern). Surface Fitness 5c's dock covers environment realism and trigger inducement, not assertion observability. *Fix: add one Setup line declaring the file-read oracle channel for all parity assertions.*

2. **[blindspot] Fixture mutation with no isolation/restore contract.** Step 4 directs the runner to mutate the fixture project's files — "在应用外新增/修改提案文件(或 eval 报告),回到提案看板" — and the document contains no disposal, rollback, or per-test isolation statement (M2's eval flagged the same class as its top blindspot). A downstream runner executing literally leaves the fixture's `proposals/` permanently altered for subsequent journeys/legs. *Fix: prescribe fixture restore or per-journey disposable proposals fixture in Setup.*

3. **[blindspot] Step 1's outcome asserts static layout structure, not behavior.** "工作台 tab 顺序 = 概览/提案/Feature/任务" verifies a navigation-bar ordering — an implementation-adjacent layout invariant of the shell, not behavior of the proposal board under test; coupling this journey's Step 1 pass/fail to global tab order makes the leg brittle to unrelated nav changes and tests the wrong thing (QA persona: tests that verify implementation, not behavior). The fact itself is PRD-true (verified), so Fact Alignment does not see it. *Fix: scope tab order to a setup-level assertion; keep Step 1's outcome on the list content.*

4. **[blindspot] Two-state precondition equivalence is assumed, never established.** Step 1b's "为空(或不存在)" treats empty-dir and missing-dir as behaviorally identical; UF5's empty state is defined only for "proposals/ 为空", and nothing in the cited sources establishes the missing-directory rendering (path explanation text may differ, or an error may be distinct from empty). Charged lightly in 3a for bundling; the deeper issue — an *unverified equivalence claim* used as the basis of an outcome — is not a rubric concept. *Fix: split into 1b(空) and 1c(不存在) or mark the equivalence UNKNOWN.*

---

## Revision Priorities (for reviser)

1. **Add the surface-web required_outcomes mapping annotations** (family-convention format): `session-expired → 离线桌面应用无会话过期面;通道失效类比 = 感知链故障,映射为 4b(sync-error + 静默重试 + last-good)` and `validation-error → 只读看板无表单;非法输入类比 = 4c 恶意 markdown(可加:frontmatter 缺 status/created/作者 的列表呈现)` — resolves the largest single gap (5a/1c/4b facets) and likely lifts the total well clear of the margin.
2. **Pin Step 2's selection** ("点击一个关联了 feature 的提案条目") so the 2→3 chain and the 2b variant become deterministic.
3. **Split or de-alternate Step 4** — separate 新增/修改 and proposal/eval into distinct edges, or declare per-scenario outcomes; add deletion flowback.
4. **Add the missing cheap edges**: UF5 `loading` state, eval-less proposal detail, stale-badge jump (feature no longer exists), malformed frontmatter.
5. **Pin the eval-report path** (UF5 "文档根 eval/" vs prd-spec "proposals/<slug>/") or mark UNKNOWN; list the proposal doc in `sources:`.
6. **Blindspot fixes**: file-read oracle channel line in Setup; fixture restore contract; demote tab-order to setup assertion; split 空 vs 不存在.

**Final: 981/1150 — PASS (marginal, +6 over target; all dimensions ≥ threshold). No revision forced by the gate, but priorities 1–3 are strongly recommended before gen-contracts consumes this document.**
