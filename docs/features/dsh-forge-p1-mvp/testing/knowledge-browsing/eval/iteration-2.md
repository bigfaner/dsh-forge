# Eval Report: knowledge-browsing / iteration-2

- **Document**: `docs/features/dsh-forge-p1-mvp/testing/knowledge-browsing/journey.md`
- **Type**: journey (web surface) | **ITERATION**: 2
- **Rubric**: `skills/eval/rubrics/journey.md` (1150 pts, target 975, all dimensions ≥ min)
- **Surface rules**: `skills/gen-journeys/rules/surface-web.md`
- **Scorer stance**: Senior QA Engineer, adversarial; scored independently on current content (no credit for improvement effort). All cited sources re-opened and re-verified this iteration: prd-user-stories.md Story 3 (lines 63–75), prd-spec.md 流程三 (lines 89–92) + Performance (line 166), prd-ui-functions.md UF-6 (lines 254–294) + Secondary Pages (line 34), proposal.md Key Scenario 知识浏览 (line 59) + SC5 (line 170). Cross-journey delegation target verified: `testing/knowledge-recall-flywheel/journey.md` Step 7 ("卡片热度较召回前 +1") does carry the dynamic heat side.

## Previous Attack-Point Resolution Verification (iteration-1 → now)

| # | Iteration-1 attack | Status | Evidence in current document |
|---|---|---|---|
| A | Web mandatory derived outcomes absent (validation-error / session-expired) — D5.1 0/60 | **RESOLVED** | New section "Derived Outcomes（Web Surface 必察项）": validation-error 实步覆盖 via new Step 3b with rule citation "surface-web required_outcomes 必察项 × UF-6 工具栏" + `source: inferred`; session-expired N/A with PRD 安全边界 mapping + `source: inferred`. |
| B | Heat AC (Story 3 AC3) claimed but never covered; dead invariant; no event fixture | **RESOLVED** | Setup line 36: "使用事件 fixture：K1 已被召回 3 次…供热度断言"; Step 1: "K1 徽章数字 = 3，与 Setup 使用事件计数一致（Story 3 AC3 断言）"; invariant 3 instantiates and delegates dynamic side to verified sibling. |
| C | "恢复上一有效状态" hallucinated/unclassified | **RESOLVED** | Step 2b now: "过滤条件清空、网格回到全量卡片（恢复目标态 = 全量网格；source: inferred——…恢复语义派生自「清除过滤」字面义 + Setup 非空库）". |
| D | Step 3 keyword no fixture anchor; hit-field semantics undefined (blindspot B2) | **RESOLVED** | Setup line 35 defines K1 (double hit) / K2 (total miss) / token qz9 with `source: inferred`; Step 3 marks "命中字段口径 UNKNOWN（规避策略见 Setup）". |
| E | 1b/1c boundary convergence (empty dir vs externally-emptied dir) | **RESOLVED** | Setup: "Step 1c 目录仍含 ≥1 个知识文件（与 1b 空目录态可区分）"; repeated in 1c precondition. |
| F | Step 1c missing cache precondition; cold-cache sub-case absent; 加载中 state uncovered | **RESOLVED** | 1c precondition: "此前已进入过知识面板（索引缓存已建立）；…索引相对目录已过期"; new Step 1d (cold cache) covers UF-6 加载中 skeleton state. |
| G | Non-blocking rebuild has no observable proxy (blindspot B4) | **LARGELY RESOLVED** | Step 1c now a two-phase observable contract with probes ("①…本次新增条目暂不在网格、被删条目仍在；②…新增条目出现、被删条目消失"). Residual race risk scored in D5.3 / blindspot 4. |
| H | Mid-level domain node + subtree semantics untested (blindspot B3) | **RESOLVED** | New Step 2c: 点第 2 层「规范」→ subtree cards incl. layer-3, with `source: inferred`; depth-3 visibility asserted in Step 1 with >3 层 explicitly fenced UNKNOWN. |
| I | Step 1c precondition mixes event narrative (D2.2) | **RESOLVED** | Now states resulting state ("索引相对目录已过期"). |
| J | Step 5 close paths collapsed (Esc / ✕) | **NOT RESOLVED** | Still "按 Esc 或点 ✕ 关闭抽屉" with no equivalence-class scope note (sibling session-workbench shows the fix pattern: "本步以按钮为代表，断言及于等价类"). |
| K | "索引直读" channel gloss inside outcome (D2.1) | **NOT RESOLVED** | Step 1 still "auto-fill 卡片网格（索引直读）". |
| L | golden_path flag semantics undocumented (D1.1 −2) | **NOT RESOLVED** | `golden_path: false` while a 5-step Happy Path section exists; set-level convention undocumented in-doc. |

