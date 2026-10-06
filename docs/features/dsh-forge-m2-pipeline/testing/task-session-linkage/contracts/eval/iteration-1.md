# Eval Report: task-session-linkage / contracts — Iteration 1

- EVAL TYPE: contract | SURFACE: web | ITERATION: 1
- Scorer: adversarial rubric evaluation (contract.md, 1100 pts)
- Inputs: 5 contract files (step-1…step-5), ../journey.md, design/page-map.md, .forge/fact-table.json, PRD/tech-design (domain-model cross-ref), schema.sql, shipped code (session-links.ts, SessionTaskPills.tsx, claim.ts, list.ts)

**SCORE: 913/1100 — NOT PASSING (target 935; all dimensions ≥ min threshold, total below target)**

| Dimension | Score | Min | Verdict |
|---|---|---|---|
| 1. Completeness | 150/150 | 90 | PASS |
| 2. Semantic Purity | 186/200 | 120 | PASS |
| 3. Precondition Exclusivity | 90/150 | 90 | PASS (at floor) |
| 4. Fact Alignment | 122/150 | 90 | PASS |
| 5. Surface Fitness | 100/100 | 60 | PASS |
| 6. Internal Consistency | 103/150 | 90 | PASS |
| 7. Anchor Integrity | 100/100 | 60 | PASS |
| 8. Fixture Specification | 62/100 | 60 | PASS (at floor) |

---

## Phase 1 — Reasoning Audit (pre-score anchors)

The 5 files faithfully decompose the journey: Steps 1–5 map 1:1, all five edge cases (3b/3c/3d/3e/5b) became Outcomes, the web-surface adjudication (validation-error / session-expired N/A) is carried into every file, and the Journey Invariants block is verbatim-consistent across files. Structure is good. The problems found are in exclusivity discipline, state-model realism, and two places where assertions diverge from shipped-code facts:

1. **Claim writes BOTH a link row and an audit record** (`claim.ts:250-261`, facts M2_CLAIM_RECORD_SHAPE + M2_LINKS_WRITE_SOURCE). The sessionLinks record source has **no verb filter** (`session-links.ts:25-28` `RECORD_LINKS_BY_SESSION_SQL … WHERE r.session_id = ? GROUP BY t.id`), so a dispatcher session's own claim record surfaces as a second (执行-typed) card on the session head — per fact M2_SESSION_LINKS_DUAL_SOURCE ("same task same session participating on both sides yields TWO coexisting cards"). Steps 3/3d assert single-派发-pill oracles and their fixtures declare link rows without the co-produced claim record — a state unreachable through the product write path.
2. **The +N overflow menu shows the FULL list, not "the rest"** (`SessionTaskPills.tsx:82-84` comment "完整列表——含并排两席全量挂接，非仅溢出余量"; fact M2_PILLS_OVERFLOW "full list"). Step 3's overflow Output says the menu shows "全部其余挂接任务".
3. **tasks.feature_id is NOT NULL REFERENCES features(id)** (schema.sql:84) — Task cannot be fixtured without Feature, yet steps 2/3/5 fixtures omit the Feature entity/relationship.
4. **Step 4's feature-switch scenario needs ≥2 Features**; its fixture declares `Feature min_count: 1`.

## Phase 2 — Rubric Scoring

### 1. Completeness — 150/150

- (50/50) Every Outcome in all 5 files (10 outcomes total) has non-empty Preconditions, Input, Output, State; Side-effect explicitly declared everywhere (incl. the correct non-none "写后事件推送（claim 动词侧）" for live-pill-on-new-claim).
- (50/50) `## Journey Invariants` present with 5 entries in every file.
- (50/50) Happy path + all journey edge Outcomes present; web mandatory derived outcomes (validation-error, session-expired) adjudicated with carried reasoning in each file: "validation-error N/A — 本旅程全部用户动作为查看与导航点击…无表单、无输入、无提交路径。session-expired N/A — 本地单人工作台，无登录态与服务端会话凭据". Step 3 has exactly 5 Outcomes (within the review checkpoint).

### 2. Semantic Purity — 186/200

