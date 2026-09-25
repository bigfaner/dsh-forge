# Contract Eval Report — iteration 1

- **Journey**: proposal-board-browsing
- **DOC_DIR**: docs/features/dsh-forge-m3/testing/proposal-board-browsing/contracts/
- **Files scored**: step-1-open-proposal-list.md, step-2-proposal-detail-eval.md, step-3-badge-crossjump.md, step-4-external-change-backflow.md (8 Outcomes total)
- **Surface**: web (rubric Dimension 5 parameterized by rules/surface-web.md)
- **Handbook**: design/page-map.md exists → Anchor Integrity scored normally
- **Scorer persona**: Senior QA Engineer (verification stance)
- **Result**: **920 / 1100 — FAIL** (target 935; every dimension ≥ min threshold, total 15 points short)

| # | Dimension | Score | Min | Verdict |
|---|-----------|-------|-----|---------|
| 1 | Completeness | 140/150 | 90 | PASS |
| 2 | Semantic Purity | 182/200 | 120 | PASS |
| 3 | Precondition Exclusivity | 90/150 | 90 | PASS (at threshold) |
| 4 | Fact Alignment | 115/150 | 90 | PASS |
| 5 | Surface Fitness | 75/100 | 60 | PASS |
| 6 | Internal Consistency | 145/150 | 90 | PASS |
| 7 | Anchor Integrity | 94/100 | 60 | PASS |
| 8 | Fixture Specification | 79/100 | 60 | PASS |
| | **Total** | **920/1100** | 935 | **FAIL** |

---

## Phase 1 — Reasoning Audit (pre-score anchors)

1. **Coverage chain sound.** All 4 happy-path steps and all 4 journey edge cases (1b/2b/4b/4c) map to Contract Outcomes with no dropped scenario: 1b→step-1 `empty-state`, 2b→step-2 `no-feature-badge`, 4b→step-4 `sync-error-degraded`, 4c→step-2 `markdown-injection-guard` (relocated — see Anchor E). Journey Setup thresholds are faithfully carried into step-1's fixture.
2. **Anchor A — step-2 orthogonality cluster (exclusivity break).** The three step-2 Outcomes precondition on *independent* dimensions (eval presence / feature linkage / content malignancy) with no mutual-exclusion constraints: success = "目标提案存在(含正文)且含 eval 评估报告"; no-feature-badge = "提案未关联任何 feature(管线早期形态)"; markdown-injection-guard = "提案正文或 eval 报告文件内含恶意 markdown 结构". A single fixture (unlinked + eval-bearing + malicious) satisfies all three Preconditions and all three fixture_specs simultaneously. Channeled into Dimension 3.
3. **Anchor B — zero traceability.** Across all 4 files not a single `fact_id` citation or `UNKNOWN` mark appears, despite specific kernel assertions that map cleanly onto FT-086 (two read verbs, sort order, hasEval live fs check, proposal_snapshot sync reusing the sync batch, NULL feature_slug = no badge), FT-092 (tab order), FT-094/FT-046 (≤500ms event batching, closed v2 vocabulary), FT-056 (sync-error toolbar + last-good retention). I verified each is substantively accurate. Channeled into Dimension 4.
4. **Anchor C — tie-break assertion untestable as fixtured.** Step-1 Output asserts "排序 = created 降序,平局 slug 升序" but no field_constraint forces ≥2 proposals to share a `created` value, so the tie-break leg cannot fail as fixtured. Channeled into Dimension 8.
5. **Anchor D — web-mandatory derived outcomes absent without consideration record.** validation-error and session-expired (surface-web "must be considered for every Web Journey") appear in no Outcome, no comment, no N/A rationale — unlike the sibling journey preferences-tiered-override, which carried explicit mapping comments. Both are structurally inapplicable here (zero-write-entry invariant; page-map Auth: none; no forms), but the document set carries no evidence that the consideration happened. Channeled into Dimensions 5/1.
6. **Anchor E — silent edge-case relocation.** Journey edge 4c (恶意 markdown 防注入) is placed under step-2 (semantically correct — its action is detail browsing) with no provenance note; a tracer mapping journey-step numbers to contracts finds 4c "missing" from step-4 and an unmapped extra Outcome in step-2. Channeled into Dimension 6.
7. **Anchor F — vacuous-pass risk on no-feature-badge.** Step-2 `no-feature-badge` fixture seeds exactly one unlinked proposal; Output "列表不显示 feature 徽标" then passes even if badge rendering is broken wholesale. Channeled into Phase 3 (blindspot).
8. **Anchor G — dangling featureSlug gap.** Step-1 renders a badge on non-null slug (FT-086: "feature_slug NULL = unlinked (no badge rendered)" — badge presence is slug-driven, not feature-existence-driven) while step-3 requires "非空且指向存在的 feature"; the in-between state (non-null slug, feature missing) is covered by no Outcome and no fact. Channeled into Phase 3 (blindspot).

