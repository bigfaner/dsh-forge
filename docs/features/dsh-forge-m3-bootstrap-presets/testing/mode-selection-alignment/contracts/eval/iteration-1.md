# Contract Evaluation Report — mode-selection-alignment (Iteration 1)

- **Scorer**: Senior QA Engineer (adversarial)
- **Date**: 2026-10-08
- **DOC_DIR**: `docs/features/dsh-forge-m3-bootstrap-presets/testing/mode-selection-alignment/contracts/` (5 files, step-1 … step-5)
- **Surface**: web · **Handbook**: `design/page-map.md` (exists) · **Fact table**: `.forge/fact-table.json` (139 entries)
- **Iteration**: 1 (no previous report)

## Verdict

**972 / 1100 — PASS** (gate 935; all dimensions above min threshold). One material defect (step-5 success fixture direction) must be fixed before test-script generation; the rest are traceability and fixture-precision gaps.

| Dimension | Score | Min |
|---|---|---|
| 1. Completeness | 150/150 | 90 |
| 2. Semantic Purity | 185/200 | 120 |
| 3. Precondition Exclusivity | 125/150 | 90 |
| 4. Fact Alignment | 130/150 | 90 |
| 5. Surface Fitness | 100/100 | 60 |
| 6. Internal Consistency | 110/150 | 90 |
| 7. Anchor Integrity | 100/100 | 60 |
| 8. Fixture Specification | 72/100 | 60 |
| **Total** | **972/1100** | **935** |

## Phase 1 — Reasoning Audit (pre-score anchors)

1. Journey has 11 steps (5 happy + 6 edge: 1b/1c/2b/2c/3b/3c/4b/5b — 8 edge). Contracts map: step-1 → success/hero-switch-off/settings-toggle-roundtrip (1, 1b, 1c); step-2 → success/idempotent-default-select/restart-mid-state (2, 2b, 2c); step-3 → success/post-lock-no-switch/restart-restore-existing (3, 3b, 3c); step-4 → success/no-mode-source-keeps-default (4, 4b); step-5 → success/honest-accounting-mismatch (5, 5b). All 11 journey steps have carrying Outcomes. No orphan outcomes.
2. Independent code verification performed (beyond the fact table): `apps/host/src/profile/presets/cordis.patch.yml` is only the `agent-preset-registry` row (default: expedition), **not** a third selectable preset — so the contract's "双预设 / 双入口" menu claim is factually sound despite M3_PRESET_BASE_DRAFTS saying three rows are materialized. `expedition.patch.yml` (name=远征模式, order=1, customSkillDirs incl. spec skills) and `blitz.patch.yml` (name=突击模式, order=2, customSkillDirs = plugin-forge-skills only) confirm order/name/skill-dir claims. `apps/host/src/profile/presets.ts:5-6` and `materialize.test.ts:3` confirm the ui-settings first-boot one-time ownership lifecycle.
3. **Primary defect found**: step-5 success Outcome declares the wrong session composition for the journey's Step 5 main scenario (see Internal Consistency / Fixture Specification below).

## Phase 2 — Dimension Scoring

### 1. Completeness — 150/150

- **Four mandatory dimensions (50/50)**: every Outcome in all 5 files has non-empty Preconditions, Input, Output, State. Side-effect present everywhere (explicit "none" or described). Invariants present on selected outcomes.
- **Journey Invariants section (50/50)**: `## Journey Invariants` present in all 5 files, 5 entries each.
- **Happy path + surface-mandated derived scenarios (50/50)**: every file carries an explicit web-surface-required adjudication comment (e.g. step-3: `validation-error = 旅程裁决近似物承载 Outcome "post-lock-no-switch"…; session-expired = …承载 Outcome "restart-restore-existing"`). The localized session-expired carriers exist as real Outcomes (step-2 `restart-mid-state`, step-3 `restart-restore-existing`); the validation-error state-machine analog exists (step-3 `post-lock-no-switch`).

