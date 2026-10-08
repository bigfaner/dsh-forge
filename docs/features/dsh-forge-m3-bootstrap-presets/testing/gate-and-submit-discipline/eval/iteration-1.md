# Eval Report: gate-and-submit-discipline — Iteration 1

- **Scorer**: adversarial journey eval (rubric `skills/eval/rubrics/journey.md`, 1150 pts; surface = web per `rules/surface-web.md`)
- **Target**: 975 total, every dimension ≥ min threshold
- **Result**: **901/1150 — FAIL** (Fact Alignment 78 < 90 min threshold; total < 975)

| Dimension | Score | Min | Pass |
|---|---|---|---|
| 1. Completeness | 170/200 | 120 | ✓ |
| 2. Semantic Purity | 183/200 | 120 | ✓ |
| 3. Precondition Exclusivity | 134/150 | 90 | ✓ |
| 4. Fact Alignment | **78/150** | 90 | **✗** |
| 5. Surface Fitness | 90/150 | 90 | ✓ (at boundary) |
| 6. Internal Consistency | 124/150 | 90 | ✓ |
| 7. Workflow Coverage | 122/150 | 90 | ✓ |
| **Total** | **901/1150** | 975 | **✗** |

---

## Phase 1 — Reasoning Audit (pre-score anchors)

1. **Problem→solution fit**: good. The journey decomposes PRD Story 7 (gate 兜底与提交定式) into the two-state AGENTS.md matrix, the gate-task digest, and the rejection edges — matching the story's three AC blocks.
2. **Evidence→solution support**: mostly grounded (Story 7 / SC7 / 提案关键场景 5 / db-schema §6-24), EXCEPT Edge 2b, which asserts a commit-message rejection mechanism that no source document and no code provides (verified: repo has no commitlint/husky/commit-msg hook; `submitTask` gate implements only `ERR_TEST_EVIDENCE_REQUIRED`/AC/summary checks — `packages/contracts/src/errors.ts:38`, `packages/plugin-forge/src/tools/submit-task.test.ts:143`).
3. **Success criteria validity**: expected results are assertion-shaped and match the PRD's own assertion style, except the over-broad invariant "submit 记录恒含 commit_hash" (unproven for gate-type tasks, whose step never establishes a commit).
4. **Self-contradiction**: invariant "提交信息恒符合规范" coexists with Edge 2b's non-conforming-message precondition; they reconcile only under 2b's undocumented enforcement mechanism.

---

## Phase 2 — Dimension Scoring

### 1. Completeness — 170/200

**Metadata (48/50)**. Frontmatter complete (feature/journey/risk_level/golden_path/surface_types/surface_keys/sources/generated); name `gate-and-submit-discipline` kebab-case; High risk justified — the workflow mutates task state, writes audit records, and creates git commits (irreversible). No flaw found.

**Steps complete (74/80)**. All 3 happy steps and all 4 edge cases carry User Action + Expected Result; edges carry Precondition. Deductions:
- Edge 3b's action is observational, not operational: "**User Action**: gate 失败后观察管线行为" — no actor performs anything; the step asserts an automatic mechanism without defining who triggers/verifies it.
- Step 3's dispatching actor is implicit ("**User Action**: 派发一个 gate 类型任务" — dispatched by whom, via which entry?).

**Outcomes coverage incl. surface-mandatory derivations (48/70)**. Boundary/error outcomes are present and strong on the validation-rejection side (1b/1c/2b) plus recovery (3b). But the web surface rule mandates `validation-error` + `session-expired` "must be considered for every Web Journey": `session-expired` is entirely absent — no outcome, no N/A annotation, no reasoning. The additional common web boundaries (network-error, loading-state) are likewise not considered. Deduct.

### 2. Semantic Purity — 183/200

**Natural language (76/80)**. No regex, selectors, or assertion calls. `submitTask` / `gate_json` / `commit_hash` / `block_source` are the product's domain vocabulary (used verbatim by PRD Story 7 and db-schema), not implementation coupling in the rubric's sense. Tiny deduction for record-internals phrasing density ("submit 记录含 commit_hash" — describes storage, not observed behavior).

