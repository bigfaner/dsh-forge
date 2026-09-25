# Eval Report — Journey: explicit-sot-migration (Iteration 2)

- **Rubric**: journey (1150 pts, 7 dimensions, target 975, per-dimension min thresholds)
- **Surface**: web (per `surface-web.md` rule)
- **Scorer persona**: Senior QA Engineer (verification stance)
- **Document**: `docs/features/dsh-forge-m3/testing/explicit-sot-migration/journey.md` (post-revision)
- **Sources verified against**: `prd-user-stories.md` (Story 1 AC1-AC4), `prd-spec.md` (SC2/G2/D1/迁移线/Data Requirements/Monitoring/Performance), `prd-ui-functions.md` (UF3 states/flow/data/validation), `design/tech-design.md` (Interface 4 migration pipeline L156-165, Error table, storage L199), `docs/proposals/dsh-forge-m3/proposal.md` (L65/L76), business-rules (coexistence/resilience/task-operations/workbench/privacy)
- **Date**: 2026-09-25

## Revision Intake (iteration-1 attack → current page)

| Iteration-1 attack | Addressed on current page? |
|---|---|
| 1. Mandatory Web derived Outcomes absent | **Yes** — Step 3d materializes `validation-error` (mapping annotation + scenario); Step 2c carries `session-expired` N/A reasoning + analogous carrier (kernel unavailable). |
| 2. Unclassified derived claim (Step 2b) | **Yes** — `<!-- source: inferred: UF3 Validation Rules...推演——取消即未确认...(UF3 未显式定义取消路径) -->`. |
| 3. 3b/3c precondition overlap | **Yes** — 3b now states "仅此成因——外部写入冲突所致失败归 Step 3c,二者成因互斥". |
| 4. 3b second-disjunct incoherence | **Yes** — 3b split into binary outcomes (提交前 → rollback+retry; 提交后 → equivalent-success terminal, no retry presentation). |
| 5. Missing failure-mode boundaries | **Yes** — 2c (kernel unavailable) and 3d (corrupt index.json) added. |
| 6. Non-browser-observable outcomes | **Yes** — Setup 断言口径 line + per-step "harness 级" markers. |
| 7. `golden_path: false` unexplained | **Yes** — comment below frontmatter documents the per-feature designation convention. |
| 8. Source annotations only on 3c | **Yes** — every edge step now carries a source annotation; Setup cites tech-design for the backup path. |
| 9. Backup artifact never verified | **Mostly** — Step 3 asserts backup presence + content; 3b asserts 恢复锚点 在场; invariant 5 asserts presence in both terminal states and explicitly disclaims retention policy. Restore-from-backup as an *executed operation* still only implied. |
| 10. 3c unexecutable under automation | **Yes for 3c** — deterministic injection window pinned ("于摄入完成后、提交前经测试通道...注入一次外部写"). **Not for 3b** — same determinism problem remains there (see Dimension 5). |

Per HARD-RULE, no points are awarded for improvement itself; only the current page is scored.

---

## Phase 1 — Reasoning Audit (pre-score anchors)

1. **Problem → Solution: sound.** The journey operationalizes Story 1 / SC2 / UF3 / D1 and the proposal's migration Key Scenarios. Verified against all cited sources; the traceability blockquote is accurate.
2. **Solution → Evidence: sound with two residual risks.** (a) Design-level facts check out: backup dir `<userData>/workbench/backups/<projectId>-<ts>/` and content "库文件 + 文档树 tasks/ 拷贝" (tech-design L159), archive rename `index.json.migrated-<ts>` (tech-design L163) — both match the journey. (b) 3d's phase claim "迁移终止于校验阶段" is an inference whose cited basis (UF3 enum first phase = 校验) does not establish that source parsing occurs pre-ingest; the kernel pipeline (①守卫 ②备份 ③摄入) has no explicit source-validation phase, so detection plausibly lands at 摄入 (UI-phase 迁移). Classified as inferred, so not a hallucination — but over-pinned.
3. **Evidence → Success Criteria: strong.** Assertion channels are now declared (browser-face vs harness 级), resolving iteration 1's observability objection. Residual: 3c's retry asserts "可重试成功" without stating whether the retry's 对拍 baseline resets to the externally-modified source.
4. **Self-contradiction check — two wrinkles found (both introduced/newly-exposed by the revision):**
   - **Invariant 5 vs Steps 2c/3d.** Invariant: "备份工件于完成态与失败回滚态均在结果所示位置在场". Step 2c's Expected Result literally presents "失败回滚状态" — but its precondition (kernel unavailable *at initiation*, "零摄入/淘汰即失败") means migration execution never ran, so no backup can exist. 3d terminates "于校验阶段" — whether that precedes the 备份 step is unstated. The invariant's parenthetical "(断言见 Step 3/3b)" suggests intended scope is only the states where backup ran, but the term 失败回滚态 is used generically and 2c uses the same phrase for a state where backup cannot exist. Ambiguity on the page; a downstream agent cannot decide whether to assert backup presence in 2c/3d.
   - **Invariant 4 vs 3b post-commit branch.** Invariant 4: "完成态必呈对拍结论". 3b's 提交后中断 outcome asserts "概览页无迁移入口,看板承载全部任务,事件与对拍结果经日志可回查(见 4c)" — logs only, no UI presentation of 对拍结论 after restart. Whether the post-crash completion satisfies "完成态必呈对拍结论" is unspecified.
