# Contract Eval Report — blitz-direct-chain / iteration-1

- Scorer: adversarial (Senior QA persona), verification stance
- DOC_DIR: `docs/features/dsh-forge-m3-bootstrap-presets/testing/blitz-direct-chain/contracts/` (5 files, step-1 … step-5)
- Surface: web (rule `gen-journeys/rules/surface-web.md`); handbook: `design/page-map.md` (exists → Anchor Integrity active); fact table: `.forge/fact-table.json` (139 entries)
- Code reconnaissance performed against `packages/plugin-forge/src/**` (emit points, tool schemas, skill dirs) to verify factual claims

## Verdict

**SCORE: 982/1100 — NOT PASS**: total ≥ 935 but **Fact Alignment 88 < 90 (min threshold)**. Revision iteration required.

| Dimension | Score | Min | Status |
|---|---|---|---|
| Completeness | 150/150 | 90 | PASS |
| Semantic Purity | 182/200 | 120 | PASS |
| Precondition Exclusivity | 144/150 | 90 | PASS |
| Fact Alignment | **88/150** | 90 | **FAIL** |
| Surface Fitness | 98/100 | 60 | PASS |
| Internal Consistency | 140/150 | 90 | PASS |
| Anchor Integrity | 90/100 | 60 | PASS |
| Fixture Specification | 90/100 | 60 | PASS |

---

## Phase 1 — Reasoning Audit (pre-score anchors)

- Journey structure faithfully operationalized: Step 1→"success"+"mode-written-at-creation" (edge 1b); Step 2→"success"+"revised-back-to-draft" (2b)+"no-feature-row-on-accept" (2c)+"validation-error-reason-empty" (derived); Step 3→"success"+"worker-blocked" (3b)+"no-ready-task-pool-done" (inferred boundary); Step 4→"success"+"ac-evidence-missing" (4b)+"concurrent-browsing-single-refetch" (4c); Step 5→"success"+"spec-skill-request-physically-invisible" (5b). All 7 edge cases mapped; journey invariants restated in all 5 files.
- Web required-outcome adjudication comment present in all 5 files; validation-error materialized only where a form exists (Step 2 评审流转对话框) — correct surface judgment.
- Cross-contract state chain (proposal draft → accepted → task pending → in_progress → completed → pool settled) is coherent.
- Code reconnaissance results that drove Fact Alignment scoring:
  - Emit-point closure = "dispatchTask 五事件 + submitTask task-submitted + 全 tool-error" (`packages/plugin-forge/src/index.ts:99`); `create-proposal.ts:119` and `add-task.ts:274` call ONLY `emitToolError` (failure path). tech-design:185 separates "logs/{slug}.jsonl = agent 面执行运营日志" from "UI 面状态变更审计 = feature_records / task_records / …（DB）——两纪律不混不重复".
  - `packages/plugin-forge-spec/skills/` on disk = **8** entries (breakdown-tasks, eval, gen-contracts, gen-journeys, gen-test-scripts, tech-design, ui-design, write-prd), matching fact `M3_PLUGIN_FORGE_SPEC_SKILLS`.
  - `submit-task.ts:46` `commit_hash?: string` — optional, no enforcement door (facts `M3_SUBMIT_COMMIT_HASH` = "passthrough"; `M2_SUBMIT_RECORD_SHAPE` = "gate payload recorded as-is, not judged").

## Phase 2 — Dimension Scoring

### 1. Completeness — 150/150

- All 13 Outcomes across 5 files carry non-empty Preconditions / Input / Output / State; Side-effect present everywhere ("none" where applicable); Invariants optional and present on the outcomes that need them. 50/50.
- `## Journey Invariants` present in all 5 files, 4 entries each. 50/50.
- Happy path + all journey edge cases + web-mandated derived outcomes (validation-error materialized in Step 2; session-expired adjudicated N/A everywhere with reasons — local single-user workbench, no login state). 50/50.

### 2. Semantic Purity — 182/200

