# Eval Report: journey/feature-board-docs-browsing — Iteration 2

- **Evaluator**: Scorer (adversarial), Senior QA Engineer persona
- **Date**: 2026-09-23
- **Document**: `docs/features/dsh-forge-m2/testing/feature-board-docs-browsing/journey.md` (revised since iteration 1)
- **Rubric**: `eval/rubrics/journey.md` (1150 pts, target 975, per-dimension thresholds)
- **Surface**: web (`gen-journeys/rules/surface-web.md`)
- **Iteration**: 2 (previous: `eval/iteration-1.md`, total 921/1150, FAIL — Fact Alignment 70/150 below threshold)
- **Verdict**: **PASS** — Total 1093/1150 (≥ 975); every dimension above threshold

| Dimension | Score | Threshold | Status | Δ vs iter-1 |
|-----------|-------|-----------|--------|-------------|
| 1. Completeness | 196/200 | 120 | PASS | +26 |
| 2. Semantic Purity | 198/200 | 120 | PASS | −2 |
| 3. Precondition Exclusivity | 147/150 | 90 | PASS | +10 |
| 4. Fact Alignment | 131/150 | 90 | **PASS** | +61 |
| 5. Surface Fitness | 136/150 | 90 | PASS | +46 |
| 6. Internal Consistency | 147/150 | 90 | PASS | +13 |
| 7. Workflow Coverage | 138/150 | 90 | PASS | +18 |
| **Total** | **1093/1150** | **975** | **PASS** | **+172** |

---

## Verification basis (what this scorer independently checked, beyond the page)

Fact Alignment in iteration 2 required code-level verification, not just PRD cross-reading. Checked against disk:

- `prd-user-stories.md` (Story 5/6 AC1–AC3), `prd-spec.md` (G4/SC4/SC5, In Scope 文档外置, Security 边界约束), `prd-ui-functions.md` (UF1 flow/validation, UF4 flow/States/Validation/Data Requirements) — all cited rows exist as quoted.
- `design/tech-design.md` — Interface 1 `workbench.readFeatureDoc(projectId, featureSlug, kind)` exists (line 163); `FeatureStatus ... // forge manifest 词表透传` (line 95); `feature_snapshot` carries `doc_kinds/task_total/task_completed` (line 244); Interface 1 注记「五槽位条是稳定地图,缺类禁用不隐藏」(confirmed in `sc4-feature-docs.spec.ts` header).
- `apps/desktop/e2e/tests/m2/sc4-feature-docs.spec.ts` and `sc5-multi-project.spec.ts` — the journey's "已落地 sc4/sc5 e2e 对比口径" claims are **true**: `normalizeDoc` (whitespace-strip) + `fixtureTextProjection` equality; badge/counter assertions (4/4 vs 1/3); missing-kind tabs disabled-not-hidden; 仓外角标 `[data-dsh-forge-badge="external-docs"]`; invalidation → error card + snapshot retained → repoint wizard edit mode → rescan per new tree. Single-instance probe (`assertNoActiveForgeInstance`), isolated userData, temp-dir cleanup — all present in both specs, matching Setup.
- `testing/multi-project-management/journey.md` — the deferral holders are real: its Step 2b (路径未检出), 3b (仓外=代码根目录), 3c (显式授权 + 「未显式切换仓外时,默认文档位置为仓内(外置默认关闭)」= Story 6 AC3 verbatim) exist exactly as this journey's Step 4 comment and 覆盖说明 claim.
- Business rules (coexistence / privacy / resilience / task-operations) — no violations: journey is browse-only on forge data (task-ops 只读约束), link guard aligns with the no-network-face posture, fixture-isolated userData is test discipline not a product-schema change.
- Searched for a real-repo registration leg backing "SC4 真实仓口径……以本仓注册另腿验收": all 7 m2 e2e legs are fixture-based; `scripts/acceptance/live-ui-{probe,sweep}.mjs` are M1 session-UI legs; `tasks/records/6.summary.md` post-M2 ledger (9 items) contains no real-repo SC4 leg. **No verifiable holder found** (see Fact Alignment).

