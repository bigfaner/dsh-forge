# Contract Evaluation Report — project-registration (Iteration 1)

- **Evaluator**: Scorer (adversarial, 3-phase protocol), persona: Senior QA Engineer
- **Date**: 2026-10-03
- **Surface type**: web (parameterized by `gen-journeys/rules/surface-web.md`)
- **Rubric**: `C:\Users\panda\.claude\plugins\cache\forge\forge\3.0.0\skills\eval\rubrics\contract.md` (1100 pts, target 935, per-dimension min thresholds)
- **Inputs scored**:
  - `testing/project-registration/contracts/step-1-open-add-project-modal.md`
  - `testing/project-registration/contracts/step-2-select-workspace-directory.md`
  - `testing/project-registration/contracts/step-3-review-register-form.md`
  - `testing/project-registration/contracts/step-4-confirm-registration.md`
  - `testing/project-registration/contracts/step-5-registration-success-mount.md`
- **Reference inputs**: `journey.md`, `design/page-map.md` (Web handbook), `.forge/fact-table.json`, `design/er-diagram.md`, `design/tech-design.md`
- **Iteration**: 1 (no previous report)

---

## Phase 1 — Reasoning Audit (pre-score anchors)

**1. Faithful decomposition of journey steps?** Yes, structurally sound. All 5 happy-path steps have contracts; all 6 journey edge cases (1b, 2b, 3b, 3c, 3d, 5b) are carried as traced Outcomes (`<!-- 溯源: journey Step Xb -->`). Three additional inferred Outcomes (listing-failure-retryable, external-forge-dir-derivation, double-confirm-reentry-blocked) add QA value beyond the journey. One structural wrinkle: **Step 2's `attach-existing-workspace` Outcome spans steps 2→5** (input: "选中该已注册目录，点「下一步」进入表单后「确认」"; output includes success feedback and left-rail mount), while Step 4's success Outcome explicitly scopes to the new-create branch ("目标工作区目录未注册（新建路径）"). Not contradictory — complementary — but per-step suite generation gets attach-branch confirm coverage only from the step-2 file (see D6 and blindspot 4).

**2. Outcomes mutually exclusive / executable?** Steps 1, 2, 4, 5 partition cleanly by flow phase and registry state. **Step 3 has two precondition overlaps** (success vs cancel-return; reselect vs external-forge-dir) — detailed under D3. Executability is otherwise good: each Outcome names concrete UI interactions and observable states. Two executability soft spots carried to blindspots: the double-confirm race (no deterministic seam named to hold the executing phase) and the zero-session rendering expectation in Step 5.

**3. Cross-contract state references?** All resolve: step-2 State "见 Step 3 断言" resolves to step-3's default-derivation assertions; step-5 precondition "衔接 Step 4 终态" matches step-4's executing terminal state; step-4's deferral comment "失败路径断言归 project-registration-compensation Journey" resolves to an existing journey **with contracts** (`testing/project-registration-compensation/contracts/step-1..5`). No dangling references.

**4. Journey invariants hold?** All four invariants (cancel points before dsh create / workspace FK on projects rows / live ledger read / hero retirement) are restated in every file and violated nowhere. Step-1/3 cancel Outcomes assert zero residue; step-2 attach and step-5 assert the FK. Clean.

**Pre-score anchors for channeling**: (a) fact-id traceability of the two `source: inferred` outcomes citing "AP-16" and "FACT_DEF_6"; (b) step-3 precondition distinguishability; (c) session-expired adjudication; (d) fixture entity types vs design domain model; (e) step-5 page anchor exactness.

---

## Phase 2 — Rubric Scoring

### D1. Completeness — **140/150**

- **Four mandatory dimensions per Outcome: 50/50.** All 12 Outcomes across 5 files carry non-empty Preconditions, Input, Output, State; Side-effect explicitly present in all ("Side-effect: \"none（仅目录列举读取与项目列表查询）\"" etc.). No missing mandatory dimension anywhere.
- **Journey Invariants section: 50/50.** Every file has `## Journey Invariants` with all 4 journey invariants verbatim.
- **Happy path + surface-mandated derived scenarios: 40/50 (-10).** Happy path ✓; `validation-error` is present and explicitly rule-tagged (step-3 `illegal-path-blocked`: "Web surface 必察项 validation-error 的实步承载"); all 6 journey edge cases ✓. However the second Web mandatory derived outcome, **`session-expired`, is absent with no consideration/N-A note in any contract body**. Mitigation credited: every frontmatter carries `requires_auth: false`, which is indirect evidence the auth dimension was inspected — but the rubric-mandated outcome family has no adjudication record, so a reader cannot distinguish "considered and excluded" from "missed".