- No regex, CSS/XPath selectors, or framework assertion calls anywhere. 80/80.
- Preconditions declarative — minor temporal/scene leakage: Step 4 "派发链有写入动词（claim / submit）即将发生" and Step 5 "（请求态——尝试调用而非枚举，含 blank 期后任意时点）" embed scenario timeline into state descriptions. 56/60.
- Implementation coupling remains in dimension values: file-system paths "插件事件总线写入 logs/容器 slug.jsonl" (Step 1, Step 3 side-effects); tool-return-shape coupling "no-task 返回 + 池快照（pending 0 / in_progress 0 / blocked 0）+ 收工判词（pool all settled — wrap up）" (Step 3 Output); event payload field names "task-claimed / task-spawned（含 workerSessionId 与 toolFilter）". DB table/column vocabulary in State is accepted as house convention (schema is public contract per `M2_DB_SEVEN_TABLES`), but the path/return-shape instances exceed it. 46/60 (-14).

### 3. Precondition Exclusivity — 144/150

- Distinctness: Step 2 "success"（"draft 或 under-review" + accept decision）and "revised-back-to-draft"（"under-review" + revision needed）share the under-review state; selection differentiator lives in Input intent, not Preconditions. Mild but workable overlap. 55/60.
- Unique selection with (state, input) pairs: unambiguous in all steps; Step 4 success vs ac-evidence-missing cleanly separated by gate completeness ("gate 四项齐备…已附测试证据" vs "gate.test 不为真"). 49/50.
- All error/boundary outcomes state explicit triggers ("reason 留空", "ac_json 非空…缺测试证据", "容器任务全部处于终态", "规格技能目录物理不在组合内"). 40/40.

### 4. Fact Alignment — 88/150 (BELOW THRESHOLD)

- Factual claims traceable / correct: 40/60
  - **Step 5 enumeration error**: "全程技能清单不含任何规格技能（write-prd / ui-design / tech-design / gen-journeys / gen-test-scripts / breakdown-tasks 七者零在场）" — lists **6** names, claims **七者**, while both the fact table (`M3_PLUGIN_FORGE_SPEC_SKILLS`) and `packages/plugin-forge-spec/skills/` contain **8** (gen-contracts and eval missing from the list; amusingly gen-contracts is the generating skill itself). A test built on this enumeration under-asserts the physical boundary. -12.
  - **Step 4 Invariant overclaim**: "submit 记录恒含 commit_hash" — `submit-task.ts` declares `commit_hash?: string` (optional) and no fact establishes an enforcement door (the only doors are `M3_SUBMIT_AC_GATE` / `M3_SUBMIT_GATE_DOOR`); `M2_SUBMIT_RECORD_SHAPE` explicitly says the service does not judge payloads. "恒含" is discipline-level (submit-task skill), not mechanism-level; as a system invariant it is unverifiable and would mislead gen-test-scripts. -8.