No new structural issues introduced; three new minor issues found (K2 domain, 1d directory state, zero-heat boundary — see below).

## Phase 1 — Reasoning Audit

1. **Coverage**: domain tree (3-layer fixture + depth boundary + mid-node subtree), card grid, domain filter, keyword refine (deterministic fixtures), entry detail drawer (composition + no-frontmatter + context preservation), heat instantiation, all four UF-6 States, empty/whitespace input no-op. The knowledge-browsing workflow is fully represented.
2. **Executable sequence**: Steps 1→5 form a coherent browse chain; edge cases 1b/1c/1d/2b/2c/3b each carry explicit preconditions and independently observable outcomes. Three soft spots remain: Step 3's miss-assertion depends on K2's unstated domain; Step 1d's outcome presupposes an unstated non-empty directory; zero-count heat rendering is never pinned.
3. **Observability**: all outcomes are UI states. The previously mechanism-level rebuild assertion is now mapped to a two-phase observable contract (its only weakness is the phase-① timing race). One residual channel gloss ("索引直读").
4. **Invariants**: all four hold in every step; heat invariant now instantiated (K1=3) with dynamic side delegated to a sibling journey that verifiably covers it. Cross-step references resolve (3b→2, 2c→1, 1→Setup, invariant 3→knowledge-recall-flywheel Step 7).
5. **Fixtures deterministic**: yes — double-hit/total-miss keyword fixtures, fixed event count 3, scenario isolation with explicit 1b/1c/1d discrimination.

## Phase 2 — Rubric Scoring

### Dimension 1: Completeness (完整性) — 189/200 (min 120: PASS)

| Criterion | Score | Justification |
|---|---|---|
| 1.1 Metadata | 48/50 | `journey: "knowledge-browsing"` kebab-case ✓; `risk_level: "Low"` valid and justified by read-only content ✓; sources/surface/generated populated ✓. −2: `golden_path: false` while the doc contains a 5-step Happy Path section — set-level flag semantics undocumented in-doc (only knowledge-recall-flywheel carries `true`); a downstream consumer cannot tell whether the flag means "no golden path" or "not THE feature-level golden-path journey". Same calibration as iteration-1 and sibling evals. |
| 1.2 Steps complete | 71/80 | All 10 steps (5 happy + 5 edge) carry User Action + Expected Result in a coherent ordered sequence ✓. −4: Step 5 "按 Esc 或点 ✕ 关闭抽屉" — two distinct close affordances collapsed into one action; coverage scope (one representative vs both) undefined. −3: Step 3's contrast fixture is underspecified — Setup says "前端域知识 K1 的标题与 frontmatter 关键词均含「部署」；K2 全字段…不含「部署」" but never states K2's domain; if K2 ∈ 后端域, "不呈现 K2 卡片" is guaranteed by Step 2's domain filter alone and proves nothing about keyword filtering. −2: Step 1d precondition ("索引缓存不存在（首次进入知识面板；依场景隔离独立启动）") omits the directory-content condition its own outcome needs — "索引建立完成后卡片网格就位" is unassertable on an empty directory (and would collapse 1d into 1b); 1c restates "目录仍含 ≥1 个知识文件" but 1d does not, an unexplained asymmetry. |
| 1.3 Outcomes: happy + required derived | 70/70 | Happy path ✓; all four UF-6 States covered (空库→1b / 加载中→1d / 过滤无结果→2b / 索引失效→1c) ✓; both web-mandatory derived outcomes present — validation-error as real step 3b with rule citation, session-expired as reasoned N/A ("单机产品无登录会话 / 过期概念") ✓. |

