# Eval Report — Journey: explicit-sot-migration (Iteration 1)

- **Rubric**: journey (1150 pts, 7 dimensions, target 975, per-dimension min thresholds)
- **Surface**: web (per `surface-web.md` rule)
- **Scorer persona**: Senior QA Engineer (verification stance)
- **Document**: `docs/features/dsh-forge-m3/testing/explicit-sot-migration/journey.md`
- **Sources verified against**: `prd-user-stories.md` (Story 1), `prd-spec.md` (SC2/G2/D1/迁移线/Data Requirements/Monitoring), `prd-ui-functions.md` (UF3), `docs/proposals/dsh-forge-m3/proposal.md` (Key Scenarios, lines 65/76), business-rules (coexistence/resilience/task-operations/workbench)
- **Date**: 2026-09-24

## Verdict

**FAIL — Total 911/1150 (target ≥ 975); Surface Fitness 68/150 below its 90-pt threshold.**

Root cause of failure: the journey completely omits the Web surface's mandatory derived Outcomes (`validation-error`, `session-expired`) — neither included nor reasoned away with an N/A annotation. Per the rubric this zeroes the 60-pt Surface Fitness criterion. Secondary issues: one unclassified derived claim (Step 2b), a precondition overlap between 3b/3c, and an internally incoherent disjunct inside Step 3b.

---

## Phase 1 — Reasoning Audit (pre-score anchors)

1. **Problem → Solution: sound.** The journey operationalizes Story 1 / SC2 / UF3 / D1 faithfully. Verified: PRD Story 1 four ACs, SC2 wording, UF3 states/flow/validation rules, D1 adjudication, and proposal Key Scenarios「既有项目迁移(一次性)」(proposal L65) and「错误路径(迁移冲突:迁移时外部写入)」(proposal L76) all exist and match the journey's claims. The traceability blockquote is accurate.
2. **Solution → Evidence: mostly sound, one gap.** All five edge cases map to PRD/proposal material *except* Step 2b (cancel). Grep-verified: the only「取消」in the PRD corpus is UF1's dispatch-warning dialog (prd-ui-functions L59/L81); UF3's migration dialog defines no cancel path. 2b is an LLM-derived claim with no `source: inferred` annotation.
3. **Evidence → Success Criteria: partially weak.** Several Expected Results assert non-observable system properties ("迁移原子执行", "(SQLite 权威)", "检查项目文档树", "回查应用本地日志") — a browser-automation test cannot observe these without FS-level out-of-band checks the journey never specifies.
4. **Self-contradiction check: one found.** Step 3b's disjunct "index.json 完整在位或已淘汰且内核完整,二者其一" combined with "呈现已回滚状态 + 「重试」入口": in the second disjunct the project is *already migrated* (and Step 1 requires `index.json` detected for the entry to exist at all), so presenting a rolled-back-plus-retry state there is impossible. Not a violation of the atomicity invariant itself (the disjunct respects "迁移前完整或迁移后完整"), but a contradiction between 3b's Expected Result and Step 1's entry logic.
5. **SC/InScope-style clustering**: not applicable (journey-type document, no SC/In Scope sections); the analogous invariant-vs-step scan found item 4 above only.
6. **Mandatory surface derivations absent**: grep-confirmed — `validation-error` / `session-expired` appear nowhere in the journey, and no N/A consideration is stated.

---

## Phase 2 — Rubric Scoring

### Dimension 1: Completeness — 173/200 (threshold 120, PASS)

