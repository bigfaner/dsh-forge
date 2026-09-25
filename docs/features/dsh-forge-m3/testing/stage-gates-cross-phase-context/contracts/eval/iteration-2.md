# Contract Eval Report — iteration 2

- **Journey**: stage-gates-cross-phase-context
- **Scope**: all 7 step-*.md contracts in `docs/features/dsh-forge-m3/testing/stage-gates-cross-phase-context/contracts/`
- **Surface**: web (anchor handbook: `docs/features/dsh-forge-m3/design/page-map.md`)
- **Scorer persona**: Senior QA Engineer (verification stance)
- **Date**: 2026-09-25
- **Total**: **1056 / 1100** — **PASS** (target ≥935 reached; every dimension ≥ min threshold)

| Dimension | Score | Min | Verdict |
|---|---|---|---|
| 1. Completeness | 150/150 | 90 | PASS |
| 2. Semantic Purity | 181/200 | 120 | PASS |
| 3. Precondition Exclusivity | 140/150 | 90 | PASS |
| 4. Fact Alignment | 144/150 | 90 | PASS |
| 5. Surface Fitness | 96/100 | 60 | PASS |
| 6. Internal Consistency | 146/150 | 90 | PASS |
| 7. Anchor Integrity | 100/100 | 60 | PASS |
| 8. Fixture Specification | 99/100 | 60 | PASS |
| **Total** | **1056/1100** | **935** | **PASS** |

---

## Iteration-1 attack disposition (verification — no credit awarded for the fix itself, only for what is now on the page)

| Iter-1 attack | Disposition in current files |
|---|---|
| 1. Web derived outcomes absent | **Addressed**: step-4 `manifest-unreadable-rejected` (validation-error mapping) + step-6 `host-channel-unavailable` (session-expired mapping), each with `surface-web required_outcomes 映射` comment, `source: inferred`, reasoning, facts |
| 2. Zero fact citations | **Addressed**: all 14 outcomes carry `<!-- facts: ... -->` or explicit `UNKNOWN` annotation |
| 3. "可派发集只为当前阶段" unsupported | **Addressed**: reworded to status-based dispatchable claim citing FT-068, with contrast task |
| 4. data_authority inconsistency | **Addressed**: `data_authority: sqlite` declared in every Project fixture across all 7 files |
| 5. step-5 / step-4 precondition overlaps | **Addressed**: success narrowed to "良性内容…内容不含恶意 markdown 结构"; step-4 success pinned "此前无成功推进记录,本次为首次生效推进" (disjoint from multi-advance) |
| 6. Kernel register / test-rig meta | **Largely addressed**: test-channel wording removed from Inputs; table.column names removed; residuals scored below |
| 7. Fixture gaps (step-4 ManifestFile, step-6 contrast task, step-2 ManifestFile) | **Addressed**: all three now declared/seeded |
| 8. Anchor naming mismatch | **Addressed**: page = "工作台 · Feature 看板(UF2 阶段化扩展)"; route uses `:slug` sigil exactly as handbook |
| Blindspot 1 (internal refresh budget) | **Addressed**: "应用内通道经事件回流渲染刷新(≤5s 口径与外部通道一致,免手动刷新)" |
| Blindspot 2 (unnamed test channel) | **Addressed**: assertion carriers named (dispatch row prompt_hash, combined first message, TaskDetailPanel read path) |

---

## Phase 1 — Reasoning Audit (pre-score anchors)

Trace: journey (7 happy steps + 5 edge cases) → 7 contracts, **14 outcomes** (12 journey-derived + 2 surface-derived). Mapping remains complete and faithful; the two new derived outcomes slot into steps 4 and 6 where the journey's only user-write action (advance) and only channel-dependent action (dispatch→session) live — the derivation layer solves the surface mandate, not a substitute problem.

SC-style full-pair bidirectional derivation over outcome-level preconditions:

