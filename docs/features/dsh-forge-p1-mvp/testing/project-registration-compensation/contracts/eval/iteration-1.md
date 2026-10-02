# Contract Evaluation Report — project-registration-compensation (Iteration 1)

- **Evaluator**: Scorer (adversarial, 3-phase protocol), persona: Senior QA Engineer
- **Date**: 2026-10-03
- **Surface type**: web (parameterized by `gen-journeys/rules/surface-web.md`)
- **Rubric**: `C:\Users\panda\.claude\plugins\cache\forge\forge\3.0.0\skills\eval\rubrics\contract.md` (1100 pts, target 935, per-dimension min thresholds)
- **Inputs scored**:
  - `testing/project-registration-compensation/contracts/step-1-initiate-new-workspace-registration.md`
  - `testing/project-registration-compensation/contracts/step-2-dsh-create-workspace.md`
  - `testing/project-registration-compensation/contracts/step-3-appdb-write-failure-compensation.md`
  - `testing/project-registration-compensation/contracts/step-4-failure-feedback.md`
  - `testing/project-registration-compensation/contracts/step-5-compensation-idempotency.md`
- **Reference inputs**: `journey.md` (same dir), `design/page-map.md` (Web handbook), `.forge/fact-table.json`, `design/er-diagram.md`, `design/tech-design.md`
- **Iteration**: 1 (no previous report)
- **Code spot-checks run by scorer** (to ground the two largest findings): `apps/host/src/main.ts` (`before-quit` → bounded `host.shutdown()`, no shutdown-time compensation), `apps/host/src/window/lifecycle.ts` (`window-all-closed` → quit), `apps/host/src/ipc/projects-rpc.ts` (`reconcileAtStartup` channel-exposed only).

---

## Phase 1 — Reasoning Audit (pre-score anchors)

**1. Faithful decomposition of the compensation journey (create → injection failure → compensation → feedback → idempotency)?** Structurally yes. All 5 happy-path steps have contracts; all 5 journey edge cases are carried as traced Outcomes (`<!-- 溯源: journey Step 3b/3c/4b/5b/5c -->`); one extra inferred Outcome (`no-drift-startup-silent`, step-5) adds genuine anti-vacuous-pass value for the 4b reconcile-hint assertion. The step-1 `attach-branch-selected` inferred Outcome deliberately materializes the precondition basis for step-3c's ownership-protection assertion — good cross-contract engineering. **One asymmetric gap**: journey step 3b (host-cancel-in-window) asserts a restart-time end state whose mechanism exists nowhere in the fact table and contradicts two facts (detail in D4) — and unlike 4b/5c, which received explicit `fact-note` tension annotations, 3b's tension is silently asserted.

**2. Outcomes mutually exclusive / executable by a downstream generator?** Partition quality is good in steps 1–4 (registry-hit, branch identity, ④ outcome, fault target all discriminate cleanly). Step 5 has one co-satisfiable pair (`success` vs `retry-registration-same-path` — both describe the post-compensation terminal state; only Input disambiguates). Executability soft spots: (a) 3b offers no deterministic seam to land inside the ②→③ window; (b) step-5 `success` Input assumes a "测试开关" that can re-trigger compensation on a captured workspaceId — beyond even the inferred FAULT_INJECTION_CONTRACT vocabulary; (c) 5b chains onto the fault-injected 3–4 scenario without declaring fault-clearance. All carried to scoring and/or blindspots.

**3. Cross-contract state references?** All resolve: step-2 State "workspaceId 可经 registry 探针按 path 捕获" ← step-3 precondition "workspaceId 已经 registry 探针捕获" ← step-5 precondition "②后经 registry 探针捕获的 id"; step-4 "衔接 Step 3 终态" matches step-3's terminal state (注册数归零 + 应用库无行); step-5b "衔接 Step 3–4 同场景终态" matches step-4 success. No dangling references, no contradictions.

**4. Journey invariants hold in every contract?** All 5 invariants restated verbatim in all 5 files. The orphan=0 scoping (with the 4b by-design exception) is consistently applied — step-4b State explicitly parks itself outside the 口径 ("该终态不计入「孤儿=0」口径"). Internally consistent. (The 3b problem is contract-vs-facts, not contract-vs-journey — scored in D4.)