### 2. Semantic Purity — 185/200

- **Natural language, no code/regex (80/80)**: no regex, CSS/XPath selectors, or framework assertion calls in any dimension value.
- **Declarative preconditions (55/60)**: step-1 `settings-toggle-roundtrip` embeds an imminent action into a precondition — `"用户即将经设置对话框翻转开关（保存动作在场——开关翻转场景）"` — a scenario marker, not a system state. Deducted 5.
- **No implementation coupling (50/60)**: internal platform API names appear in State fields: step-2 `"会话 agentPreset = blitz（blank 期 select 写入会话）"`, step-4 `"agentPreset.select 以提案 mode（blitz）写入会话"` / `"agentPreset.select 不调用（mode 缺席不切换…）"`; plus step-1 fixture constraint value `"expedition 与 blitz（boot overlay 每启注行物化）"` naming the injection mechanism. These mirror design-doc vocabulary but are internal call/mechanism names in behavior dimensions. Deducted 10.

### 3. Precondition Exclusivity — 125/150

- **Distinctness (50/60)**: two overlapping pairs.
  - step-1: `success` ("应用首启完成（ui-settings 行 enabled: true…）") vs `settings-toggle-roundtrip` ("首启预置已完成（开关 = 开启…）") share the switch-on base state; the only differentiator is the action marker "用户即将…翻转开关". Not identical, but overlapping. −10.
  - step-5: `success` ("hero 自由创建（无提案上下文）的远征会话在场；一个远征 feature 在场") vs `honest-accounting-mismatch` ("hero 自由远征会话在场；带直挂任务的 blitz 提案在场") share the session clause; the Setup world contains both the feature and the blitz proposal, so both preconditions hold simultaneously. −10 from criterion 2 (below), counted once here as overlap.
- **Unique selection (35/50)**: both pairs above require the Input to disambiguate; precondition-only selection is ambiguous. −15.
- **Explicit triggering conditions (40/40)**: all boundary outcomes state triggers precisely — row absent/off (1b), NULL mode (4b), past-first-turn with restart explicitly excluded ("连续运行态，未经历重启场景", 3b), restart (2c/3c), idempotent target ("本次点选目标 = 远征", 2b).

### 4. Fact Alignment — 130/150

- **Factual claims traceable (45/60)**: substantive alignment is excellent — every checkable claim matches code/facts verified this session (registry default=expedition, order 1/2 + Chinese display names, blitz lacks spec skill dirs, legacy proposals mode NULL, task mode snapshot non-retroactive, ui-settings first-boot one-time). **However, not a single fact_id citation exists in any of the 5 files**; grounding is via SC1/SC3/AC4/UF-1 document anchors and the journey source only. The rubric requires factual claims to be traceable to a `fact_id` or marked UNKNOWN. Formal traceability gap → −15. No substantive misalignment found (verified: cordis is the registry row, not a third menu preset).
- **Inferred claims annotated (42/50)**: step-2 `idempotent-default-select`/`restart-mid-state`, step-3 `post-lock-no-switch`/`restart-restore-existing`, step-4 `no-mode-source-keeps-default`, step-5 `honest-accounting-mismatch` all carry `<!-- source: inferred -->` + reasoning, and the surface-rule-derived ones cite the rule (e.g. "surface-web session-expired 规则本地化映射"). But step-1 `hero-switch-off` drops the inferred marker its journey source carries (journey Step 1b: "［source: inferred——开关只控 hero 座位可见性…］") while asserting the same inferred clause ("既有会话的组合不受开关影响"). −8.
- **No hallucinated claims (40/40)**: zero unclassified claims; nothing contradicts the fact table, page-map, or code.

### 5. Surface Fitness — 100/100