| Criterion | Score | Justification |
|---|---|---|
| Metadata complete | 50/50 | `journey: "explicit-sot-migration"` kebab-case ✓; `risk_level: "High"` valid and justified by content — the journey itself states "迁移含不可逆文件淘汰,不得以生产仓为承载" (irreversible operation ⇒ High per the doc's own classification criteria). Sources + generated date present. |
| Steps complete (name/action/outcome) | 78/80 | All 9 steps (4 happy + 5 edge) have User Action + Expected Result; edge steps all carry Preconditions; numbering gives a coherent order. −2: Step 3's action "观察迁移进度浮层直至完成" is passive observation rather than a driving action, and Step 2's Expected Result states the guard ("仅在显式确认后才进入执行") but not the post-confirm transition state (progress overlay appears) — the step boundary relies on inference by the downstream agent. |
| Happy + required derived outcomes | 45/70 | Boundary coverage beyond happy path is genuinely strong (cancel, interrupt/rollback/retry, external-write conflict, wizard variant, log audit — 5 edge outcomes). However the Web surface's mandatory derived Outcomes are entirely absent: no `validation-error` outcome and no `session-expired` outcome appear anywhere, nor any stated N/A reasoning. Additionally missing failure-mode boundaries: Setup assumes "数据内核(SQLite)可用" and a parseable `index.json` — no outcome covers corrupt/unreadable index.json or kernel-unavailable at initiation. |

### Dimension 2: Semantic Purity — 189/200 (threshold 120, PASS)

| Criterion | Score | Justification |
|---|---|---|
| Natural-language outcomes | 75/80 | No regex, selectors, or framework assertions anywhere. Outcomes describe what the user/system observes. −5: implementation coupling leaks in — "任务看板正常承载全部任务(SQLite 权威)" names the storage engine (not user-observable) inside an Expected Result; "迁移原子执行" asserts a system property rather than an observation. |
| Declarative preconditions | 55/60 | Edge-case preconditions are declarative states ("迁移确认对话框呈现中", "迁移已完成(或已失败回滚)") ✓. −5: Setup mixes in procedural fixture instructions — "迁移发起前记录任务全集基线(ID/状态/依赖/标题)用于对拍" is an action to perform, and "测试承载 = 一次性 fixture 项目...不得以生产仓为承载" is test-policy commentary, not a state declaration. |
| No implementation coupling in steps | 59/60 | Steps are user-level (点击/查看/检查/回查); no API calls, queries, or internals. −1: Step 4c "回查应用本地日志" and Step 4 "检查项目文档树" direct the user outside the application UI surface (file system), straddling the user-action/system-probe boundary. |

### Dimension 3: Precondition Exclusivity — 119/150 (threshold 90, PASS)

| Criterion | Score | Justification |
|---|---|---|
| Preconditions distinct across outcomes | 40/60 | One ambiguous pair (−20 per deduction rules): **3b vs 3c**. 3b: "迁移执行中中断(应用被杀/崩溃)**或迁移失败**"; 3c: "迁移执行期间外部写者(终端 CLI/外部会话)改动任务数据" with expected result "迁移失败并回滚至干净态". A conflict-induced failure satisfies both preconditions simultaneously — the generic "或迁移失败" clause in 3b subsumes 3c's trigger, so given that state two outcomes apply. |
| Preconditions sufficient to uniquely select | 42/50 | Same 3b/3c pair cannot be uniquely resolved (cause-based distinction is implied but the 3b text swallows all failure causes). Happy-path steps carry no per-step preconditions (rely on global Setup), acceptable in this format but it leaves state selection implicit at each branch point. |
| No missing preconditions for error/boundary outcomes | 37/40 | All five boundary steps state their trigger ✓ (2b dialog present, 3b interrupt/failure, 3c external writer, 4b wizard context, 4c completed/rolled-back). −3: 3b's "或迁移失败" enumerates no failure taxonomy (which failure modes? corrupt source? kernel fault?) and 3c does not specify when in the migration window the external write occurs (detection is asserted regardless of phase). |

### Dimension 4: Fact Alignment — 93/150 (threshold 90, PASS — barely)

| Criterion | Score | Justification |
|---|---|---|
| Factual claims traceable | 48/60 | Journey-level traceability blockquote ("Story 1;SC2;UF3;D1;proposal Key Scenarios...") exists and **every** PRD-grounded claim verifies against the cited sources (三要素 dialog, 校验/迁移/对拍/完成 progress enum, 备份位置可见, md 留存, 向导步骤②后插入, 日志可回查, 回滚重试零半迁移态). −12: no per-claim anchoring scheme — outcomes assert specific behavior (e.g., "进度按 校验/迁移/对拍/完成 呈现") with no per-item fact reference, relying on the reader to re-derive from three source documents. |
| Inferred claims have rule support + `source: inferred` | 35/50 | Good practice exists in exactly one place: Step 3c carries `<!-- source: proposal 错误路径(迁移冲突:迁移时外部写入)检测与重试 -->`. But: Step 2b is an unannotated derivation (no PRD text grounds a migration-dialog cancel); and **zero** outcomes cite a Web `required_outcomes` rule or carry `source: inferred` — the two mechanisms the rubric requires for derived boundaries are essentially unused. |
| No unclassified (hallucinated) claims | 10/40 | −30 per explicit deduction rule for one unclassified claim: Step 2b "**Expected Result**: 不执行任何迁移;项目状态与文件零变化;迁移入口仍在,可再次发起". Verified: UF3 defines no cancel for the migration dialog (the PRD's only「取消」is UF1's dispatch warning, prd-ui-functions L59/L81); the claim is neither factual-with-traceability nor inferred-with-rule-support. All other behavioral claims verified factual against PRD/proposal — no fabricated behavior found. |

### Dimension 5: Surface Fitness — 68/150 (threshold 90, **FAIL**)

| Criterion | Score | Justification |
|---|---|---|
| Mandatory derived Outcomes present | **0/60** | `surface-web.md` mandates `validation-error` + `session-expired` "must be considered for every Web Journey". Grep-confirmed: neither string (nor any equivalent scenario) appears in the document, and no N/A consideration is stated. Rubric instruction: "Score 0 if mandatory Outcomes are completely absent." Even a one-line annotation (e.g., "session-expired: N/A — 离线桌面壳无会话过期语义") would have constituted consideration; the document is silent. This single omission is the journey's failing defect. |
| Test strategy proportions (Web 50/50) | 42/50 | Outcome density is good: 9 steps with contract-level granularity embedded in journey flow (dialog 三要素, progress enum, per-state displays). Depth is journey-leaning but contract details are present inside outcomes. |
| Realistic web execution assumptions | 26/40 | Async handling is done right (Step 3 progress overlay "观察迁移进度浮层直至完成", phase-wise progress). But several outcomes are not browser-observable: Step 4 "检查项目文档树" + "项目文档树内 `tasks/index.json` 不存在" and Step 4c "回查应用本地日志" require file-system access outside the automated browser context, with no UI-proxy specified (UF3 does define a `done` state display "对拍结果 + index.json 已淘汰" the journey could have referenced); "迁移原子执行"/"零半迁移态" are system properties with no stated observation channel. |

### Dimension 6: Internal Consistency — 132/150 (threshold 90, PASS)

| Criterion | Score | Justification |
|---|---|---|
| Invariants hold in every step | 50/60 | The four invariants (显式触发/原子性/md 不迁移/对拍+日志) are respected by all steps — no step performs a silent migration or touches md. −10: Step 3b's Expected Result pairs "无半迁移态(index.json 完整在位**或已淘汰且内核完整**,二者其一)" with "呈现**已回滚状态** + 「重试」入口". In the second disjunct the migration has effectively succeeded (index.json eliminated, kernel complete) — presenting a rolled-back-plus-retry state contradicts both the rollback semantics and the journey's own completion invariant ("完成后 index.json 终态淘汰"). The disjunct conflates crash-before-commit with crash-after-commit under one UI presentation. |
| Cross-step references consistent | 42/50 | Step numbering (2b/3b/3c/4b/4c) anchors cleanly to happy-path positions; Step 3's 对拍 references the Setup baseline unambiguously; Step 4's "「可迁移」入口消失" is consistent with Step 1's detection-based entry. −8: the 3b second disjunct also breaks cross-step logic — retry requires the entry, the entry requires "检出 index.json" (Step 1), and an eliminated index.json cannot re-present a retry entry. |
| Risk level consistent with content | 40/40 | High is correct: the workflow's core act is irreversible file elimination ("index.json 终态淘汰") plus state migration — data-loss-risk territory. |

### Dimension 7: Workflow Coverage — 137/150 (threshold 90, PASS; veto NOT triggered)

| Criterion | Score | Justification |
|---|---|---|
| Golden Path existence (veto) | 55/60 | Semantic verification performed: Happy Path Steps 1→4 (发现入口 → 确认 → 原子迁移+对拍 → 终态确认) is a contiguous 4-step sequence matching PRD Story 1 and the spec's 迁移线 ("已注册且检出 tasks/index.json 的项目在工作台呈现迁移入口 → 显式确认 → 原子迁移 → 对拍 → index.json 淘汰"). Steps are domain-level user operations. Veto not triggered. −5: frontmatter declares `golden_path: false` while the body contains a qualifying golden path — a downstream consumer filtering on that flag would wrongly conclude this journey lacks a golden path (sibling `task-dispatch-execution-loop` carries `golden_path: true`, suggesting a per-feature designation convention, but the document never explains the flag's semantics). |
| Multi-step coverage depth | 45/50 | Strong: state machine (pre-migration → migrating → migrated / rolled-back), error recovery (3b retry loop), alternative entry path (4b wizard), concurrency boundary (3c), post-hoc audit (4c), negative presentation (Step 1's non-detection clause). Cross-entity: project + kernel + file tree. |
| Completeness vs PRD scope | 37/40 | Story 1's four ACs all covered (AC1→Steps 1-4, AC2→3b, AC3→Step 4, AC4→4b); spec's "新注册项目直接 SQLite(无 index.json 摄入)" reflected in Step 1's negative clause. −3: AC2's "从备份恢复" (restore **from backup**) is only behaviorally implied by 3b's "已回滚状态" — no outcome explicitly exercises restore-from-backup semantics. Other stories are covered by the seven sibling journeys (set-wide division of labor verified). |

---

## Score Summary

| Dimension | Score | Threshold | Status |
|---|---|---|---|
| 1. Completeness | 173/200 | 120 | PASS |
| 2. Semantic Purity | 189/200 | 120 | PASS |
| 3. Precondition Exclusivity | 119/150 | 90 | PASS |
| 4. Fact Alignment | 93/150 | 90 | PASS (margin 3) |
| 5. Surface Fitness | **68/150** | **90** | **FAIL** |
| 6. Internal Consistency | 132/150 | 90 | PASS |
| 7. Workflow Coverage | 137/150 | 90 | PASS |
| **Total** | **911/1150** | **975** | **FAIL** |

## Deduction Ledger

| Rule | Instances | Applied |
|---|---|---|
| Mandatory outcomes absent → Surface criterion 1 = 0 | 1 (both validation-error and session-expired) | −60 effective (Surface Fitness) |
| Unclassified claim −30 | 1 (Step 2b) | Fact Alignment C 40→10 |
| Precondition overlap −20/pair | 1 pair (3b/3c) | Precondition Exclusivity A 60→40 |
| Invariant violation −40 | 0 (3b issue is presentation-level contradiction, not an invariant breach) | — |
| Surface-type violation −25 | 0 (no CLI-style assertions present) | — |
| Golden Path veto | not triggered | — |

---

## Phase 3 — Blindspot Hunt

1. `[blindspot]` **Backup artifact lifecycle never verified.** The journey's safety net is the auto-backup ("迁移前自动备份", "备份位置在结果中可见") and 3b presumes rollback works, but no outcome ever asserts the backup artifact itself — that it exists after migration, is restorable, or what its retention/cleanup policy is (is it deleted after success? does it leak task data into an untracked location?). For a High-risk irreversible-migration journey, the one artifact that makes the operation reversible is itself untested. *Reasoning audit flagged this independently of dimension scoring.*
2. `[blindspot]` **Step 3c may be unexecutable by a downstream test agent.** Precondition "迁移执行期间外部写者(终端 CLI/外部会话)改动任务数据" requires interleaving an external write inside a window that an atomic migration is specifically designed to make as short as possible. Without a specified fault-injection mechanism (e.g., a delay hook, a held lock, or a staged migration phase), an automated e2e cannot reliably hit this window; the step as written risks being skipped or flaky. The journey should state the injection mechanism or relax timing (e.g., "外部写入发生于迁移校验阶段" with a deterministic pause).

## Attack List (for reviser)

1. **[Surface Fitness]** Mandatory Web derived Outcomes completely absent — document contains only Steps 2b/3b/3c/4b/4c under "## Edge Cases"; grep for `validation-error`/`session-expired` returns nothing — add both derived outcomes or explicit N/A annotations with reasoning (e.g., session-expired N/A: 离线桌面壳无登录会话;validation-error scope: 无自由输入字段,但可派生 index.json 损坏/不可读的校验边界).
2. **[Fact Alignment]** Unclassified derived claim in Step 2b — "点击取消 ... 不执行任何迁移;项目状态与文件零变化;迁移入口仍在,可再次发起" — UF3 defines no cancel for the migration dialog (only UF1's dispatch warning has one); annotate `source: inferred` with rule basis or extend the source list with a grounding document.
3. **[Precondition Exclusivity]** 3b/3c precondition overlap — 3b "迁移执行中中断(应用被杀/崩溃)或迁移失败" vs 3c "迁移执行期间外部写者(终端 CLI/外部会话)改动任务数据" — a conflict-induced failure matches both; narrow 3b's trigger (e.g., "非冲突性失败:应用被杀/崩溃") or restructure as same-step branched outcomes with disjoint causes.
4. **[Internal Consistency]** Step 3b second disjunct incoherent — "index.json 完整在位或已淘汰且内核完整,二者其一" paired with "呈现已回滚状态 + 「重试」入口" — crash-after-commit is a success-terminal state that cannot present rollback+retry (and Step 1's entry requires index.json detected); split into distinct outcomes (rollback-then-retry vs effectively-completed).
5. **[Completeness]** Missing failure-mode boundaries — Setup presupposes "数据内核(SQLite)可用" and a well-formed index.json — add boundary outcomes for corrupt/unreadable index.json and kernel-unavailable at initiation.
6. **[Surface Fitness]** Non-browser-observable outcomes — Step 4 "检查项目文档树" / "项目文档树内 `tasks/index.json` 不存在"; Step 4c "回查应用本地日志" — specify UI-observable proxies (UF3's done-state display "对拍结果 + index.json 已淘汰") or explicitly mark these as harness-level file assertions.
7. **[Workflow Coverage]** `golden_path: false` frontmatter vs qualifying 4-step Happy Path content — document the flag's designation semantics or align it, so downstream consumers filtering on the flag do not mis-classify this journey.
8. **[Fact Alignment]** Source annotation applied to only one edge case — sole instance: `<!-- source: proposal 错误路径(迁移冲突:迁移时外部写入)检测与重试 -->` (Step 3c) — extend per-claim/per-edge-case source annotations (PRD SC2 for 3b, UF3 for 4c, Story 1 AC4 for 4b) so traceability does not depend on reader re-derivation.
9. **[blindspot]** Backup artifact never verified — "迁移前自动备份" / "备份位置在结果中可见" — add outcomes asserting backup existence, restorability, and retention policy; the irreversible-migration safety net must itself be tested.
10. **[blindspot]** 3c unrealizable under automation as written — "迁移执行期间外部写者(终端 CLI/外部会话)改动任务数据" — specify a deterministic fault-injection mechanism (phase-pinned write or delay hook) so a downstream e2e agent can reliably reach the conflict window.
