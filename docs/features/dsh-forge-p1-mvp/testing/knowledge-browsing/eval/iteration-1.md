# Eval Report: knowledge-browsing / iteration-1

- **Document**: `docs/features/dsh-forge-p1-mvp/testing/knowledge-browsing/journey.md`
- **Type**: journey (web surface) | **ITERATION**: 1 (no previous report)
- **Rubric**: `skills/eval/rubrics/journey.md` (1150 pts, target 975, all dimensions ≥ min)
- **Surface rules**: `skills/gen-journeys/rules/surface-web.md`
- **Scorer stance**: Senior QA Engineer, adversarial; all sources cited in the journey frontmatter were independently opened and cross-checked (prd-user-stories.md Story 3, prd-spec.md 流程三, prd-ui-functions.md UF-6, proposal.md Key Scenario + SC5).

## Source Verification (performed before scoring)

All five PRD 溯源 loci were verified accurate:

| Claimed locus | Verified |
|---|---|
| Story 3, all 3 ACs (域前缀过滤 / 抽屉不含 frontmatter / 热度与事件计数一致) | YES (prd-user-stories.md:65-75) |
| 流程三第 2 步 (prd-spec Business Flow) | YES (prd-spec.md:90) |
| UF-6（工具栏 / 域树 / 卡片网格 / 详情抽屉） | YES (prd-ui-functions.md:254-294) |
| 提案 Key Scenario「知识浏览」 | YES (proposal.md:59) |
| SC5（浏览子集） | YES (proposal.md:170) |

The document is honest in its citations — the failures below are about what the journey omits and leaves unclassified, not about fabricated facts.

## Phase 1 — Reasoning Audit

1. **Primary workflow**: The 5-step happy path (enter view → domain filter → keyword refine → open drawer → close drawer) faithfully mirrors UF-6's User Interaction Flow and Story 3's I-want. Structurally sound.
2. **Executable sequence**: Mostly executable, with three soft spots: Step 3's keyword has no fixture anchor and no hit-semantics definition; Step 2b's "恢复上一有效状态" is undefined (pre-keyword state? pre-domain state?); Step 1c's "重建不阻塞面板首显" is a timing property with no user-observable proxy.
3. **Outcomes observable**: Yes — all outcomes are UI states, with one notable exception family (index rebuild mechanics, "索引直读", "缓存先行"), which are PRD-verbatim channel descriptions rather than observations.
4. **Self-contradiction check**: No step violates any invariant; cross-step references resolve. However, invariant 3 (热度恒等于事件计数) is **dead** — no step observes a heat value, and the Setup seeds no usage events, so the invariant is unverifiable as written. The 溯源 claims "全部 3 条 AC" coverage, but AC3 has no step. This is the single largest substantive gap.

## Phase 2 — Rubric Scoring

### Dimension 1: Completeness (完整性) — 154/200 (min 120: PASS)

| Criterion | Score | Justification |
|---|---|---|
| 1.1 Metadata | 48/50 | `journey: "knowledge-browsing"` kebab-case ✓; `risk_level: "Low"` valid and justified (read-only browsing, invariant "浏览全程对知识目录零写入") ✓; sources/surface/generated populated ✓. −2: `golden_path: false` while the doc contains a 5-step Happy Path — set-level flag semantics undocumented in-doc (only knowledge-recall-flywheel carries `true`), ambiguous for downstream consumers. Same calibration as sibling evals. |
| 1.2 Steps complete | 70/80 | All 8 steps (5 happy + 3 edge) carry User Action + Expected Result and form a coherent ordered sequence ✓. −6: Step 3 "在工具栏搜索框输入关键词" — no fixture anchor for the keyword (which keyword, hitting which card, missing which card), leaving the test generator to invent the fixture; −4: Step 5 "按 Esc 或点 ✕ 关闭抽屉" — two distinct close code paths collapsed into one action, coverage scope (one representative vs both) undefined. |
| 1.3 Outcomes: happy + required derived | 36/70 | Happy path ✓; UF-6 States-derived edges present: 空库 (Step 1b), 索引失效 (Step 1c), 过滤无结果 (Step 2b) — but UF-6's fourth state 加载中/网格骨架 has no outcome. −30: the web surface's mandatory derived outcomes (`validation-error`, `session-expired`) are **completely absent** — no step and no N/A classification (the sibling journeys session-workbench and project-registration-compensation both carry an explicit derived-outcome disposition section; this document has none). −4: 加载中 state uncovered. |