- **Mandatory derived outcomes (40/40)**: validation-error + session-expired adjudicated in all 5 files with reasoned N/A/carrier dispositions; carriers are real Outcomes.
- **Surface-appropriate language (35/35)**: user-centric web vocabulary throughout (座位标签、菜单点选、mode chip、设置对话框保存反馈、阳性对照). No DOM selectors or non-web language.
- **TUI timeout criterion (25/25)**: non-TUI surface — full marks.

### 6. Internal Consistency — 110/150

- **Invariants hold (55/60)**: no Outcome violates the five journey invariants. Small deduction for an internal side-effect tension inside step-2: `success` declares `"Side-effect: none（会话内预设选择，无库写入）"` while `restart-mid-state` in the same file asserts the selection survives restart (`"点选不因重启丢失"`) — durability implies a persisted platform write; "none" is only defensible under the "no forge-DB write" reading the parenthesis supplies. −5.
- **Cross-contract references (30/50)**: **material defect**. The journey's Step 5 main scenario is explicitly the Step-2/3 chain: precondition "Step 2/3 的突击会话在场（已确立突击组合）" + "一个远征 feature 在场", i.e. **blitz session opens expedition feature**. step-3's State duly sets "组合锁定为 blitz". But step-5 `success` declares: `"hero 自由创建（无提案上下文）的远征会话在场；一个远征 feature 在场（Setup——供 Step 5 错配守卫场景的镜像主场景：突击会话打开远征 feature）"` — it swaps in Step 5b's session (hero expedition session) while its own parenthetical names the real main scenario ("突击会话打开远征 feature") as the "mirror". The cross-step state chain (Step 2 select → Step 3 lock → Step 5 use) is broken at the last link. −20.
- **Preconditions ↔ preceding State / Output achievability (25/40)**: with the declared fixture (expedition session + expedition feature — features are inherently expedition per page-map "feature 列表 = 远征内容"), **there is no mode mismatch**, so the asserted Output `"mode chip 对照（会话组合 vs 所打开内容的模式）+ 派发入口提示"` cannot occur; the Input's own phrase "在该异模式会话中…打开异模式内容" is false under the declared fixture. A downstream test generated from this contract either fails or vacuously passes. −15.

### 7. Anchor Integrity — 100/100

- Handbook `design/page-map.md` exists. All 5 contracts carry `anchors.web.page` matching handbook Page Overview entries exactly: "hero 预设座位" (steps 1–3), "概览 · 提案子 tab" (step 4), "概览 · feature 子 tab" (step 5). No missing `page` field; empty `route` is consistent with the handbook's "无新路由 / Route Guard 不适用". No duplicate or conflicting handbook pages. Anchor field completeness 40/40, value match 30/30, handbook consistency 30/30.
- Note (no deduction): step-5's action also traverses the 任务子 tab ("派发" entry); the layout field records it ("任务子 tab 派发入口对照面") while `page` pins the primary surface — acceptable single-anchor practice.

### 8. Fixture Specification — 72/100

- **Entity completeness (28/40)** — veto considered, NOT triggered (primary entities are declared in every file; ambient auto-materialized state omitted rather than operated-on entities missing). Real gaps: step-2 `success` Preconditions explicitly reference `"hero 开关开启、预设座位在场"` yet `fixture_spec.entities` = [Session] only — UiSettingsRow (and PresetRow, needed for the menu to list both entries) absent. step-3 `success`/`post-lock-no-switch` observe the seat's presence/卸载 without pinning UiSettingsRow.enabled=true — for the 3b negative test the seat's absence is confounded (switch-off vs lock-unload indistinguishable). In practice the first-boot preset defaults the switch on, which is why this is a deduction, not a veto. −12.
- **Relationship/constraint coverage (22/35)**: step-5 `success` composition constraint is wrong for the scenario (expedition session + expedition feature cannot trigger the mismatch guard asserted in Output) — the fixture fails the scenario it exists to create. −10. step-1 `success` uses a malformed constraint: `field: "ids"` with value `"expedition 与 blitz（boot overlay 每启注行物化）"` — a single pseudo-field holding both rows' values instead of per-row id constraints. −3. (step-5 `honest-accounting-mismatch` relationship declaration — Task belongs_to Proposal with mode snapshot — is correct and well-formed.)
- **Minimum data quantity (22/25)**: PresetRow min_count 2 correctly supports the two-entry menu; Session/Proposal/Feature/Task min_counts adequate. Minor: `hero-switch-off` encodes an OR into a constraint value (`"false（或缺席——开关门控关闭态）"`), weakening fixture determinism; restart outcomes rely on the Session fixture surviving an app restart without stating persistence semantics. −3.