- step-4 success ("此前无成功推进记录,本次为首次生效推进") ↔ multi-advance-accumulation ("已先后完成多次阶段推进…本结果为浏览观察,非推进请求") — **now explicitly disjoint** (iteration-1 ambiguity resolved by declaration).
- step-5 success ("良性内容…内容不含恶意 markdown 结构") ↔ markdown-injection-guard ("内含恶意 markdown 结构") — **now explicitly disjoint**.
- step-3 success (in-app channel) ↔ external-channel-summary (非应用内通道) — disjoint by channel declaration.
- **New weak-ambiguity pairs introduced by the revision** (tagged `ambiguous — requires author clarification`, scored under Precondition Exclusivity):
  1. step-4 `success` ↔ `manifest-unreadable-rejected`: a corrupted-manifest feature with summary present satisfies every *stated* precondition of success ("门满足" is file-existence only per FT-080; manifest parseability is never stated on the success side). Disjoint only in consequence (an unreadable manifest cannot be status-replaced), and via fixture implication — not via declared preconditions.
  2. step-6 `success` ↔ `host-channel-unavailable`: success's preconditions are silent on host-channel availability; the channel-unavailable state satisfies both. Disambiguated only by consequence/fixture.
- No mutual-exclusion contradictions found; chain derivability (step-2 zero-writes → step-3 same stage → step-4 gate satisfied → step-6 new stage + prior asset) is sound.

---

## Phase 2 — Rubric Scoring

### 1. Completeness — 150/150

- **Four mandatory dimensions per Outcome (50/50)**: all 14 outcomes across 7 files carry non-empty Preconditions, Input, Output, State; every outcome carries explicit Side-effect ("none" where applicable) and per-outcome Invariants. Verified file-by-file; zero gaps.
- **Journey Invariants section (50/50)**: all 7 contracts contain `## Journey Invariants` with the full 4-entry journey invariant set verbatim.
- **Happy path + required derived scenarios (50/50)**: all 7 happy steps and all 5 journey edges ported as outcomes. The Web surface's `required_outcomes` mandate is now satisfied by documented analog mappings, not silence: step-4 `manifest-unreadable-rejected` carries "surface-web required_outcomes 映射:validation-error → 本旅程无表单输入面,映射为推进动作作用于不可解析 manifest 状态时的近动作位可观察拒绝(推进前状态校验失败)" and step-6 `host-channel-unavailable` carries "session-expired → 单用户桌面无登录态(页面图 Auth: none),映射为宿主会话通道不可用…失败态呈现 + 恢复引导,不静默". Both mappings state why the literal outcome cannot exist in this journey. No journey step or edge is unported.

### 2. Semantic Purity — 181/200

- **Natural language, not code/regex (75/80)**: no regex patterns, CSS/XPath selectors, or framework assertion calls anywhere. Residual deduction: step-6 success Output embeds verification instructions inside a dimension value — "断言载体 = 派发行记录(prompt_hash = 组合消息 sha256)与会话首条组合消息,经任务详情侧板派发记录读取" describes *how to verify*, not only *what the system produces* (the carrier-naming was the iteration-1 blindspot fix and is deliberately load-bearing, but the phrasing sits in an Output field). Also "sha256" as an algorithm name in user-facing Output (-5).
- **Preconditions declarative (58/60)**: overwhelmingly declarative state descriptions; the iteration-1 offenders are gone (tool-surface mention removed from step-3 — now "应用内 agent 会话通道可用(阶段总结经应用内会话产出)"; test-channel meta moved out of step-6 preconditions into a fixture state_requirement, where it belongs). Deduction: step-7 success precondition names the mutation action rather than the resulting state — "外部会话(终端/冻结 CC 插件)将 manifest status 改写为不同阶段(跨阶段操作)" (expressible as "manifest 阶段已被外部改写为…"; the fixture already phrases it this way) (-2).
- **No implementation coupling (48/60)**: much improved (table.column names and zero-write DB vocabulary removed from step-2/step-7 State). Residuals, with the domain's file-centricity partially defensible (the gate rule literally is a file-existence check, FT-080):
  - Path templates inside dimension values: step-2 Preconditions "(文档根不存在 stages/<当前阶段>.md)" and state_requirement "features/<slug>/stages/<当前阶段>.md 不存在(总结未生成)"; step-3 State "文档根单一规范文件 stages/<当前阶段>.md"; step-4 Preconditions "stages/<当前阶段>.md 存在" (-4).
  - Frontmatter field-level register: step-3 State "阶段/生成时间/目标头部 + 摘要正文" (stage/generated/goal field names) (-2).
  - Internal-event and row register in observable-facing fields: step-7 State "偏离事件(deviation_detected)推送"; step-6 host-channel State "受影响派发行进入 failed 态并记录原因"; step-4 State "阶段字段经唯一内核写面更新" (-4).
  - Step-6 Output's DB-row + hash + panel-read-path vocabulary (as above) (-2).