### Dimension 2: Semantic Purity (语义纯度) — 189/200 (min 120: PASS)

| Criterion | Score | Justification |
|---|---|---|
| 2.1 Natural-language outcomes | 76/80 | No regex, selectors, or assertion calls anywhere ✓; outcomes describe what the user sees ✓. −4: parentheticals inside outcomes assert data channels rather than observations — Step 1 "呈现当前项目知识的 auto-fill 卡片网格（索引直读）" — "索引直读" is an SC2 data-provenance channel, invisible to the user and to a browser test. |
| 2.2 Declarative preconditions | 57/60 | Setup and edge preconditions are state descriptions ✓ (Step 1b "当前项目知识目录为空（无任何知识文件）"). −3: Step 1c "知识目录在应用外被修改（新增 / 删除知识文件）后进入知识面板" mixes an event narrative with entry timing instead of stating the resulting state (index stale relative to directory). |
| 2.3 No implementation coupling in steps | 56/60 | Steps are user-level actions (点域树节点 / 输入关键词 / 点卡片) ✓. −4: Step 1c's expected result asserts internal mechanics — "索引按需一次性静默重建…（缓存先行）" — the rebuild process and cache strategy, PRD-verbatim but mechanism-level; the observable contract is only "卡片网格反映最新目录内容". |

### Dimension 3: Precondition Exclusivity (前置条件互斥性) — 140/150 (min 90: PASS)

| Criterion | Score | Justification |
|---|---|---|
| 3.1 Preconditions distinct across outcomes | 56/60 | One outcome per step; edge preconditions 1b (empty dir) / 1c (externally modified dir) / 2b (combined filter no-hit) are mutually distinct ✓. −4: 1b/1c converge at the boundary — an externally-emptied directory satisfies both "目录为空" and "被修改", and both outcomes then predict the same grid; a fixture-level distinction (1c must retain ≥1 file) is not stated. |
| 3.2 Preconditions sufficient to uniquely select | 50/50 | Given Setup + precondition, exactly one outcome applies per scenario; Step 2b's "域过滤与关键词组合后无任何命中" uniquely selects the empty-result outcome. |
| 3.3 No missing preconditions for boundary outcomes | 34/40 | All three edge cases state triggers ✓. −6: Step 1c omits the precondition its own expected result depends on — "重建不阻塞面板首显（缓存先行）" presupposes an existing index cache to show first, but the precondition does not require prior entry/scan; on first-ever entry (no cache) the outcome's "缓存先行" clause is unfulfillable. A boundary sub-case (cold cache vs stale cache) is missing. |

### Dimension 4: Fact Alignment (事实依据) — 82/150 (min 90: **FAIL**)

| Criterion | Score | Justification |
|---|---|---|
| 4.1 Factual claims traceable | 52/60 | The 溯源 section anchors the major claims, and all five loci verify against the actual PRD text (see Source Verification) — domain prefix filter, drawer composition, no-frontmatter rule, non-blocking rebuild, empty-state copy all match UF-6 / Story 3 / prd-spec verbatim ✓. −8: traceability is document-level only (no per-claim fact mapping); several step-level behavioral assertions (e.g., Step 5 "过滤条件不丢失，无需重新过滤") carry no locus mark and rely on the reader locating UF-6's "关闭回浏览上下文（保持）" themselves. |
| 4.2 Inferred claims have rule support + `source: inferred` | 20/50 | **Zero `source: inferred` annotations in the entire document**, while the sibling journeys in the same doc set carry six or more each (e.g., session-workbench line 35, 50, 130-131). The inference layer the surface rules mandate is entirely missing: no `validation-error` derivation from "surface-web required_outcomes 必察项 × 工具栏输入面", no `session-expired` N/A mapping to the PRD single-machine security boundary. −30 for the absent mandatory-inference layer, the same secondary-manifestation calibration applied in the session-workbench iteration-1 eval. |
| 4.3 No hallucinated unclassified claims | 10/40 | One unclassified behavioral claim found: Step 2b "点清除后恢复上一有效状态". UF-6's States table defines only "空结果提示 + 清除过滤入口" (prd-ui-functions.md:287) — the *existence* of the clear entry is factual, but the *behavior after clearing* ("恢复上一有效状态") is asserted nowhere in any cited source and is marked neither UNKNOWN nor inferred. Deduction rule "Hallucinated unclassified claim: −30 per instance" applied as written. Recovery: mark `source: inferred` with basis, define "上一有效状态", or delete the clause. |

### Dimension 5: Surface Fitness (Surface 适配, web-parameterized) — 76/150 (min 90: **FAIL**)