SC/InScope clustering check: N/A for contract-type documents (no SC/In Scope sections); the analogous full-pair Outcome satisfiability scan found no logical mutual-exclusion contradiction — the step-2 cluster is overlap ambiguity (one state selecting multiple Outcomes), not contradiction, and is scored under Dimension 3.

---

## Dimension 1 — Completeness: 140/150

- **Four mandatory dimensions per Outcome (0-50): 50.** All 8 Outcomes across 4 files carry non-empty Preconditions, Input, Output, State; every Outcome also carries an explicit Side-effect (including "none"); per-Outcome Invariants supplied where meaningful (step-1 success "提案看板全页面零状态写入口(只读硬约束)", step-2 success/markdown-injection-guard "渲染恒经 MarkdownView 白名单(防注入)", step-3 "互跳只读;返回来源页语义", step-4 both Outcomes carry freshness invariants). Verified block-by-block — zero missing dimensions.
- **Journey Invariants section (0-50): 50.** All 4 files contain `## Journey Invariants` with the full 3-entry invariant list replicated verbatim from the journey (zero-write entry, MarkdownView whitelist, board≡doc-root with ≤5s/failure-fallback semantics).
- **Happy path + surface-mandated derived scenarios (0-50): 40.** All happy paths and all four journey edge cases have Outcomes. Deduction: the surface-web mandatory derived outcomes (validation-error, session-expired) are absent from every file with no N/A annotation or mapping rationale — the only state-adjacent Outcome prose is "纯读零写", which states the behavior but never records that the mandatory scenarios were considered and excluded. −10.

## Dimension 2 — Semantic Purity: 182/200

- **Natural language, not code/regex (0-80): 78.** No regex tokens, CSS selectors, XPath, or framework assertion calls anywhere. Output values are behavioral ("列表呈现全部提案…工作台 tab 顺序 = 概览/提案/Feature/任务", "呈现「暂无提案」+ 路径说明(empty 态,正常呈现,无错误)"). Minor deduction: spec-jargon tokens embedded in State prose ("v2 事件词表闭合,无提案专属事件型") read as internal spec references rather than system behavior. −2.
- **Preconditions declarative, not procedural (0-60): 56.** Preconditions are state descriptions throughout ("已注册项目激活;项目文档根 proposals/ 含至少 2 个提案…", "感知链(watcher/扫描)故障,外部变更无法回流"). Deduction: harness mechanics inside fixture state_requirements — step-4 sync-error-degraded: "感知链故障(watcher/扫描失败,测试通道注入)" — "测试通道注入" is setup instruction; the state should stand alone with mechanics in fixture_spec metadata. −4.
- **No implementation coupling (0-60): 48.** Concrete couplings in dimension values: step-1 State "纯读(proposal_snapshot 派生索引 + hasEval 活性 fs 判定);零写入口" (DB table + DTO field); step-2 State "纯读(readProposalDoc 两 kind:proposal/eval);零写入口" (IPC verb); step-4 State "proposal_snapshot 随感知扫描行集替换;事件复用既有 sync 批(v2 事件词表闭合,无提案专属事件型)" (indexer internals + event vocabulary); step-4 Side-effect "感知事件批推(≤500ms 合并语义)" (push-channel internals). Step-3's State "视图切换为会话期内存态(视图键切换);数据零变更" is the right altitude. −12.

## Dimension 3 — Precondition Exclusivity: 90/150