**Declarative preconditions (55/60)**. Edge preconditions are declarative states ("任务带 AC 清单，worker 未附任何测试证据"). Deduction: Step 2's action embeds the setup procedure — "**User Action**: 移除 AGENTS.md 后另一任务由 worker 完成并提交" — the AGENTS.md toggle belongs to Setup (which already declares "工作区 AGENTS.md 可配置/移除"), not inside the action.

**No implementation coupling in steps (52/60)**. Expected results are exclusively storage-level ("gate_json 承载数字摘要落账", "submit 记录含 commit_hash") with no behavior-observable framing anywhere. Tolerable for this domain, but 8 pts withheld because no step states its result in terms of anything a user or test harness observes through the product surface.

### 3. Precondition Exclusivity — 134/150

**Distinct across outcomes (57/60)**. Step 1 vs 1b vs 1c (evidence absent / state stale), Step 2 vs 2b (conforming / non-conforming message), Step 3 vs 3b (gate pass / gate fail) — no semantic overlap.

**Sufficient to uniquely select (44/50)**. 1b ("任务带 AC 清单，worker 未附任何测试证据") and 1c ("任务实际状态与 submit 假设不符") are independent dimensions and can co-occur (a stale-state submission that also lacks evidence) — the document establishes no precedence between the two rejections.

**No missing preconditions for error outcomes (33/40)**. All four edges state triggers. Deduction: the happy path's own discriminator is never stated — Step 1 does not say the worker **attached test evidence**; the Step 1 vs 1b distinction exists only on 1b's side. A downstream agent executing Step 1 literally ("自检（任务 AC / run-tests 配方）") cannot know that attaching evidence is the precondition keeping it out of 1b's rejection.

### 4. Fact Alignment — 78/150 (BELOW THRESHOLD)

**Traceable factual claims (48/60)**.
- Steps 1–3, Edge 1b, Edge 3b trace cleanly to Story 7 AC blocks, SC7, and 提案关键场景 5 ("gate 边界：带 AC 任务 submit 缺测试证据 → 拒（错误信息含 AC 清单）…"). Edge 1b is additionally confirmed by implemented code (`ERR_TEST_EVIDENCE_REQUIRED`, data 带 AC 清单).
- Edge 1c's "拒绝并回报校验提示（**from 匹配口径**）" — invented precision: no source documents a from-parameter check or its error shape for `submitTask` (db-schema's submitTask row specifies `in_progress→completed|blocked`; the from≠to semantics belong to `transitionTask`, the human channel). The underlying M2 guard is real; the stated 校验提示口径 is not.
- Overview cites "db-schema §6-24/§6-31 兑付": §6-24 (task_records named columns incl. gate_json/commit_hash) is SC7-relevant; **§6-31 is the proposal↔feature identity-FK ruling (成链/SC6 material) and has nothing to do with gate/submit** — a propagated miscitation (the PRD SC7 row carries the same error; the journey repeats it without verification).

**Inferred claims annotated (20/50)**. Edges 1c and 2b are LLM-derived boundary outcomes not present in the source AC set. Neither cites a `required_outcomes` rule nor carries any `source: inferred` marker (unlike 1b/3b which at least gesture at sources via "（功能断言）"/"（M2 机制回归断言）"). The one web-mandatory derivation substantively present (validation-error, via 1b) is source-backed rather than annotated-inferred; the other (session-expired) is absent.

**No hallucinated unclassified claims (10/40)**. One clear instance — **Edge 2b**:
> "**Expected Result**: **拒绝**（提交历史可审计——不产生无规范提交）；纠正后可过"