| Criterion | Score | Justification |
|---|---|---|
| 5.1 Mandatory derived Outcomes present | **0/60** | surface-web.md: "Mandatory derived Outcomes (**must be considered for every Web Journey**): validation-error … session-expired". Both are **completely absent**: no step exercises the journey's only input surface under invalid/empty input (toolbar keyword box — e.g., empty or whitespace keyword behavior undefined), and session-expired is neither covered nor classified N/A — even though the N/A pattern (single-machine product, no login session) is established in the sibling journeys. Rubric: "Score 0 if mandatory Outcomes are completely absent." Applied as written. |
| 5.2 Test strategy proportions (Web: balanced 50/50) | 44/50 | The 8 scenarios split cleanly: contract-extractable units (domain prefix filter, empty state, no-result state, drawer content rules) plus a coherent journey smoke (the 5-step browse flow) — balance respected ✓. −6: outcome density is thin for contract extraction — 3 of 4 UF-6 States made it into outcomes but 加载中/骨架 did not, and Step 3's outcome is a single undifferentiated clause. |
| 5.3 Environment/execution assumptions realistic | 32/40 | Browser interaction model ✓ (clicks, keyboard Esc, right-side drawer slide-in); async handling present for the rebuild operation ✓. −5: Step 1c asserts "重建不阻塞面板首显（缓存先行）" — a timing property with no observable surrogate (no stale-then-fresh two-phase assertion, no stability anchor), which a Playwright agent cannot assert from the UI alone; −3: drawer slide-in animation gets no element-stability consideration ("右侧滑入" — assert after animation settles). |

### Dimension 6: Internal Consistency (一致性) — 135/150 (min 90: PASS)

| Criterion | Score | Justification |
|---|---|---|
| 6.1 Invariants hold in every step | 50/60 | No step violates any of the four invariants ✓. −10: invariant 3 — "卡片热度数字恒等于该知识的使用事件计数（同源数据）" — is dead: no step displays or checks a heat value, and the Setup seeds knowledge files but zero usage events, so no downstream agent can ever exercise it. Invariant 4 (零写入) is likewise browser-unobservable (SC2 code-audit channel) but at least derives from DF005's "不落知识目录"; the heat invariant is the one claimed as covered AC yet never instantiated. |
| 6.2 Cross-Step references consistent | 45/50 | Step 3 composes on Step 2's domain filter ✓; Step 5 returns to Step 4's drawer context ✓; Step 1c's "重新进入" resolves to Step 1 ✓. −5: Step 2b's "恢复上一有效状态" is ambiguous against the step chain — with domain (Step 2) and keyword (Step 3) both active, "上一有效状态" could mean pre-keyword composite or fully unfiltered; the cross-step state being restored is undefined. |
| 6.3 Risk level consistent | 40/40 | Low = read-only: every step is observational, the journey declares "全程只读", and invariant 4 enforces zero writes. Fully consistent ✓. |

### Dimension 7: Workflow Coverage (工作流覆盖度) — 120/150 (min 90: PASS; Golden Path veto NOT triggered)