**Pre-score anchors for channeling**: (a) 3b restart-state mechanism vs `RECONCILE_REPAIR` / `RECONCILE_NOT_AUTO_INVOKED`; (b) dangling fact id `FACT_RC_4`; (c) step-5 precondition overlap pair; (d) web mandatory derived-outcome adjudication visibility at contract level (grep: zero occurrences of `validation-error` / `session-expired` / `必察` in all 5 files); (e) step-5 empty anchor vs page-map; (f) fixture entity types and `prerequisite_entity` labels vs the design domain model.

---

## Phase 2 — Rubric Scoring

### D1. Completeness — **140/150**

- **Four mandatory dimensions per Outcome: 50/50.** All 13 Outcomes across 5 files carry non-empty Preconditions, Input, Output, State, plus explicit Side-effect everywhere (e.g., step-3c `Side-effect: "none（保护性零删除）"`). No missing mandatory dimension.
- **Journey Invariants section: 50/50.** Every file has `## Journey Invariants` with all 5 journey invariants verbatim.
- **Happy path + surface-mandated derived scenarios: 40/50 (-10).** Happy path ✓; boundary/error coverage is rich (attach branch, create-idempotent, host-cancel, ownership protection, compensation-failure ledger, replay no-op, retry, drift-repair, no-drift silent). However, **the two Web mandatory derived outcomes (`validation-error`, `session-expired`) have zero presence and zero adjudication record in any contract body** (grep-verified). The journey does adjudicate both ("validation-error — N/A … 由兄弟 Journey project-registration Step 3d 承载"; "session-expired — N/A … 最近邻 = 执行窗口内宿主中断，已由 Step 3b 覆盖"), and the session-expired nearest analog IS materialized as an Outcome (3b) — credited as mitigation. But the contract layer (what gen-test-scripts consumes) cannot distinguish "considered and delegated" from "missed". Same failure class the sibling journey's eval penalized; same -10.

### D2. Semantic Purity — **190/200**

- **Natural language, no regex/selectors/assertion calls: 80/80.** No regex patterns, CSS/XPath selectors, or framework assertion calls in any dimension value. Values describe what the system produces ("重复补偿为 no-op——不产生二次删除、不报错、不波及目录与会话日志").
- **Declarative preconditions: 60/60.** Preconditions are state descriptions throughout ("目标 canonical path 在 registry 中已存在工作区注册（同路径重复 create 场景）"), including the fault states ("④补偿调用本身失败（经注入开关触发）"). `registry.create/delete/list` and ①②③④ are the pinned public vocabulary of the four-step chain (tech-design Interface 1, G1 pin pool item 4), not implementation leakage.
- **No implementation coupling: 50/60 (-10).** Storage-level phrasing leaks into dimension values: step-5c Side-effect "应用库 **UPDATE projects** 引用修复" (SQL fragment) and step-4b Side-effect "**app_key_logs** 写入补偿失败条目（error/compensation）…（warn/reconcile）" (internal table + column enums). The ledger is the designated observation channel per `state-verification` comments and `COMP_FAILURE_LEDGER`, hence moderate not severe. Prefer "应用库项目记录引用被修复" / "记账日志写入补偿失败条目（错误级·补偿域）" system-level phrasing.

### D3. Precondition Exclusivity — **120/150**

- **Distinct preconditions across Outcomes per Step: 40/60 (-20).** Steps 1–4 partition cleanly (registry hit vs miss; new-branch vs attach; ④-success vs ④-failure). One ambiguous pair in step 5: `success` — "同一 workspaceId 已完成过一次补偿删除（②后经 registry 探针捕获的 id）" vs `retry-registration-same-path` — "上一次注册已完整补偿（衔接 Step 3–4 同场景终态：dsh 侧无孤儿）". Both describe the same reachable system state (compensation done, zero orphans); the only discriminator is the "已捕获 id" test-bookkeeping note, which is not a system state. Given that state, both Outcomes are applicable and selection is possible only via the Input verb — the full-overlap case per the -20 deduction rule.
- **Sufficient to uniquely select an Outcome: 40/50 (-10).** 5b is chained onto the fault-injected scenario ("衔接 Step 3–4 同场景终态") yet never declares the fault switch cleared. If the ③ injection persists, the retry registration fails and compensates again — a completely different Outcome. The precondition as written is insufficient to guarantee the asserted success terminal state; it must declare "故障注入已解除（或本场景重置注入开关）".
- **Error/boundary Outcomes state triggering conditions explicitly: 40/40.** All boundary Outcomes name their triggers: "关闭应用窗口/终止宿主进程" (3b), "本次注册经①预检命中既有工作区（幂等挂接，非本次新建，未登记补偿）" (3c), "④补偿调用本身失败（经注入开关触发）" (4b), "workspace_id 与 registry 实际 canonical path 失配（…漂移态经注入契约预置）" (5c).

