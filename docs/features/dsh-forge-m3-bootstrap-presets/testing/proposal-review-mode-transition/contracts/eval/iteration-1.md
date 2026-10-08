# Contract Eval Report — proposal-review-mode-transition / iteration 1

- **Scorer**: Senior QA Engineer (adversarial), verification stance
- **Date**: 2026-10-08
- **DOC_DIR**: `testing/proposal-review-mode-transition/contracts/` (5 files: step-1 … step-5)
- **Surface**: web (journey `surface_types: ["web"]`)
- **References**: rubric `skills/eval/rubrics/contract.md` (1100); `gen-journeys/rules/surface-web.md`; handbook `design/page-map.md`; `.forge/fact-table.json` (139 entries); design cross-check `design/tech-design.md`
- **Iteration**: 1 (no previous report)

## Verdict

**SCORE: 964/1100 — PASS** (target 935; all dimensions above min thresholds)

| Dimension | Score | Min | Pass |
|---|---|---|---|
| Completeness | 142/150 | 90 | ✓ |
| Semantic Purity | 188/200 | 120 | ✓ |
| Precondition Exclusivity | 140/150 | 90 | ✓ |
| Fact Alignment | 100/150 | 90 | ✓ (near floor) |
| Surface Fitness | 94/100 | 60 | ✓ |
| Internal Consistency | 145/150 | 90 | ✓ |
| Anchor Integrity | 80/100 | 60 | ✓ |
| Fixture Specification | 75/100 | 60 | ✓ |

---

## Phase 1 — Reasoning Audit (pre-score anchors)

1. **Journey → contract mapping is 1:1 complete.** All 5 happy-path steps and all 8 edge cases (1b/1c/2b/2c/3b/4b/4c/5b) are operationalized as Outcomes: chips-boundary-behavior, legacy-mode-placeholder, empty-reason-refused, disallowed-target-hidden, proposal-doc-jump, expedition-accepted-chain-contrast, agent-face-no-mode-verb, chip-consistency-after-change. Journey invariants block is copied verbatim into all 5 files.
2. **Cross-step state chain is sound.** Step 4 State "proposals.mode = expedition（正门写径）；既有任务的 mode 快照不变（创建时值）" feeds Step 5 Preconditions "模式更改已提交（blitz → expedition 写库返回）" and Task fixture "mode = blitz（创建时快照——未回溯）" — consistent with fact M3_TASK_MODE_SNAPSHOT.
3. **Independent judgment formed before scoring**: the dominant defect class in this set is **unverifiable/contradicted Side-effect claims about the event log** (3 of 13 Outcomes), plus fixture under-declaration for the 4b contrast assertion and two anchor gaps. Everything else (state machine vocabulary, chain gate, decided_at, mode lineage, setMode door, blank lock) aligns precisely with facts M3_PROPOSAL_FIVE_STATES / M3_PROPOSAL_TRANSITION_RULE / M3_CHAIN_GATE_EXPEDITION / M3_DECIDED_AT_SEMANTICS / M3_PROPOSAL_MODE_LINEAGE / M3_SETMODE_UI_ONLY and page-map.

---

## Phase 2 — Dimension Scoring

### 1. Completeness — 142/150

- **Four mandatory dimensions (50/50)**: every Outcome in all 5 files has non-empty Preconditions / Input / Output / State; Side-effect present (or "none") throughout; Invariants optional and used where meaningful.
- **Journey Invariants section (50/50)**: all 5 files carry `## Journey Invariants` with the journey's 4 entries verbatim.
- **Outcome coverage incl. surface-mandated derived scenarios (42/50)**: happy paths 5/5, journey edge cases 8/8. validation-error is concretely realized (step-2 `empty-reason-refused`, with header adjudication quoting the surface rule); session-expired is adjudicated N/A per file with a defensible reason ("本地单人工作台无登录态"). **-8**: step-4's own form has no validation-error Outcome anywhere. Its adjudication delegates to a *different dialog*: "validation-error = N/A（模式更改对话框说明必填的空因拒绝形态与 Step 2b 同门（评审流转对话框同形），由 step-2 合约承载…）". The 模式更改对话框 is a distinct form with its own required field (说明); page-map only guarantees "空因拒绝留场" for the verdict dialog ("模式更改 = 远征⇄突击二选 + 说明必填 + 快照不回溯一行明示" — no refusal-stay behavior stated). A downstream generator producing step-4 tests has no Outcome specifying the mode dialog's empty-说明 behavior; the same-shape inference is untested by any contract.