### 3. Precondition Exclusivity — 140/150

- **Distinct across outcomes (58/60)**: step-1 (middle vs early stage), step-3 (in-app vs external channel), step-5 (benign vs malicious content), step-4 success vs multi-advance (first advance vs multiple advances) are all now explicitly disjoint. Deduction: step-4 `success` does not state manifest parseability while its new sibling `manifest-unreadable-rejected` is triggered by "feature 的 manifest 阶段头部不可解析(损坏 YAML);当前阶段总结即便在场" — in that state every stated success precondition still holds, so the pair is distinct only by unstated implication (-2).
- **Sufficient to uniquely select (42/50)**: two pairs require fixture-level or consequence-level disambiguation rather than declared-precondition selection:
  - step-4 success ↔ manifest-unreadable-rejected share the same Input verb (advance: "用户再次请求推进" / "用户请求推进该 feature"); selection in the corrupted-manifest-with-summary state rests entirely on the fixture seeding (valid frontmatter vs "YAML 损坏") (-4).
  - step-6 success ↔ host-channel-unavailable: "宿主会话通道不可用(宿主异常/凭据失效)" is nowhere excluded by success's preconditions, and the Inputs overlap ("发起任务派发…派发后进入会话" vs "用户发起派发/进入会话后察看任务看板编排条目状态") — selection again rests on consequence/fixture (-4).
- **Error/boundary triggers explicit (40/40)**: every non-happy outcome names its trigger concretely — "feature 尚无推进记录(早期阶段,文档根无 stages/ 资产)" (step-1), "当前阶段的总结资产未生成" (step-2), "阶段总结由外部会话/终端产出资产文件(非应用内通道)" (step-3), "manifest 阶段头部不可解析(损坏 YAML)" (step-4), "阶段资产文件内含恶意 markdown 结构" (step-5), "宿主会话通道不可用(宿主异常/凭据失效)" (step-6), "偏离标识呈现中" (step-7).

### 4. Fact Alignment — 144/150