### D4. Fact Alignment — **110/150**

**Context**: the protocol requires evaluating whether journey-vs-code fact tensions are correctly surfaced/classified rather than silently asserted. This contract set surfaces the fault-injection tension (step-3 `fact-note: 故障注入为测试基建契约（fact FAULT_INJECTION_CONTRACT）…e2e 需建注入缝`) and the reconcile-wiring tension twice (step-4 and step-5 `fact-note: fact RECONCILE_NOT_AUTO_INVOKED——启动对账当前仅为通道暴露…触发缝属缺陷信号/设计裁决点`) — exemplary classification. The deductions below are for the tensions and claims that were NOT surfaced.

- **Factual claims traceable to fact_id or marked UNKNOWN: 50/60 (-10).**
  - Step-5d reasoning cites "Fact Table（RECONCILE_REPAIR/**FACT_RC_4**，packages/core/src/forge/project-service.ts:284-344…）". **`FACT_RC_4` does not exist in `.forge/fact-table.json`** (verified against all 42 entries). The co-cited `RECONCILE_REPAIR` carries the content, so the claim is recoverable, but the citation is unresolvable — same defect class as the sibling journey's `AP-16`/`FACT_DEF_6`. -10.
  - All other fact references resolve: `REG_PRECHECK`, `COMP_DELETE_SEMANTICS`, `REG_CREATE`, `FAULT_INJECTION_CONTRACT`, `RECONCILE_NOT_AUTO_INVOKED`, `RECONCILE_REPAIR` ✓.
- **Inferred claims have rule support and source: inferred: 50/50.** All three `source: inferred` Outcomes (step-1 attach, step-2 create-idempotent, step-5 no-drift-silent) carry explicit reasoning with real, resolvable fact citations and journey linkage. Step-5b carries the journey's own inherited annotation ("source: inferred（重试成功非 PRD 原文，派生自①按 canonical path 匹配 + ②幂等…）"). Content verified accurate against the cited facts (e.g., 5d's "relinked 才写 warn 日志" matches `RECONCILE_REPAIR`).
- **No hallucinated/unclassified claims: 10/40 (-30).**
  - **Step-3b (-20)**: Output asserts "判定属本次新建 → ④补偿执行删除该注册；重启后经观察通道断言：目录与会话日志保留、**该路径无孤儿注册**" and State "重启后 dsh 侧该路径零注册". After a host kill mid-window this end state has no mechanism in shipped code: `RECONCILE_NOT_AUTO_INVOKED` ("Neither apps/host/src/main.ts, boot code, nor core plugin activation calls reconcileAtStartup"), and even if reconcile ran, `RECONCILE_REPAIR` says the orphan is "reported + warn log only, **never auto-deleted**". Scorer's code spot-check confirms `before-quit` performs only a bounded graceful shutdown (no compensation hook). So either ④ must run at termination (seam absent from facts and code) or the orphan persists (contradicting the asserted State). The contract gave 4b/5c explicit `fact-note` tension annotations for exactly this class of dependency — 3b got none. Journey-traced but silently asserting unsupported (indeed contradicted) behavior: the definition of an unclassified claim. -20.
  - **Step-5 success (-10)**: Input "系统级重放——**经测试开关**对同一 workspaceId 再触发一次补偿（模拟补偿重入）" assumes a test facility that re-invokes compensation on an already-compensated id. `FAULT_INJECTION_CONTRACT` enumerates the only known seams ("StubRegistry constructor injection (failCreate/failDelete) + ws_path UNIQUE conflict row seeding; e2e lacks a fault facility") — a replay trigger is not among them, and step-5 has no `fact-note` declaring it as a to-be-built harness capability (the way step-3 did for injection). Unclassified test-infrastructure assertion. -10.

### D5. Surface Fitness (web-parameterized) — **90/100**

