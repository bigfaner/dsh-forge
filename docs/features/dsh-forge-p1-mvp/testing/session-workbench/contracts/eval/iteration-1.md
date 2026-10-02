# Contract Evaluation Report — session-workbench (Iteration 1)

- **Evaluator**: Scorer (adversarial, 3-phase protocol), persona: Senior QA Engineer
- **Date**: 2026-10-03
- **Surface type**: web (parameterized by `gen-journeys/rules/surface-web.md`)
- **Rubric**: `C:\Users\panda\.claude\plugins\cache\forge\forge\3.0.0\skills\eval\rubrics\contract.md` (1100 pts, target 935, per-dimension min thresholds)
- **Inputs scored**:
  - `testing/session-workbench/contracts/step-1-workbench-first-screen.md`
  - `testing/session-workbench/contracts/step-2-new-session-roundtrip.md`
  - `testing/session-workbench/contracts/step-3-trace-tab-ledger.md`
  - `testing/session-workbench/contracts/step-4-restore-session.md`
  - `testing/session-workbench/contracts/step-5-view-switch-state-retention.md`
  - `testing/session-workbench/contracts/step-6-project-switch-dock-follow.md`
- **Reference inputs**: `journey.md`, `design/page-map.md` (Web handbook), `.forge/fact-table.json` (42 entries), `design/er-diagram.md`, `design/tech-design.md`
- **Iteration**: 1 (no previous report)

---

## Phase 1 — Reasoning Audit (pre-score anchors)

**1. Faithful decomposition of the journey?** Yes, structurally faithful. All 6 happy-path steps (first screen / new-session roundtrip / trace tab / restore / view-switch retention / project-switch dock follow) have 1:1 contracts. All 6 journey edge cases are carried as traced Outcomes with `<!-- 溯源: journey Step Xb/Xc -->` comments: 1b→`rail-collapse`, 1c→`zero-project-rail-empty`, 2b→`empty-session-guide`, 2c→`blank-send-blocked`, 4b→`zero-session-placeholder`, 4c→`list-loading-skeleton`. Journey probe language (转录仍在原位、标题未变、草稿保留、不闪断不回空态) is carried into Output dimensions verbatim. Sibling-journey scoping notes (knowledge-recall-flywheel / knowledge-browsing) are preserved in Outputs, preventing scope bleed.

**2. Outcomes mutually exclusive / generator-executable?** Steps 1, 2, 4 partition cleanly by registry/list/input state (detailed under D3 — this contract set is genuinely clean here, unlike the project-registration set). Executability soft spots carried to blindspots: (a) step-6 and step-1 assert return-actions ("切回甲时恢复", "再展开恢复完整导航") in Output that are never declared in Input — a script generator cannot execute an assertion whose trigger action is absent; (b) transient skeleton assertions (step-4, step-4c) carry no observability/capture strategy while step-2 got an explicit 120s window + retry policy — asymmetric flake rigor.

**3. Cross-contract state references?** All resolve: step-3 precondition "Step 2 往返已完成的会话打开中" ← step-2 State ("新建 dsh 会话…回答完成"); step-5 "Step 4 历史会话打开中（衔接 Step 4 终态）" ← step-4 State ("当前打开会话切换为该历史会话"); step-6 "衔接 Step 5 终态：右栏展开、甲会话打开" ← step-5 State ("右栏偏好保留…切回恢复展开态" + "Step 4 会话转录仍完整呈现"). Dock tab sets are coherent per-step (step-5 min_count 2 = 甲项目级+全局; step-6 min_count 3 = 甲/乙项目级+全局), but step-1 seeds only the global tab while the journey Setup declares a single baseline with 甲·页签 present throughout — a per-contract divergence from the Setup baseline (scored under D6).

**4. Journey invariants hold in every contract?** All 5 invariants restated verbatim in every file. No violation found: three-tab non-reset asserted in step-3; knowledge-view dock hiding asserted in step-5; dock follow derivation asserted in step-6; session-row-click no-reset asserted in step-4/5. One classification tension: step-2's State asserts "左栏会话列表实时新增行，零缓存零副本" while the contract's own Invariant 2 classifies "实时读、零缓存零副本" as an audit-channel (code-review) claim that is NOT a browser-observable assertion — the observable part (a new row appears) and the audit part (zero-copy) are conflated in one State value (blindspot 3).