5. **Precondition exclusivity re-check (revision delta):** 3b/3c now cause-exclusive (declared 互斥); 3b's internal binary (提交前/提交后) is explicitly exhaustive ("无第三态"). No ambiguous pair remains at the trigger level.
6. **Mandatory surface derivations:** both considered with explicit mapping annotations (2c: session-expired N/A + analog; 3d: validation-error materialized). Not absent → no zero-score condition.

---

## Phase 2 — Rubric Scoring

### Dimension 1: Completeness — 192/200 (threshold 120, PASS)

| Criterion | Score | Justification |
|---|---|---|
| Metadata complete | 50/50 | `journey: "explicit-sot-migration"` kebab-case ✓; `risk_level: "High"` valid and justified (irreversible index.json elimination — matches the doc's own High criteria); sources, date, surface_types present; golden_path semantics documented by comment. |
| Steps complete (name/action/outcome) | 77/80 | All 9 steps have User Action + Expected Result; edge steps carry Preconditions; numbering anchors a coherent order; 3b's two branch outcomes are properly labeled. −2: Step 3's action "观察迁移进度浮层直至完成" is passive observation, not a driving action. −1: Step 2's Expected Result states the confirm guard ("仅在显式确认后才进入执行") but never states the post-confirm transition (progress overlay appears) — the 2→3 boundary relies on downstream inference. |
| Happy + required derived outcomes | 65/70 | Web mandatory derived Outcomes now present and materialized (3d = validation-error analog with block + error + correct-and-retry; 2c = session-expired N/A + analog carrier). Boundary coverage is rich: cancel, kernel-unavailable, interrupt binary, external conflict (deterministic window), corrupt source, wizard variant, log audit, negative entry clause. −2: 3c's "提示后可重试成功" does not state whether the retry's 对拍 baseline resets to the externally-modified source — ambiguous for the asserting agent. −2: migrating-state re-entry/navigation-away presentation unspecified (user navigates away mid-migration and returns — surface navigation-guard analog; only app-kill is covered, by 3b). −1: failure-state presentation of backup location in 2c/3d unspecified (see D6 wrinkle). |

### Dimension 2: Semantic Purity — 190/200 (threshold 120, PASS)

| Criterion | Score | Justification |
|---|---|---|
| Natural-language outcomes | 77/80 | No regex, selectors, or framework assertions. The iteration-1 leak "(SQLite 权威)" inside an Expected Result is gone (now lives in Invariants, where system guarantees belong). −3: Step 3's Expected Result embeds meta-language — "原子性观察通道 = 终态二值呈现(见 3b 分支)" is a pointer to where atomicity is observable, not itself an observation; and "内容 = 迁移前库文件 + 文档树 `tasks/` 拷贝" asserts file-level internals inside a user-facing outcome (mitigated by the explicit "harness 级断言" marker). |
| Declarative preconditions | 55/60 | Edge Preconditions are declarative states ✓. −5: Setup still mixes procedural/policy content into the global precondition — "迁移发起前记录任务全集基线(ID/状态/依赖/标题)用于对拍" is an action to perform; "测试承载 = 一次性 fixture 项目,迁移含不可逆文件淘汰,不得以生产仓为承载" is test-policy commentary. |
| No implementation coupling in steps | 58/60 | Steps remain user-level; harness probes are now explicitly marked ("经测试通道检查项目文档树(harness 级)"), which was the remedy iteration 1 offered. −2: Step 3's meta pointer (above) and Step 2c/3d preconditions embedding test mechanics ("经测试通道注入") — acceptable as the demanded injection mechanism, but the mechanics sit inside declarative preconditions rather than beside them. |

### Dimension 3: Precondition Exclusivity — 140/150 (threshold 90, PASS)

| Criterion | Score | Justification |
|---|---|---|
| Preconditions distinct across outcomes | 57/60 | The 3b/3c overlap is resolved by declared cause-exclusivity; 3b's internal binary is exhaustive. −2: Step 1 packs two complementary outcomes into one line ("检出 index.json 的已注册项目呈现...;未检出 index.json 的项目不呈现迁移入口") without precondition-labeled outcomes — the discriminator is inferable but not structured. −1: 2c bundles two fault modes ("库文件打开失败/损坏") into one outcome without stating the presentation is identical for both. |
| Preconditions sufficient to uniquely select | 44/50 | Trigger-level uniqueness now holds everywhere. −4: 4c's disjunctive precondition "迁移已完成(或已失败回滚)" does not gate its Expected Result's item list — "本地日志含迁移事件(备份位置/对拍结果/失败原因)逐项可查" expects a 失败原因 on the success branch, where none exists; given the precondition, the expected content is not determined. −2: 3c's "回滚至干净态" — "干净态" is used exactly once and never defined (inferable from the atomicity invariant as 迁移前完整, but the asserting agent must re-derive what to check: index.json 在位? baseline 一致? md untouched?). |
| No missing preconditions for error/boundary outcomes | 39/40 | All boundary steps state their trigger; 3c additionally pins the deterministic injection window; 3d states the detection stage; 3b declares commit-point unknownness. −1: 2c's two trigger modes (open-failure vs corrupt db) may present differently; unstated. |

### Dimension 4: Fact Alignment — 140/150 (threshold 90, PASS)

| Criterion | Score | Justification |
|---|---|---|
| Factual claims traceable | 56/60 | Journey-level traceability blockquote + per-edge-step source annotations now present. Independently verified against sources: progress enum "校验/迁移/对拍/完成" = UF3 Data Requirements verbatim; dialog 三要素 = UF3 flow step 2; done/failed-rolled-back presentations = UF3 States; md 留存/index.json 淘汰 = SC2; wizard insertion = Story 1 AC4 + UF3 Placement; log 回查 = UF3 Validation Rules + prd-spec Monitoring; backup path and content = tech-design L159; 备份位置结果可见 = UF3 Data Requirements. −4: happy-path Steps 1-4 carry no per-step annotations (blockquote only), and Step 4's archive-name fact "(归档为 `index.json.migrated-<ts>`)" has no source annotation — the Setup annotation covers only the backup-directory claim (verified true against tech-design L163, so not a hallucination, but traceability is uneven). |
| Inferred claims have rule support + `source: inferred` | 44/50 | All three derivations (2b, 2c, 3d) carry both a reasoning basis and `source: inferred`, plus surface-mapping annotations where applicable. −6: 3d's inference is over-pinned — "迁移终止于校验阶段...检出发生于校验阶段" asserts a specific phase, but the cited basis (UF3 进度首阶段 = 校验 + 原子性) establishes only that invalid source must be blocked before 淘汰, not that parsing happens in the 校验 phase; the kernel pipeline (①守卫 ②备份 ③摄入) contains no pre-ingest source-validation step, so detection plausibly occurs during 摄入 (UI-phase 迁移). The inference should assert the invariant (零摄入/原样在位) and leave the phase unpinned or verify it against implementation. |
| No hallucinated unclassified claims | 40/40 | Every behavioral assertion on the page was checked: each is either PRD/proposal/design-grounded (verified true) or annotated `source: inferred` with basis. Invariant 5's closing disclaimer ("备份保留/清理策略 PRD 未定界,不作断言") is exemplary non-assertion hygiene. No unclassified fabricated behavior found. |

### Dimension 5: Surface Fitness — 134/150 (threshold 90, PASS)

| Criterion | Score | Justification |
|---|---|---|
| Mandatory derived Outcomes present | 56/60 | Both mandatory outcomes are now considered: 3d materializes validation-error's assert pattern (block + field-relevant error + correct-and-retry) adapted to the source-validation surface; 2c documents session-expired N/A ("离线桌面壳无登录会话语义(N/A)" — consistent with the offline/no-login product reality) plus an analogous availability-failure carrier with non-silent handling. The zero-score condition is lifted. −4: the mappings exist only as HTML comments anchored to individual steps — there is no surface-coverage declaration, so an aggregator scanning for canonical outcome names must parse comments; 2c's two annotations (surface mapping + source inference) also interleave two distinct justification kinds on one step. |
| Test strategy proportions (Web 50/50) | 46/50 | Contract-level detail is embedded in journey flow: dialog 三要素 (Step 2), progress enum (Step 3), binary terminal presentations (3b), entry presence/absence (Steps 1/4), per-state display expectations. −4: browser-face contract density is thinner than harness density — e.g., the confirming state asserts only content presence (三要素), no interaction-contract assertions (confirm control states, dialog dismissibility) on the browser face. |
| Realistic web execution assumptions | 32/40 | Browser interaction, async progress handling, and assertion channels are realistic for an Electron shell driven by automation; 3c's deterministic injection window is exactly what iteration 1 demanded. −6: 3b asserts both crash branches ("中断时点相对迁移提交未知(提交前/提交后均可能)") with distinct expected outcomes, but no deterministic mechanism is given for controlling crash timing relative to commit — hitting 提交后中断 reliably requires a phase-pinned kill hook; as written the second branch is as flaky as 3c was before its fix. −2: the Setup fixture is explicitly one-shot ("一次性 fixture 项目" — migration consumes index.json), but per-run fixture regeneration/reset is never stated; a downstream e2e suite re-running this journey needs the reset contract. |

### Dimension 6: Internal Consistency — 134/150 (threshold 90, PASS)

| Criterion | Score | Justification |
|---|---|---|
| Invariants hold in every step | 50/60 | Invariants 1-4 hold across all steps (no silent migration anywhere; 3b binary honors atomicity; md untouched everywhere; 对拍+日志 asserted). −10 on invariant 5: "备份工件于完成态与失败回滚态均在结果所示位置在场" collides with Step 2c, which by the journey's own words presents "失败回滚状态" out of a precondition ("发起迁移时数据内核不可用...零摄入/淘汰即失败") in which migration execution — and therefore the backup step — never ran; 3d's 校验-stage termination has the same unstated ordering vs 备份. Treated as a scope ambiguity rather than a −40 violation because the parenthetical "(断言见 Step 3/3b)" signals a narrower intended scope — but as written, a test agent cannot decide whether 2c/3d must show a backup location. Requires explicit delineation. |
| Cross-step references consistent | 44/50 | References resolve cleanly: 3b → Setup 基线 ✓, 3b → "Step 3 备份" ✓, 3b → 4c ✓, Step 3 → 3b ✓, Step 4 entry-disappearance ↔ Step 1 detection ✓, 3b post-commit "无迁移入口" consistent with Step 1 ✓. −4: 4c's precondition "迁移已完成(或已失败回滚)" loosely spans 2c/3d-style failures whose log content differs from the asserted item list (scored in D3; manifests here as reference looseness). −2: 3b's post-commit branch asserts log-based recovery only, while invariant 4 demands "完成态必呈对拍结论" — whether a post-crash-restart UI presentation of 对拍结论 exists is unspecified. |
| Risk level consistent with content | 40/40 | High is correct: irreversible file elimination + full-state migration (data-loss territory). |

### Dimension 7: Workflow Coverage — 136/150 (threshold 90, PASS; veto NOT triggered)

| Criterion | Score | Justification |
|---|---|---|
| Golden Path existence (veto) | 58/60 | Semantic verification performed: Happy Path Steps 1→4 (发现入口 → 确认 → 迁移+对拍 → 终态确认) is a contiguous 4-step domain-level sequence matching PRD Story 1 AC1 and the spec's 迁移线 ("呈现迁移入口 → 显式确认 → 原子迁移 → 对拍 → index.json 淘汰"). Veto not triggered. −2: the golden_path flag semantics are documented only in an HTML comment — machine consumers filtering on frontmatter alone still see `false`; the convention deserves a frontmatter-visible or set-level explanation. |
| Multi-step coverage depth | 48/50 | Strong: full state machine (migratable/confirming/migrating/done/failed-rolled-back), error recovery loops (2c/3b/3c/3d retries), alternative entry (4b wizard), post-hoc audit (4c), negative presentation (Step 1), binary crash outcomes. −2: the one cross-entity interaction the design defines for this workflow — migration vs in-flight orchestration (see criterion C) — is absent, so cross-entity depth relies on board/kernel only. |
| Workflow completeness vs PRD/Design scope | 30/40 | Story 1's four ACs covered (AC1→Steps 1-4, AC2→3b, AC3→Step 4, AC4→4b). −3: AC2's "从备份恢复" remains behaviorally implied — backup presence is asserted (Step 3/3b) and the design's rollback mechanism is "整体回滚备份", but no outcome executes and verifies a restore-from-backup (restore fidelity: task set = baseline *after restore*, md tree intact) — and 3c's verification anchor "干净态" is undefined, weakening exactly the assertion that would prove restore correctness. −5: the design's migration guard branch is entirely uncovered — tech-design Interface 4 step 1: "守卫:`dispatch.ended_at IS NULL` 计数 >0 → `ERR_MIGRATION_GUARD`(UI 列在跑清单)" + error table "守卫对话框(在跑清单)" is a user-visible migration-blocking workflow absent from the journey. −2: wizard 稍后/decline branch uncovered — design step 8 defines "(立即/稍后)" options; 4b covers 立即 only, and the decline→registered-but-files-authority state (later reachable via Step 1's entry) is never exercised. |

