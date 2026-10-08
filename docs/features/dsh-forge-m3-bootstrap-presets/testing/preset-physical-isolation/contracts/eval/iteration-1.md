# Contract Evaluation Report — preset-physical-isolation (iteration 1)

- **Evaluator**: Scorer (adversarial), Senior QA Engineer persona
- **Date**: 2026-10-08
- **DOC_DIR**: `docs/features/dsh-forge-m3-bootstrap-presets/testing/preset-physical-isolation/contracts/` (3 files: step-1, step-2, step-3)
- **Surface**: web | **Iteration**: 1 (no previous contract report)
- **Total**: **1010 / 1100** (target 935 — PASS on total; all dimensions above min threshold)

| Dimension | Score | Min | Verdict |
|---|---|---|---|
| 1. Completeness | 150/150 | 90 | PASS |
| 2. Semantic Purity | 188/200 | 120 | PASS |
| 3. Precondition Exclusivity | 147/150 | 90 | PASS |
| 4. Fact Alignment | 117/150 | 90 | PASS (weakest dimension) |
| 5. Surface Fitness | 92/100 | 60 | PASS |
| 6. Internal Consistency | 138/150 | 90 | PASS |
| 7. Anchor Integrity | 80/100 | 60 | PASS |
| 8. Fixture Specification | 98/100 | 60 | PASS (no veto) |

## Verification evidence gathered (codebase reality-check)

- `packages/plugin-forge-spec/skills/` = **8 dirs**: breakdown-tasks, **eval**, gen-contracts, gen-journeys, gen-test-scripts, tech-design, ui-design, write-prd. Fact `M3_PLUGIN_FORGE_SPEC_SKILLS` and PRD In Scope ① (prd-spec.md L50, "…breakdown-tasks / **eval** 幸存者") both list 8.
- `apps/host/src/profile/presets/expedition.patch.yml:45` = `sampleOverCapGlobResults: false` (blitz:39 same). The contract's key name matches code; the journey's `sampleOverCapResults` (journey L62) is the stale proposal-era name.
- `tasks/records/3.9-spike-residuals-verification.md` Test Results: "N（packaged-js 负对照——**!!js 全形态死刑确认**）" → 3b's broken claim is empirically grounded. **But** Key Decisions: "AGENTS.md/技能目录承载 = **上下文注入事件（agent-instructions/skill-catalog），非 system 提示词**" → contradicts the contract's carrier description (see 4.3).
- `expedition.patch.yml` header: mirror form = "上游 dsh-web-app standard.patch.yml 全量镜像（行块逐字…）**+ 产品分叉四处**：persona prefix…/ name·description·order / skill-filesystem 行 customSkillDirs…/ 尾部…增量行" → whole-product verbatim identity with upstream is false by design (see 6.2).
- Anchor convention calibration (sibling contracts): page-face steps set `page:` to the exact handbook entry (mode-selection-alignment steps 1/2/3 = "hero 预设座位"; proposal-review steps = "概览 · 提案子 tab" etc.); transcript/contract-face steps leave `page: ""` (blitz-direct-chain step-5, gate-and-submit steps). Sibling `blitz-direct-chain/step-5` embeds a fact id inline ("M3_PRESET_BLITZ_SKILL_DIRS") — inline fact referencing is an established convention these three files do not use.
- Handbook `design/page-map.md` exists with a "hero 预设座位" page entry ("菜单列双预设中文直出 order 1/2") — the exact face steps 2b/3b assert on.

## Phase 1 — Reasoning audit (pre-score anchors)

- Journey→outcome mapping is complete and faithful: 1→success, 1b→expedition-catalog-contrast, 2→success, 2b→mirror-config-missing-broken, 3→success, 3b→js-expression-broken. No journey step dropped, no outcome invented beyond the journey.
- Web required-outcome adjudication present in every file as an HTML comment; validation-error localized into 2b/3b with `source: inferred` + reasoning; session-expired N/A'd with cross-journey delegation. Structurally sound.
- Independent judgment: the contracts operationalize the journey well, but carry forward three factual defects from the journey (spec-set undercount, stale carrier description, stale config key) and add one own-goal (unscoped State identity claim, empty hero anchors despite hero-menu outcomes).

## Phase 2 — Dimension scoring

### 1. Completeness — 150/150