- **Factual claims traceable / UNKNOWN (56/60)**: all 14 outcomes carry annotations. Verified against the fact table: FT-080 gate semantics (live fs, no index trust, vocabulary) ✓; FT-081 advance write-face, in-place replace, minimal-manifest creation, deviation clear with audit, stage_advanced ✓ (iteration-1's unverified "前插" paraphrase is gone, replaced by FT-081's own vocabulary); FT-082 single canonical file + synchronous index replacement ✓; FT-084 triple-PK uniqueness + rebuildable index ✓; FT-085 detect→converge→once ✓; FT-071/070/068/059 presynth + dispatch chain in step-6 ✓ (including "对照 in_progress 任务被拒并提示「单执行者」" = FT-068's 'one executor per task'); FT-073 launch-fail → failed row + reason ✓. The asset-empty outcome honestly marks "facts: UNKNOWN(空态占位呈现无 FT 条目…)" — exactly the required discipline. Deductions:
  - Step-3 success claims "应用内通道经事件回流渲染刷新(≤5s 口径与外部通道一致,免手动刷新)" citing BIZ-workbench-005 — but that rule's scope is task changes ("会话/终端侧任务变更 → 看板免手动刷新可见 ≤5 秒"); gate-state refresh after an in-app stageSummarize is an analogical extension of the baseline, and no fact names the event that refreshes the gate view on the internal channel (FT-082 covers index synchronicity only) (-2).
  - Step-5 markdown-injection-guard carries "source: prd-spec Security(…)" — a document source, not a fact_id, and no UNKNOWN/inferred classification; the whitelist-rendering claim has no fact-table entry (-2).
- **Inferred claims have rule support + source: inferred (48/50)**: both derived outcomes carry the full triple — mapping rule ("surface-web required_outcomes 映射:validation-error → …" / "session-expired → …"), `source: inferred`, and a reasoning line citing fact-table evidence (FT-081 malformed YAML; FT-073 notifyLaunchFailed) plus the sibling-journey mapping precedent. Deduction: the validation-error template's third assert ("user can correct and retry") has no analog in the mapped outcome — step-4's rejection Output ("推进被拒:错误(ERR_STAGE_MANIFEST_UNREADABLE)在推进动作位附近呈现;feature 阶段不变;manifest 原文零改动(拒绝合并写入)") includes no correction/recovery guidance, while the journey-native gate rejection does ("引导缺失动作(生成阶段总结…)") (-2).
- **No hallucinated unclassified claims (40/40)**: every ERR_*, event name, hint string ("单执行者"), hash semantics, and panel affordance (派发确认链三要素说明, 预合成要素就位标识) checks out against the fact table and page-map. No fabricated mechanisms found.

### 5. Surface Fitness — 96/100

- **Mandatory Web derived outcomes present (40/40)**: `validation-error` and `session-expired` are both present as annotated analog mappings (see Completeness). The mappings are honest: the journey has no form face and the app is single-user desktop (page-map "Auth: none(单用户桌面)"); the analogs preserve the template's assert structure (near-action error + unchanged state for validation-error; visible failure + reason + recovery + no half-state for session-expired).
- **Surface-appropriate language (31/35)**: Inputs/Outputs are proper web interaction language throughout ("用户进入工作台·Feature 看板,点击目标 feature"; "用户在新阶段发起任务派发(任务看板选择模式 → 派发确认链),派发后进入会话"; "任务详情侧板呈现预合成要素就位标识"). Step-6's injection assertion now has genuine web observables (dispatch confirm chain, TaskDetailPanel indicators) — the iteration-1 "nothing for the browser to assert" gap is closed. Deduction: State fields still consistently speak kernel/index register rather than observable web state — "注入指纹随派发行落库" (step-6), "偏离事件(deviation_detected)推送" (step-7), "门校验为活性文件判定(确定性代码,不吃索引时滞)" (step-2) — the web face of each is left to be inferred from the Output (-4).
- **TUI timeout criterion (25/25)**: N/A for web surface — full marks per rubric.

### 6. Internal Consistency — 146/150

- **Journey invariants hold in every contract (60/60)**: hard gate never bypassed (step-2 zero-write rejection; step-4 success only when "门满足"); determinism asserted wherever it applies ("门校验为确定性代码(无模型参与)", "注入为确定性组装(禁模型调用)"); content-in-files/metadata-in-SQLite respected (step-3/4/5); whitelist read-only rendering (step-5); zero host intrusion (step-7 "manifest 字节与 mtime 原样(零宿主侵入)"); cross-phase context carried (step-6). Human actions are exactly the sanctioned orchestration verbs (查看/推进/浏览/派发 per BIZ-task-ops-001 M3 and page-map Permissions). Deviation-marker lifecycle statements are mutually consistent across step-4 ("合法推进 = 偏离清除点") and step-7 no-blocking ("持续至下次内核合法推进…门拒绝与终态 no-op 不清除" — derivable from FT-081's zero-write no-op + FT-085).
- **Cross-Contract state references consistent (50/50)**: the chain is sound — step-2 zero-write → step-3 same middle stage; step-3's written stage asset → step-4's "stages/<当前阶段>.md 存在,门满足" (fixture: StageAsset "与 feature 当前阶段一致"); step-4 advance → step-6 "feature 已推进至新阶段" with prior-stage StageAsset (matching FT-071's "排除 feature 当前阶段自身的总结"); multi-advance fixture (in-progress + ≥2 distinct prior stages) constructible via ≥2 advances. `data_authority: sqlite` is now declared uniformly in every Project fixture across all 7 files — iteration-1's authority-silence ambiguity is resolved.
- **Preconditions achievable from preceding steps (36/40)**: all chain preconditions are achievable — except step-6 success lists "派发行记录可读取注入指纹与组合消息" as a *precondition*, but the dispatch row is created by this outcome's own Input ("发起任务派发"), not by any preceding step; the precondition encodes assertion availability rather than a prior state (-4).

### 7. Anchor Integrity — 100/100

Handbook `design/page-map.md` exists; Web anchor field = `page`. All 7 contracts carry `anchors.web.page` (+ supplementary `route`/`layout`/`requires_auth`, plus `last_anchor_sync`).

- **Anchor field completeness (40/40)**: no missing `page` fields.
  **Missing Anchor Fields** table: none — no deductions.
- **Anchor values match handbook (30/30)**: iteration-1's systematic mismatch class is fixed. Steps 1–5 and 7 use exactly the handbook entry title "工作台 · Feature 看板(UF2 阶段化扩展)"; routes use the handbook's own sigil notation (`workbench/features`, `workbench/features/:slug`). Step-6's compound anchor "工作台 · 任务看板(UF1 编排扩展)→ 上游会话视图" / route "workbench/tasks → session" resolves component-for-component to two real handbook entries (tasks page + 上游会话视图, matching the page-map dispatch→「进入会话」navigation). Step-5's layout "FeatureDetail → StageAssetsTab(第六 tab)" matches the handbook's "「阶段资产」tab(第六)".
- **Handbook internal consistency (30/30)**: view keys unique and disjoint; tab order consistent with FT-092; panel mutual-exclusivity and Esc layering conflict with nothing.
  **Handbook Conflicts** table: none found.

### 8. Fixture Specification — 99/100

Scored per-contract (entity completeness / relationships+constraints / min_count), then averaged. Entity types verify against the design's domain model (Project, Feature, ManifestFile, StageAsset, Task, Dispatch — all real model entities per schema-v2/FT-067/084).

| Contract | Entity | Rel/Cstr | MinCount | Total | Notes |
|---|---|---|---|---|---|
| step-1 | 40 | 35 | 22 | **97** | Feature min_count 1 while Output asserts plural list semantics ("列表呈现各 feature 当前阶段") — one feature cannot exercise the list rendering (-3; unaddressed from iteration 1). |
| step-2 | 40 | 35 | 25 | **100** | ManifestFile now declared as zero-write observation baseline + state_requirement for the absent stage file — iteration-1 gap fixed. |
| step-3 | 40 | 33 | 25 | **98** | External outcome models channel origin as state_requirement (non-schema "producedBy" field removed) ✓; external fixture leaves Feature status unpinned (middle stage implied by journey context only) (-2). |
| step-4 | 40 | 35 | 25 | **100** | ManifestFile prerequisite restored with "原位替换的观察基线"; multi-advance StageAsset min 2 with distinct-stage constraint; unreadable variant seeds corrupted content. |
| step-5 | 40 | 35 | 25 | **100** | Content constraints differentiate benign vs malicious variants — now matches the narrowed preconditions. |
| step-6 | 40 | 33 | 25 | **98** | Contrast task restored (pending ×1 + in_progress ×1) substantiating the dispatchable-set claim; host-channel seeds Dispatch starting|running + unavailability state_requirement. Deduction: Task's parent_entity is inconsistent across the two outcomes of the same file — success declares `parent_entity: Feature` (board address model) while host-channel declares `parent_entity: Project` (-2). |
| step-7 | 40 | 35 | 25 | **100** | External rewrite modeled as seeded ManifestFile state + snapshotPresent constraint. |

Average: (97+100+98+100+100+98+100)/7 = **99**. No entity-completeness veto triggered.

---

## Phase 3 — Blindspot Hunt

1. `[blindspot]` **Error-precedence for the combined corrupted-manifest + gate-unsatisfied state is unspecified across contracts** — step-2 triggers on "文档根不存在 stages/<当前阶段>.md" (fixture: valid ManifestFile), step-4's new outcome triggers on "manifest 阶段头部不可解析(损坏 YAML);当前阶段总结即便在场" (fixture: corrupted ManifestFile). Neither FT-080 nor FT-081 states which check runs first, and no contract assigns the combined state (corrupted manifest AND no summary) to an outcome — a test author exploring the rejection space gets no answer, and the two rejection outcomes cannot be jointly validated against precedence. Must improve: state the precedence in one of the two outcomes (or mark the combined state explicitly out of scope / UNKNOWN).
2. `[blindspot]` **The step-6 assertion carrier's read path is asserted but not grounded** — Output: "断言载体 = 派发行记录(prompt_hash = 组合消息 sha256)与会话首条组合消息,经任务详情侧板派发记录读取". FT-067 confirms the dispatch row carries prompt_hash, but neither the fact table nor page-map's TaskDetailPanel section ("当前态/会话/去审批/失败原因+重派发/预合成要素 ✓✓✓", data source getTaskDetail + getDispatches) documents that the panel exposes prompt_hash or the session's first combined message body; the sibling journey routed such assertions through a named test channel. Must improve: ground the exposure (which verb returns prompt_hash / message body — cite the fact or mark UNKNOWN) or restore an explicitly named test channel for the message-body leg while keeping the panel indicators as the web face.
3. `[blindspot]` **FT-081's missing-manifest branch is cited but never exercisable in any fixture** — step-4 Side-effect: "manifest 文件写入(阶段字段原位替换;原缺失时创建最小 manifest)", yet every step-4 outcome seeds ManifestFile min_count 1 (success: "原位替换的观察基线"; unreadable variant: corrupted content present). The create-minimal-manifest branch is real behavior named in the contract with no outcome or fixture variant that could ever trigger it. Must improve: add a fixture variant (ManifestFile absent) for the success outcome or a boundary outcome exercising the branch — otherwise drop the branch from the Side-effect wording to keep dimensions testable as declared.

---

## Attack List (for reviser)

1. **Precondition Exclusivity**: step-4 `success` omits manifest parseability while `manifest-unreadable-rejected` triggers on "manifest 阶段头部不可解析(损坏 YAML);当前阶段总结即便在场" — add "manifest 阶段头部可解析" to success preconditions (or state the check precedence); same pattern for step-6 `success` vs `host-channel-unavailable` ("宿主会话通道不可用" is never excluded by success's preconditions).
2. **Semantic Purity**: step-6 Output embeds verification instructions — "断言载体 = 派发行记录(prompt_hash = 组合消息 sha256)与会话首条组合消息,经任务详情侧板派发记录读取" — split the carrier/read-path into a fixture or test-channel note and keep the Output user-observable; also residual path templates ("features/<slug>/stages/<当前阶段>.md 不存在") and event/row register ("偏离事件(deviation_detected)推送", "受影响派发行进入 failed 态").
3. **Fact Alignment**: step-3 internal-channel ≤5s claim cites BIZ-workbench-005 whose scope is task changes — mark the extension as inferred or cite the actual internal-channel refresh mechanism; step-5 injection-guard carries only "source: prd-spec Security(…)" — add UNKNOWN marking or a fact reference for whitelist rendering.
4. **Surface Fitness**: State fields still kernel-register ("注入指纹随派发行落库") — pair each kernel-level State with its web-observable counterpart.
5. **Internal Consistency / Fixture**: step-6 success lists "派发行记录可读取注入指纹与组合消息" as a precondition though the row is created by the outcome's own Input; Task parent_entity flips between Feature (success) and Project (host-channel) within one file; step-1 Feature min_count 1 cannot exercise "列表呈现各 feature 当前阶段".
6. **[blindspot]**: combined corrupted-manifest + gate-unsatisfied state unassigned (error precedence unspecified); step-6 carrier read path ungrounded; FT-081 create-minimal-manifest branch cited but unexercisable — see Phase 3.

---

## Outcome

Target reached — total 1056/1100 ≥ 935 with every dimension above its min threshold (lowest margin: Surface Fitness 96 ≥ 60, all others ≥ 96 vs thresholds 90–120). The iteration-1 failure driver (missing Web derived outcomes) and the annotation-discipline gap are resolved on the page; remaining deductions are localized (declared-exclusivity of the two new boundary outcomes, assertion-carrier phrasing in step-6, and three blindspot-grade gaps that do not breach thresholds).