| Criterion | Score | Justification |
|---|---|---|
| 7.1 Golden Path existence (veto) | 60/60 | Five contiguous steps semantically match Story 3's primary flow and UF-6's User Interaction Flow (enter → tree filter + keyword → card → drawer → close), using domain-level operations (点域树「前端」域节点 / 点一张知识卡片), not API-level descriptions. Veto not triggered. |
| 7.2 Multi-step coverage depth | 38/50 | Beyond the golden path: empty-state guidance (1b), stale-index recovery (1c), no-result + clear-filter recovery (2b) — genuine state/edge variations ✓. −12: the one cross-entity interaction available in this read-only domain — card heat ⨝ usage events (the flywheel's visible trace, explicitly an AC and an invariant) — is absent; no state-transition or lifecycle content exists by design (read-only), so depth rests entirely on filter/empty/recovery variations. |
| 7.3 Completeness against PRD scope | 22/40 | Story 3: AC1 covered by Step 2, AC2 covered by Step 4 ✓. **AC3 (热度展示与使用事件计数一致) has no step** despite 溯源 claiming "Story 3（全部 3 条 AC：… 热度与事件计数一致）" — a self-declared coverage that the body does not deliver (−15). UF-6's 加载中 state uncovered (−3). UF-6 interaction flow otherwise fully traced ✓. |

### Cross-dimension coherence check

- **Root cause A — web mandatory derived outcomes absent**: manifests in D5.1 (0/60, primary per rubric), D1.3 (−30), D4.2 (−30). Deliberately heaviest in D5 where the rule lives.
- **Root cause B — heat AC claimed but never covered**: manifests in D7.3 (−15) and D6.1 (−10 dead invariant); reappears as blindspot B1 because it is a downstream-executability failure (no fixture) beyond the rubric's letter.
- **Root cause C — "恢复上一有效状态" undefined/unclassified**: manifests in D4.3 (−30 per rule) and D6.2 (−5 ambiguity).

## Phase 3 — Blindspot Hunt

1. **[blindspot] Untestable invariant — no usage-event fixture**: the invariant says "卡片热度数字恒等于该知识的使用事件计数（同源数据）" but Setup seeds only "前端域 / 后端域知识文件（frontmatter 合规…）" — no knowledge is stated to have been recalled N times. Without an event fixture (e.g., "知识 A 已被召回 3 次"), no generated test can assert heat = count. Must add an event-count fixture to Setup or defer explicitly to the knowledge-recall-flywheel sibling journey.
2. **[blindspot] Keyword hit semantics undefined**: "在工具栏搜索框输入关键词" → "网格仅呈现组合过滤命中的卡片" — neither this journey nor UF-6 defines which fields constitute a hit (title? frontmatter keywords? summary? body?). A test generator cannot deterministically construct hit/miss fixture cards. Must define scope or mark UNKNOWN.
3. **[blindspot] Domain-tree non-leaf selection boundary untested**: "左轨域目录树呈现（目录即域，≤3 层）" and invariant "域过滤 = 目录路径前缀匹配" — only a single top-level domain (「前端」) is exercised; selecting a mid-level node (does prefix match include the subtree's cards?) and the ≤3-layer depth boundary itself are never tested. Prefix semantics imply subtree inclusion, but no step asserts it.
4. **[blindspot] Non-blocking assertion has no observable proxy**: "重建不阻塞面板首显（缓存先行）" is a timing property; a browser-level test needs an observable two-phase contract (stale grid renders immediately, refreshed content appears after rebuild) or a stability anchor. As written the generated test would either skip it or assert nothing meaningful.
5. **[blindspot] Only input surface gets zero negative treatment**: "在工具栏搜索框输入关键词" is the journey's sole input, and it has no boundary outcome at all (empty keyword, whitespace, special characters) and no explicit N/A disposition — even a read-only surface must dispose of `validation-error` explicitly, per surface-web "must be considered for every Web Journey".

## Deduction Rule Applications

| Rule | Applied | Instance |
|---|---|---|
| Hallucinated unclassified claim −30 | YES ×1 | D4.3: "点清除后恢复上一有效状态" (no source, no UNKNOWN/inferred mark) |
| Surface type violation −25 | No instance | No CLI/API-style assertions found in the web journey |
| Invariant violation −40 | No instance | No step violates a declared invariant (dead invariant handled as 6.1 quality loss) |
| Precondition overlap −20 | No instance | No ambiguous precondition pair within a step |
| Golden Path veto / API-level step −15 | Not triggered | Golden path present and domain-level |

## Final Summary

```
SCORE: 896/1150  (target 975 — FAIL; revision required)
DIMENSIONS:
  Completeness: 154/200            (min 120: PASS)
  Semantic Purity: 189/200         (min 120: PASS)
  Precondition Exclusivity: 140/150 (min 90: PASS)
  Fact Alignment: 82/150           (min 90: FAIL)
  Surface Fitness: 76/150          (min 90: FAIL)
  Internal Consistency: 135/150    (min 90: PASS)
  Workflow Coverage: 120/150       (min 90: PASS)
```

**Revision priorities** (highest leverage first):
1. Add the derived-outcome disposition section (validation-error disposition for the keyword box — cover or N/A with reasoning; session-expired N/A per single-machine boundary), each with `source: inferred` + rule citation → recovers D5.1 (0→~50), D1.3 (+~25), D4.2 (+~25).
2. Give AC3 real coverage: seed a usage-event fixture in Setup and add a step (or fold into Step 1/4) observing the heat number → recovers D7.3, D6.1, kills blindspot B1.
3. Mark/remove "恢复上一有效状态" or define it (and the restored state) with `source: inferred` → recovers D4.3, D6.2.
4. Define keyword hit scope (or mark UNKNOWN) and add non-leaf domain-tree selection + cold-cache sub-case as preconditions/steps → addresses blindspots B2-B4 and D3.3.