### 2. Semantic Purity — 188/200

- **Natural language, no code/regex (76/80)**: no regex, CSS selectors, XPath, or framework assertion calls anywhere. **-4**: Outputs embed test-instruction meta-language rather than system behavior — e.g. step-3 "写库结果与人工面一致（同门动词，对比断言）" and step-5 "（整数 ID / eval 豁免不变——断言）" describe *how to verify*, not *what the system produces* (inherited verbatim from the journey, but the contract is the layer that should operationalize, not repeat, assertion markers).
- **Declarative Preconditions (60/60)**: all Preconditions are state descriptions ("库中存在多态提案…", "模式更改已提交（blitz → expedition 写库返回）"), no setup procedures.
- **No implementation coupling (52/60)**: **-8** for store-column-level detail inside dimension values: step-2 State "proposals.proposal_status = 目标态（裁决态写 decided_at；superseded 写谱系）", step-4 State "proposals.mode = expedition（正门写径）", step-5 State "新会话 agentPreset = expedition". State dimensions legitimately name persistent fields (journey uses the same phrasing), but column-level naming (`decided_at`, `superseded_by`-implied 谱系, `agentPreset`) drifts from user-observable behavior toward schema coupling. Tool/RPC names in Input/Invariants ("经 transitionProposal tool", "setMode = UI 专属 RPC") are acceptable as the actual interaction verbs.

### 3. Precondition Exclusivity — 140/150

- **Distinct Preconditions per Step (60/60)**: within every file, no two Outcomes share equivalent Preconditions. Step-2's success vs empty-reason-refused are cleanly split by "reason 已填" vs "reason 留空".
- **Sufficient to uniquely select (40/50)**: **-10** — step-5's pair overlaps on an identical base clause: success requires "模式更改已提交（blitz → expedition 写库返回）；该提案有既有任务与会话在场" while chip-consistency-after-change requires "模式变更已提交（写库返回——读面一致性场景：重查 mode chip）". In any post-change state with existing tasks/sessions both Preconditions hold; selection is only possible via Input, not state. Low practical ambiguity (Inputs differ: create-session vs refresh), but a state-only selector cannot disambiguate.
- **Error/boundary triggers explicit (40/40)**: every boundary Outcome names its trigger (0-count chip / NULL mode / empty reason / intermediate current state / accepted expedition / tool-face enumeration / post-change requery).

### 4. Fact Alignment — 100/150 (weakest dimension)

