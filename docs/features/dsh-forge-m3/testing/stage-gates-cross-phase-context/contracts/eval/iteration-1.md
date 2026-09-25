# Contract Eval Report — iteration 1

- **Journey**: stage-gates-cross-phase-context
- **Scope**: all 7 step-*.md contracts in `docs/features/dsh-forge-m3/testing/stage-gates-cross-phase-context/contracts/`
- **Surface**: web (anchor handbook: `docs/features/dsh-forge-m3/design/page-map.md`)
- **Scorer persona**: Senior QA Engineer (verification stance)
- **Date**: 2026-09-25
- **Total**: **904 / 1100** — **FAIL** (target ≥935 NOT reached; Surface Fitness 52 < min threshold 60)

| Dimension | Score | Min | Verdict |
|---|---|---|---|
| 1. Completeness | 125/150 | 90 | PASS |
| 2. Semantic Purity | 178/200 | 120 | PASS |
| 3. Precondition Exclusivity | 119/150 | 90 | PASS |
| 4. Fact Alignment | 102/150 | 90 | PASS |
| 5. Surface Fitness | 52/100 | 60 | **FAIL** |
| 6. Internal Consistency | 142/150 | 90 | PASS |
| 7. Anchor Integrity | 90/100 | 60 | PASS |
| 8. Fixture Specification | 96/100 | 60 | PASS |
| **Total** | **904/1100** | **935** | **FAIL** |

---

## Phase 1 — Reasoning Audit (pre-score anchors)

Trace: journey (7 happy steps + 5 edge cases) → 7 contracts, 12 outcomes. Mapping is complete and faithful on the journey layer: step-1 covers Step 1 + edge 1b; step-2 covers Step 2; step-3 covers Step 3 + edge 3b; step-4 covers Step 4 + edge 4b; step-5 covers Step 5 + edge 5b; step-6 covers Step 6; step-7 covers Step 7 + edge 7b. Every journey step and edge has a contract outcome. The contract set solves the journey, not an easier substitute.

Independent anchors found before rubric scoring:

1. **The Web surface-mandated derivation layer is entirely absent.** `rules/surface-web.md` mandates `validation-error` + `session-expired` "must be considered for every Web Journey". None of the 7 contracts contains either outcome, an analog mapping, or an N/A consideration note (the only source comment in the whole set is step-5's `<!-- source: prd-spec Security(...) -->`). The sibling journey (task-dispatch-execution-loop) performed explicit mapping; this journey's generator skipped the exercise. This drives Surface Fitness criterion 1 to 0/40 per the rubric's explicit rule, and pulls Completeness and Fact Alignment criterion 2 down with it.
2. **Step-6's `data_authority: "sqlite"` appears from nowhere.** Steps 1–5 fixtures for the same project are silent on authority; step-6 dispatch requires sqlite (FT-059/FT-068 authority gate). The journey chain never migrates the project — the constraint is fixture-fiat only, and a downstream fixture author cannot tell whether steps 1–5 and step 6 share one project instance. Scored under Internal Consistency.
3. **Step-5's two outcomes are precondition-subset twins with the same input verb.** `success` ("feature 存在至少一份阶段资产") is a superset of `markdown-injection-guard` ("阶段资产文件内含恶意 markdown 结构"); both Inputs are the same user action ("打开「阶段资产」面板浏览" / "浏览「阶段资产」面板"). Scored under Precondition Exclusivity.
4. **Step-6's exclusion assertion is untestable as fixture-declared.** Output claims "可派发集只为当前(新)阶段任务" but the fixture seeds exactly 1 Task (pending, dispatchable type) — there is no contrast task (old-stage or non-dispatchable) to observe exclusion against; and no fact supports a stage-filtered dispatchable set (FT-068 defines dispatchable purely by status pending|blocked). Scored under Fact Alignment + Fixture Specification.
5. SC-style outcome-level bidirectional derivation (safety-net full-pair scan): no mutual-exclusion contradictions found. Pairs are derivable-compatible (step-2 zero-writes ↔ step-3 same-stage precondition; step-4 advance ↔ step-6 new-stage precondition; step-7 convergence ↔ step-7 no-blocking persistence). One `ambiguous — requires author clarification` pair: step-4 success vs multi-advance-accumulation (a twice-advanced feature with current summary present satisfies both preconditions; selection is by Input only). Anchor #2 (authority silence vs sqlite) is likewise ambiguity, not contradiction.

---

## Phase 2 — Rubric Scoring

### 1. Completeness — 125/150

- **Four mandatory dimensions per Outcome (50/50)**: all 12 outcomes across 7 files carry non-empty Preconditions, Input, Output, State; every outcome also carries explicit Side-effect ("none" where applicable) and per-outcome Invariants. Verified file-by-file; zero gaps.
- **Journey Invariants section (50/50)**: all 7 contracts contain `## Journey Invariants` with the full 4-entry journey invariant set verbatim (e.g., step-1: "阶段推进门为编排层硬门:总结未生成必拒绝推进;门校验与产物检查均为确定性代码(断言无模型参与)").
- **Happy path + required derived scenarios (25/50)**: journey coverage itself is complete — all 7 happy steps and all 5 journey edge cases (1b asset-empty, 3b external-channel, 4b multi-advance, 5b injection-guard, 7b no-blocking) are ported as outcomes. But the Web surface's `required_outcomes` mandates are completely unaddressed: no `validation-error` outcome or mapping, no `session-expired` outcome or mapping, no consideration note anywhere. Step-2's gate rejection is a *state-gate* rejection, not input validation, and carries no mapping comment claiming the analog. Half the criterion's substance (the surface-mandated derivation layer) is missing → -25.

### 2. Semantic Purity — 178/200

- **Natural language, not code/regex (76/80)**: no regex patterns, CSS/XPath selectors, or framework assertion calls anywhere. Deductions for implementation nouns inside dimension values: step-3 State "frontmatter 含 stage/generated/goal + 摘要正文" (file-format field names); step-7 State "feature_snapshot.deviated 置位 + last_external_at 记录" (table.column names); step-2 State "manifest 与 feature_snapshot 零写入" (table names).
- **Preconditions declarative (56/60)**: overwhelmingly declarative ("已注册项目含一个处于中间阶段(如 tasks 阶段)的 feature;数据内核可查询阶段门状态", "当前阶段总结已生成(stages/<当前阶段>.md 存在,门满足)"). Deductions: step-3 success embeds the tool surface in a precondition ("agent 会话可经 dsh 通道产出阶段总结(forge_stage_summarize 写面)"); step-6's precondition is a test-harness meta-statement ("测试通道可直读会话系统提示词") — a condition on the test rig, not the system.
- **No implementation coupling (46/60)**: recurring kernel/file mechanics inside dimension values: file paths as state descriptors — step-1 "stages/<当前阶段>.md 存在性", step-3 "features/<slug>/stages/<stage>.md 写入"; database/index vocabulary — step-5 "面板内容 = stage_asset 索引寻址的文档根文件内容", step-4 "feature_snapshot 派生缓存同步"; event names — "stage_advanced 事件推送", "deviation_detected 事件推送". Heaviest: step-6 mixes test-harness instructions into user-facing dimensions — Input "用户在新阶段启动会话/派发任务,经测试通道断言会话系统提示词" and Output "新阶段会话系统提示词强制包含目标 + 摘要(注入内容断言)" describe what a test channel must verify, not what the system produces for the user. (Note: the domain is file-centric — the gate rule is literally a file-existence check, FT-080 — so path mentions are partially defensible; the deduction is for the pervasive register, not individual mentions.)

### 3. Precondition Exclusivity — 119/150

- **Distinct preconditions across outcomes (44/60)**:
  - Step-5: `success` Preconditions "feature 存在至少一份阶段资产(先行阶段已产出)" is a strict superset of `markdown-injection-guard` Preconditions "阶段资产文件内含恶意 markdown 结构(脚本注入/危险链接)" — an asset with malicious content satisfies both (-10).
  - Step-4: `success` ("当前阶段总结已生成") and `multi-advance-accumulation` ("feature 先后完成多次阶段推进(各先行阶段资产齐全)") are not mutually exclusive — a twice-advanced feature with a current-stage summary satisfies both; "先行阶段资产齐全" does not exclude a present current-stage summary (-6).
  - Clean pairs elsewhere: step-1 (middle-stage vs "早期阶段" prd fixture pin), step-3 (internal vs external production channel), step-7 (manifest≠snapshot transition vs post-detection deviated=1) are distinguishable by state alone.
- **Sufficient to uniquely select (35/50)**:
  - Step-5 is unselectable from preconditions alone in the malicious-content state — and the Inputs are semantically identical ("用户打开详情区「阶段资产」面板浏览" vs "用户浏览「阶段资产」面板"), so not even the action disambiguates (-10).
  - Step-4's overlap resolves only via Input (推进 vs 浏览) (-5).
- **Error/boundary triggers explicit (40/40)**: every non-happy outcome names its trigger concretely: "feature 尚无推进记录(早期阶段,文档根无 stages/ 资产)" (step-1), "当前阶段的总结资产未生成(文档根不存在 stages/<当前阶段>.md)" (step-2), "阶段总结由外部会话/终端产出资产文件(非应用内通道)" (step-3), "阶段资产文件内含恶意 markdown 结构(脚本注入/危险链接)" (step-5), "偏离标识呈现中" (step-7).

### 4. Fact Alignment — 102/150

- **Factual claims traceable / UNKNOWN (46/60)**: most behavioral claims verify cleanly against the fact table — ERR_STAGE_GATE_UNSATISFIED rejection ↔ FT-080; live-fs gate "不吃索引时滞" ↔ FT-080 ("never trusts index staleness"); stage-asset write shape "frontmatter 含 stage/generated/goal + 摘要正文;同阶段重写 = 覆盖更新" ↔ FT-082; "stage_asset 索引同步替换(写后即就位,零感知时滞)" ↔ FT-082 ("index is replaced synchronously… zero index lag"); advance semantics "内核写 manifest status(唯一写面…);偏离标记清除(…last_external_at 保留审计);stage_advanced 事件推送" ↔ FT-081; deviation chain "manifest status ≠ 快照 status → feature_snapshot.deviated 置位…同一外部变更只报一次" ↔ FT-085; presynth exclusion "排除 feature 当前阶段自身的总结" + "确定性组装(禁模型调用)" ↔ FT-071; zero-CLI side-effect ↔ FT-096. Deductions:
  - **Zero fact_id citations across all 7 files.** The rubric requires factual claims to "reference a fact" — not one outcome carries a fact_id or UNKNOWN marker; only step-5 carries any source annotation at all (`<!-- source: prd-spec Security(markdown 防注入:阶段资产渲染经白名单) -->`). The grounding is real (I traced it) but the declared traceability discipline is absent (-4 systematic).
  - Step-6 Output "可派发集只为当前(新)阶段任务" — no fact supports a stage-filtered dispatchable set; FT-068 defines dispatchable purely by status ("dispatchable statuses = pending | blocked"). The phrase is inherited verbatim from the journey, but the contract asserts it as system behavior without fact reference or UNKNOWN marking (-6).
  - Step-4 Side-effect "manifest.md 文件写入(status 原位替换或前插)" — "前插" is not FT-081's vocabulary ("in-place status replace… missing manifest → minimal one created"); unverified paraphrase (-4).
- **Inferred claims have rule support + source: inferred (20/50)**: there are **no inferred outcomes at all** — the two surface-mandated derivations (`validation-error`, `session-expired`) that would require `source: inferred` + `required_outcomes` rule basis were never generated, so the criterion's subject matter is missing entirely. 1 of 12 outcomes carries any source annotation. The six journey-derived boundary outcomes are legitimately journey-sourced (no annotation strictly required), which is the only reason this is not lower.
- **No hallucinated unclassified claims (36/40)**: no fabricated error codes or invented mechanisms found — every ERR_* and event name checks out against the fact table. Residual: the step-6 dispatchable-set claim and the "前插" paraphrase remain unclassified relative to the fact base (-4).

### 5. Surface Fitness — 52/100 — **BELOW THRESHOLD (60)**

- **Mandatory Web derived outcomes present (0/40)**: `validation-error` and `session-expired` are **completely absent** from all 7 contracts — no outcome, no analog mapping comment, no N/A consideration note. Per the rubric's explicit rule ("Score 0 if mandatory Outcomes are completely absent"), this criterion scores 0. This is the failure driver: the journey genuinely has no forms and is a single-user desktop app (page-map: "Auth: none(单用户桌面)"), so a documented N/A or an analog mapping (as the sibling journey did: session-expired → host-channel unavailability) was required — silence is not consideration.
- **Surface-appropriate language (27/35)**: Inputs/Outputs use proper web interaction language ("用户进入工作台·Feature 看板,点击目标 feature", "用户打开详情区「阶段资产」面板浏览"). Deductions: State dimensions consistently speak kernel/index register rather than observable web state ("推进被 ERR_STAGE_GATE_UNSATISFIED 拒绝;manifest 与 feature_snapshot 零写入", "feature_snapshot.deviated 置位 + last_external_at 记录;deviation_detected 事件推送"); and step-6's primary Output ("新阶段会话系统提示词强制包含目标 + 摘要(注入内容断言)") is not browser-observable at all — the contract honestly delegates to a test channel, but the outcome gives the web surface nothing to assert.
- **TUI timeout criterion (25/25)**: N/A for web surface — full marks per rubric.

### 6. Internal Consistency — 142/150

- **Journey invariants hold in every contract (60/60)**: hard gate never bypassed (step-2 rejection with zero writes); determinism asserted everywhere it applies (step-1 "门校验为确定性代码(无模型参与)", step-6 "注入为确定性组装(禁模型调用)"); content-in-files/metadata-in-SQLite respected (step-3/4/5); read-only whitelist rendering (step-5); zero host intrusion on external ops (step-7 "manifest 字节与 mtime 原样(零宿主侵入)"); cross-phase context carried (step-6). No contract offers a task-status write UI (BIZ-task-ops-001 M3: human = orchestration only) — human actions here are exactly 查看/推进/浏览, and 推进 is the sanctioned orchestration verb per page-map Permissions ("阶段推进(编排面…)"). Kernel stage writes do not violate the derived-cache model (stage_asset is FT-084's rebuildable index; manifest writing is FT-081's sanctioned kernel path).
- **Cross-Contract state references consistent (50/50)**: the chain is sound and unambiguous — step-2 leaves "feature 阶段不变" → step-3 operates on the same middle stage; step-3's "features/<slug>/stages/<stage>.md 写入" → step-4's precondition "stages/<当前阶段>.md 存在,门满足" (fixture: StageAsset "与 feature 当前阶段一致(门资产在场)"); step-4 advances status → step-6 precondition "feature 已推进至新阶段" (fixture: "推进后的新阶段"); step-4's multi-advance fixture ("in-progress(已多次推进)" + StageAsset min_count 2) is exactly constructible via ≥2 advances (e.g., design→tasks→in-progress). Step-7's snapshot/detection chain matches FT-085's set-then-converge order.
- **Preconditions achievable from preceding steps (32/40)**: all steps chain achievable **except step-6's authority constraint**: fixture declares "field: 'data_authority' / value: 'sqlite'" while steps 1–5 fixtures — the same project instance this journey walks through — are silent on authority, and no step migrates it (FT-061 migration is another journey's scope). Per FT-059 dispatch requires sqlite; per the fact table stage ops are not authority-gated, so steps 1–5 are compatible with a files-authority project that step 6 then cannot dispatch on. Either declare `data_authority: sqlite` in all 7 fixtures or state the authority assumption in the journey setup (-8).