### D2. Semantic Purity — **184/200**

- **Natural language, no regex/selectors/assertion calls: 80/80.** No regex patterns, CSS/XPath selectors, or framework assertion calls in any dimension value. Values describe what the system produces ("模态打开态（中区交互锁定于对话框自身）"), not how to verify.
- **Declarative preconditions: 56/60 (-4).** Preconditions are state descriptions throughout. One wart: step-3 `illegal-path-blocked` — "表单态下 forge 目录或知识库目录输入框可编辑，**用户即将输入非法路径**" — bakes user intent ("about to type") into a precondition; the executable content is only "input boxes editable". Intent is not a settable system state.
- **No implementation coupling: 50/60 (-10).** State values repeatedly reference the storage table and field identifiers: "projects 表零行" (step-1), "应用库写入 projects 行成功（携带既有 workspaceId 外键）" (step-2 attach), "projects 表零新增" (step-3 cancel). The journey invariant itself says "应用库 projects 记录必须携带 workspace 外键", so part of this vocabulary is inherited, and the app DB is the designated verification channel per the `state-verification` comments — hence a moderate, not severe, deduction. Prefer "应用库项目记录零行" style system-level phrasing.

### D3. Precondition Exclusivity — **110/150** (weakest dimension)

- **Distinct preconditions across Outcomes per Step: 30/60 (-30).**
  - Step 3, pair 1 (full overlap, -20): `success` — "第二段注册表单就位（工作区目录已选定并只读回填）" vs `cancel-return-clean-exit` — "流程处于第二段注册表单（表单可能已有部分输入）". Both describe the identical reachable state (form phase; workspace is always selected/backfilled on entry; "可能" is non-discriminating). Selection between them is possible only via the Input verb, violating the rubric's precondition-distinguishability requirement. Note the generator did it right in step-1 (hero/modal-closed vs modal-open) — the same phase-separation discipline is missing here.
  - Step 3, pair 2 (subset overlap, -10): `reselect-rederive-fields` — "部分字段已被手动修改或经「浏览…」选定过（存在被标记为已触碰的字段）" vs `external-forge-dir-derivation` — "forge 目录经手动输入或浏览改选为工作区外的合法绝对路径（字段已触碰）". The latter satisfies the former's precondition, so with a touched external forge dir both Outcomes match. Most-specific-wins resolves it pragmatically, hence partial deduction only.
- **Sufficient to uniquely select an Outcome: 40/50 (-10).** Same root cause: in step-3's form phase, fixture + current state do not uniquely determine the applicable Outcome for the success/cancel pair.
- **Error/boundary Outcomes state triggering conditions: 40/40.** All boundary Outcomes name their triggers explicitly: "目录不可读或列举通道返回异常" (listing-failure), "第二次触发落在执行态开始之后" (double-confirm), "canonical path 命中 dsh registry 既有工作区" (attach-existing), "输入非法路径（如相对路径片段或清空必填项）" (illegal-path).

### D4. Fact Alignment — **100/150**

- **Factual claims traceable to fact_id or marked UNKNOWN: 40/60 (-20).**
  - Step-2 `listing-failure-retryable` reasoning: "Fact Table（**AP-16**，apps/web/src/flows/add-project/DirectoryBrowser.tsx:173-192）". **`AP-16` does not exist in `.forge/fact-table.json`**, and no fact entry cites `DirectoryBrowser` at all (verified by grep). The claimed behavioral basis ("错误提示条与重试入口且导航状态保持") is therefore untraceable in the sanctioned table. -12.
  - Step-3 `external-forge-dir-derivation` reasoning: "Fact Table（**FACT_DEF_6** isForgeDirExternal…）". **`FACT_DEF_6` does not exist** in the fact table. The underlying content is recoverable under `FORM_DEFAULTS` ("仓内/仓外 = isForgeDirExternal(relative-position check)"), but the cited id is unresolvable. -8.