- (80/80) No regex, CSS/XPath selectors, or framework assertions in any dimension value.
- (54/60) Preconditions are declarative, EXCEPT step-4 success: "概览当前可能停在另一 feature" — "可能" is not a state that must hold; a precondition must be decidable (the companion state_requirement repeats the indeterminacy: "概览 tab 当前选中的 feature **可以**异于目标任务所属 feature"). −6.
- (52/60) Step-2 State carries a query-shaped union expression: "sessionLinks 读面 = links ∪ records.session_id 双源分型，不合并解释" — table/column-level computation in a dimension value (domain shorthand at best, query semantics at worst). −8. (Step-5's "目标会话在 task_session_links 与 task_records.session_id 两源均无匹配行" is inside fixture state_requirements — fixture territory, acceptable.)

### 3. Precondition Exclusivity — 90/150 (at floor)

Step-3's success Preconditions are under-constrained and are simultaneously satisfiable with three boundary Outcomes, violating the gen-contracts HARD-RULE ("at most one Outcome's Preconditions can be satisfied for any given system state"). Success states only:

> "dispatcher 主会话在场且其 id 与挂接表行 session_id 一致（该会话曾 claim 该任务）；会话头部可达"

- vs "overflow-menu-beyond-two" ("dispatcher 会话挂接任务数 >2"): a 3-link state satisfies both → ambiguous pair 1.
- vs "exactly-two-inline-no-overflow" ("恰好 =2"): a 2-link state satisfies both → ambiguous pair 2.
- vs "re-claim-dedup-single-pill" ("同会话对 T 二次 claim（幂等重入…）"): the post-re-claim state (1 link row) satisfies both → ambiguous pair 3.

Deduction rule applied: 3 ambiguous pairs × −20 = −60. The per-Outcome fixtures (min_count 1/2/3) partially disambiguate for generation, but the Preconditions text — which the exclusivity rule scores — overlaps. Fix: constrain success, e.g. "挂接任务数 =1（并排上限内）且无重领历史". Step-5's two Outcomes are cleanly exclusive. Note (no separate deduction): step-5 no-linkage Preconditions contain a redundant confusing clause — "会话从未 claim 过任何任务…；**另有一个**从未 claim 过任何任务的会话在场" — vestigial journey-Setup phrasing; it is unclear whether the target session IS the "另一个" and no fixture supports a second no-claim session.

### 4. Fact Alignment — 122/150

- (40/60) Content was verified against the fact table and mostly aligns (M2_THREE_VIEWS sub-row linkage count; M2_PILLS_OVERFLOW ≤2 inline / +N; M2_EVENT_PUSH_CHAIN ≤500ms; M2_SESSION_LINKS_DUAL_SOURCE dual typing; M2_LINKS_WRITE_SOURCE UNIQUE idempotency). Two misalignments:
  1. **Overflow menu contents**: contract asserts "打开菜单可见**全部其余**挂接任务（含分型标注）" — the fact says "official Menu portal (**full list** + per-item source typing label)" and the code renders `sessionPillMenuItems(pills)` over ALL pills ("完整列表——含并排两席全量挂接，非仅溢出余量"). A test authored as "menu = remainder" (row count N−2, inline pills absent from menu) fails against shipped behavior. −8.
  2. **Dispatcher's claim record is never modeled**: step 3 success asserts a single-typed presentation — "pill 分型标识为派发（该会话的挂接来源 = claim 写入的挂接表行）" — and step 3d asserts "任务 T 仍呈**单一** pill，无重复 pill". Under the journey's canonical Setup ("一次完整派发已发生：dispatcher 主会话 claim 任务…+ executor 匿名子会话 submit"), claim atomically writes a task_records row with session_id = dispatcher (claim.ts:250-255), and the unfiltered record source turns that into a second 执行-typed card for the same task on the dispatcher's own session head (M2_SESSION_LINKS_DUAL_SOURCE two-coexisting-cards rule). The contracts neither assert nor adjudicate this; their fixtures sidestep it with synthetic states. The journey's namesake oracle is unsound as written. −12. (This is also a defect signal to adjudicate: either the record source should filter verb, or the dual-pill dispatcher display is intended and the contracts must say so.)
- (42/50) All five boundary Outcomes carry "source: inferred 注记承旅程" + journey-step refs EXCEPT "exactly-two-inline-no-overflow" whose comment is only "（journey.md Step 3c，off-by-one 边界值）" — no `source: inferred` annotation. Additionally, none of the files cite fact-table ids, where the sibling convention does (task-dispatch-pipeline step-2/5 use "reasoning: Fact Table M2_CLAIM_REENTRY（claim.ts:15-17…）" style comments); the load-bearing facts for this journey (M2_SESSION_LINKS_DUAL_SOURCE, M2_PILLS_OVERFLOW) go uncited. −8.
- (40/40) No hallucinated unclassified claims found — every behavioral assertion traces to a fact, the journey, or PRD UI-function references.

### 5. Surface Fitness — 100/100

- (40/40) Mandatory web derived Outcomes adjudicated (N/A with reasoning) in every file, carried from the journey's "Derived Outcomes 裁决" section.
- (35/35) Consistently web-appropriate language (tabs, drawer, pills, +N menu, session switching, click navigation); no CLI/API idioms.
- (25/25) TUI timeout criterion N/A for web — full marks.

### 6. Internal Consistency — 103/150

- (48/60) Invariants mostly hold, two tensions:
  - live-pill-on-new-claim State labels the claim "（**前置**动作）" while its own Preconditions establish it as subsequent ("头部已渲染且尚未挂接任务 X；该会话**随后**完成对 X 的一次 claim"). −5.
  - The copied invariant "同一「任务 × 会话」挂接**恒单一展示**" collides with step 2's own outcome-level "同任务同会话双侧参与则**两卡并存**（诚实审计）" — reconciliation exists only in parentheticals (per-source uniqueness), and given finding 4.2 (dispatcher's claim record puts it on both sides mechanically), the absolute phrasing is unsafe as a test oracle for the dispatcher case. −7.