**Pre-score anchors for channeling**: (a) rail geometry numeric claim vs fact `RAIL_GEOMETRY`; (b) provenance of the 120s/retry/degrade policy ("为旅程 Setup 契约" — journey Setup contains no such policy); (c) session-expired adjudication traceability at contract level; (d) fixture entity types (DshRuntime / DockTab / Session) vs the Design domain model; (e) page-anchor exactness vs page-map headings.

---

## Phase 2 — Rubric Scoring

### D1. Completeness — **140/150**

- **Four mandatory dimensions per Outcome: 50/50.** All 11 Outcomes across 6 files carry non-empty Preconditions, Input, Output, State; Side-effect explicitly present in all ("Side-effect: \"none（首屏读取）\"", "Side-effect: \"dsh 会话日志追加（账本写入，非应用库）\"", etc.). No missing mandatory dimension anywhere. No critical failure.
- **Journey Invariants section: 50/50.** Every file has `## Journey Invariants` with all 5 journey invariants verbatim.
- **Happy path + surface-mandated derived scenarios: 40/50 (-10).** Happy path ✓; `validation-error` is present and explicitly rule-tagged (step-2 `blank-send-blocked`: "Web surface 必察项 validation-error 的实步承载"); all 6 journey edge cases ✓. However the second Web mandatory derived outcome, **`session-expired`, has no adjudication record in any contract body** (grep-verified: zero occurrences across the 6 files). The journey itself adjudicates it ("session-expired — N/A：单机产品无登录会话 / 过期概念…source: inferred"), but that record does not propagate: a reader of the contracts alone cannot distinguish "considered and excluded" from "missed". Mitigation credited: every frontmatter carries `requires_auth: false`, indirect evidence the auth dimension was inspected. (Same failure class and same -10/-10 split across D1/D5 as the project-registration iteration-1 report; single reviser fix — one N/A line — recovers both.)

### D2. Semantic Purity — **185/200**

- **Natural language, no regex/selectors/assertion calls: 80/80.** No regex patterns, CSS/XPath selectors, or framework assertion calls in any dimension value. Values describe what the system produces ("左栏折叠为 56px rail——图标保留、悬停提示可用"), not how to verify it.
- **Preconditions declarative, not procedural: 60/60.** All Preconditions are state descriptions: "对话 tab 输入框为空或仅空白字符", "会话列表尚未就位（账本查询进行中的瞬态）", "应用零项目记录（首用状态…）". No setup instructions anywhere.
- **No implementation coupling in dimension values: 45/60 (-15).**
  - Step-2 success State embeds a procedural test-execution policy, not a system state: "观察窗 = 提问后 120s 内回答完成且轨迹出现工具调用；窗内未完成 → 同一 fixture 问题重发至多 2 次；仍无 → 降级能力面 contract 通道验证同等断言并记 flake" — retry loops, fallback channeling and flake bookkeeping are generator instructions inside a State dimension. The State's assertable content ("回答完成且轨迹出现工具调用") is diluted by orchestration prose. -10.
  - Audit-channel vocabulary leaks into a browser-observable State: step-2 "新建 dsh 会话（左栏会话列表实时新增行，零缓存零副本）" — "零缓存零副本" is the UF-1 data-contract term the contract's own Invariant 2 classifies as non-observable (see blindspot 3). -5.

### D3. Precondition Exclusivity — **150/150**

- **Distinct preconditions across Outcomes per Step: 60/60.** No two Outcomes in any file share identical or semantically equivalent Preconditions. Step-1: success (≥1 project, runtime available) vs `rail-collapse` (rail expanded) vs `zero-project` (zero projects — hard-exclusive against success). Step-2: success (runtime + session view) vs `empty-session-guide` (zero-message session) vs `blank-send-blocked` (empty input box) — distinct predicates (message count vs input content), co-occurrence possible but never equivalence, and Input verbs ("查看" vs "直接点发送") complete the selection. Step-4: success (甲 with history) vs `zero-session` (乙, zero sessions — hard-exclusive) vs `list-loading` (pending transient).
- **Sufficient to uniquely select an Outcome: 50/50.** Given fixture + current state + Input, exactly one Outcome applies everywhere. The zero-project outcome additionally pins its isolation mechanism ("独立启动，不与甲/乙基线叠加"), preventing fixture bleed ambiguity.
- **Error/boundary Outcomes state triggering conditions explicitly: 40/40.** All boundary Outcomes name their triggers: "对话 tab 输入框为空或仅空白字符" (blank-send), "应用零项目记录（首用状态…）" (zero-project), "打开的是项目乙（Setup 定义：刚注册、零会话）" (zero-session), "会话列表尚未就位（账本查询进行中的瞬态）" (list-loading).