- **Distinct across Outcomes (0-60): 30.** Step-1 partitions cleanly (board non-empty vs "项目文档根 proposals/ 为空(或不存在)"); step-4 partitions cleanly on perception-chain health ("感知链就绪…" vs "感知链(watcher/扫描)故障…"). Deductions — three overlap pairs, all in step-2, all constructible with one fixture (unlinked + eval-bearing + malicious proposal): (a) success × no-feature-badge — success constrains neither linkage nor benignity, no-feature-badge constrains neither eval nor body, and neither fixture_spec discriminates (success fixture has no featureSlug constraint; no-feature-badge fixture has no body/eval constraint); (b) success × markdown-injection-guard — success does not exclude malicious content, so a malicious proposal with an eval report matches both; (c) no-feature-badge × markdown-injection-guard — a malicious unlinked proposal matches both. −10 per pair.
- **Sufficient to uniquely select (0-50): 25.** The three overlap pairs are not resolvable from Preconditions + system state (nor from the nested fixture constraints — see above), violating "exactly one Outcome applicable". Additionally, a registered project whose proposals/ holds exactly 1 proposal matches **no** Outcome: success demands "含至少 2 个提案" (journey Setup threshold copied as trigger) while empty-state demands 为空/不存在 — the 1-proposal state (list still renders) selects nothing. −20 overlap + −5 selection hole.
- **Error/boundary triggers explicit (0-40): 35.** Every non-happy Outcome names its trigger: empty-state ("proposals/ 为空(或不存在)"), no-feature-badge ("未关联任何 feature(管线早期形态)"), markdown-injection-guard ("提案正文或 eval 报告文件内含恶意 markdown 结构"), sync-error-degraded ("感知链(watcher/扫描)故障,外部变更无法回流"). Deduction: success's "至少 2 个提案" is a journey-Setup echo, not the behavioral trigger for list rendering (rendering succeeds with ≥1), blurring trigger semantics and causing the selection hole above. −5.

## Dimension 4 — Fact Alignment: 115/150