- (25/50) Cross-contract state modeling is inconsistent:
  - "一次完整派发已发生" is operationalized differently: step 1's fixture demands `TaskRecord min_count: 2` with "claim（派发会话）+ submit（执行会话）各至少一行" (the realistic producible state), while steps 2–5 fixtures declare no claim record at all (step 2: submit-only `min_count: 1`; steps 3/4: link-only). Steps 3/4's own Preconditions ("该会话曾 claim 该任务") imply the claim audit row exists — claim writes record+link in one transaction. −15.
  - Task parentage declared differently across contracts: steps 1/4 "Task belongs_to Feature belongs_to Project" vs step 3 "relationship_type: has_many / parent_entity: Project" — schema has `tasks.feature_id NOT NULL` and no task→project FK. −10.
- (30/40) Step 4's success Output demands "（即使概览当前停在另一 feature 亦切至该任务的 feature）" and its state_requirement demands the selected feature differ from the target's, but its fixture declares `Feature min_count: 1` — the scenario is infeasible with one feature. −10.

### 7. Anchor Integrity — 100/100

Handbook (`design/page-map.md`) exists; anchor field for web is `page`; all 5 files carry `anchors.web.{page, route, requires_auth, layout}`.

#### Missing Anchor Fields

| File | Missing field | Note |
|---|---|---|
| — | — | None. `page` present in all 5 files; journey-relevant handbook entries all covered (dswf-overview ×2, 任务详情抽屉, 会话头挂接 pill 行 ×2, step-4 composite listing both endpoints). dswf-doc / 转移状态对话框 / 注册表单派生行 belong to other journeys — correctly out of scope here. |

#### Handbook Conflicts

| Conflict | Location | Note |
|---|---|---|
| — | — | None. 6 distinct page entries, no route/registration conflicts (dswf-overview singleton replaceTab vs dswf-doc multiple is by design). |

- (40/40) Field completeness.
- (30/30) Values resolve unambiguously to handbook entries; qualifiers add precision using the handbook's own identifiers (e.g. "右栏「项目概览」tab（dswf-overview）任务子 tab 列表视图" contains the exact page name + its route id; "会话头挂接 pill 行（SessionTaskPills）" matches the handbook heading incl. component). `route: ""` for drawer/pill surfaces correctly mirrors the no-new-route architecture.
- (30/30) Handbook internally consistent.

### 8. Fixture Specification — 62/100

- (40/40) Entity-completeness veto NOT triggered: every entity type textually referenced in Preconditions/Input/State is present in `fixture_spec.entities` per file (Task/TaskSessionLink/TaskRecord/Project/Feature as referenced). The deeper realism gap (claim record absent from steps 3/4 fixtures though implied by "曾 claim") is scored under relationship coverage and Internal Consistency, not as a veto.
- (5/35) Relationship coverage: `tasks.feature_id NOT NULL REFERENCES features(id)` (schema.sql:84) makes Task un-fixturable without Feature, and step 1/4 declare the chain correctly — but step 2 (Task parentless, Feature absent), step 3 all five outcomes (Task declared `has_many parent_entity: Project` instead), and step 5 (Task/TaskRecord parentless, Feature absent) all miss the Task→Feature relationship. 3 missing relationships × −10 = −30.
- (17/25) min_count: step 4 `Feature min_count: 1` cannot support the "selected feature ≠ target's feature" switch scenario its own Output and state_requirement demand (needs ≥2). −8. All other counts sufficient (overflow 3/3, exactly-two 2/2, step-1 records 2, live-pill 1/1).