### Dimension 2: Semantic Purity (语义纯度) — 195/200 (min 120: PASS)

| Criterion | Score | Justification |
|---|---|---|
| 2.1 Natural-language outcomes | 77/80 | No regex, selectors, or assertion calls anywhere ✓; outcomes describe what the user sees ✓. −3: Step 1 embeds a data-provenance channel in the observable outcome — "呈现当前项目知识的 auto-fill 卡片网格（索引直读）" — "索引直读" is an SC2 channel property (UF-6 verbatim), invisible to both user and browser test. |
| 2.2 Declarative preconditions | 60/60 | Setup and edge preconditions are state descriptions; the iteration-1 narrative-timing mix in 1c is fixed — now "此前已进入过知识面板（索引缓存已建立）；其后知识目录在应用外被修改…，索引相对目录已过期" states the resulting state ✓. Fixture-seeding parentheticals ("应用状态层使用事件表预置 3 条事件") keep a declarative lead ("K1 已被召回 3 次") ✓. |
| 2.3 No implementation coupling in steps | 58/60 | Steps are user-level actions ✓. Step 1c's outcome now leads with the observable contract and appends the mechanism phrase as its named proxy — "「重建不阻塞首显（缓存先行）」的可观察代理即上述先旧后新两阶段" — acceptable but still carries PRD-mechanics vocabulary inside an Expected Result (−2). |

### Dimension 3: Precondition Exclusivity (前置条件互斥性) — 150/150 (min 90: PASS)

| Criterion | Score | Justification |
|---|---|---|
| 3.1 Preconditions distinct across outcomes | 60/60 | One outcome per step; edge preconditions pairwise distinct and explicitly discriminated — empty dir (1b) / existing-but-stale cache + ≥1 file (1c) / absent cache (1d) / combined no-hit (2b) / unfiltered mid-node (2c) / domain state + empty box (3b). Setup additionally fences the 1b/1c boundary: "Step 1c 目录仍含 ≥1 个知识文件（与 1b 空目录态可区分）" ✓. |
| 3.2 Preconditions sufficient to uniquely select | 50/50 | Given Setup + precondition, exactly one outcome applies per scenario; e.g. 1c's two phases are sequenced within one outcome, not competing outcomes. |
| 3.3 No missing preconditions for boundary outcomes | 40/40 | Every boundary step states its trigger, including 1c's previously missing cache precondition. (1d's unstated directory content is scored under 1.2 as fixture completeness — the trigger itself, cache absence, is stated.) |

### Dimension 4: Fact Alignment (事实依据) — 145/150 (min 90: PASS)