---

## Score Summary

| Dimension | Score | Threshold | Status |
|---|---|---|---|
| 1. Completeness | 192/200 | 120 | PASS |
| 2. Semantic Purity | 190/200 | 120 | PASS |
| 3. Precondition Exclusivity | 140/150 | 90 | PASS |
| 4. Fact Alignment | 140/150 | 90 | PASS |
| 5. Surface Fitness | 134/150 | 90 | PASS |
| 6. Internal Consistency | 134/150 | 90 | PASS |
| 7. Workflow Coverage | 136/150 | 90 | PASS |
| **Total** | **1066/1150** | **975** | **PASS** |

## Deduction Ledger

| Rule | Instances | Applied |
|---|---|---|
| Mandatory outcomes absent → Surface criterion 1 = 0 | 0 (both considered with mappings) | — |
| Unclassified claim −30 | 0 | — |
| Precondition overlap −20/pair | 0 pairs (3b/3c exclusivity now declared) | — |
| Invariant violation −40 | 0 applied (invariant-5 vs 2c/3d treated as scope ambiguity requiring clarification; −10 in D6) | — |
| Surface-type violation −25 | 0 | — |
| Golden Path veto | not triggered | — |

---

## Phase 3 — Blindspot Hunt

1. `[blindspot]` **The "测试通道" is load-bearing but has no contract.** The journey's entire fault-injection and harness-assertion strategy depends on an undefined capability: "内核/源数据/外部写故障注入经测试通道(见 Step 2c/3c/3d)". 3c's window ("于摄入完成后、提交前") requires kernel-internal phase hooks that must be *built* as testability features; 2c requires injecting kernel unavailability; harness assertions require reading logs/backups out-of-band. None of this is specified or even referenced to an existing harness precedent (e.g., the M2 e2e channel stub / acceptance scripts). A downstream gen-test-scripts agent cannot know whether these channels exist or must be implemented. Must improve: define or reference the test-channel contract (injection points, phase hooks, read APIs), or mark each injection as a build-required testability prerequisite.
2. `[blindspot]` **Exact-string UI assertions vs bilingual product.** prd-spec Compatibility requires "工作台 UI 中英双语", yet every browser-face assertion pins zh-CN strings verbatim — "呈现「可迁移」标识与「迁移到 M3 内核」入口", "「重试」入口", "「迁移到 M3 内核」". If the shell runs under a non-zh locale, every such assertion fails for reasons unrelated to behavior. No dimension covers locale coupling. Must improve: state locale pinning for the test environment or use locale-agnostic anchors (state identifiers/data-testid semantics) for UI-text assertions.
3. `[blindspot]` **对拍 field set silently omits inferred fields.** The comparison asserts "任务全集(ID/状态/依赖/标题)与迁移前零差异" — faithfully mirroring G2/SC2 — but the design's ingest step also synthesizes/infer fields beyond that set (tech-design L160: "限定地址合成...+ `task_type`/`desc_path` 推断"). Inference defects in those fields escape every assertion in this journey and surface later at dispatch time (wrong protocol selection). The journey never acknowledges the field-set boundary. Must improve: note explicitly that task_type/desc_path inference is outside the 对拍 field set (PRD-scoped), or add one assertion touching them (e.g., board renders task types for sampled tasks), so the omission is a documented decision rather than a silent hole.