- Inferred claims annotated: 48/50
  - Step 2 "validation-error-reason-empty": `source: inferred` + reasoning citing the web form-step justification and `M3_PROPOSAL_TRANSITION_RULE` — exemplary.
  - Step 3 "no-ready-task-pool-done": `source: inferred` + fact-based reasoning (`M3_DISPATCH_POOL_SNAPSHOT`) — good, but it is a domain boundary not mandated by any `required_outcomes` rule and the derivation-trigger adjudication (why this boundary, why not the surface rule's additional web boundaries) is thinner. -2.
- No hallucinated unclassified claims: 0/40
  - **Step 1 "success" Side-effect is contradicted by code**: "插件事件总线写入 logs/容器 slug.jsonl（提案与任务写入动词事件）". Verified against the codebase: `create-proposal.ts:119` / `add-task.ts:274` emit only `emitToolError` on failure; `index.ts:99` closes the emit-point list ("dispatchTask 五事件 + submitTask task-submitted + 全 tool-error"); tech-design:185 explicitly keeps write-verb state audit in DB records, NOT jsonl. After quick-tasks (createProposal + addTask), zero events land in logs/{slug}.jsonl. A generated test asserting this side-effect fails 100%. Unclassified, untraceable, false → hallucination rule applied. -30.
  - **Step 3 "worker-blocked" Side-effect half-false**: "fix 链协议事件与审计行落库" — the 审计行 half is fact-backed (`M3_BLOCK_SOURCE_ATOMIC`) but addTask has no success emit point, so "fix 链协议事件" never lands in the event log. -10 (floors criterion at 0).

### 5. Surface Fitness — 98/100

- Mandatory derived outcomes: validation-error present where a form exists (Step 2), N/A-adjudicated with reasons in all other files; session-expired N/A-adjudicated everywhere (no login state in a local single-user workbench — genuine). 40/40.
- Surface language: web interactions well-rendered ("提案子 tab 行状态即时更新", "对话框不关闭、不落部分写库", "列表 / DAG / 泳道", "任务子 tab「派发」入口"); occasional tool-face jargon in Outputs ("工具返回结算 + 池快照") where the step's face genuinely is the agent session — acceptable. 33/35.
- TUI timeout criterion: N/A for web. 25/25.

### 6. Internal Consistency — 140/150

- Journey invariants hold in every contract: gate discipline enforced (ac-evidence-missing), mode-snapshot semantics carried, no-feature-row asserted, single-refetch criterion tested. No invariant violation. 60/60.
- Cross-contract references: "任务已直挂该提案（Step 1 产出）" resolves; state chain coherent. However Step 3's adjudication comment contains a **dangling cross-reference**: "全部终态置灰分支归 Step 5 域" — Step 5 is the skill-catalog audit and contains nothing about dispatch-button disabled state; the all-terminal 置灰 branch is in fact not covered anywhere in this journey (journey-inherited gap, likely belongs to another journey or Step 3's own no-ready outcome). 45/50.
- Preconditions achievable from prior steps: all chains valid except Step 3 "no-ready-task-pool-done" whose precondition ("容器任务全部处于终态") is only reachable after Step 4's completions — a boundary outcome placed earlier than its enabling state; not contradictory, but ordering-sensitive for test sequencing. 35/40.

### 7. Anchor Integrity — 90/100

Handbook `design/page-map.md` exists → dimension active. Route fields empty everywhere is CORRECT (handbook: "M3 无新路由").

- Field completeness: **Step 4 ships `page: ""` while its own Outcome operates on a handbook page** — "concurrent-browsing-single-refetch" Input: "派发链写入动词发生的同时用户持续浏览概览三视图（列表 / DAG / 泳道）" is squarely 概览 · 任务子 tab (page-map entry, three views per `M2_THREE_VIEWS`). Missing anchor where one applies: -10. Steps 1/5 also have `page: ""` but their surfaces (in-session skill invocation; system-prompt transcription) have no handbook page entry — treated as honest N/A, recommend an explicit "N/A" marker instead of empty string to remove ambiguity. 30/40.
- Value match: Step 2 "概览 · 提案子 tab" and Step 3 "概览 · 任务子 tab" match handbook entries (version annotations aside); layouts consistent with Target Files (proposal-tab.tsx / task-tab 工具栏派发按钮). Note: Step 2's validation-error fires inside 评审流转对话框, which has its own handbook page entry (落位 proposal-tab 局部) — anchoring at the parent tab is defensible; the layout could name the dialog. 30/30.
- Handbook internal consistency: no duplicate/conflicting page definitions. 30/30.

### 8. Fixture Specification — 90/100

- Entity completeness (veto check): entity_types (WorkspaceDir, Session, Proposal, Task, Project) all correspond to design domain entities; every entity referenced in Preconditions/Input/State changes of each outcome is covered or is a created/negated output. No veto. 40/40.
- Relationship/constraint coverage: Step 2/Step 3-success outcomes correctly declare `Task belongs_to Proposal`. However five outcome fixtures omit the container relationship their scenarios depend on: Step 3 "worker-blocked" and "no-ready-task-pool-done" (block_source 链深/容器 slug are container-scoped), Step 4 "success", "ac-evidence-missing", "concurrent-browsing-single-refetch" (tasks must be seeded in the blitz proposal container; sibling outcomes show the house pattern). Systemic under-declaration of the Task→Proposal-container relationship: -10. 25/35.
- min_count adequacy: concurrent-browsing Task min_count 2 (in_progress + pending mix) fits the write-verb scenario; all others adequate. 25/25.