- **Factual claims traceable or UNKNOWN (0-60): 40.** Substantively the claims are accurate — I verified against the Fact Table: sort "created 降序,平局 slug 升序" (FT-086), hasEval live fs determination (FT-086), exactly-two-read-verbs read-only domain (FT-086), tab order 概览/提案/Feature/任务 (FT-092), proposal_snapshot sync reusing the perception scan / sync event batch with no proposal-specific event type (FT-086, FT-094, FT-046), ≤500ms batch coalescing (FT-094), sync-error toolbar + silent retry + last-good retention + rebuildable snapshots (FT-056), MarkdownView whitelist rendering (prd-spec Security via journey comment). But the corpus contains **zero** `fact_id` citations and zero `UNKNOWN` marks — every one of these specific behavioral assertions is carried unattributed (`sources:` cites only journey.md). −20.
- **Inferred claims have rule support + source: inferred (0-50): 35.** Exemplary for the one clearly-inferred Outcome: step-4 `sync-error-degraded` carries "<!-- source: inferred:感知链故障的失败面沿用 M2 口径(sync-error 工具栏指示 + 静默重试、保留最后良好视图);文件恒为事实源,看板为派生快照可重建 -->" — inherited verbatim from the journey. Deductions: that annotation cites the M2-degradation reasoning but no surface-web `required_outcomes` rule basis (sync-error-degraded is substantively the network-error/degraded-connection analogue from surface-web's "Additional common Web boundary Outcomes", yet no mapping is recorded) −5; journey-derived boundary Outcomes `empty-state` (1b) and `no-feature-badge` (2b) carry no source lineage at all and read as uncited assertions −10.
- **No hallucinated unclassified claims (0-40): 40.** Nothing contradicts the Fact Table; the read-verb set, NULL-slug badge suppression, sort order, event reuse, and degradation semantics are faithful to FT-086/094/056. UI copy 「暂无提案」+ 路径说明 has no fact backing but is inherited verbatim from the journey (declared source). Unclassified-but-accurate claims were penalized under criterion 1; no fabrications found.

## Dimension 5 — Surface Fitness: 75/100

- **Mandatory derived Outcomes present (0-40): 20.** Both web-mandatory outcomes (validation-error, session-expired) are completely absent from all 4 files, with no N/A rationale and no reasoned-analogue mapping comment (contrast the sibling journey preferences-tiered-override, which mapped both inline). Mitigation credit: the scenarios are structurally inapplicable as the journey stands — zero-write-entry invariant "提案看板全页面零状态写入口(只读硬约束;状态流转归终端/agent)" leaves no form to validate, and page-map Auth: none / single-user desktop leaves no session to expire — and `sync-error-degraded` is already the substantive degradation analogue (connection to data source lost → graceful degradation, state retained, recovery on reconnect). But the consideration is undocumented; a downstream agent applying surface-web rules finds nothing. Must improve: add mapping/N/A comments (e.g. "surface-web required_outcomes: validation-error → N/A(零写入口,无表单); session-expired → N/A(单用户桌面,Auth none); 降级面由 sync-error-degraded 承载(network-error 映射)"). −20.
- **Surface-appropriate language (0-35): 30.** Input/Output are proper web-UI language (切换 tab, 点击提案条目, 徽标, 详情页, 工具栏指示, 返回, aria-live/FlowOverlay in layout). Deduction: State dimensions mix kernel/DB/indexer language ("proposal_snapshot 派生索引 + hasEval 活性 fs 判定", "readProposalDoc 两 kind", "事件复用既有 sync 批(v2 事件词表闭合)"). −5.
- **TUI timeout criterion (0-25): 25.** Non-TUI surface — full marks per rubric.

## Dimension 6 — Internal Consistency: 145/150

- **Invariants hold in every Step Contract (0-60): 60.** Zero-write: every Outcome declares Side-effect "none" except step-4 success "感知事件批推(≤500ms 合并语义)" — an internal system push, not a UI write entry point, so the invariant "零状态写入口" (entry-point semantics) holds; proposal_snapshot refresh is the app-owned derived cache explicitly permitted by BIZ-coexistence-002. Whitelist: step-2's rendering Outcomes carry it explicitly. Board≡doc-root: step-4's two Outcomes state exactly the healthy (≤5s, 免手动刷新, 回流内容与文件一致) and degraded (保留最后一次良好视图;恢复或重启全量重扫后与文档根文件一致) legs of invariant 3. No violations found.
- **Cross-Contract state references consistent (0-50): 45.** Implicit continuity verified: step-2 success "目标提案存在(含正文)且含 eval 评估报告" is satisfiable from step-1's board fixture (≥1 proposal with eval); step-3 "目标提案关联一个存在的 feature" deepens step-1's linked-proposal constraint (non-null slug → existing feature) honestly and declares the Feature entity itself. No dangling references. Deduction: journey edge 4c (恶意 markdown 防注入, an edge of the external-change step) is relocated into step-2 as `markdown-instruction-guard`-equivalent Outcome `markdown-injection-guard` with no provenance note — the journey→contract step mapping is silently renumbered (4c absent from step-4, an extra Outcome in step-2), which will confuse any journey-coverage tracer. Also same-file scope bleed: `no-feature-badge` sits under step-2 (detail) but its Input/Output cover the list view ("查看列表与该提案详情" / "列表不显示 feature 徽标"), which is step-1's action surface. −5.
- **Preconditions achievable from preceding State changes (0-40): 40.** All contracts are read-only with self-contained fixtures; step-4's "提案看板已打开" is reachable from step-1; step-2/3 fixtures are independently seedable. Chain verified, no breaks.

## Dimension 7 — Anchor Integrity: 94/100

Handbook `design/page-map.md` exists → scored normally. Web anchor field = `page`; contracts additionally carry `route`/`requires_auth`/`layout`, richer than required.

- **Anchor field completeness (0-40): 40.** All 4 contracts carry `anchors.web.page` (+ route). No missing fields.
- **Anchor values match handbook (0-30): 24.** Routes match handbook view keys for the static pages: `workbench/proposals` (step-1, step-4) exactly matches the handbook View Key; step-2's `workbench/proposals/<slug>` resolves via the handbook's Route Parameters table (slug = "string(视图键段)…详情子视图"); step-3's layout names ProposalDetail → FeaturesPage, both present in the handbook. Deductions: (a) page-title augmentation drift — "工作台 · 提案看板(第二 tab)" (step-1) / "(列表/详情回流)" (step-4) / compound transition title "提案详情(feature 徽标)→ 工作台 · Feature 看板" (step-3) vs handbook headings "工作台 · 提案看板(UF5,新增页)" / "工作台 · Feature 看板(UF2 阶段化扩展)" — prefix resolves via route, but exact-match discipline says use the handbook title verbatim −4; (b) dynamic-segment notation drift — contract routes use `<slug>` (steps 2–3) where the handbook pins `workbench/features/:slug` −2.
- **Handbook internal consistency (0-30): 30.** No conflicting page/route definitions: view keys disjoint (overview / proposals (+slug 视图键段) / features(+ :slug) / tasks / dialog/* / panel/* / session); tab order 概览/提案/Feature/任务 consistent between header ("workbench 内四 tab 子页(概览/提案/Feature/任务)") and the Pages section, corroborated by FT-092; the proposals page's slug-as-视图键段 framing is coherent with the no-URL-routing header; FlowOverlay row ("外部变更 ≤5s;aria-live") consistent with step-4's layout anchor.

**Missing Anchor Fields** — none.

| File | Field | Issue |
|------|-------|-------|
| (none) | — | — |

**Anchor value notes** (minor, non-desyncing):

| File | Field | Contract value | Handbook value | Note |
|------|-------|----------------|----------------|------|
| step-1 | page | 工作台 · 提案看板(第二 tab) | 工作台 · 提案看板(UF5,新增页) | augmented title; route resolves |
| step-2 | route | workbench/proposals/<slug> | slug = 视图键段(详情子视图) | notation inference; consistent framing |
| step-3 | page/route | 提案详情(feature 徽标)→ 工作台 · Feature 看板 / workbench/features/<slug> | 工作台 · Feature 看板(UF2 阶段化扩展) / workbench/features/:slug | compound transition title; `<slug>` vs `:slug` notation |
| step-4 | page | 工作台 · 提案看板(列表/详情回流) | 工作台 · 提案看板(UF5,新增页) | augmented title; route resolves |

**Handbook Conflicts** — none found.

## Dimension 8 — Fixture Specification: 79/100

`fixture_spec` present on all 8 Outcomes → mandatory scoring (no legacy exemption). Veto NOT triggered: every entity type materially operated on is declared, and all declared types (Project, Proposal, EvalReport, Feature) map to the design domain (tech-design §Domain: projects, proposal_snapshot + proposals/<slug>/eval/*.md with readProposalDoc kind 'proposal'|'eval', feature_snapshot; UF5 slice "proposal 动词").

- **Entity completeness (0-40): 40.** Verified per-Outcome: step-1 success seeds Project + Proposal (2, with linked/unlinked variants) + EvalReport; step-3 adds Feature with the slug-match constraint; empty-state correctly declares only Project (no Proposal rows). Badge rendering in step-1 is driven by proposal.featureSlug nullness (FT-086), so no Feature row is required there — the association is carried as a Proposal field_constraint. Note (not vetoed): step-4 success Input covers "(或 eval 报告)" modification but declares no EvalReport entity for that variant — acceptable because the variant is optional; scored under min_count.
- **Relationship and constraint coverage (0-35): 26.** `belongs_to` + `parent_entity` declared consistently for multi-entity fixtures; field_constraints capture the load-bearing values (frontmatter status/created/作者, featureSlug 非空/空, body 非空, content 恶意, slug 与提案关联值一致). Deductions: (a) step-3 models Proposal and Feature as siblings both `belongs_to Project`, but the operative relationship is Proposal→Feature (featureSlug reference); the link is only implied via parallel field_constraints, not declared as a relationship −5; (b) step-2 uses field "body" (success: "非空提案正文") vs field "content" (markdown-injection-guard: "含恶意 markdown 结构…") for the same proposal text — field-name drift within one file −2; (c) step-1 success lists Proposal three times (aggregate min_count 2 + linked +1 + unlinked +1) — expressive but structurally ambiguous for a seeder (are these three populations or overlapping views of one set?) −2.
- **Minimum data quantity (0-25): 13.** Step-1's aggregate (≥2 proposals, ≥1 linked, ≥1 unlinked, ≥1 with eval) and steps 2–3 single-entity counts are adequate for their primary assertions. Deductions: (a) step-1 Output asserts the tie-break "平局 slug 升序" but no constraint forces ≥2 proposals to share a `created` value — the tie leg is untestable as fixtured −8; (b) step-4 success Input's eval-report variant ("新增/修改提案文件(或 eval 报告)") has no EvalReport entity/min_count behind it — the variant is asserted but not seedable from the fixture −4.

---

## Phase 3 — Blindspot Hunt

1. `[blindspot]` **Vacuous-pass risk: badge-absence test cannot fail.** Step-2 `no-feature-badge` Output asserts "列表不显示 feature 徽标;详情浏览照常可用(正常态,非错误)" with a fixture of a single unlinked proposal (min_count 1, featureSlug 空). A board containing only unlinked proposals passes this assertion even if badge rendering is broken wholesale — nothing exercises the positive control. Must improve: seed ≥1 linked proposal in the same fixture as contrast, or split the assertion (badge absent on unlinked card / present on linked card) so the check can fail.
2. `[blindspot]` **Dangling featureSlug state is undefined between steps (Reasoning audit Anchor G).** Step-1 renders the badge on non-null slug ("关联 feature 徽标(无关联不渲染徽标)" — FT-086: badge presence is slug-driven, not feature-existence-driven), while step-3's fixture demands "非空且指向存在的 feature". The in-between state — non-null slug whose feature no longer exists (stale slug after feature removal/rename) — is covered by no Outcome, no fact, and no UNKNOWN mark: does the badge render? does the jump fail silently? A user can genuinely reach it. Must improve: add a boundary Outcome for the dangling slug (or explicitly mark the rendering behavior UNKNOWN pending a design ruling).
3. `[blindspot]` **Per-step fixture continuity is implicitly assumed but never stated.** Steps 2–4 each redeclare minimal fixtures (Proposal min_count 1) while their Preconditions say "目标提案"/"提案看板已打开" — nothing states whether tests run against one shared board fixture (journey continuity) or independent seeds per contract. For step-4 especially, "回到提案看板" presposes the board from step-1 (≥2 proposals, mixed linkage) — with its own min_count-1 fixture, the backflow assertion degenerates to a single-card check. Must improve: state fixture scope per contract (shared journey board vs isolated seed) or raise step-4's min_count to the journey-setup profile.

(Reasoning-audit Anchors A–G were scored under Dimensions 3, 4, 8, 5/1, 6, and blindspots 1–2 respectively, per protocol channeling rules.)

---

## Revision Priorities (for reviser)

1. **Dimension 3 (top priority — at threshold):** make step-2's three Outcomes mutually exclusive — add discriminators to Preconditions (e.g. success: "…且内容为常规良构 markdown、featureSlug 未限定"; no-feature-badge: "…且内容常规、含正文与 eval 与否不限" → better: scope each Outcome to its single varying dimension and state the others fixed), and replace step-1 success's "至少 2 个提案" setup echo with the behavioral trigger (board non-empty), adding an Outcome or precondition leg for the exactly-1-proposal state.
2. **Dimension 5/1:** add surface-web required_outcomes mapping comments — validation-error N/A (零写入口, no forms), session-expired N/A (Auth: none, single-user desktop), sync-error-degraded ← network-error/degradation analogue — so the consideration is on the page.
3. **Dimension 4:** add fact citations (FT-086 to step-1/2 sort·badge·hasEval·read-verb claims; FT-092 tab order; FT-094/FT-046 event batching/reuse; FT-056 degradation semantics) or UNKNOWN marks; add source lineage to `empty-state` and `no-feature-badge`; add the required_outcomes rule basis to `sync-error-degraded`'s inferred comment.
4. **Dimension 8:** constrain two step-1 proposals to share `created` (or drop the tie-break clause); declare EvalReport for step-4's eval variant; declare the Proposal→Feature relationship in step-3; unify the proposal-text field name (body vs content).
5. **Dimension 2:** move `proposal_snapshot`/`hasEval`/`readProposalDoc`/sync-batch internals out of State values into metadata; move "测试通道注入" from state_requirements into fixture mechanics.
6. **Dimension 7:** use handbook page titles verbatim; normalize `<slug>` → `:slug` per handbook notation.
7. **Dimension 6/blindspots:** annotate the 4c→step-2 relocation with provenance; seed a linked-contrast proposal for `no-feature-badge`; define or mark UNKNOWN the dangling-featureSlug behavior; state fixture scope for steps 2–4.