- **Factual claims traceable / UNKNOWN-marked (28/60)**:
  - **Verified against fact table**: five-state vocabulary (M3_PROPOSAL_FIVE_STATES), allowed-set-minus-current + ERR_INVALID_TRANSITION (M3_PROPOSAL_TRANSITION_RULE), accepted→registerFeature chaining with blitz/NULL never chaining (M3_CHAIN_GATE_EXPEDITION), decided_at semantics (M3_DECIDED_AT_SEMANTICS), NULL-mode legacy placeholder (M3_PROPOSAL_MODE_LINEAGE), setMode UI-only / no agent mode verb (M3_SETMODE_UI_ONLY, M3_PLUGIN_FORGE_TOOLS), task mode snapshot + blitz integer-ID/eval-exempt (M3_TASK_MODE_SNAPSHOT, M3_BLITZ_TASK_SEMANTICS), chips zero-count disabled (M2_STATUS_CHIPS_ZERO_DISABLED analog + page-map), blank lock (page-map hero section).
  - **-22 — event-log Side-effect claims are untraceable, and two are contradicted by the design**. tech-design Interface 3 分工边界 states: "logs/{slug}.jsonl = agent 面执行运营日志；UI 面状态变更审计 = feature_records / task_records / proposals.decided_at（DB）——两纪律不混不重复", and the bus is fed by "工具执行只发事件（零日志代码）". Yet:
    1. step-2 success (UI verdict face) Side-effect: "提案域转移动词事件落事件日志" — **contradicted**: UI-face verdicts audit to DB (decided_at), never to the agent-face event log.
    2. step-4 success (UI setMode face) Side-effect: "模式变更动词事件落事件日志（UI 专属通道）" — **contradicted**: setProposalMode is UI-exclusive RPC with no tool face; per the design boundary it writes `proposals.mode` only; the event log is not a "UI 专属通道".
    3. step-3 success (agent tool face) Side-effect: "提案域转移动词事件落事件日志" — **unverified**: fact M3_FORGE_EVENT_TYPES (code recon) lists only dispatch events (task-claimed/task-spawned/task-worker-done/no-ready-task); the design's ForgePluginEvent union includes `proposal-created` but no proposal-transitioned verb ("…verb 级按需扩" is future extension, not shipped fact).
    None of the three is marked UNKNOWN or `source: inferred`. A test asserting any of these today would fail against the design. The journey itself makes no such claims — these were added at contract-generation time.
  - **-10 — superseded payload requirement omitted**: step-2 success Preconditions claim sufficiency as "目标态在允许集内且 reason 已填（提交即成功形态）" with Input "选目标态并填 reason 提交", and State promises "superseded 写谱系". Fact M3_SUPERSEDED_TARGET_REQUIRED: "to_status=superseded must carry superseded_by (target proposal id validated in place, 404 if absent)". superseded is mechanically inside the five-state allowed set, so the success Outcome's stated input contract is insufficient for the superseded branch it itself references — a generator producing a superseded transition from this contract would omit the mandatory payload and fail.
- **Inferred claims rule support + source:inferred (44/50)**: derived-outcome handling is annotated in each file's header comment with explicit reasoning tied to the web required_outcomes (e.g. step-2: "validation-error = 承载 Outcome "empty-reason-refused"（本步 2b：裁决对话框 = 表单提交步——reason 必填、空因拒绝留场，web validation-error 原生形式）"), and empty-reason-refused's Invariants line tags "web validation-error 原生形态". **-6**: no literal `source: inferred` annotation on any Outcome; support lives only in HTML comments rather than in the Outcome blocks the rubric scopes.
- **No unclassified hallucinations (28/40)**: **-12** for the three unclassified Side-effect instances above (zero-tolerance criterion; the two UI-face ones are design-contradicted, the agent-face one is unsupported by code-recon facts).

### 5. Surface Fitness — 94/100

- **Mandatory derived Outcomes (36/40)**: validation-error concretely present in step-2; session-expired adjudicated N/A in all 5 files with surface-consistent justification. **-4**: step-4's form-level validation-error is delegated cross-contract to a different dialog (see Completeness), leaving the 模式更改对话框 without its own derived Outcome on the only surface this journey declares.
- **Surface-appropriate language (33/35)**: user-centric web language throughout (chips, ⋯ 菜单, dialogs, sub-tabs, refresh/requery). **-2**: step-5 Output "既有任务按创建时快照照旧执行（整数 ID / eval 豁免不变——断言）" uses internal task-semantics vocabulary (integer local_id, eval-gate exemption) not observable on the web read face; the contract gives no web-observable proxy for this assertion.
- **TUI timeout criterion (25/25)**: N/A for web — full marks.

### 6. Internal Consistency — 145/150

- **Invariants hold in every Contract (60/60)**: no Step violates 模式绑定三律 / 双面流转同门 / mode-chip 一致 / 快照不回溯. Step-4's success explicitly routes mode change through the sole door; step-5 asserts zero retroaction in both task-snapshot and session-preset domains.
- **Cross-Contract references (45/50)**: step-4's adjudication pointer ("由 step-2 合约承载") resolves to an existing Outcome; step-5's preconditions resolve against step-4's State writes; step-3's "另一提案" keeps the transition target disjoint from step-2's. **-5**: the event-log channel is characterized inconsistently across contracts — step-4 calls it "（UI 专属通道）" while step-3 has the agent tool face landing "提案域转移动词事件落事件日志" in the same log; both cannot be true of one channel whose writers are tools.
- **Preconditions achievable from preceding States (40/40)**: step-4's blitz-in-flight setup and step-5's post-change preconditions are each reachable; no step demands a state a predecessor destroys.