This asserts a system rejection of non-conforming commit messages. Verification across the full fact base:
- Story 7 AC / SC7 / 提案方案: commit-message conformance is a **behavioral 定式** ("从其约定 / 回退模型常识级 Conventional Commits — 两态分别断言"), i.e., an assertion about what the worker produces, enforced by AGENTS.md guidance + model discipline, not by a gate.
- db-schema C4 hard-validation list for submitTask: 零测试证据拒 / AC 未满足拒 / summary 空拒 — **commit-message format is not among them**.
- Architecture: the worker itself performs the git commit (git-commit skill explicitly not migrated, Out of Scope #12); no component in the described system is positioned between "message written" and "commit created" that could reject.
- Code: no commitlint/husky/commit-msg validation anywhere in the repo; submitTask gate implements only test-evidence/AC/summary checks.

Nothing rejects. "纠正后可过" further implies a retry gate that does not exist. Per rubric deduction rule (-30 per hallucinated unclassified instance), criterion floor: 40 − 30 = 10.

### 5. Surface Fitness — 90/150 (at boundary)

**Mandatory derived outcomes (30/60)**. `validation-error` is substantively present: 1b is a submission rejected with an error message containing the AC list, self-correctable, retryable — semantically the web validation-error contract, transposed to the tool surface. `session-expired` is completely absent with no consideration and no reasoned N/A annotation, despite the surface rule's "must be considered for every Web Journey". (An N/A note would be defensible — single-user local app, no login sessions — but the document must make that consideration explicit; silence is the failure.)

**Test strategy proportions (38/50)**. 3 happy steps + 4 boundary outcomes give reasonable outcome density for a balanced 50/50 contract/journey split at the document level; no explicit proportion violation detectable in-document. Moderate score because nothing in the document structures or marks the contract-level vs journey-smoke-level split.

**Surface-realistic environment assumptions (22/40)**. Declared `surface_types: ["web"]`, yet the journey contains **zero browser interaction**: every User Action is a worker/dispatcher tool operation ("worker 完成任务改动与自检…提交并 submitTask"), and every Expected Result is DB/record-verifiable only ("submit 记录含 commit_hash", "gate_json 承载数字摘要落账"). The web rule expects browser-interaction and async-operation assumptions; the PRD itself provides a user-visible carrier this journey never uses (任务详情/执行记录时间线渲染 — a documented task_records consumer). The workflow is real but its web adaptation is absent: this reads as a pipeline-domain journey with a web label.

### 6. Internal Consistency — 124/150

**Invariants hold in every step (40/60)**. Two findings:
- "submit 记录恒含 **commit_hash**" is absolute, but Step 3 (gate-type task, "如契约面/审计类检查") never establishes that a commit occurs — audit-type tasks plausibly produce no code change (the `commit_hash` column is nullable by schema: "submit 后 git 提交"), so the invariant is unproven exactly at the step the journey itself introduces. SC7 asserts commit_hash for the worker 提交定式, not for gate-task submits.
- "提交信息恒符合规范" as an invariant coexists with Edge 2b's precondition "提交信息不符合约定/常识级规范" — internally reconcilable only via 2b's rejection mechanism, which no source supports (see Fact Alignment). Under the PRD's behavioral reading, "恒" is an aspiration, not a system property.

**Cross-step references (46/50)**. Edge numbering (1b/1c/2b/3b) maps cleanly to happy steps; Step 2's "另一任务" is unambiguous against Step 1's task. No dangling references.

**Risk level consistency (38/40)**. High is consistent: state mutation (submit/transition), irreversible git commits, append-only audit writes, fix-chain recovery.

### 7. Workflow Coverage — 122/150

**Golden Path existence (48/60)** — no veto. The happy path is a contiguous 3-step sequence semantically tied to a specific PRD user story (Story 7): commit-with-convention → commit-without-convention (fallback) → gate-task digest. Steps use domain terminology (提交定式/自检/派发), not bare API calls. Not full marks: Steps 1–2 are the same operation under two configurations (variation, not workflow progression — justified by the PRD's explicit "两态分别断言", but the sequence reads as an assertion checklist rather than a progressing workflow); frontmatter also self-declares `golden_path: false` (the feature-level golden path lives elsewhere — acceptable, noted for accuracy).

**Multi-step coverage depth (38/50)**. Beyond the golden path: three distinct rejection edges (evidence / stale state / format) + automatic recovery (fix chain) — good error-recovery depth. No entity-lifecycle variation (create→update→delete) and no cross-entity operation within this journey (task + record only; defensible given sibling journeys, but depth is what it is).

**Workflow completeness against PRD scope (36/40)**. Story 7's three AC blocks are fully covered (AC1→1b; AC2→Steps 1–2; AC3→Step 3+3b); SC7 items all represented. Minor omission: the SC7 nuance that AGENTS.md conventions reach the worker "经 dsh-agent-instructions 到达 worker 会话" (a load-bearing channel for Step 1's premise) is never referenced.

### Cross-dimension coherence check

- The `session-expired` absence is charged once in Completeness (outcome coverage) and once in Surface Fitness (surface-rule compliance) — consistent, non-duplicative criteria.
- The Edge 2b flaw is charged in Fact Alignment (no factual basis) and reflected in Internal Consistency (invariant tension it creates) — the rubric intentionally assesses evidence basis and logical soundness separately.
- No dimension rewards or penalizes the same quote twice under the same criterion.

---

## Phase 3 — Blindspot Hunt

1. **[blindspot] Verification-altitude undeclared per step.** The PRD systematically distinguishes 功能断言 / e2e 断言 / 契约断言 / 表断言, and this journey mixes them without declaration: "拒绝且错误信息含 AC 清单（**功能断言**）" (tool-response altitude) vs "库状态不被破坏（**M2 口径回归**）" (DB altitude) vs "**两态分别断言**" (unspecified). No rubric dimension captures this: downstream gen-contracts cannot tell which outcomes are observable via tool response, via UI, or via direct DB read. Each step should declare its verification channel.
2. **[blindspot] Gate digest content under-specified.** "gate 任务产出**数字摘要**（gate_json 落账）" — db-schema §2.4 fixes the digest shape as `{compile, fmt, lint, test}`; the journey's load-bearing Step 3 assertion ("执行记录含量化结果") never says what the 数字摘要 contains, leaving the only gate-task success assertion unverifiable in detail. Not a wrong fact — an unfalsifiable one.
3. **[blindspot] Actor drift with no framing.** The journey's every "User Action" belongs to the worker ("**User Action**: worker 完成任务改动与自检…"), while the PRD casts 单人开发者 as the only human and workers as 系统协作者 whose behavior is covered "经各 Story 的系统侧断言". Sibling worker-provisioning anchors with a human step (配置 Forge设置); this journey silently reassigns the user role with no framing note — for a web-surface journey that changes who the test harness drives.
4. **[blindspot] Invariant 4 universal scope.** "提交历史可审计：**每步自举开发**都有质检环（证据 + 哈希 + 规范三件套）" quantifies over all future bootstrap development, not over this journey's steps — as a journey invariant it is unfalsifiable and untestable in scope.

---

## Required Revisions (priority order)

1. **Rewrite or replace Edge 2b** (Fact Alignment, blocking): the commit-message rejection gate does not exist in any source or code. Either (a) restate as the behavioral outcome the PRD actually asserts (worker self-corrects before submitting; final history conforms — with the assertion being on the produced commits), or (b) replace with a grounded edge (e.g., AGENTS.md 约定到达通道断言, or evidence-present-but-gate-failed → blocked+reason). Annotate whatever remains as inferred with its rule basis.
2. **Add session-expired consideration** (Surface Fitness): either a derived outcome or an explicit reasoned N/A ("单机单用户无登录会话——session-expired 不适用，理由：…").
3. **Scope the commit_hash invariant** (Internal Consistency): "submit 记录恒含 commit_hash" → 限定于产生代码/文档改动的任务，或为 gate 任务补 commit 行为口径.
4. **State Step 1's happy-path precondition** (test evidence attached) so Step 1 vs 1b is selectable from both sides.
5. Fix the §6-31 miscitation (keep §6-24 only, or cite §6-31 where actually relevant); ground or soften 1c's "from 匹配口径" to the documented in_progress guard.
6. Add at least one user-observable assertion channel (任务详情执行记录) to a web-surface journey whose current expected results are all DB-only.