### 7. Anchor Integrity — 90/100

Handbook `design/page-map.md` exists; Web anchor field = `page`. All 7 contracts carry `anchors.web.page` (+ supplementary `route`/`layout`/`requires_auth`).

- **Anchor field completeness (40/40)**: no missing `page` fields. Values resolve to handbook pages: step-1/7 → 工作台 · Feature 看板 (`workbench/features`); step-2/3/4/5 → Feature detail subview (`workbench/features/:slug`, handbook Layout "FeaturesPage + FeatureDetail"); step-6 → 工作台 · 任务看板 (`workbench/tasks`) + 上游会话视图 (`session`) — both exist as handbook entries.

  **Missing Anchor Fields** table: none — no deductions.

- **Anchor values match handbook (20/30)**: one systematic mismatch class. Steps 2–5 title the page "工作台 · Feature 详情(…)" (e.g., step-2: `page: "工作台 · Feature 详情(推进动作 + GateHint)"`), but the handbook has no page entry by that name — its entry is "工作台 · Feature 看板(UF2 阶段化扩展)" with View Key "workbench/features(tab)+ 子视图 workbench/features/:slug". Additionally the contracts write the subview route as `workbench/features/<slug>` while the handbook's parameter sigil is `:slug` (its own Route Parameters tables use named params). Semantics identical, identifiers not exact — the rubric requires exact matching (-10 for the class).
- **Handbook internal consistency (30/30)**: no conflicting definitions. View keys unique and disjoint (`workbench/overview|proposals|features|tasks`, `workbench/dialog/*`, `workbench/panel/*`, `session`); tab order "概览 / 提案 / Feature / 任务" stated identically in header and Page Overview and matches FT-092; panels documented as mutually exclusive in both the tasks-page row and Shared Components; Esc layering and close-guard rules conflict with nothing.

  **Handbook Conflicts** table: none found.