- All 7 outcomes across 3 files have non-empty Preconditions/Input/Output/State; Side-effect explicitly declared everywhere ("none" where applicable); Invariants optional dimension present on success outcomes. 50/50.
- `## Journey Invariants` present with ≥1 entry in every file (all four journey invariants carried). 50/50.
- Happy path + all journey edge cases + web mandatory derived outcomes (validation-error materialized as 2b/3b; session-expired adjudicated N/A). 50/50.

### 2. Semantic Purity — 188/200

- **2.1 Natural language (78/80)**. No regex, selectors, XPath, or framework assertion calls. Minor: Output anchors to one concrete internal config key — "如 tool-fs-search 的 sampleOverCapGlobResults 键在场" (step-2) — a data-form token acceptable for a contract-face pin test, but it is the strongest implementation coupling present in a dimension value (-2).
- **2.2 Declarative preconditions (56/60)**. All preconditions are state descriptions. One within-outcome ambiguity: step-1 success Preconditions say "突击会话已创建（组合 = 突击预设…）" while its Input says "单人开发者**创建**突击会话并转录其技能目录" — creation is both a precondition and part of the action, leaving the action/state boundary ambiguous for a downstream executor; the sibling outcome (expedition-catalog-contrast) does not repeat creation in Input, so the two outcomes in the same file are styled inconsistently (-4).
- **2.3 No implementation coupling (54/60)**. File-level references (`standard.patch.yml`, boot overlay, YAML introspection) are the journey-mandated observation channel for the 契约面 steps — inherent to the subject matter, not gratuitous coupling; residual coupling noted above (-6 recognized as topic-inherent, mirrored from the journey eval's 42/60 on the analogous criterion).

### 3. Precondition Exclusivity — 147/150

- **3.1 Distinct (60/60)**. blitz vs expedition composition; healthy drafts vs corrupted draft; healthy vs `!!js` form — no two outcomes in any step share equivalent preconditions.
- **3.2 Sufficient to uniquely select (47/50)**. Step-2 success ("双预设已物化") vs broken (draft incomplete) is exclusive only via the inference that a corrupted draft cannot materialize a healthy preset row — draft health is never stated positively in the success precondition (-3). Step-1 and step-3 pairs are airtight.
- **3.3 Triggers explicit (40/40)**. Both boundary outcomes name their fault form precisely ("缺失某必填 config 的不完整态", "误用 !!js 表达式的形态（非物化路径）").

### 4. Fact Alignment — 117/150 (weakest dimension)

- **4.1 Factual claims traceable / UNKNOWN (39/60)** — three findings:
  1. **Spec-skill set undercounted (-12)**. Step-1 Output: "目录不含规格技能全集——write-prd / ui-design / tech-design / gen-journeys / gen-contracts / gen-test-scripts / breakdown-tasks **七者零在场**" and contrast outcome "规格技能全集**七者**可见". The claim asserts a *complete set* of seven, but the fact table (`M3_PLUGIN_FORGE_SPEC_SKILLS`), PRD In Scope ①, and `packages/plugin-forge-spec/skills/` all say **eight** — `eval` is omitted. Consequence: a test generated from this contract would not catch `eval` leaking into the blitz composition (absence side) nor `eval` missing from expedition (presence side). This is a real test gap on the journey's core invariant, not a stylistic nit.
  2. **Positive control subset (-3)**. "核心包技能行可见（run-tests / brainstorm / run-tasks / submit-task）" — 4 of the 5 core skills; `quick-tasks` omitted even though the journey's own cited authority ("In Scope ① 清单为准") and `M3_PLUGIN_FORGE_SKILLS` include it. Subset assertion is not false, but the enumerated "positive control" is undercomplete relative to its declared source.
  3. **No fact-id traceability markers (-6)**. No fact_id reference or UNKNOWN marking appears anywhere in the three files, although claims are fact-table-verifiable in content and the sibling convention (inline "M3_PRESET_BLITZ_SKILL_DIRS" in blitz-direct-chain step-5 field_constraints) demonstrates the mechanism. Content is mostly verifiable, hence only a process-level deduction.
- **4.2 Inferred claims annotated (50/50)**. Both derived boundary outcomes carry `<!-- source: inferred -->` plus a reasoning block citing the surface-web validation-error localization, the journey's Setup injection regimen, and the 3.9 record. Exemplary annotation.
- **4.3 No unclassified claims (28/40)** — two findings:
  1. **Unannotated journey↔contract value divergence (-6)**. Journey says "tool-fs-search 的 **sampleOverCapResults**" (L62); contract says "**sampleOverCapGlobResults** 键在场". The contract matches the actual code (expedition.patch.yml:45) — i.e., it silently corrected a stale journey value with no fact citation or note explaining the divergence. Right value, wrong provenance discipline: to a reviewer diffing journey vs contract this reads as a possible typo.
  2. **Carrier description contradicts the freshest source record (-6)**. Step-1 Input/Preconditions: "转录其技能目录（**会话系统提示**中的技能目录清单）" / "会话技能目录经**会话系统提示投影**可转录". The 3.9 record (in the journey's own sources list) states: "AGENTS.md/技能目录承载 = **上下文注入事件（agent-instructions/skill-catalog），非 system 提示词**". The transcription-by-model channel still works either way, but a downstream test that greps the system prompt for the catalog (as the contract's words direct) would false-fail. Not marked UNKNOWN, not fact-cited.

### 5. Surface Fitness — 92/100

- **5.1 Mandatory derived outcomes (38/40)**. validation-error localized into config-assembly domain with `source: inferred`; session-expired adjudicated N/A with reasoning and explicit cross-journey delegation (mode-selection-alignment Step 3c). Adaptation is documented and semantically faithful to "invalid data → rejected, not silent". Minor: the localized form lives in only two of three files with step-1 carrying a pointer comment — acceptable, but the pointer comment (not a dimension value) is the only linkage (-2).
- **5.2 Surface-appropriate language (29/35)**. Web-face bits use page/menu language ("查看 hero 预设菜单", "该预设不出现在预设菜单枚举面"); contract-face bits (机械 diff, YAML 内省) match the journey's declared 契约面 channel. Deduction: "拒绝形态**显式可见**，无静默降级" (step-2b Output) and "装配校验拒绝原因**可查（契约面）**" (State) assert visibility/queryability without naming any concrete positive observable — the spike S5 record documents the actual diagnostic face ("设置 → Agent 预设 roster 显示「加载失败」"), which neither journey nor contract cites. As written, the "not silent" half of the assertion has no specified observation channel and risks being tested as a vacuous truth behind the menu-absence check (-6).
- **5.3 TUI timeout (25/25)**. N/A for web surface — full marks.

### 6. Internal Consistency — 138/150

- **6.1 Invariants hold (60/60)**. All four journey invariants repeated and honored in every file; no contract outcome contradicts any invariant (physical absence asserted via enumeration; mirror drift via diff; `!!js` death via 3b).
- **6.2 Cross-references consistent (40/50)**. PresetRow/PresetDraft/Session usage is coherent across files. **One real contradiction inside step-2 success**: Output correctly scopes the identity claim to the mirror rows ("将两预设的 **standard 基础行** 与上游…机械 diff" → "一致（**镜像行契约**）"), but State overclaims: "**物化产物与上游基线逐字一致**" — unscoped whole-product verbatim identity, which is false by design per the draft header's documented "产品分叉四处" (persona prefix / name·description·order / customSkillDirs / tail increment rows). A test-script generator keying on the State sentence would diff the entire row and fail on the product forks (-10).
- **6.3 Preconditions achievable from preceding states (38/50→38/40)**. Step chains are Setup-derived and achievable; 2b/3b preconditions reachable via the declared injection regimen. Minor: the step-1 creation-in-precondition AND creation-in-input overlap (see 2.2) blurs the state/action boundary (-2).

### 7. Anchor Integrity — 80/100

Handbook `design/page-map.md` exists (web) → dimension active.

- **7.1 Anchor field completeness (20/40)**. All three files carry `page: ""`. For step-1 (pure 会话投影面 transcript observation) the empty anchor matches the established sibling convention (blitz-direct-chain step-5 et al.) — no deduction. **But steps 2 and 3 each contain a page-face outcome** — "以该底稿物化装配并启动应用，**查看 hero 预设菜单**" (2b Input), "该预设不出现在**预设菜单枚举面**" (2b/3b State) — and the handbook defines the exact page ("hero 预设座位…菜单列双预设中文直出 order 1/2") that sibling mode-selection-alignment anchors as `page: "hero 预设座位"`. Empty anchor on a contract asserting hero-menu behavior = missing anchor value: -10 × 2.
- **7.2 Values match handbook (30/30)**. No non-empty anchor value mismatches any handbook entry.
- **7.3 Handbook internal consistency (30/30)**. No duplicate routes/pages or conflicting definitions in page-map.md (M3 explicitly route-free; "Route Guard Configuration 不适用").

### 8. Fixture Specification — 98/100 (veto not triggered)

- **8.1 Entity completeness (40/40)**. Every entity operated on is declared: Session (step-1 ×2), UpstreamCheckout + PresetRow (step-2 success), PresetDraft (2b/3b), PresetRow (step-3). Composition modeled as Session field constraint is legitimate normalization; ambient product artifacts (core/spec plugin dirs, healthy co-presets materialized every boot) need no fixture declaration. Entity types semantically match the design vocabulary (底稿/预设行/会话).
- **8.2 Relationships and constraints (33/35)**. Single-entity contracts — no parent-child declarations required; constraints capture version pinning ("与被测安装同版本——dsh 0.x-rc next 线精确锁定"), materialization state, and composition. Gap: 2b/3b PresetDraft constraints describe the fault form but not **which preset's** draft ("mirror_row_config: 缺失某必填 config" — expedition or blitz?) — the menu-absence assertion needs to know which menu entry to expect missing; min_count 1 with no identity constraint leaves the target ambiguous (-2).
- **8.3 min_count sufficiency (25/25)**. PresetRow min 2 matches the dual-preset diff/introspection scenarios; Session min 1, UpstreamCheckout min 1, PresetDraft min 1 all feasible. Healthy-preset contrast for 2b/3b is ambient (renderBootOverlay materializes all drafts every boot), so no extra count needed.

## Phase 3 — Blindspot hunt `[blindspot]`

1. **[blindspot] Fault-injection realization mechanism is unspecified at the contract level.** 2b/3b Preconditions: "预设底稿的 standard 镜像行处于缺失某必填 config 的不完整态（**Setup 故障注入规程造成**——底稿为唯一持久故障源）". The journey's Setup reasons *why* the draft is the only persistent fault source but names no *mechanism* for how a test corrupts a product-owned draft — in packaged form these ship inside app resources (`apps/host/src/profile/presets/*.patch.yml` → resources), and the e2e infra fact notes "NO fault-injection facility in e2e" with `DSH_FORGE_PATCH_FILES` as the nearest override seam. `fixture_spec` declares the corrupted state but not the realization channel (dev-source edit vs packaged override vs env patch-files). Downstream gen-test-scripts may be unable to reach the precondition without inventing a seam. Outside all rubric dimensions (Fixture checks entities/counts, not realization channels).
2. **[blindspot] Hero-seat enabling switch is an undeclared environmental precondition.** Step-1 Preconditions: "突击会话已创建（组合 = 突击预设…）" — creating a blitz session via UI presumes the hero preset seat is visible, which fact `M3_HERO_SWITCH_FIRST_BOOT` gates on a ui-settings switch ("first-boot preset enabled=true one-time… hero seat visibility is gated by this switch"). Fresh isolated user-data gets it via first-boot preposition, but any test reusing user-data (or running after the switch was touched) silently loses the creation path. No fixture entity or precondition declares this switch state.

## Summary of required revisions (priority order)

1. **Step-1**: correct the spec-skill set to eight (add `eval`) in both the absence assertion and the expedition contrast; add `quick-tasks` to the positive control (or cite why the 4-skill subset suffices).
2. **Step-2 success State**: scope the identity claim — "镜像行与上游基线逐字一致" instead of "物化产物与上游基线逐字一致" (four documented product forks make the whole-product claim false).
3. **Steps 2/3**: set `anchors.web.page: "hero 预设座位"` (handbook entry) since 2b/3b assert hero-menu behavior.
4. **Step-1**: update the catalog carrier description to the 3.9 finding (context-injection events agent-instructions/skill-catalog, not system prompt), or mark the carrier claim UNKNOWN.
5. **Step-2b/3b**: name the concrete diagnostic observable for "拒绝形态显式可见" (设置 → Agent 预设 roster「加载失败」 per spike S5) and add preset-identity field constraint to PresetDraft.
6. Annotate the `sampleOverCapGlobResults` correction with its fact/source basis so the journey↔contract divergence is explainable; adopt inline fact-id references per sibling convention.