### D4. Fact Alignment — **115/150**

- **Factual claims traceable to fact_id or marked UNKNOWN: 40/60 (-20).**
  - Step-1 `rail-collapse` Preconditions: "左栏处于展开态（约 240–420px 展开区间）" — fact `RAIL_GEOMETRY` states "collapsed rail = 56px control bar; expanded clamp **264–420px** (default 280)". The contract's 240 lower bound contradicts the fact's 264 clamp; the journey only said "~240px" (itself loose vs default 280) and the contract hardened it into a wrong interval. No fact_id cited, no UNKNOWN marking. -8.
  - Step-2 Fixture Specification: "往返稳定性策略（120s 观察窗 + 重发 ≤2 次 + 降级 contract 通道）为旅程 Setup 契约" — **the journey Setup contains no such policy** (Setup lists project fixtures, dock-tab fixtures, runtime availability, dock expandability, scenario isolation — no observation window, no retry budget, no fallback channel). The journey Step 2 expected result doesn't mention it either; tech-design Open Question ② explicitly leaves e2e model strategy undecided ("录制回放仅在 flake 时评估（不预建）"). The contract silently resolved an open design question and attributed it to a source that doesn't contain it — false provenance on a load-bearing execution policy. -12.
  - Credited clean: "折叠为 56px rail" ↔ `RAIL_GEOMETRY`; "标题 / 状态点 / 相对时间" ↔ `SESSION_LIST_FACE`; "空输入下发送入口不可用且提交护栏拦截" ↔ `EMPTY_SEND_GUARD`; "暂无会话」占位（UF-1 States 原文）" ↔ `SESSION_LIST_FACE` exact copy; dock visibility/follow semantics ↔ `DOCK_TAB_MODEL` (cited by name in step-5/step-6).
- **Inferred claims have required_outcomes rule support and source: inferred: 40/50 (-10).** The two highest-risk inferred constructs are exemplary: dock-tab preseed channel cites `DOCK_TAB_MODEL` by name in both step-5 ("fact DOCK_TAB_MODEL：shipped 代码仅注册全局页签，项目级页签需测试预置缝") and step-6 (fact-note with the FACT-TENSION spelled out), and step-4 `zero-session-placeholder` carries a literal "source: inferred（UF-1 仅定义占位态，质量项为派生）". But several journey-level `source: inferred` annotations lost their literal tag when carried into contracts: step-2's equivalence-class note ("品牌行同属「新建会话」等价类…断言及于等价类" — journey marked source: inferred), step-2's fixture-message tool-call guarantee ("fixture 消息保证" — journey marked source: inferred), step-5's coverage-caliber note ("会话行为三切回入口代表…断言及于全部入口" — journey marked source: inferred). The reasoning basis survives, the classification marker doesn't. -10.
- **No hallucinated unclassified claims: 35/40 (-5).** One residual unclassified behavior assertion: step-2 success Preconditions "模型 API 凭证归 dsh profile 域，产品不经手" — architecture-level claim, traceable in spirit to `ELECTRON_MAIN`/proposal but cited nowhere and marked nowhere. The 120s policy invention is counted once above (criterion 1), not double-billed here.

### D5. Surface Fitness (web-parameterized) — **90/100**