### 8. Fixture Specification — 96/100

Scored per-contract (entity completeness / relationships+constraints / min_count), then averaged. Entity types verify against the design's domain model: Project, Feature, ManifestFile, StageAsset, Task all correspond to real model entities (feature_snapshot, stage_asset, task tables / manifest file projection).

| Contract | Entity | Rel/Cstr | MinCount | Total | Notes |
|---|---|---|---|---|---|
| step-1 | 40 | 35 | 22 | **97** | ManifestFile→Feature + vocabulary constraint ("词表内阶段值") well done; Feature min_count 1 while Output asserts plural list semantics ("列表呈现各 feature 当前阶段") — one feature cannot exercise the list rendering (-3). |
| step-2 | 37 | 35 | 25 | **97** | State asserts "manifest 与 feature_snapshot 零写入" but ManifestFile is not declared (a manifest must exist to verify zero-write; step-1 declares it for the same state) (-3). |
| step-3 | 40 | 32 | 25 | **97** | external outcome correctly seeds StageAsset as prerequisite; success outcome's created-during-test asset acceptably undeclared; external fixture uses a non-schema field "producedBy" (stage_asset carries path/generated_at per FT-084) — channel origin is expressible as a state_requirement instead (-3). |
| step-4 | 30 | 35 | 25 | **90** | The manifest-**writing** contract does not declare ManifestFile as prerequisite — "status 原位替换" requires a seeded manifest with existing status to observe in-place replacement (FT-081) (-10). multi-advance min_count 2 exactly matches ≥2 advances. |
| step-5 | 40 | 35 | 25 | **100** | Both outcomes declare Project/Feature/StageAsset with the content constraint on the injection-guard variant — complete. |
| step-6 | 40 | 35 | 17 | **92** | Best entity set of the journey (data_authority, task_type, status constraints). But Output asserts an exclusion ("可派发集只为当前(新)阶段任务") that needs a contrast task (old-stage or non-dispatchable-type) to observe; min_count 1 same-shape Task cannot substantiate "只为" (-8). |
| step-7 | 40 | 35 | 25 | **100** | External rewrite modeled as seeded ManifestFile state ("被外部改写为与快照不同的词表内阶段") + snapshotPresent constraint — clean. |