| Criterion | Score | Justification |
|---|---|---|
| 4.1 Factual claims traceable | 57/60 | All five 溯源 loci re-verified against source text this iteration, including the now-accurate per-AC step mapping (AC1→Step 2, AC2→Step 4, AC3→Step 1) ✓; step-level locus marks now present ("（Story 3 AC3 断言）", "（UF-6 States 原文）", "（UF-6「加载中」态）"); two UNKNOWNs explicitly fenced (">3 层目录的呈现口径 PRD 未定义，UNKNOWN 不入断言"; "命中字段口径 UNKNOWN") ✓. −3: a few verbatim-derivable behaviors still carry no locus mark — Step 5 "过滤条件不丢失，无需重新过滤" (grounded in UF-6 "Esc / ✕ 关闭回浏览上下文（保持）" but unmarked) and Step 1 "（右栏隐藏、状态保留）" (UF-5 / 流程三第 1 步, unmarked). |
| 4.2 Inferred claims have rule support + `source: inferred` | 48/50 | Eight `source: inferred` annotations, each with reasoning basis (surface rule citation, PRD-gap note, or semantic-derivation basis) ✓ — keyword fixture, event-seeding channel, 2b clear semantics, 2c subtree semantics, 3b empty-keyword semantics, session-expired N/A, invariant subtree clause. −2: classification discipline is inconsistent for test-harness conventions — the event-seeding channel is marked ("预置通道 PRD 未定义——source: inferred") but the scenario-isolation convention ("Step 1b / 1c / 1d 以独立知识目录状态启动，不与基线叠加") and 1c's external-modification injection channel are PRD-silent harness conventions left unmarked. |
| 4.3 No hallucinated unclassified claims | 40/40 | Full sweep of every behavioral assertion: each maps to PRD verbatim (empty-state copy, 空结果提示 + 清除过滤入口, 无对账横幅, drawer composition, prefix filter), to a declared fixture, or to an inferred-marked derivation. The iteration-1 hallucination is gone; no new unclassified claims found. |

### Dimension 5: Surface Fitness (Surface 适配, web-parameterized) — 145/150 (min 90: PASS)

| Criterion | Score | Justification |
|---|---|---|
| 5.1 Mandatory derived Outcomes present | 60/60 | surface-web.md: "Mandatory derived Outcomes (must be considered for every Web Journey): validation-error … session-expired". validation-error: real step (3b) exercising the journey's only input face under empty/whitespace input with rule citation; session-expired: explicit N/A with PRD 安全边界 mapping, matching sibling-journey practice. Both considered and disposed — the 0/60 condition ("completely absent") no longer applies. |
| 5.2 Test strategy proportions (Web: balanced 50/50) | 49/50 | Contract-extractable units are now dense: prefix filter (2), subtree semantics (2c), keyword hit/miss (3), whitespace no-op (3b), no-result + clear recovery (2b), empty library (1b), cold-cache skeleton (1d), stale-index two-phase (1c), drawer composition/no-frontmatter (4), context preservation (5), heat=count (1) — alongside a coherent 5-step journey smoke; balance respected ✓. −1: the smoke's closing beat has no anchored affordance ("按 Esc 或点 ✕") — a generated suite must pick one arbitrarily, leaving the contract for close behavior under-determined. |
| 5.3 Environment/execution assumptions realistic | 36/40 | Browser interaction model ✓ (clicks, keyboard Esc, drawer slide-in, view switch); async handling substantially improved — the rebuild now has an observable two-phase contract with concrete probes ✓. −2: phase ① has no determinism anchor — "面板立即呈现旧缓存内容（探针：本次新增条目暂不在网格、被删条目仍在）" races a fast background rebuild on a small fixture (rebuild may complete before first paint; UF-6 itself notes "缓存先行则瞬时"), with no fixture-sizing/latency note or soft-assert disposition; −2: drawer "右侧滑入" still gets no element-stability consideration despite surface-web General Principle 5 ("wait for elements to become stable before asserting" — animation completion). |

### Dimension 6: Internal Consistency (一致性) — 145/150 (min 90: PASS)