## Attack List (for reviser)

1. **[Internal Consistency]** Invariant 5 backup-presence scope collides with 2c/3d — "备份工件于完成态与失败回滚态均在结果所示位置在场" vs 2c "零摄入/淘汰即失败,呈现失败回滚状态" (no backup can exist when the kernel never started) — delineate which failure states carry backups (e.g., "已开始执行的失败态" vs "未启动即失败"), and state whether 3d's 校验-stage termination precedes or follows 备份.
2. **[Surface Fitness]** 3b asserts both crash branches without a deterministic timing mechanism — "中断时点相对迁移提交未知(提交前/提交后均可能)" — provide the same class of phase-pinned hook 3c received, else the 提交后 branch is untestable/non-deterministic under automation.
3. **[Precondition Exclusivity]** 4c's disjunction does not gate its log-item list — "迁移已完成(或已失败回滚)" vs "本地日志含迁移事件(备份位置/对拍结果/失败原因)逐项可查" — branch the expected items (success: 备份位置/对拍结果; failure: + 失败原因).
4. **[Fact Alignment]** 3d over-pins the detection phase — "迁移终止于校验阶段...检出发生于校验阶段" — the cited rules establish zero-ingest, not the phase; assert the invariant (零摄入/原样在位) and leave the phase open, or ground it against the implemented pipeline.
5. **[Workflow Coverage]** ERR_MIGRATION_GUARD branch uncovered — design Interface 4 step 1 "守卫:`dispatch.ended_at IS NULL` 计数 >0 → `ERR_MIGRATION_GUARD`(UI 列在跑清单)" — add an outcome: migration initiated while a dispatch is in flight → guard dialog with in-run list, no execution.
6. **[Workflow Coverage]** Wizard decline/稍后 branch and restore-from-backup execution both uncovered — design step 8 "(立即/稍后)" vs 4b confirm-only; AC2 "从备份恢复" only implied — add the 稍后 outcome and a restore-fidelity assertion (or define "干净态" so 3c verifies the restored state concretely).
7. **[Internal Consistency]** 3b post-commit branch vs invariant 4 — "事件与对拍结果经日志可回查(见 4c)" (logs only) vs "完成态必呈对拍结论" — specify whether a post-restart UI presentation of the 对拍结论 exists.
8. **[Semantic Purity]** Setup mixes procedure/policy into the global precondition — "迁移发起前记录任务全集基线(ID/状态/依赖/标题)用于对拍" — move fixture/baseline-recording instructions to a separate preparation note so Preconditions remain declarative states.
9. **[Precondition Exclusivity]** "干净态" has an undefined referent — "迁移失败并回滚至干净态(不产生两源混合数据)" — define it (index.json 在位 + 任务全集 = Setup 基线 + md 原样) or cross-reference 3b's pre-commit terminal state.
10. **[blindspot]** Test-channel contract unspecified — "内核/源数据/外部写故障注入经测试通道(见 Step 2c/3c/3d)" — define/reference the injection and read-back contract or mark build-required testability prerequisites.
11. **[blindspot]** Locale-coupled UI string assertions vs bilingual requirement — "呈现「可迁移」标识与「迁移到 M3 内核」入口" — pin the test locale or use locale-agnostic anchors.
12. **[blindspot]** 对拍 field set omits inferred fields — "任务全集(ID/状态/依赖/标题)与迁移前零差异" — acknowledge task_type/desc_path escape verification, or add a sampled assertion.

---

**Verdict: PASS — 1066/1150 (target ≥ 975; all dimensions above threshold).**