- **Mandatory derived Outcomes present: 30/40 (-10).** `validation-error`: present, well-formed and rule-tagged — step-2 `blank-send-blocked` asserts no message on screen, no agent roundtrip, no side effect, guidance state kept, focus retained (matching the surface rule's "form is not submitted, user can correct and retry" guidance). `session-expired`: absent from all contract bodies with no N/A note — the journey's adjudication ("单机产品无登录会话 / 过期概念…最近邻 = dsh 运行时不可用，属环境故障非过期") is not restated anywhere a contract reader will see. `requires_auth: false` in every frontmatter is credited as indirect mitigation, capping the deduction.
- **Surface-appropriate language: 35/35.** Consistently Web-idiomatic: 点「新会话」按钮、页签切换、加载骨架、悬停提示、预输入草稿、hero 空态、CTA、视图态往返. Zero CLI/API/TUI language leakage, zero DOM-selector coupling. Async behavior is described at the user-observable level (skeleton during restore, rows settle after query).
- **TUI timeout criterion: 25/25.** N/A for web surface (non-TUI) — full marks per rubric.

### D6. Internal Consistency — **145/150**

- **Invariants hold in every Step Contract: 60/60.** No violations. Three-tab non-reset asserted (step-3 State: "会话状态跨页签保持（三页签常驻切换零重置）"); knowledge-view dock exclusion asserted (step-5 Output: "知识模式下右栏隐藏（已展开也隐藏）"); dock visible-set derivation asserted (step-6 State: "dock 可见集随当前项目焦点派生切换（无快照、可往返恢复）"); session-row-click no-reset asserted (step-4 State: "中区其它视图状态不被重置"). All consistent with `VIEW_STATE_MACHINE` / `SESSION_TABS` / `DOCK_TAB_MODEL`.
- **Cross-Contract state references consistent: 45/50 (-5).** All references resolve (see Phase 1 #3). Deduction: the DockTab seeding baseline diverges across contracts vs the journey's single Setup baseline. Setup declares "甲/乙各预置一个项目级页签（甲·页签 / 乙·页签）+ 全局页签常驻" as one persistent fixture state, but step-1 seeds only "DockTab … min_count: 1 … scope: global（全局页签常驻）" while step-5 declares min_count 2 and step-6 min_count 3. Per-contract union seeding is feasible (each suite seeds its own), but step-1 also lists the invariant "dock 可见页签集恒等于「当前项目页签 + 全局页签」" which is vacuous under its own fixture (no project tab seeded), and step-1 `rail-collapse` declares a global DockTab fixture it never touches. One baseline, three divergent materializations. -5.
- **Outcome Preconditions consistent with preceding Steps' State changes: 40/40.** Chain verified: step-2 terminal (roundtrip complete, new session in list) → step-3 precondition ("Step 2 往返已完成的会话打开中"); step-4 terminal (historical session open) → step-5 precondition; step-5 terminal (back on session view, dock restored expanded, step-4 session open, draft retained) → step-6 precondition ("衔接 Step 5 终态：右栏展开、甲会话打开"). No unreachable precondition.

### D7. Anchor Integrity (handbook: `design/page-map.md`) — **90/100**

Handbook exists for web surface → dimension active. Page-anchor map built from handbook: `工作台 · 会话视图（默认态）` → route `workbench/session`; `工作台 · 知识库视图（浏览页签）` → route `workbench/knowledge`; `添加项目（两段模态流程）` → route `modal/add-project`.

- **Anchor field completeness: 40/40 (itemized).** All 6 contracts carry `anchors.web.page` (the required Web field), plus consistent extras (`route`, `requires_auth: false`, `layout`). All six anchor to the session view — correct for this journey's scope; `workbench/knowledge` is a transit state in step-5, explicitly documented in an anchor note ("本步往返于 workbench/session 与 workbench/knowledge 两视图态间；锚点取回归态（会话视图），知识视图态为途中态") that names the transit route, so no information is lost. The remaining two handbook pages are owned by sibling journeys (knowledge-browsing; project-registration has its own contract set) — out of scope here, not a gap. **Missing fields: none.**
- **Anchor values match handbook: 20/30 (itemized, 1 mismatch × -10).**
  - All 6 contracts: route "workbench/session" ✓ matches handbook `workbench/session`; layout "WorkbenchLayout（左 rail / 中会话面板 / 右 dock）" ✓ verbatim; requires_auth false ↔ "Auth: none（本机单用户）" ✓.
  - **page "工作台·会话视图（默认态）" ≠ handbook heading "工作台 · 会话视图（默认态）"** — missing the two spaces around the interpunct, in all 6 files (systematic). The rubric requires exact match; a strict anchor resolver comparing page values to page-map headings fails to locate the entry. Same defect class already scored in the project-registration report (its step-5) — this set reproduces it six times. Counted as one systematic mismatch × -10.
- **Handbook internal consistency: 30/30.** Three distinct pages, unique view-state routes/modal id, no duplicate or conflicting definitions; route-guard section coherent with page sections. **Conflicts: none.**

### D8. Fixture Specification — **80/100**

**Veto check (entity completeness) — NOT triggered.** Adjudication: the veto fires when an entity type referenced in the Contract's Preconditions, Input, or State changes is missing from `fixture_spec.entities`. Checked per Outcome: step-1 success (Project/Session/DockTab all declared); step-2 (Project declared; the new Session is *created* by the 新会话 action — post-state, not a prerequisite; the zero-message Sessions in `empty-session-guide`/`blank-send-blocked` are declared); step-3 (Project/Session); step-4 (Project/Session; 乙-zero via state_requirements); step-5 (Project/Session/DockTab×2); step-6 (Project×2/DockTab×3/Session). Nothing referenced-as-prerequisite is undeclared. Entities created at runtime are post-state assertions, not fixtures (same adjudication as the project-registration report).

- **Entity completeness (semantic verification vs Design domain model): 30/40 (-10).** Checked against `er-diagram.md` + `tech-design.md` Data Models: `Project` ↔ PROJECTS ✓; `Session` ↔ dsh-side session entity (design-acknowledged external SoT — "dsh 会话账本实时读", `knowledge_recall_logs.session_id` "dsh 会话 id") ✓; `DockTab` ↔ web view-state dock model (`DOCK_TAB_MODEL` fact: DockTabScope global|project, zones/dock.ts) — design-acknowledged via the dock/页签跟随 architecture and explicitly contract-bound by the journey Setup ✓. But **`DshRuntime` (step-1 `zero-project-rail-empty`: "entity_type: \"DshRuntime\" … availability: 可用") is not an entity in any design domain model** — it is an environmental availability condition. Modeling it as a seedable entity is a category error; it belongs in `state_requirements` (where step-2 puts the same condition). Partial credit 30/40; no veto.
- **Relationship and constraint coverage: 25/35 (-10).** Good: Session `belongs_to` Project declared consistently where sessions pre-exist; scope constraints on DockTab correctly distinguish global vs project tabs; step-6's three-tab scope enumeration ("甲项目级 + 乙项目级 + 全局各一") is exactly the distinguishable visible set the journey demands. Two issues: (1) step-4 `list-loading-skeleton` declares "field: \"session_list_phase\" … value: \"pending（账本查询进行中）\"" on entity `Project` — `session_list_phase` is not a field of PROJECTS in any design model; it is a transient UI phase, not a seedable data constraint. A generator cannot seed a query-in-progress state from this spec (see blindspot 2). (2) step-2 success attributes the runtime-availability + tool-call-guarantee requirement to "prerequisite_entity: \"Session\"" — the described requirement is about runtime availability, not a Session row; misattributed parent. -10 total.
- **Minimum data quantity: 25/25.** step-6 Project min_count 2 (甲+乙) and DockTab min_count 3 (甲/乙项目级+全局) — correct for a switch-and-switch-back scenario; step-5 DockTab min_count 2 (甲项目级+全局) correct for the distinguishable visible set; all Session min_count 1 sufficient; zero-row states correctly expressed as state_requirements rather than min_count 0. No under-declared min_count.

### Cross-dimension coherence check

- The `session-expired` gap is penalized in both D1.3 (-10) and D5.1 (-10). Intentional, not double-counting: the rubric encodes the requirement in both dimensions; one reviser fix (a single N/A adjudication line in any contract) recovers both. Precedent: identical split in the project-registration iteration-1 report.
- The 120s/retry policy is billed once in D4 (false provenance, -12) and once in D2 (procedural content in a State value, -10): distinct failure classes (traceability vs purity) sharing one root — a single fix (move the policy to an execution-note block marked `source: inferred`) recovers both.
- D7's page-title mismatch and D8's DshRuntime finding are independent artifacts (handbook sync vs domain-model traceability); no overlap.
- The dock-tab fixture baseline divergence (D6 -5) is distinct from D8's entity semantics: it is a cross-contract coherence issue, not a per-contract declaration defect.

---

## Phase 3 — Blindspot Hunt (rubric-missed QA failure patterns)

1. **[blindspot] Return-actions asserted in Output but never declared in Input — generator cannot execute.** Step-6 Input is "左栏从项目甲切换到项目乙（衔接 Step 5 终态：右栏展开、甲会话打开）" while its Output asserts "切回甲时恢复「甲·页签 + 全局页签」且展开态保持" — the switch-back click that produces the asserted state is nowhere in the Input. Same pattern in step-1 `rail-collapse`: Input "点收起按钮", Output "…再展开恢复完整导航" — the re-expand action is undeclared. Half the assertion is untriggerable by a script generated strictly from Input. Each composite verification (switch back / re-expand) must appear as an explicit Input step.
2. **[blindspot] Transient skeleton assertions have no observability strategy — flake by design.** Step-4 Output: "恢复期间呈加载骨架；完成后历史会话的全部消息与工具调用按时间序完整呈现" and step-4 `list-loading-skeleton` Output: "呈现行级骨架；查询完成后会话行就位". Local restores and ledger queries may complete inside one animation frame, making the skeleton unobservably brief; unlike step-2 (which got an explicit "观察窗 = 提问后 120s 内…重发至多 2 次" policy), the transient-state outcomes declare no capture strategy (e.g., throttled/delayed ledger seam, or asserting the settled state plus skeleton-on-demand). Asymmetric nondeterminism rigor between async outcomes of the same contract set.
3. **[blindspot] Audit-channel language leaks into browser-observable State, contradicting the contract's own invariant.** Step-2 State: "新建 dsh 会话（左栏会话列表实时新增行，零缓存零副本）" — while the same file's Journey Invariants state "「实时读、零缓存零副本」为 UF-1 数据契约，属审计通道（代码审查承载），非浏览器可观察断言". The document classifies the zero-copy claim as unverifiable in a browser, then asserts it inside a State dimension. Split the observable part (new row appears in list) from the audit part, or the generator will either skip the assertion or invent an invalid one.
4. **[blindspot] Zero-message Session fixture asks the generator to seed an entity with undefined existence semantics.** Step-2 `empty-session-guide` / `blank-send-blocked` fixtures: "entity_type: \"Session\" … min_count: 1 … message_count: 0（新建零消息会话）". No fact in the table establishes that a dsh session with zero messages exists as a seedable ledger row before the first send (the natural path is: click 新会话 → runtime creates the session). Seeding a pre-existing zero-message session may be impossible or may produce a state unreachable by real usage. Express it as "session created at runtime by the 新会话 action; no pre-seeded row" instead of a min_count-1 fixture.

---

## Final Summary

| Dimension | Score | Min | Status |
|---|---|---|---|
| 1. Completeness | 140/150 | 90 | PASS |
| 2. Semantic Purity | 185/200 | 120 | PASS |
| 3. Precondition Exclusivity | 150/150 | 90 | PASS |
| 4. Fact Alignment | 115/150 | 90 | PASS |
| 5. Surface Fitness | 90/100 | 60 | PASS |
| 6. Internal Consistency | 145/150 | 90 | PASS |
| 7. Anchor Integrity | 90/100 | 60 | PASS |
| 8. Fixture Specification | 80/100 | 60 | PASS (veto not triggered) |
| **Total** | **995/1100** | **935** | **PASS** |

**Verdict: 995/1100 — above the 935 pass line; every dimension above its min threshold.** The contract set is structurally strong: complete six-dimension Outcomes with explicit Side-effects, verbatim invariants, genuinely clean precondition partitioning (notably better than the sibling project-registration set, whose step-3 overlaps have no analogue here), exemplary fact-cited handling of the two highest-risk inferred constructs (dock-tab preseed via `DOCK_TAB_MODEL`, zero-session placeholder), and fully resolved cross-contract state chains. The deductions concentrate in: (a) fact/provenance discipline — a wrong rail-geometry interval and a retry policy falsely attributed to the journey Setup; (b) the `session-expired` N/A adjudication not surfacing at contract level; (c) a systematic page-anchor title mismatch vs the handbook; (d) fixture-model warts (DshRuntime pseudo-entity, session_list_phase pseudo-field, misattributed prerequisite_entity).

**Cheapest high-yield fixes for the reviser (priority order):**
1. Fix rail interval to 264–420px (or cite `RAIL_GEOMETRY` / mark the ~240 legacy value) — +8 (D4).
2. Move the 120s/retry/degrade policy out of the State dimension into an execution note marked `source: inferred`, and stop calling it a "旅程 Setup 契约" — up to +22 (D4 + D2).
3. Add one `session-expired` N/A adjudication line (auth-less local surface; nearest neighbor = runtime unavailability, environmental) — +20 (D1 + D5).
4. Normalize page anchors to "工作台 · 会话视图（默认态）" (spaces around interpunct) in all 6 files — +10 (D7).
5. Replace `DshRuntime` entity with a state_requirement; replace `session_list_phase` field constraint with a transient-state expression; fix step-2's prerequisite_entity attribution — up to +20 (D8).
6. Restore literal `source: inferred` tags on the three carried-over inferred notes (equivalence class, fixture-message guarantee, coverage caliber) — up to +10 (D4).
7. Align step-1's DockTab seeding with the Setup baseline (or scope the invariant) — +5 (D6).
8. Declare switch-back / re-expand as explicit Input actions in step-6/step-1 — removes blindspot 1's executability gap.