Average: (97+97+97+90+100+92+100)/7 = **96**. No entity-completeness veto triggered (every referenced *prerequisite* entity is declared).

---

## Phase 3 — Blindspot Hunt

1. `[blindspot]` **Internal-channel gate refresh has no await bound while its external twin has one** — step-3 success Output: "门状态更新为「总结已生成」(感知回流,免手动刷新)". The external outcome gets an explicit budget ("门状态经感知更新(≤5s 口径沿用感知链)"), but the internal outcome gives the test author no wait budget for the board's gate-state flip (the index is synchronous per FT-082, but the *renderer* still needs the perception/event leg — which outcome text leaves unspecified). Must improve: state the observable update channel and budget (e.g., ≤5s perception leg) or pin the kernel-direct event for the internal channel.
2. `[blindspot]` **Step-6's load-bearing assertion is delegated to an unspecified test channel** — Input: "用户在新阶段启动会话/派发任务,经测试通道断言会话系统提示词". The entire point of Step 6 (mandatory goal+summary injection) rides on an unnamed channel with no record shape, location, or access method; the web surface gets no observable at all. Reasoning audit flagged this independently of dimension scoring. Must improve: name the artifact (e.g., dispatch row prompt_hash / host-side presynth record per FT-070/FT-071) and its access path inside the outcome's State or a fixture note, and give the web face at least a derived observable (e.g., dispatch confirm panel's 预合成要素 indication per page-map TaskDetailPanel).

---

## Attack List (for reviser)

1. **Surface Fitness (0/40 driver)**: Web mandatory derived outcomes completely absent — no `validation-error`, no `session-expired`, no mapping/N-A consideration in any of the 7 files. Add both derived outcomes (or documented analog mappings with `source: inferred` + rule basis, per surface-web `required_outcomes`), e.g., validation-error analog on the advance action (advance requested on non-vocabulary/terminal state → observable rejection near the action), session-expired analog on the host/session channel for step-6.
2. **Fact Alignment**: zero fact_id citations and zero UNKNOWN/inferred annotations across all 12 outcomes — e.g., step-2 State "推进被 ERR_STAGE_GATE_UNSATISFIED 拒绝" cites nothing (FT-080). Annotate outcomes with fact references (FT-080/081/082/084/085/071 as applicable) or UNKNOWN; mark derived outcomes `source: inferred` with rule basis.
3. **Fact Alignment**: step-6 Output "可派发集只为当前(新)阶段任务" has no fact-table support (FT-068: dispatchable = pending|blocked, status-based) — cite the governing fact, reword to the fact-backed form, or mark UNKNOWN.
4. **Internal Consistency**: step-6 fixture "data_authority: 'sqlite'" appears only in step-6 while steps 1–5 fixtures are silent and no step migrates — declare data_authority consistently across all 7 fixtures (or state it in journey Setup).
5. **Precondition Exclusivity**: step-5 `success` ⊃ `markdown-injection-guard` with semantically identical Inputs ("用户打开详情区「阶段资产」面板浏览" / "用户浏览「阶段资产」面板") — narrow success (benign content) or differentiate inputs; same fix for step-4 success/multi-advance overlap (pin "当前阶段总结已生成且尚未多次推进"-style disjointness or accept Input-based selection explicitly).
6. **Semantic Purity**: kernel/db register in dimension values — "manifest 与 feature_snapshot 零写入" (step-2), "feature_snapshot.deviated 置位 + last_external_at 记录" (step-7), "features/<slug>/stages/<stage>.md 写入" (step-3), test-rig meta in user dimensions ("经测试通道断言会话系统提示词", step-6) — rewrite as observable system state.
7. **Fixture Specification**: step-4 lacks the ManifestFile prerequisite (in-place status replace needs a seeded manifest); step-6 needs a contrast Task (≥2 tasks across stage/type) to substantiate the "可派发集只为当前阶段" exclusion; step-2 should declare ManifestFile to make the zero-write assertion verifiable.
8. **Anchor Integrity**: align page identifiers with handbook entries — "工作台 · Feature 详情(…)" (steps 2–5) is not a handbook page title; use the handbook's "工作台 · Feature 看板" + subview convention, and match the `:slug` sigil.
9. **Completeness**: the surface-mandated derivation gap also costs here (25/50 on the derived-scenarios criterion) — fixed by attack 1.
10. **[blindspot]**: internal-channel refresh budget unspecified (step-3) and step-6 test-channel artifact unnamed — see Phase 3.

---

## Outcome

Target NOT reached — iteration 1 fails on two conditions: total 904 < 935 and Surface Fitness 52 < 60 (min threshold). The single highest-leverage revision is Attack 1 (+the annotation discipline of Attack 2): adding the two Web-mandated derived outcomes with proper `source: inferred` rule basis moves Surface Fitness criterion 1 from 0/40 and lifts Completeness/Fact Alignment simultaneously; the remaining fixes are localized.