### 7. Anchor Integrity — 80/100

Handbook `design/page-map.md` exists with web entries → dimension active.

- **Anchor field completeness (30/40)**: **-10** — step-3 frontmatter has `page: ""` (with `route`/`layout` also empty) yet the file contains a web interaction Outcome: proposal-doc-jump Input "点击提案行文档链接" → Output "dock 文档 tab 打开对应文档" operates on 概览 · 提案子 tab (page-map: proposal rows carry the doc links). A web-e2e generator gets no page anchor for this Outcome.
- **Anchor values match handbook (20/30)**: step-1/5 "概览 · 提案子 tab", step-2 "评审流转对话框", step-4 "模式更改对话框" all match page-map entries. **-10** — step-4's expedition-accepted-chain-contrast operates on a page its anchor does not cover: Input "检查 feature 子 tab 与谱系" targets 概览 · feature 子 tab, while the contract's only anchor is 模式更改对话框.
- **Handbook internal consistency (30/30)**: no duplicate or conflicting page definitions in page-map (three sub-tabs and two dialogs are distinct rows; M3 declares 无新路由 and all `route: ""` values are consistent with that).

### 8. Fixture Specification — 75/100

- **Entity completeness, semantic verification vs design (28/40)**: Proposal / Task / Session all correspond to design domain concepts. **-12** — `ProposalDocument` (step-3 proposal-doc-jump: "entity_type: "ProposalDocument" … relationship_type: "belongs_to"") does not match the design's domain model: tech-design adjudication explicitly rejected a proposal_documents table ("proposal_documents 新表（无写径支撑——提案文档由人/git 摆放，非动词产物）" listed as the rejected alternative; accepted = "只读目录扫描 listProposalDocs（零状态零写径）", files under `docs/proposals/<slug>/`). Fixture seeding must create files, not entity rows; the declared entity type implies a persistence entity that does not exist. (Veto not triggered — no referenced entity *type* is missing from `entities`; this is a semantic mismatch, deducted within the criterion.)
- **Relationship and constraint coverage (30/35)**: Task belongs_to Proposal declared in steps 4/5; ProposalDocument belongs_to declared in step-3; field constraints are specific (five-state representation, mode NULL, blitz snapshot, under-review). **-5** — step-5's Session ("composition: 既有会话（模式变更前创建——已确立）") has no declared relationship to the Proposal/Task context it is asserted against, leaving the "查看既有任务与会话" linkage underspecified.
- **Minimum data quantity (17/25)**: step-1 success min_count 5 (five-state representation) and boundary min_count 2 are feasible. **-8** — step-4 expedition-accepted-chain-contrast declares `min_count: 1` (expedition accepted) but its Output asserts a two-branch contrast: "对照：突击提案 accepted 无 feature 行（两分支分化断言）". The blitz-accepted counterpart proposal is required by the assertion yet absent from the fixture — the contrast half of the scenario is unseedable as specified.

---

## Phase 3 — Blindspot Hunt (outside rubric dimensions)