| Criterion | Score | Justification |
|---|---|---|
| 6.1 Invariants hold in every step | 58/60 | No step violates any of the four invariants ✓; the heat invariant is no longer dead — Step 1 instantiates it against the seeded fixture, and the dynamic (+1) side is delegated to knowledge-recall-flywheel Step 7, which verifiably covers it ✓; rebuild writes only the app-side cache, so the 零写入 invariant holds through Step 1c ✓. −2: the equality invariant is spot-instantiated at a single point — "卡片热度数字恒等于该知识的使用事件计数（同源数据）——Step 1 以 K1 徽章 = 3 实例化" — no step pins the count=0 boundary (badge rendered "0", blank, or absent for never-recalled knowledge such as K2 or 后端域 entries); PRD is silent on zero display and the journey neither covers nor fences it, so 恒等于 remains untested at the boundary an implementation is most likely to get wrong. |
| 6.2 Cross-Step references consistent | 47/50 | 3b 衔接 Step 2 ✓; 2c depends on Step 1's tree ✓; Step 1's badge resolves to the Setup event fixture ✓; invariant 3's sibling reference resolves and is honored there ✓; Step 3 composes on Step 2's filter ✓. −3: Step 3's discriminating assertion rests on an unstated cross-step fixture fact — "不呈现 K2 卡片（全字段未命中）" presupposes K2 ∈ 前端域, which Setup never states; if K2 is backend-domain the assertion is satisfied by Step 2's filter regardless of keyword behavior, so the keyword-refinement step would silently pass even if keyword filtering were broken. |
| 6.3 Risk level consistent | 40/40 | Low = read-only: every step observational, "全程只读" declared, 零写入 invariant enforced; rebuild writes only the derived app-side cache. Fully consistent ✓. |

### Dimension 7: Workflow Coverage (工作流覆盖度) — 147/150 (min 90: PASS; Golden Path veto NOT triggered)