## Phase 3 — Blindspot Hunt (`[blindspot]`, outside rubric dimensions)

1. **[blindspot] Observation-channel annotations were dropped in the contracts, leaving projection-face assertions without any executable locus.** The journey promises "每步「观察通道」行显式标注断言落点" and marks e.g. Step 2 as "web 面（座位标签）+ 会话投影面（工具面/技能目录投影）". The contracts absorbed the wording into Output — step-2: `"会话工具面/技能目录与突击组合一致（技能清单不含规格技能全集——SC1 投影断言口径）"` — but carry no observation-channel field, probe name, or page element for the projection half. A web test generator receiving this contract has no DOM/probe surface to assert against; the risk is a silently skipped or invented assertion. Recommend carrying 观察通道 into the contract (per Outcome) or citing the probe channel used by acceptance tooling.
2. **[blindspot] The "row absent" branch of hero-switch-off is unrealizable alongside its own对照 fixture.** Preconditions: `"ui-settings 行缺席或被用户运行时关闭；一个既有已确立模式的会话在场（对照）"`. An established session implies the app has booted; the first-boot preset is id-keyed one-time and creates the row on first boot — so with a对照 session present, "行缺席" is reachable only by manual row deletion, which no UI action performs. The realistic trigger is user-runtime-off only; the OR branch invites an unbuildable fixture variant.
3. **[blindspot] Restart Outcomes leave harness ordering implicit.** step-2 `restart-mid-state` Input: `"重启应用后重新打开该会话"` with fixture `Session.agentPreset = blitz` — nothing states that the fixture must be seeded **before** the restart and that the assertion targets post-restart projection (the e2e harness must relaunch Electron with the same user-data/session store). Worth one sentence in Preconditions or State to prevent a fresh-instance fixture that trivially "passes" by re-selecting.

## Priority Fix List (for reviser)

1. **step-5 `success`**: replace the session fixture with the journey chain's blitz session — Preconditions/fixture: Session composition = "已确立的突击组合（Step 2/3 会话延续——hero 选定或绑定入口对齐均可）", keep Feature present; align the parenthetical so the main scenario (突击会话 + 远征 feature) is the declared one, and reserve the hero-expedition session for `honest-accounting-mismatch`.
2. **step-2 `success` / step-3 `success`+`post-lock-no-switch`**: add `UiSettingsRow { enabled: true }` (and PresetRow where the menu must render) to `fixture_spec.entities`; for 3b this is the confound control that attributes seat absence to the lock.
3. **step-1 `hero-switch-off`**: restore the `source: inferred` annotation carried by journey Step 1b; drop or justify the "行缺席" OR-branch against the对照-session fixture.
4. Add fact_id traceability (or explicit UNKNOWN marks) for the factual claims (M3_PRESET_REGISTRY_DEFAULT, M3_PRESET_EXPEDITION/BLITZ_IDENTITY, M3_PRESET_BLITZ_SKILL_DIRS, M3_PROPOSAL_MODE_LINEAGE, M3_TASK_MODE_SNAPSHOT, M3_BLITZ_TASK_SEMANTICS, M3_HERO_SWITCH_FIRST_BOOT, M3_OPEN_SESSION_SEQUENCE are the natural anchors).
5. Replace the malformed `field: "ids"` constraint in step-1 with per-row id constraints; soften step-2 `success` "Side-effect: none" to name the platform session-store write implied by restart durability.