### Cross-dimension coherence check

The dispatcher-claim-record finding legitimately manifests in three places (Fact Alignment −12, Internal Consistency −15, and the fixture realism note) — it is one root cause, scored where it most clearly manifests, not triple-penalized arbitrarily. The Task→Feature fixture gap similarly surfaces in Fixture (−30) and as a cross-contract inconsistency in Internal Consistency (−10, for the contradictory `has_many Project` vs `belongs_to Feature` declarations).

## Phase 3 — Blindspot Hunt

1. [blindspot] **Fixture schema cannot express the journey's central subject — dsh ledger sessions.** Every precondition pivots on sessions ("dispatcher 主会话在场且其 id 与挂接表行 session_id 一致") and field_constraints reference "dispatcher 主会话 id", but sessions live in the dsh ledger, not forge.db, and no `state_requirements` entry declares how a session with a known id is seeded/observed (E2E_INFRA shows session-log probes exist). gen-test-scripts must invent the session-seeding seam. — Quote: `field: "sessionId" / value: "dispatcher 主会话 id"`. Contracts should add state_requirements for ledger sessions (or a documented seam), else the fixture is unrealizable as written.
2. [blindspot] **No Outcome anywhere covers the same-session-both-sources display on the session head** — the exact production ambiguity the fixtures sidestep (dispatcher's 派发+执行 dual pill). The journey lacks it too; the contract generation inherited the blind spot instead of catching it. — Quote: step 3d "任务 T 仍呈单一 pill，无重复 pill". Either adjudicate the verb-filter question or add an outcome pinning the dual-card head display.
3. [blindspot] **Step 1's count oracle never pins the dedup口径.** "副行呈现该任务的挂接计数（挂接会话数汇总…）" — shipped code dedupes across both sources ("挂接计数（双源 UNION 去重）", list.ts:141): canonical state yields 2 sessions but 3 cards. A test author could legitimately assert 3. The contract should state "双源 UNION 去重后的会话数".
4. [blindspot] **Outcome count / duplication**: step 3's overflow Outcome embeds a full copy of Step 4's navigation assertion ("菜单内条目点击后与 Step 4 同一导航（dock 开概览 + 任务子 tab + 选中 feature + 任务抽屉打开）") — duplicated oracle creates maintenance drift risk if Step 4 changes; a reference-only formulation would suffice.
5. [blindspot] **live-pill's ≤500ms bound is asserted without a measurement protocol** ("时延有界 ≤500ms") — M2_EVENT_PUSH_CHAIN defines the criterion as "single refetch after write return sees new value"; the contract should phrase the observable check (post-write refetch visibility) rather than a wall-clock bound a Playwright test can only sample coarsely.

## Top attacks (revision priorities)

1. [precondition-exclusivity] Step 3 success Preconditions overlap 3 boundary Outcomes — "dispatcher 主会话在场且其 id 与挂接表行 session_id 一致（该会话曾 claim 该任务）" — add count/history constraints (挂接数=1、无重领) to success; −20 per pair.
2. [fact-alignment] Dispatcher claim record → record-source 执行 card unmodeled; single-pill oracles unsound under producible state — "任务 T 仍呈单一 pill，无重复 pill" — adjudicate verb-filter vs dual-card and align fixtures/assertions (claim record must be in the canonical-state fixtures).
3. [internal-consistency] "一次完整派发已发生" modeled inconsistently (step 1: claim+submit records; steps 2–5: no claim record) — unify on the producible state.
4. [fixture] Task→Feature relationship missing in steps 2/3/5 (schema NOT NULL FK); step 3 wrongly declares "has_many parent_entity: Project" — declare Task belongs_to Feature everywhere; add Feature ≥2 for step 4's switch scenario.
5. [fact-alignment] Overflow menu shows the full list, not "全部其余" — "打开菜单可见全部其余挂接任务" — align with M2_PILLS_OVERFLOW ("full list").
6. [semantic-purity] Indecidable precondition phrasing — "概览当前可能停在另一 feature" — make it definite (选中 feature ≠ 目标 feature).