- **Inferred claims have required_outcomes rule support and source: inferred: 35/50 (-15).** All three inferred Outcomes carry `<!-- source: inferred -->` plus a reasoning basis — structurally correct. Quality varies: `double-confirm-reentry-blocked` cites `FLOW_PHASES` verbatim-accurately ("beginExecute 单次进入护栏") — exemplary. But `listing-failure-retryable` derives from no surface rule at all (the Web rule file's "network-error" additional-outcome guidance is the natural lineage and is not cited), and `external-forge-dir-derivation` is a domain boundary derivation whose cited basis is the unresolvable `FACT_DEF_6`.
- **No hallucinated unclassified claims: 25/40 (-15).** Three specific behavior assertions appear in dimension values with no journey trace, no fact_id, and no `source: inferred` annotation: (1) step-1 Output "「下一步」在未选中目录时不可用"; (2) step-2 Output "「下一步」在未选中任何目录时不可用**且有引导提示**"; (3) step-3 `cancel-return` Output "返回上一步时已填表单状态在浏览器⇄表单往返间保持" — the journey's Step 3b expected result says nothing about state preservation across back-navigation. These are plausibly code-true but are unclassified claims as written.

### D5. Surface Fitness (web-parameterized) — **90/100**

- **Mandatory derived Outcomes present: 30/40 (-10).** `validation-error`: present, well-formed (field-level correctable message, confirm gated, no submission — matching the surface rule's assert guidance). `session-expired`: **absent, no N/A adjudication note** (grep-verified zero occurrences). The surface rule says both "must be considered for every Web Journey"; the contracts record no consideration. `requires_auth: false` in frontmatter is credited as indirect evidence, capping the deduction.
- **Surface-appropriate language: 35/35.** Consistently Web-idiomatic: CTA, modal, breadcrumb, 只读回填, Esc/遮罩点击, 双击进入, loading/progress indication. Zero CLI/API/TUI language leakage, zero DOM-selector coupling.
- **TUI timeout criterion: 25/25.** N/A for web surface (non-TUI) — full marks per rubric.

### D6. Internal Consistency — **140/150**

- **Invariants hold in every Step Contract: 60/60.** No violations found. Cancels assert "dsh 侧与应用侧均无残留…projects 表零行"; attach branch preserves existing workspace and sessions ("既有工作区与其会话不受影响"); step-5 asserts FK and hero retirement consistent with `HERO_PHASE` semantics.
- **Cross-Contract state references consistent: 40/50 (-10).** All references resolve (see Phase 1 #3). Deduction is for the step-boundary ownership blur: the attach-branch registration (select → 确认 → execution → left-rail mount) lives entirely inside the step-2 contract, so the step-4 contract titled "点「确认」提交注册" covers only the new-create confirm path. A downstream generator emitting per-step suites will not know the attach-branch confirm exists unless it reads step-2. No contradiction — a coverage-routing hazard, hence -10, with the generator-level consequence spelled out in blindspot 4.
- **Preconditions consistent with preceding Steps' State changes: 40/40.** Verified chain: step-1 terminal (modal open, browser phase) → step-2 precondition; step-2 terminal (form defaults in place) → step-3; step-3 terminal ("「确认」在校验无问题时可用") → step-4 precondition ("第二段表单通过校验…「确认」可用"); step-4 terminal (执行进行中) → step-5 precondition ("注册执行四步链全部完成").

### D7. Anchor Integrity (handbook: `design/page-map.md`) — **90/100**

Handbook exists for web surface → dimension active. Page-anchor map built from handbook: `工作台 · 会话视图（默认态）` → route `workbench/session`; `工作台 · 知识库视图（浏览页签）` → `workbench/knowledge`; `添加项目（两段模态流程）` → `modal/add-project`.

- **Anchor field completeness: 40/40 (itemized).** All 5 contracts carry `anchors.web.page` (the required Web field), plus consistent extras (`route`, `requires_auth`, `layout`). Steps 1–4 → `添加项目（两段模态流程）`; step 5 → workbench session view. Journey-relevant handbook pages fully covered; `workbench/knowledge` correctly out of scope for this journey (owned by knowledge-browsing journey contracts). **Missing fields: none.**
- **Anchor values match handbook: 20/30 (itemized).**
  - Steps 1–4: page "添加项目（两段模态流程）" = handbook heading exactly ✓; route "modal/add-project" ✓; layout "覆盖中区的模态" ✓.
  - Step 5: route "workbench/session" ✓; layout "WorkbenchLayout（左 rail / 中会话面板 / 右 dock）" ✓; **page "工作台·会话视图（默认态）" ≠ handbook "工作台 · 会话视图（默认态）"** — missing the two spaces around the interpunct. The rubric requires exact match; a strict anchor resolver fails to locate the handbook entry. **1 mismatch × -10.**
- **Handbook internal consistency: 30/30.** Three distinct pages, unique view-state routes, no duplicate/conflicting definitions (the "same page, different routes" conflict class has zero instances). No handbook conflicts found. **Conflicts: none.**

### D8. Fixture Specification — **80/100**

**Veto check (entity completeness) — NOT triggered.** Adjudication: the veto fires when "any entity type referenced in the Contract's Preconditions, Input, or State changes is missing from `fixture_spec.entities`". Interpreting fixture_spec by its dimension title (前置数据声明 = prerequisite data declaration): every entity type required as *prerequisite* state is declared — `WorkspaceDirectory` per browser outcome, `Workspace` (canonical_path constrained) for attach-existing, `Project` min_count 1 for second-project, and the zero-project / registry-available states are declared via the `state_requirements` channel with `prerequisite_entity: "Project"` (step-1, step-4, step-5). Entities *created* by operations (projects row in step-2 attach's State "应用库写入 projects 行成功"; registry entry in step-4/5 side-effects) are post-state assertions, not fixtures — a strict-literal veto on created entities would contradict the dimension's purpose and was not applied. This adjudication is recorded for auditability.

- **Entity completeness (semantic verification vs Design domain model): 30/40 (-10).** Declared types checked against `er-diagram.md` / `tech-design.md` Data Models: `Project` ↔ PROJECTS ✓; `Workspace` ↔ dsh workspace registry entity (design-acknowledged external entity behind `workspace_id` UK) ✓. But **`WorkspaceDirectory` and `ForgeDirectory` are not entities in the design domain model** — the ER diagram models five tables (projects, knowledge_entries, knowledge_recall_logs, app_key_logs, schema_meta) plus the dsh-side workspace; `forge_dir` is a *column* of projects, and workspace directories are filesystem inputs, not modeled entities. These two fixture types are generator-level abstractions (pragmatically necessary for placing on-disk test data, and used consistently), but they fail the criterion's traceability-to-domain-model requirement. Partial credit 30/40; no veto.
- **Relationship and constraint coverage: 25/35 (-10).** Field constraints are good (registration_state, canonical_path, listable, forge_dir_default, archived=false). Two relationship issues: (1) step-5 `second-project-via-tree` declares the **unregistered candidate** `WorkspaceDirectory` as `belongs_to` / `parent_entity: "Project"` — the candidate belongs to no project yet; the genuinely existing relationship (existing Project ↔ its registered Workspace) is left undeclared. Wrong-relationship declaration, -10. (2) step-3 `external-forge-dir` declaring an *external* `ForgeDirectory` as `belongs_to WorkspaceDirectory` is semantically strained but structurally serves the derivation pairing — noted, no separate deduction (avoid nitpick stacking).
- **Minimum data quantity: 25/25.** `reselect-rederive-fields` needs two candidate directories → `min_count: 2` ✓ declared. Second-project needs ≥1 existing project → `min_count: 1` with archived=false ✓. All other outcomes ≥1 ✓. No under-declared min_count.

### Cross-dimension coherence check

- The `session-expired` gap is penalized in both D1.3 (-10) and D5.1 (-10). This is intentional, not double-counting error: the rubric encodes the same requirement in both dimensions ("required derived scenarios per surface type" / "mandatory derived Outcomes present"), and the coherence check confirms the two deductions share one root cause — a single reviser fix (N/A adjudication note or outcome) recovers both.
- D3's overlaps and D6's step-boundary blur both touch step-3/step-2 structure but are distinct failure classes (selection ambiguity vs coverage routing).
- D4's unresolvable-id findings and D8's non-domain entity types both reduce design/code traceability but via different artifacts (fact table vs ER model) — independent deductions, no overlap.

---

## Phase 3 — Blindspot Hunt (rubric-missed QA failure patterns)

1. **[blindspot] Race-condition outcome lacks a determinism seam (flaky test risk).** Step-4 `double-confirm-reentry-blocked` Input: "「确认」的快速连击或重复提交尝试（第二次触发落在执行态开始之后）" and Output asserts "进度呈现连续不被打断". Nothing specifies *how* a test holds the flow in the executing phase long enough to land a second click — the fact table's `E2E_INFRA` records "NO fault-injection facility in e2e yet". A naive fast-double-click is timing-dependent flake. The contract should name a deterministic mechanism (blocked/delayed RPC seam) for pinning the executing phase. 
2. **[blindspot] Zero-session rendering unspecified for a freshly registered project.** Step-5 Output: "左栏出现该项目及其 dsh 会话列表（实时读 dsh 账本，零副本）". A brand-new workspace has zero dsh sessions; `SESSION_LIST_FACE` defines a zero-session placeholder「暂无会话」. The contract never says whether to assert the session-list container, the placeholder, or both — the generator must guess. Specify the expected empty-session presentation.
3. **[blindspot] Validation copy asserted "类文案"-style (hedged), not pinned.** Step-3 `illegal-path-blocked` Output: "字段级可修正提示呈现（如「需为绝对路径」「不能为空」**类文案**）". "Copy like this" is underdetermined for text-level assertion; `FORM_VALIDATION` defines the exact issue strings. The contract should cite the exact known copy (still natural-language, fact-traceable) instead of a hedge, and enumerate the concrete invalid-input boundary values (which field, which value) rather than "如相对路径片段".
4. **[blindspot] Attach-branch confirm coverage silently routed through another step's suite.** Step-2 `attach-existing-workspace` Input "选中该已注册目录，点「下一步」进入表单后「确认」" while step-4's success Outcome preconditions "目标工作区目录未注册（新建路径）". If a generator or CI filter selects suites per step (e.g., re-run step-4 only after a regression), the attach-branch confirm path has no step-4 presence and its coverage silently depends on step-2's suite. Add an explicit scoping cross-reference in step-4 pointing to where the attach-branch confirm is contracted.
5. **[blindspot] Auth-expiry adjudication is implicit only.** `requires_auth: false` in frontmatter is the only artifact recording that auth was considered; no contract body notes that `session-expired` is structurally inapplicable for this auth-less local surface. Future surface audits (and the next eval iteration) cannot distinguish deliberation from omission. One N/A line in any contract (or the journey testing notes) fixes this.

---

## Final Summary

| Dimension | Score | Min | Status |
|---|---|---|---|
| 1. Completeness | 140/150 | 90 | PASS |
| 2. Semantic Purity | 184/200 | 120 | PASS |
| 3. Precondition Exclusivity | 110/150 | 90 | PASS |
| 4. Fact Alignment | 100/150 | 90 | PASS |
| 5. Surface Fitness | 90/100 | 60 | PASS |
| 6. Internal Consistency | 140/150 | 90 | PASS |
| 7. Anchor Integrity | 90/100 | 60 | PASS |
| 8. Fixture Specification | 80/100 | 60 | PASS (veto not triggered) |
| **Total** | **934/1100** | **935** | **FAIL (by 1 pt)** |

**Verdict: 934/1100 — below the 935 pass line; all dimensions above their min thresholds.** The contract set is structurally strong (complete six-dimension Outcomes, invariants held, cross-references resolved, good web idiom, thoughtful inferred boundary outcomes). The shortfall is concentrated in (a) broken fact-id traceability on two inferred outcomes (`AP-16`, `FACT_DEF_6` — both absent from `.forge/fact-table.json`), (b) step-3 precondition overlaps, (c) the unadjudicated `session-expired` web-mandatory outcome, (d) one anchor value mismatch, and (e) fixture entity/relationship semantics vs the design domain model. Every fix is cheap and local; the reviser has ample legitimate headroom to clear 935 next iteration.

**Cheapest high-yield fixes for the reviser (priority order):**
1. Replace `AP-16` / `FACT_DEF_6` citations with real fact ids (`FORM_DEFAULTS`; add or cite a DirectoryBrowser listing-failure fact, or mark the copy claim UNKNOWN) — up to +20 (D4).
2. Add discriminating state markers in step-3 (success vs cancel; reselect vs external) — up to +40 (D3).
3. Add one `session-expired` N/A adjudication note (auth-less surface) — +20 (D1 + D5).
4. Fix step-5 page anchor to "工作台 · 会话视图（默认态）" (spaces) — +10 (D7).
5. Correct step-5 fixture relationship (candidate dir belongs_to no project) and align/map `WorkspaceDirectory`/`ForgeDirectory` to design entities or annotate their fixture-abstraction status — up to +20 (D8).
6. Cite facts for the three unclassified UI assertions (next-button gating, guidance hint, back-nav state preservation) — up to +15 (D4).