---

## Phase 1 — Reasoning Audit (pre-score anchors)

**Chain check**: Story 6 (feature 文档浏览与仓外文档) → problem (需求上下文应用内可查 + 过程资产不进代码仓) → solution (board → 状态机 → 五类只读渲染 → 仓外注册 → 同构渲染) → evidence (header traceability Story 6/SC4/SC5/G4/UF4, all verified present; per-claim grounding now largely inline) → success criteria (every Expected Result carries an observable + a named 校验通道). The journey exercises exactly the user story it claims. No self-contradictions found in the state chain.

**Iteration-1 attack resolution audit** (all nine attacks re-checked against the revised text — none claimed-but-unresolved):

1. Annotations → Step 3b now carries `source: inferred` with a reasoning basis (Interface 1 per-doc verb + UF4 error-row scope); basis verified real in tech-design. **Resolved.**
2. Unclassified 3b isolation clause → same annotation covers it. **Resolved.**
3. validation-error / session-expired disposition → Step 4 mapping comment (deferral to multi-project 2b/3b/3c — holders **verified**) + Step 5b mapping comment (session-expired → channel-invalidation analog). **Resolved.**
4. Fixtures / isolation / channel → Setup now provisions the disposable fixture project (临时目录 + 隔离 userData + 清理 + 单实例探测), dual-feature model, 仓外 trees ×2, zero-feature project, corrupted-doc copy, link/injection docs, plus 跨面断言口径 and 落库形态读数对拍 — all matching actual e2e practice. **Resolved.**
5. Unquantified 「功能完整」→ Steps 4/5 now enumerate observables (≤3 步、落库形态、slug 一致、角标、规范化全等). **Resolved.**
6. Loading edge → Step 1c added with inline `(UF4 States:loading 行)` citation. **Resolved.**
7. Step 5b UF3 overreach → action now scoped to feature 详情与文档. **Resolved.**
8. Numbering drift → edges re-parented correctly (1b/1c under Step 1; 3b/3c/3d under Step 3; 5b under Step 5, post-Step-4 state). **Resolved.**
9. AC3 deferral + in-progress leg → 覆盖说明 names the verified holder; Setup 双 feature + Step 2 verifies both states and the 缺类禁用 matrix. **Resolved.**

Iteration-1 blindspots: #1 (real-repo carrier/lock hazard) resolved via fixture discipline; #2 (equivalence criterion undefined) resolved via the normalization 口径; #3 (feature-board freshness) **still open** (re-listed in Phase 3 with ledger evidence); #4 (cross-journey rename/repoint promise) half-resolved — repoint now exercised in 5b, rename honestly declared 「家族未认领」 but the sibling's pointer still aims here (charged under Internal Consistency).

**Pre-score anchors recorded before rubric scoring**:

1. The revision is substantive, not cosmetic: every deduction class from iteration 1 has a text-visible countermeasure, and the new specifics (badge/counters, 缺类禁用, repoint loop) are all real behaviors I verified in tech-design/e2e — the document now describes the shipped system, not an invented one.
2. The residual defect mass is second-order: one unanchored deferral (另腿), two design-layer specifics cited nowhere in-doc, one under-provisioned registration subject (Step 4's 「该 forge 项目」), one transient-state edge without an observability control, and family-seam leftovers (rename, feature freshness).
3. Narrative remains clean: no forks, no selector leakage, no precondition collisions.

---

## Phase 2 — Rubric Scoring (verification stance)

### 1. Completeness — 196/200

**Metadata (50/50)**: kebab-case name; `risk_level: Medium` valid and correctly placed (read-only browse + authorization-bound registration + two security guards; below multi-project's High with removal/hash-verify, above task-board's pure-browse Low). Sources all exist.

**Steps complete with required fields (76/80)**: Every happy step and edge has User Action + Expected Result; the 1→5 spine is coherent; every Expected Result now names observables with a channel pointer. Deduction:
- Step 4's registration subject is under-provisioned: 「以仓外本地路径为文档位置注册**该 forge 项目**」 — 「该」 has no unambiguous antecedent. Setup provisions the main fixture project (already registered+activated) and the 仓外 docs **trees** (「另造与代码根目录分离的仓外 docs 树 fixture」), but no second codeRoot project to pair with the external tree. Registering the already-registered fixture's codeRoot would collide with multi-project Step 2c's duplicate-rejection leg; the actual e2e leg (sc5) registers a second project B (own codeRoot + external docsRoot). A downstream agent must invent the subject project. (−4)

**Outcomes cover happy path + required derived scenarios (70/70)**: Happy path complete for AC1/AC2; derived coverage: empty (1b), loading (1c), per-doc error + retry-after-recovery (3b), link guard (3c), injection guard (3d), channel-invalidation + full repoint recovery (5b); validation-error dispositioned to a **verified** holder; session-expired mapped. Nothing mandatory is absent or undispositioned.

### 2. Semantic Purity — 198/200

**Natural language, no code/regex (80/80)**: No regex, selectors, or assertion calls; the comparison criterion (「渲染文本空白剥离规范化后与文件投影全等」) is a precise natural-language spec, not code.
**Declarative preconditions (60/60)**: All edge preconditions are states (「文档位置路径有效,但某个过程文档内容读取失败」); fixture provenance parentheticals are sourcing notes, not procedures.
**No implementation coupling (58/60)**: Steps are user-level throughout. One lead-with-internal-vocabulary instance: Step 5b's 「**已扫快照数据**不被静默清空(feature 列表仍在)」 asserts via the derived-cache concept (feature_snapshot table vocabulary) with the user-observable form relegated to a parenthetical; lead with the observable. (−2)

### 3. Precondition Exclusivity — 147/150

**Distinct across outcomes (57/60)**: Iteration-1's 2b/3b boundary defect is fixed — 3b now explicitly scopes 「文档位置路径**有效**」, cleanly separating single-doc corruption from 5b's path invalidation. Residual: Setup presets one fixture doc class carrying both guard payloads (「外链/注入腿 = fixture 文档预置外链与脚本/HTML 内容」), so 3c's and 3d's preconditions are simultaneously satisfiable on the same document; outcome selection then depends on the differing User Actions rather than on state alone. Not an equivalence violation, but edge isolation is action-carried. (−3)
**Sufficient to uniquely select (50/50)**: Iteration-1's unreachable 1b is fixed (「空态腿 = 另备零 feature fixture 项目」 + precondition cites Setup); 5b's state is reachable via Step 4 + Setup's second tree; every edge's precondition selects exactly its outcome.
**Missing preconditions for error/boundary outcomes (40/40)**: All five boundary edges state their triggers, including the transient loading trigger.

### 4. Fact Alignment — 131/150 (threshold 90 — PASS; was 70)

**Factual claims traceable / UNKNOWN (46/60)**: The core is now strongly grounded and I verified the strongest claims against code: Steps 1–3 ← UF4 flow 1/2/3 + Navigation Rules + e2e sc4 (badge, counters 4/4 vs 1/3, 缺类禁用 matrix — all real assertions in `sc4-feature-docs.spec.ts`); Step 4 ← UF1 flow/validation + sc5 `wizardExternal`; Step 5 ← UF4 Data Requirements 仓外路径来源 + sc5 external-docs badge; 1b/1c ← UF4 States rows (1c inline-cited); 3b ← UF4 error row + Interface 1 (annotated); 3c/3d ← UF4 Validation 安全约束 / prd-spec Security 边界约束; 5b ← UF4 Validation near-verbatim + sc5 repoint leg (cited, verified true); Setup 口径 ← verified true against both specs. Deductions:
- 「SC4 真实仓口径[dsh-forge-m1 completed]**以本仓注册另腿验收**」 — a disposition claim whose holder leg I could not find anywhere: all 7 m2 e2e legs are fixture-based, the acceptance scripts are M1 session-UI legs, the phase-6 gate record's acceptance basis is the fixture legs, and the 9-item post-M2 ledger has no real-repo SC4 leg. The deferral is unanchored and unmarked. (−8)
- Step 1's 「计数全满/计数部分完成」 and Step 2's 「缺类禁用不隐藏」「(forge manifest 词表透传)」 are the document's most specific behavioral claims; they are **true** (tech-design `feature_snapshot` counters; Interface 1 注记 五槽位稳定地图; `FeatureStatus // manifest 词表透传`) but the document cites none of them, and tech-design is absent from `sources:`. The family's own convention (inline UF citations, e2e 口径 pointers) is applied elsewhere but skipped exactly where the claims are least PRD-derivable. (−6)

**Inferred claims annotated with rule support + source: inferred (48/50)**: Step 3b's annotation is present, correctly formed, and its stated basis is real. Step 4/5b carry the two surface-mapping comments in family form. Residual: 1c's 「未就绪期间不显示错误态或空态」 extends beyond the cited UF4 loading row into a state-exclusivity assertion with no basis given. (−2)

**No unclassified claims (37/40)**: All behavior assertions classify (factual-verified or inferred-annotated). The 另腿 disposition claim is the one item that is neither traceable, nor inferred-with-rule, nor marked UNKNOWN — charged here at classification weight (its truth-weight charge is the −8 above; no −30 hallucination applied because it asserts an acceptance arrangement, not system behavior). (−3)

### 5. Surface Fitness — 136/150

**Mandatory derived outcomes (56/60)**: Both web-mandatory outcomes are present in disposition with family-standard comments: validation-error → Step 4 deferral to multi-project 2b/3b/3c (holders verified on disk), session-expired → Step 5b offline-analog mapping with reasoning. Not absent, so no 0-score; a journey that owns a form surface (Step 4 wizard) yet carries zero in-journey validation observation is one notch below instantiating the outcome where the surface rule's example ("error message displayed near the relevant field") would apply. (−4)
**Test strategy proportions 50/50 (47/50)**: 11 scenarios (5 happy + 6 edge), per-step granularity contract-extractable (state rows, guards, counters, normalized-equality contract, repoint recovery loop), coherent end-to-end spine — balanced. Guard edges (1b/1c/3c/3d) are one-line depth versus 5b's full recovery workflow. (−3)
**Environment realism (33/40)**: The iteration-1 gaps are closed with verified-real discipline (disposable fixture + isolated userData + lock probe + cleanup = exactly what the e2e specs do; assertion channel = direct fixture-file read with normalization = exactly `normalizeDoc`/`fixtureTextProjection`; registry form = 工作台状态读数 = exactly the e2e `getState` probe). Residuals:
- Loading-edge observability: 1c asserts 「先行显示 loading 骨架」 but the 2-feature fixture settles near-instantly and Setup provisions no slow-load/large-set control (contrast task-board's 500-task preset that makes its loading leg observable); surface-web async principles expect a deterministic wait/trigger strategy for transient states. (−3)
- Accessibility principle: surface-web principle 4 (keyboard reachability, ARIA labels for dynamic content) is encoded by the task-board sibling as an invariant; this journey's interactive surface (feature cards, doc tabs, back nav) asserts none. (−4)

### 6. Internal Consistency — 147/150

**Invariants hold in every step (60/60)**: 只读渲染 holds everywhere and is actively tested (3c/3d; no step offers an edit entry — registration/repoint are registry operations, not doc writes); forge-consistency is now operationalized (Setup channel + per-step pointers — iteration-1's gap fixed); 仓内/仓外等价 asserted via the same channel in Step 5. No violations.
**Cross-step references consistent (47/50)**: 「该仓外项目」→Step 4; 「第二仓外树」→Setup; edge parenting correct; both 覆盖说明 deferrals verified against the sibling text. One seam: this journey declares 「显示名编辑(rename)腿本旅程不覆盖,家族未认领」 while multi-project-management's 覆盖说明 still points the rename leg here (「前者随 UF1 编辑模式/重指向腿衔接(feature-board-docs-browsing journey)」). The disclaimer is honest and the stale pointer lives in the sibling, but an auditor following the sibling's promise lands on a disclaimer — the seam contradiction is visible from this document's own coverage note. (−3)
**Risk level consistent with content (40/40)**: Medium is right (reversible add/repoint mutations, authorization, security guards; no removal/irreversible operations — those live in the High sibling).

### 7. Workflow Coverage — 138/150

**Golden Path existence — veto item (58/60)**: NOT triggered. Steps 1–5 form a contiguous domain-level sequence mapping Story 6 AC1+AC2 (and SC4+SC5) one-to-one; Step 1 now carries substantive assertion content (dual-feature board state), not bare navigation. −2: the qualifying spine itself remains unlabeled in-document (`golden_path: false`; feature-level designation lives in the session-loop journey).
**Multi-step coverage depth (44/50)**: Browse hierarchy, cross-entity (registration ↔ external docs ↔ equivalence), a full error→repoint→rescan recovery workflow, dual-state machine verification (completed + in-progress — iteration-1's gap fixed), and the 缺类禁用 matrix. Residual: the five-stage state machine is verified at 2 of 5 stages; intermediate statuses (prd/design/tasks) have no fixture feature, though Setup's generator model could carry a third sample cheaply. (−6)
**Workflow completeness against PRD scope (36/40)**: Story 6 AC1/AC2 covered; AC3 deferral verified; UF4 all four States rows covered. Residual: DF003 declares feature/文档 data freshness ≤5s, and the invariant 「feature 列表与状态机展示与 forge 数据一致」 implies a board whose SoT changes underneath — yet no edge in this journey (or any family journey: dual-form covers the task board only) exercises external feature-file change → board refresh; the phase-6 ledger itself records the UF4 board-refresh consumption as deferred. Rename (显示名编辑) is declared uncovered — auxiliary, no penalty per rubric, seam charged under Internal Consistency. (−4)

### Cross-dimension coherence check

The revision's gains are coherent and independently verifiable: annotation/disposition discipline drives Fact Alignment 70→131; fixture/channel/isolation closure drives Surface Fitness 90→136 and the Completeness derived-scenario recovery; the re-parented edges drive the Exclusivity and Consistency gains. No dimension contradicts another. No double-counting: the 另腿 claim pays a truth-weight charge (FA c1 −8) and a classification charge (FA c3 −3) per the rubric's own c1/c3 split (same pattern iteration 1 applied to the 3b clause); loading observability is charged once (Surface Fitness); the rename seam is charged once (Internal Consistency); the Step 4 subject gap is charged once (Completeness).

---

## Phase 3 — Blindspot Hunt ([blindspot] — outside all rubric dimensions)

1. **[blindspot] Feature-board freshness remains untested family-wide — and the project's own ledger admits it.** Quote: 「feature 列表与状态机展示与 forge 数据一致(forge manifest 词表透传;校验通道见 Setup)」. Every consistency assertion in this journey is read-time; no step or sibling journey (dual-form-consistency targets the 任务看板) tests what happens when forge feature files change externally mid-session (agent/terminal writes — the normal case for an in-progress feature). `tasks/records/6.summary.md` ledger item (1): "feature_updated -> UF4 board-refresh consumption polish (5.16 deferred; no 6.x task covered it — small)". The stale-status regression class this product family exists to prevent is exactly here, and no rubric dimension mandates mid-session freshness for a browse journey.

2. **[blindspot] Locale discipline is unpinned for a bilingual UI contract.** Quote: 「显示空(empty)态"无 feature"引导,不显示错误」. The PRD requires 工作台 UI 文案中英双语 (Other Notes · Compatibility), and the shipped e2e legs defend against it (`getByRole('tab', { name: /^feature$|^Features$/ })` — both locales). The journey never states which locale its legs assert, nor that guidance copy is locale-invariant; a downstream script-writer must guess and will flake on a locale-switching shell. No rubric dimension captures locale policy.

3. **[blindspot] Fixture dialect fidelity is unspecified where the e2e suite is strict.** Quote: 「另造与代码根目录分离的仓外 docs 树 fixture(同构五类文档)」. 「同构」 guarantees structure, not bytes. The real e2e fixture chain is dialect-exact by construction (6.1: "dialect-exact project writer … never invent what forge never wrote"), and the project's own vendor-closure lesson (memory: projection rules once missed runtime data → silent failures in fresh sessions) shows hand-rolled fixtures drift silently. A gen-test-scripts consumer provisioning 「同构」 trees by hand can produce files the indexer parses differently, breaking the normalized-equality 口径 for reasons unrelated to the behavior under test.

---

## Attacks Summary (for reviser — all second-order; no structural rework needed)

1. **[Fact Alignment]** Unanchored deferral — 「SC4 真实仓口径[dsh-forge-m1 completed]以本仓注册另腿验收」: no real-repo leg exists in the e2e suite, acceptance scripts, or the post-M2 ledger — name the holder (spec path / task / manual gate record) or mark the disposition as planned/UNKNOWN.
2. **[Fact Alignment]** Uncited design-layer specifics — 「缺类禁用不隐藏」「计数全满」/「(forge manifest 词表透传)」 are tech-design facts (Interface 1 注记, feature_snapshot counters) with no inline citation and tech-design missing from `sources:` — add pointers per the family convention the document itself uses elsewhere.
3. **[Completeness]** Step 4 registration subject under-provisioned — 「以仓外本地路径为文档位置注册该 forge 项目」 against a Setup that provisions docs trees but no second codeRoot project; duplicate registration of the active fixture would hit multi-project 2c. Provision the 仓外腿 subject project explicitly.
4. **[Surface Fitness]** Loading-edge observability — 「先行显示 loading 骨架」 has no slow-load/large-set provision; add one (or cite the wait discipline) so the transient is deterministically catchable.
5. **[Surface Fitness]** Accessibility principle absent — feature cards/doc tabs/back nav have no keyboard-reachability or readable-name assertion (sibling task-board carries a 可达性 invariant; surface-web principle 4).
6. **[Internal Consistency]** Rename seam — 「显示名编辑(rename)腿本旅程不覆盖,家族未认领」 contradicts multi-project-management's 覆盖说明 still pointing rename here; reconcile the two coverage notes (its pointer or your claim).
7. **[Workflow Coverage]** Feature-board freshness gap — invariant 「与 forge 数据一致」 never tested under external change; add an edge or an explicit family deferral note (ledger item 1 confirms the product-side deferral).
8. **[Semantic Purity]** Internal-vocabulary lead — 「已扫快照数据不被静默清空(feature 列表仍在)」: lead with the user-observable clause.
9. **[Fact Alignment]** 1c extension uncited — 「未就绪期间不显示错误态或空态」 goes beyond the cited UF4 loading row; annotate basis or trim.

---

## Pass/Fail

**PASS** — Total 1093/1150 ≥ 975; all dimensions above threshold (minimum: Fact Alignment 131/90, Surface Fitness 136/90). All nine iteration-1 attacks were verifiably resolved in the revised text (none claimed-but-unresolved); the residual findings are second-order citation/provisioning/seam issues listed above. The happy-path narrative and edge structure are sound; iteration 3, if run, should spend itself entirely on attacks 1–3 and 6–7.