| Criterion | Score | Justification |
|---|---|---|
| 7.1 Golden Path existence (veto) | 60/60 | Five contiguous steps semantically match Story 3's primary flow and UF-6's User Interaction Flow (enter → domain filter → keyword refine → open drawer → close), using domain-level operations ("点域树「前端」域节点", "点一张知识卡片"), not API-level descriptions. Veto not triggered. |
| 7.2 Multi-step coverage depth | 47/50 | Beyond the golden path: four UI states (empty/stale/cold/no-result), mid-level subtree selection, depth-3 boundary reachability, combined-filter recovery with defined restore target, whitespace no-op, and the card-heat ⨝ usage-event cross-entity instantiation (static) with the dynamic side delegated to the flywheel journey — genuine depth for a read-only domain ✓. −2: zero-heat boundary untested (same instance as 6.1 — a never-recalled card's badge behavior); −1: close affordance equivalence undisposed, leaving one beat of the browse workflow's variation set unanchored. |
| 7.3 Workflow completeness against PRD scope | 40/40 | Story 3 AC1/AC2/AC3 all covered with accurate 溯源 mapping; UF-6 all four States covered; UF-6's 3-step interaction flow fully traced; SC5's three items (域前缀过滤 / frontmatter 驱动卡片与抽屉 / 热度 = 事件计数) all instantiated. Remaining micro-gaps (second close affordance, toolbar 范围显示 element) are auxiliary — no penalty per rubric. |

### Cross-dimension coherence check

- **K2-domain fixture ambiguity**: primary manifestation D1.2 (−3, fixture anchor) and secondary D6.2 (−3, weakened assertion discrimination) — one root cause, two criteria genuinely affected.
- **Close-affordance collapse**: primary D1.2 (−4); light secondary echoes in D5.2 (−1) and D7.2 (−1) where the respective criterion (smoke anchor / variation completeness) is independently touched.
- **Zero-heat boundary**: D6.1 (−2) + D7.2 (−2); also blindspot 1 (downstream executability beyond rubric letter).
- No deduction-rule triggers this iteration (see below) — all residual losses are criterion-level quality docks, each with a quote.

## Phase 3 — Blindspot Hunt

1. **[blindspot] Zero-count heat rendering unpinned**: "卡片热度数字恒等于该知识的使用事件计数（同源数据）——Step 1 以 K1 徽章 = 3 实例化（Setup 事件 fixture）" — the equality is only ever asserted at count=3. Every other card in the fixture (K2, 后端域 entries) has zero events; whether the badge shows "0", is blank, or is hidden is asserted nowhere and marked UNKNOWN nowhere. An implementation that hides zero badges (or shows "—") passes every current assertion while arguably violating 恒等于. Must add a zero-event card expectation or fence the zero case explicitly.
2. **[blindspot] Keyword-fixture robustness overclaimed**: "token「qz9」为全部知识全字段不含——命中 / 未命中在任何字段口径下均确定" — the guarantee holds only for field-scope conventions that include 标题 or frontmatter 关键词. K1's 摘要/正文 content is unstated; under a summary/body-only search convention K1's hit is not guaranteed and Step 3's expected result becomes nondeterministic. Fix by also placing 「部署」 in K1's 摘要/正文, or narrowing the claim ("任何包含标题或关键词的口径").
3. **[blindspot] Step 1d directory state unspecified**: "索引缓存不存在（首次进入知识面板；依场景隔离独立启动）" — 1c explicitly retains "≥1 个知识文件" but 1d says nothing about its directory; on an empty directory 1d's "索引建立完成后卡片网格就位" is unobservable and 1d/1b become indistinguishable. Must state 1d runs against the non-empty baseline fixture.
4. **[blindspot] Phase-① probe races a fast rebuild**: "① 首显不被重建阻塞：面板立即呈现旧缓存内容（探针：本次新增条目暂不在网格、被删条目仍在）" — no determinism guard: with a small fixture the background rebuild can finish before first paint, making the "暂不在网格" assertion flaky (fail-on-pass). Should designate phase ② as the hard contract and phase ① as opportunistic, or require a fixture/latency guard for the stale window.
5. **[blindspot] Only free-text input gets no hostile-input disposal**: "空 / 纯空白输入不产生过滤收紧与副作用" — whitespace-only coverage. Regex/SQL metacharacters (e.g. 「部署（」 or ".*[") in the search box are neither tested nor disposed; a naive matcher (`new RegExp(query)`-style) throws on metacharacters — a classic production bug this plan would miss. Add a special-character no-crash step or an explicit disposition.

## Deduction Rule Applications

| Rule | Applied | Instance |
|---|---|---|
| Hallucinated unclassified claim −30 | No instance | All behavioral assertions trace to PRD verbatim, declared fixtures, or inferred-marked derivations; both residual UNKNOWNs fenced. |
| Surface type violation −25 | No instance | No CLI/API-style assertions in the web journey. |
| Invariant violation −40 | No instance | No step violates a declared invariant (zero-heat gap is boundary-quality loss, not a violation). |
| Precondition overlap −20 | No instance | No ambiguous precondition pair; edge scenarios explicitly discriminated. |
| Golden Path veto / API-level step −15 | Not triggered | Golden path present, contiguous, domain-level. |

## Final Summary

```
SCORE: 1116/1150  (target 975 — PASS; all dimensions ≥ min threshold)
DIMENSIONS:
  Completeness: 189/200             (min 120: PASS)
  Semantic Purity: 195/200          (min 120: PASS)
  Precondition Exclusivity: 150/150 (min 90: PASS)
  Fact Alignment: 145/150           (min 90: PASS)
  Surface Fitness: 145/150          (min 90: PASS)
  Internal Consistency: 145/150     (min 90: PASS)
  Workflow Coverage: 147/150        (min 90: PASS)
```

**Residual improvement list** (all minor; none blocks pass):
1. State K2 ∈ 前端域 in the keyword fixture so Step 3 discriminates keyword-miss from domain-exclusion (D1.2/D6.2).
2. Add zero-event heat expectation (or UNKNOWN fence) — blindspot 1 (D6.1/D7.2).
3. Specify Step 1d's non-empty directory and Step 5's close-affordance coverage scope (D1.2).
4. Add a determinism guard for Step 1c phase ① and a stability note for the drawer slide-in (D5.3).
5. Mark the scenario-isolation / external-modification harness conventions `source: inferred` for classification consistency (D4.2); drop the "索引直读" channel gloss from the Step 1 outcome (D2.1).