1. **[blindspot] Agent-tool-face Outcomes are not realizable on the declared web surface, and no test layer is named.** step-4 agent-face-no-mode-verb Input: "枚举 agent tool 面动词" (and step-3 success Output: "agent tool 面无模式改写动词（契约断言——模式不可变边界）"). The tool face is a plugin registration surface; a web e2e test cannot enumerate it from the browser. The design realizes this exact assertion as a vitest contract pin ("契约 pin（G1 扩池）… setProposalMode 缺席（代码审计）", tech-design), but the contracts give gen-test-scripts no hint of the realizing layer — every Outcome here reads as web-e2e-shaped. Risk: the strongest SC3/律三 assertion in the journey silently becomes unexecutable or gets approximated by UI-side proxies. Contracts should state the verification vehicle (code-audit/contract-pin vs browser).
2. **[blindspot] "既有会话按 blank 锁保持原预设" has no web-observable.** step-5 Output asserts session-preset continuity, but a preset of an existing session is not rendered anywhere in the proposal tab (the hero seat is a new-session face per page-map). Without a stated observation channel (e.g. session config inspection), the assertion is untestable as written.
3. **[blindspot] The verdict dialog's accepted-branch copy is asserted nowhere.** step-2 success Output stops at "对话框目标态仅列五态机允许集 + reason 必填"; page-map specifies "accepted 分叉文案（远征 → 将单步成链建 feature；突击 → 直接进入任务阶段·无 feature）" as part of the same dialog. No Outcome in any contract pins this user-facing divergence copy — the only accepted-branch coverage is the post-hoc DB/feature-tab assertion in 4b, so a regression in the dialog's expectation-setting copy would pass this contract set.
4. **[blindspot] Duplicated tool-face assertion across contracts.** step-3 success bundles "agent tool 面无模式改写动词（契约断言）" as a second clause of the transition-success Outcome, while step-4 dedicates a whole Outcome (agent-face-no-mode-verb) to the same assertion. Whichever test layer realizes it, one of the two will be a redundant re-run; bundling also makes step-3's success Outcome fail atomically if the enumeration check breaks, obscuring which behavior regressed.

---

## Deduction Ledger (summary)

| # | Dimension | Δ | Root cause |
|---|---|---|---|
| 1 | Completeness | -8 | mode-dialog validation-error delegated to a different dialog's Outcome |
| 2 | Semantic Purity | -4 | assertion meta-language inside Outputs |
| 3 | Semantic Purity | -8 | store-column-level coupling in State values |
| 4 | Precondition Exclusivity | -10 | step-5 outcome pair shares base clause; state-only selection ambiguous |
| 5 | Fact Alignment | -22 | event-log Side-effects: 2 design-contradicted (UI faces), 1 unverified, none UNKNOWN-marked |
| 6 | Fact Alignment | -10 | superseded requires superseded_by payload (M3_SUPERSEDED_TARGET_REQUIRED) not in success Input/Preconditions |
| 7 | Fact Alignment | -6 | no `source: inferred` annotations on Outcome blocks |
| 8 | Fact Alignment | -12 | unclassified side-effect claims (zero-tolerance criterion) |
| 9 | Surface Fitness | -4 | step-4 form-level derived outcome absent |
| 10 | Surface Fitness | -2 | non-web-observable vocabulary in step-5 Output |
| 11 | Internal Consistency | -5 | event-log channel characterized as "UI 专属通道" (step-4) vs agent-face landing (step-3) |
| 12 | Anchor Integrity | -10 | step-3 `page: ""` despite web Outcome (doc jump) |
| 13 | Anchor Integrity | -10 | step-4 feature-tab Outcome not covered by its only anchor |
| 14 | Fixture Spec | -12 | `ProposalDocument` entity contradicts design's rejected-table/directory-scan adjudication |
| 15 | Fixture Spec | -5 | step-5 Session lacks relationship to proposal/task context |
| 16 | Fixture Spec | -8 | 4b contrast needs ≥2 proposals (expedition accepted + blitz accepted); min_count: 1 |

## Revision Priorities (for reviser)

1. **Fix or delete the three event-log Side-effect lines** (steps 2/3/4) — align with tech-design Interface 3 分工边界: UI-face audit = DB (decided_at / superseded_by / proposals.mode), event log = agent tool face only; mark the agent-face proposal-transition event UNKNOWN or cite the verb-extension design note.
2. **Add superseded_by to step-2's success input contract** (or scope success to non-superseded targets and add a superseded Outcome carrying the payload requirement).
3. **Give step-3 a real web anchor** (概览 · 提案子 tab for proposal-doc-jump) and extend step-4's anchors to cover the feature-tab observation.
4. **Seed the 4b contrast**: add the blitz-accepted proposal to the fixture (min_count ≥ 2 with per-branch constraints).
5. **Replace `ProposalDocument`** with the design's actual data face (doc files under the proposal docs directory).
6. **Add the mode-dialog empty-说明 refusal Outcome** (or an explicit, testable same-form justification) instead of cross-dialog delegation.
7. Name the realizing test layer for tool-face enumeration and session-preset continuity assertions (blindspots 1–2).