- **Mandatory derived Outcomes present: 30/40 (-10).** `validation-error`: absent (journey delegates to sibling journey step-3d, which does contract it — verified in `testing/project-registration/contracts/step-3-review-register-form.md`: "Web surface 必察项 validation-error 的实步承载"). `session-expired`: absent as such, but its journey-mapped analog (3b host-cancel) is a full contract Outcome. System-level coverage therefore exists; the deduction is for the contract-local record: zero occurrences of either term in all 5 files, so a consumer of the contracts alone cannot see the adjudication. Mitigation credited (journey-level adjudication + `requires_auth: false` on every frontmatter + analog present), capping at -10 per the sibling-eval calibration.
- **Surface-appropriate language: 35/35.** Consistently Web-idiomatic (打开添加项目流程, 文件浏览器, 注册表单点「确认」, 模态可经失败态关闭意图退出, 左栏项目树). The system-probe vocabulary (registry 探针/对账报告探针) is the journey-sanctioned non-UI observation channel, properly scoped by `state-verification` comments. Zero CLI/API/TUI language leakage.
- **TUI timeout criterion: 25/25.** N/A for web surface — full marks per rubric.

### D6. Internal Consistency — **140/150**

- **Invariants hold in every Step Contract: 60/60.** No violations. 3b/3c/5/5b/5c all assert orphan=0 consistently with invariant 1's scoping; 4b explicitly parks outside it; ownership protection (3c: "补偿 delete 零调用、记账零写入") and directory/log preservation are asserted everywhere compensation runs.
- **Cross-Contract state references consistent: 40/50 (-10).** All references resolve (Phase 1 #3). Deduction is for step-5's content-vs-title routing hazard: the step is contracted as "补偿幂等（重复补偿为 no-op）", yet 3 of its 4 Outcomes are different subsystem actions — registration retry (5b), startup reference-drift repair (5c), no-drift silent startup (5d). A generator or CI filter selecting the "compensation idempotency" suite silently drags in reconcile-drift scenarios (and conversely, someone looking for reconcile coverage may not look in this file). No contradiction — a coverage-routing hazard, -10, with the blindspot-channel consequence spelled out.
- **Preconditions consistent with preceding Steps' State changes: 40/40.** Verified chain: step-1 terminal (新建分支判定) → step-2 precondition; step-2 terminal (注册在场、workspaceId 可捕获) → step-3 preconditions; step-3 terminal (归零+无残留) → step-4 "衔接 Step 3 终态"; step-4 terminal → step-5b/5 chains. Step-1's attach Outcome explicitly exists to make step-3c's precondition achievable — correctly engineered.

### D7. Anchor Integrity (handbook: `design/page-map.md`) — **90/100**

Handbook exists for web surface → dimension active. Page-anchor map built from handbook: `工作台 · 会话视图（默认态）` → `workbench/session`; `工作台 · 知识库视图（浏览页签）` → `workbench/knowledge`; `添加项目（两段模态流程）` → `modal/add-project`.

- **Anchor field completeness: 30/40 (itemized).** Steps 1–4 carry `anchors.web.page: "添加项目（两段模态流程）"` + `route`/`requires_auth`/`layout` ✓. **Step 5 carries `page: ""`, `route: ""`, `layout: ""`** — the required Web anchor field is present but empty, i.e., effectively missing for that Contract while the handbook exists. The contract's own note concedes part of the step is anchorable: "5b 重注册段经 modal/add-project 与左栏（workbench/session）行使". The no-guess rationale ("锚点留空（不猜测）") is honest engineering for the system-level outcomes, but the 5b segment's page is known and unanchored. **1 empty/missing field × -10.**
- **Anchor values match handbook: 30/30 (itemized).** Steps 1–4: page "添加项目（两段模态流程）" = handbook heading exactly ✓; route "modal/add-project" ✓; layout "覆盖中区的模态" ✓; `requires_auth: false` ↔ "Auth: none" ✓. **Mismatches: none.**
- **Handbook internal consistency: 30/30.** Three distinct pages, unique view-state routes, no duplicate/conflicting definitions. **Conflicts: none.**

### D8. Fixture Specification — **80/100**

**Veto check (entity completeness) — NOT triggered.** Adjudication (recorded for auditability): interpreting `fixture_spec` by its dimension title (前置数据声明 = prerequisite data declaration), every entity type required as *prerequisite* state is declared per Outcome — `Workspace` (canonical_path-constrained) for attach/idempotent/3x/4b/5c/5d, `WorkspaceDirectory` for new-path outcomes, `Project`+`Workspace` for 5c/5d. Entities *created* by operations (the ② registry entry in step-2's State, the re-registration in 5b's Side-effect) are post-state assertions, not fixtures; a literal veto on created entities would contradict the dimension's purpose and was not applied (same adjudication as the sibling eval). The `prerequisite_entity: "Project"` references inside `state_requirements` (steps 1/3/4) where `Project` ∉ that Outcome's `entities` list are mislabels of a qualifier field, not omitted fixture entities — the underlying requirement texts do not operate on a Project row in those cases. They are penalized below, not vetoed.

- **Entity completeness (semantic verification vs Design domain model): 30/40 (-10).** `Project` ↔ PROJECTS (er-diagram) ✓; `Workspace` ↔ dsh workspace registry entity (design-acknowledged external entity behind `projects.workspace_id` UK, "dsh 侧实体为本体") ✓. But **`WorkspaceDirectory` is not an entity in the design domain model** — the ER diagram models five app tables plus the dsh-side workspace; a workspace directory is a filesystem input (the `workspaceDir` field of RegisterProjectInput), not a modeled entity. It is a pragmatic generator-level abstraction used consistently, but it fails the criterion's traceability-to-domain-model requirement. Partial credit 30/40; no veto. (Same calibration as the sibling eval's treatment of `WorkspaceDirectory`/`ForgeDirectory`.)
- **Relationship and constraint coverage: 25/35 (-10).** Constraints are largely good (registration_state, canonical_path pairings, workspace_id mismatch for drift). One concrete mislabel pattern: `prerequisite_entity: "Project"` attached to state requirements that have nothing to do with a Project row — step-4b's "故障注入生效：**④registry.delete 补偿调用失败**" targets the Workspace/registry seam, not Project; step-1's "场景隔离：专属新建路径…无故障注入" is vacuously tagged. A downstream fixture builder reading `prerequisite_entity` would seed the wrong entity family. -10. (Step-5d's `has_one`/`parent_entity: Project` relationship direction is correct.)
- **Minimum data quantity: 25/25.** All `min_count: 1` declarations are sufficient — no list/pagination or delete-one-of-many scenarios; 5c/5d need exactly one Project+Workspace pair ✓.

### Cross-dimension coherence check

- The web-derived-outcome adjudication gap is penalized in D1.3 (-10) and D5.1 (-10): same root cause, one reviser fix (an N/A adjudication note in any contract body, or restating the journey's Derived Outcomes dispositions) recovers both — intentional, not double-counting (rubric encodes the requirement in both dimensions; sibling-eval precedent).
- D4's 3b finding and D6's routing hazard both touch step-5/3 structure but are distinct failure classes (unsupported fact claim vs coverage routing); the 3b window-determinism blindspot is adjacent to the D4 finding but is a different defect (no deterministic trigger seam vs unsupported end-state claim) — kept separate.
- D3's 5b fault-clearance gap and D6's step-5 folding are independent (precondition sufficiency vs suite routing).

---

## Phase 3 — Blindspot Hunt (rubric-missed QA failure patterns)

1. **[blindspot] 3b's in-window kill has no deterministic landing seam (flaky test baked into the contract).** Preconditions: "②步已执行、③应用库写入尚未完成（流程窗口内，「确认」后的 UI 取消点已过）". Nothing specifies how a test deterministically holds the flow between ② and ③ — the declared fault vocabulary is fail-mode only (`test.setFault(...,"fail")`; `FAULT_INJECTION_CONTRACT`: "StubRegistry … failCreate/failDelete + ws_path UNIQUE conflict row seeding"), a kill racing a millisecond window is flake. The contract must name a hold mechanism (hang-mode fault on the ③ write, or a harness pause hook after ②) — otherwise every generated 3b test is a timing lottery.
2. **[blindspot] 5c merges two repair pre-states into one Outcome — the `recreated` branch is not deterministically reachable.** State: "projects 行 workspace_id 更新为按 ws_path 找回（relinked）或幂等重建（recreated）的工作区 id". Per `RECONCILE_REPAIR`, relinked requires a registry entry at ws_path (different id); recreated requires NO entry at ws_path. The single precondition ("workspace_id 与 registry 实际 canonical path 失配") does not distinguish them, so a generator cannot preset which repair action occurs and the Output assertion "失配按 path 找回" is vacuously satisfiable by either. Split into two Outcomes with distinct registry pre-states.
3. **[blindspot] Missing negative control: ② create failure never asserts the zero-compensation side of the gate.** The journey is the compensation journey, yet the one branch where compensation must NOT exist — dsh create itself fails (`REG_CREATE`: "failure ⇒ WorkspaceCreateError (ERR_WORKSPACE_CREATE), abort, no compensation needed") — appears in no Outcome; step-2's outcomes only consider "无故障注入" and ③/④ faults ("新建分支注册执行进行中（①预检已完成未命中）；无故障注入"). Without the ②-failure outcome (assert: no registry entry, no compensation ledger entry), the compensation gate's false-positive side (compensating when it shouldn't) is tested only via the attach branch, not the create-failure branch.
4. **[blindspot] The primary dsh-side assertion channel ("registry 探针") has no declared realization.** Step-2 State: "workspaceId 可经 registry 探针按 path 捕获"; steps 3/4/5 assert dsh-side state ("dsh 侧该路径注册数归零") through it. `E2E_INFRA` lists the RPC probe (`window.dshForge.invoke` — forge:* channels only), UI probes, and the session-log probe; there is no dsh registry read channel (forge:projects/list reads the app DB, which is precisely what must NOT be trusted for dsh-side assertions). After compensation the「已注册」marker also goes dark for app-side reasons. The contracts depend on an undeclared probe facility — it must be named in the test-infrastructure contract (dsh CLI query, registry store read, or new channel) or every "dsh 侧" assertion is unverifiable in e2e.

---

## Final Summary

| Dimension | Score | Min | Status |
|---|---|---|---|
| 1. Completeness | 140/150 | 90 | PASS |
| 2. Semantic Purity | 190/200 | 120 | PASS |
| 3. Precondition Exclusivity | 120/150 | 90 | PASS |
| 4. Fact Alignment | 110/150 | 90 | PASS |
| 5. Surface Fitness | 90/100 | 60 | PASS |
| 6. Internal Consistency | 140/150 | 90 | PASS |
| 7. Anchor Integrity | 90/100 | 60 | PASS |
| 8. Fixture Specification | 80/100 | 60 | PASS (veto not triggered) |
| **Total** | **960/1100** | **935** | **PASS** |

**Verdict: 960/1100 — above the 935 pass line; every dimension above its min threshold.** The contract set is structurally strong: complete six-dimension Outcomes, invariants held with correct 4b exception scoping, resolved cross-contract workspaceId chain, genuine web idiom, and — notably better than average — correct in-contract surfacing of the fault-injection and reconcile-wiring fact tensions via `fact-note` annotations. The residual risk concentrates in: (a) step-3b silently asserting a restart-time orphan-removal end state that contradicts `RECONCILE_REPAIR`/`RECONCILE_NOT_AUTO_INVOKED` (the one tension not surfaced), (b) step-5's co-satisfiable precondition pair and the undeclared replay-trigger facility, (c) the unadjudicated web derived outcomes at contract level, (d) step-5's empty page anchor, and (e) fixture entity/qualifier semantics vs the design domain model.

**Cheapest high-yield fixes for the reviser (priority order):**
1. Add a `fact-note` to step-3's 3b Outcome classifying the restart-no-orphan expectation as a fact tension (shutdown-compensation seam absent; reconcile report-only) — +20 (D4).
2. Replace `FACT_RC_4` with the real id (`RECONCILE_REPAIR` suffices) — +10 (D4).
3. Annotate step-5 `success` Input with the FAULT_INJECTION_CONTRACT scope caveat (replay trigger = new harness seam) — +10 (D4).
4. Add a discriminating precondition to 5b vs 5-success, and declare fault-clearance for 5b — up to +30 (D3).
5. Add one contract-body N/A adjudication note for validation-error (delegated) / session-expired (mapped to 3b) — +20 (D1 + D5).
6. Anchor step-5's 5b segment (modal/add-project) or split the system-level outcomes from the UI-facing one — +10 (D7).
7. Fix `prerequisite_entity` labels (4b → Workspace; drop vacuous tags) and map/annotate `WorkspaceDirectory` as a fixture abstraction vs the design domain model — up to +20 (D8).