## Cross-dimension coherence check

- The Step 1 event hallucination (Fact Alignment) also weakens Semantic Purity's path-coupling finding — same quotes, different dimensions, no double-counted points (purity docked for path vocabulary, fact docked for truth value).
- The Step 5 "七者" error is scored once (Fact Alignment, enumeration-vs-fact); noted as on its face self-contradictory (6 listed ≠ 7 claimed) but not double-docked in Internal Consistency.
- Fixture relationship gap and Anchor Step-4 gap both trace to the same root (step-4/step-3 outcomes under-declaring their web/container context); kept in their own dimensions.

## Phase 3 — Blindspot Hunt (outside rubric dimensions)

1. **[blindspot] Unobservable assertion targets.** Step 4 "concurrent-browsing-single-refetch" Output: "tool 写入与 UI 读取无锁竞争；列表在写入返回后单次重取即见新值（即时判据成立，无 watch / 无同步延迟）". "无锁竞争" is mechanism rhetoric with no web-surface observable; "单次重取" risks coupling the E2E to refetch-count instrumentation. The assertable proxy is: after the write verb's return, the visible list shows the new value without manual refresh/polling. Contracts should phrase outputs in observer terms or gen-test-scripts will invent an instrumentation seam.
2. **[blindspot] Loading-state never adjudicated for an async-heavy journey.** The web surface rule lists loading-state among common web boundary outcomes; Step 3's dispatch loop and Step 4's settlement are long-running async operations on a live UI, yet no outcome or adjudication addresses intermediate UI states during dispatch. The files adjudicate only the two mandatory outcomes. Low severity (rule says "additional common", not mandatory), but for a journey whose Step 4c is literally "user watches while writes happen", the loading/intermediate-state face is a plausible miss.
3. **[blindspot] Session-establishment route unspecified for fixtures.** Step 1 fixture asserts `Session.composition = "blitz（customSkillDirs 仅含 plugin-forge 技能目录）"` but the journey Setup offers two routes ("hero 选突击或经 blitz 提案绑定入口自动对齐") and the contract never tells gen-test-scripts which entry to drive (hero AgentPresetSeat click vs openSessionWithPreset). Step 1 also hedges "blank 锁前或后均可" — timing the composer message against platform blank-lock is a real e2e hazard left implicit.

## Required fixes (for reviser, priority order)

1. Step 1 "success" Side-effect: delete/correct "插件事件总线写入 logs/容器 slug.jsonl（提案与任务写入动词事件）" — per emit-point closure, quick-tasks writes zero success events; correct side-effect = task_records add rows（审计）+ 无文档产出. (Restores Fact Alignment above hallucination rule.)
2. Step 3 "worker-blocked" Side-effect: drop "fix 链协议事件"; keep 审计行（task_records add / auto-block rows）.
3. Step 5 success Output: fix enumeration to the actual 8 spec skills (add gen-contracts, eval) or phrase as "plugin-forge-spec 全部技能零在场".
4. Step 4 success Invariant: soften "submit 记录恒含 commit_hash" to scenario/skill-discipline basis or mark the enforcement gap (commit_hash optional in tool schema).
5. Step 3 adjudication comment: fix dangling "全部终态置灰分支归 Step 5 域" reference.
6. Step 4 anchors: set `page: "概览 · 任务子 tab"` (concurrent-browsing outcome surface).
7. Add Task→Proposal container relationship to the five under-declared fixtures.
8. Recommended: explicit "N/A" for empty anchor values (Steps 1/5); observer-phrased outputs for the concurrency outcome.
