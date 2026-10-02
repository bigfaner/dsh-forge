# Contract Eval Report: installer-smoke — Iteration 1

- **Feature**: dsh-forge-p1-mvp
- **Journey**: installer-smoke (risk Medium, surface web)
- **Documents under evaluation**:
  - `contracts/step-1-run-installer.md` (1 Outcome)
  - `contracts/step-2-launch-installed-app.md` (4 Outcomes)
  - `contracts/step-3-main-screen-reachable.md` (1 Outcome)
  - `contracts/step-4-session-panel-usable.md` (2 Outcomes)
- **Source journey**: `testing/installer-smoke/journey.md` (generated 2026-10-03)
- **Rubric**: `eval/rubrics/contract.md` (1100 pts, target 935, per-dimension min thresholds)
- **Surface rules**: `gen-journeys/rules/surface-web.md` (validation-error + session-expired 必察)
- **Handbook**: `design/page-map.md` (web → `page` anchor)
- **Fact table**: `.forge/fact-table.json` (42 entries)
- **Iteration**: 1 (no previous report)
- **Scorer stance**: adversarial, verification-first (Senior QA Engineer persona)

**Verdict: 915/1100 — FAIL** (total < 935 AND Fixture Specification 0 < 60 min threshold, veto triggered).

---

## Phase 1 — Reasoning Audit (pre-score anchors)

1. **Faithful decomposition — YES.** The four contracts map 1:1 onto journey Steps 1–4. Journey edge cases are carried in-contract: Step 2b → Outcome `offline-launch-self-sufficient`, Step 2c → Outcome `launch-failure-fail-fast`, Step 4b → Outcome `blank-send-blocked-min`. One additional inferred Outcome (`second-launch-consistent`, step 2) is properly annotated `source: inferred` with a reasoning basis. Scope bookkeeping (fresh-install single boundary; 覆盖安装/升级归 M8) is preserved verbatim.
2. **Mutual exclusivity / executability — PARTIAL.** Step 2's four Outcomes are distinguishable in intent but `success` never declares its network environment or launch-history assumptions, so `offline-launch-self-sufficient` and `second-launch-consistent` preconditions are strict supersets of `success`. Worse, `second-launch-consistent` chains to `success`'s terminal state ("应用进程运行") while its Output ("主窗口再次打开") contradicts the single-instance-lock semantics that its own reasoning comment cites (fact `ELECTRON_MAIN`: "requestSingleInstanceLock false ⇒ quit"). As written, a generator chaining the two outcomes would launch a second process that quits before any window opens.
3. **Cross-contract state references — CLEAN.** Step 1 State ("机器进入已安装态…快捷方式注册") → Step 2 Preconditions ("安装完成（衔接 Step 1 终态），启动入口在位") → Step 3 ("应用已启动进入首屏（衔接 Step 2 终态…）") → Step 4 ("首屏可达（衔接 Step 3 终态）") — no dangling or contradictory references. Step 2 offline defers UI assertion explicitly ("首屏可达，见 Step 3 断言").
4. **Journey invariants — HOLD.** Both invariants (无远程资源请求；安装 ≡ 开发 via audit channel) are restated verbatim in all four contracts and violated nowhere.

Pre-score anchors channeled into Dimensions 3, 4, 6, 8 below.

---

## Phase 2 — Rubric Scoring

### Dimension 1: Completeness — 150/150

| Criterion | Score | Notes |
|---|---|---|
| All four mandatory dimensions per Outcome | 50/50 | All 8 Outcomes across 4 files have non-empty Preconditions / Input / Output / State; Side-effect explicit everywhere (including "none（相对安装态）"). |
| Journey Invariants section present | 50/50 | `## Journey Invariants` with both entries in every file. |
| Happy path + surface-mandated derived scenarios | 50/50 | All four happy paths present; validation-error materialized as `blank-send-blocked-min`; error/boundary outcomes present for launch (`launch-failure-fail-fast`). (session-expired adjudication gap charged once, under Dimension 5.) |

### Dimension 2: Semantic Purity — 194/200

| Criterion | Score | Notes |
|---|---|---|
| Natural language, no code/regex/selectors | 80/80 | No regex, CSS/XPath selectors, or framework assertion calls anywhere. UI text references (「＋添加项目」CTA) are user-visible copy, appropriate for web. |
| Preconditions declarative | 60/60 | All preconditions are state descriptions ("安装完成（衔接 Step 1 终态），启动入口在位"), never setup procedures. |
| No implementation coupling | 54/60 | −6: Output values embed architecture-internal and test-infrastructure vocabulary that a generator must parse around: step-1 "验证通道 = 安装产物与构建配置检查（审计通道承载）"; step-2 "装载机制（薄宿主 + 自有前端入口 + 壳内核经 boot manifest 掌舵）为架构内部件（提案 In Scope M0），由契约面 pin 测试（G1 门）承载，非浏览器可观察断言". These are scope disclaimers (inherited verbatim from the journey), not assertions — but naming internal mechanisms ("薄宿主", "boot manifest", "G1 门") inside dimension values couples the executable spec to implementation concepts. Improvement: move audit-channel notes to a contract-level annotation outside the Output value. |

### Dimension 3: Precondition Exclusivity — 130/150

| Criterion | Score | Notes |
|---|---|---|
| Preconditions distinct across Outcomes | 50/60 | Step 2: `offline-launch-self-sufficient` ("安装完成且目标机器处于断网环境") is a strict superset of `success` ("安装完成（衔接 Step 1 终态），启动入口在位") — success never declares its network environment. Same pattern with `second-launch-consistent` ("应用已安装且此前至少完整启动过一次（衔接 success 终态）…") — success never declares first-launch. Two overlapping pairs with `success`. |
| Sufficient to uniquely select an Outcome | 40/50 | In the offline machine state, both `success` and `offline-launch-self-sufficient` preconditions are satisfied — "exactly one applicable" fails. Fix: `success` should declare "联网环境（或网络环境不设限）" and/or the offline outcome should state it replaces success in that environment. |
| Error/boundary Outcomes state triggers explicitly | 40/40 | `launch-failure-fail-fast`: "安装完成但启动异常（运行时缺失 / 首启崩溃 / 白屏类故障）" — explicit. `blank-send-blocked-min`: "对话 tab 输入框为空或仅空白字符" — explicit. |

Deduction rule application: one ambiguous pair charged (−20 equivalent), distributed −10/−10 across the two criteria above; the `second-launch` overlap shares the same root cause (undeclared environment/history assumptions on `success`) and is covered by the same fix, not double-charged.

### Dimension 4: Fact Alignment — 116/150

| Criterion | Score | Notes |
|---|---|---|
| Factual claims traceable to fact_id or marked UNKNOWN | 30/60 | Zero `fact_id` citations appear in any dimension value across all 8 Outcomes; the only fact reference in the entire set is inside step-2's inferred-outcome comment ("fact ELECTRON_MAIN"). The protocol states the fact table is "cited by fact_id" — that discipline is absent. Content-wise the reviewer verified the claims TRUE against the fact table (INSTALLER_CONFIG: per-user install, NSIS default shortcuts, 安装期零网络; HERO_PHASE: hero CTA copy; VIEW_STATE_MACHINE: rightDock default collapsed; NEW_SESSION_ENTRIES: 新会话 entry equivalence; EMPTY_SEND_GUARD: blank-submit zero roundtrip; UF-1/UF-2/UF-4 citations all accurate vs prd-ui-functions.md; proposal NFR citation verbatim-accurate). But two claims assert facilities that no fact evidences and are not marked UNKNOWN: (a) step-2 offline "观察通道 = 启动期网络请求记录" — E2E_INFRA lists probes (boot ready, RPC, UI, session log) but no network-request recorder; (b) `launch-failure-fail-fast` fixture "故障注入或预置" — FAULT_INJECTION_CONTRACT states "No setFault/injectFault/faultPoint in shipped code … e2e lacks a fault facility". Unverified facility claims without UNKNOWN marking are a failure per this criterion. |
| Inferred claims have required_outcomes support + source: inferred | 46/50 | `second-launch-consistent`: `<!-- source: inferred -->` + reasoning basis (ELECTRON_MAIN, scope bookkeeping, invariant implication) — exemplary. `blank-send-blocked-min`: cites the rule ("Web surface 必察项 validation-error 的实步承载") and journey Step 4b; the literal `source: inferred` tag lives only in the journey's Derived Outcomes section, not in the contract file (−4). |
| No hallucinated/unclassified claims | 40/40 | Every behavioral claim cross-checked true against fact table, PRD ui-functions, and proposal. No fabrications found. |

### Dimension 5: Surface Fitness — 90/100

| Criterion | Score | Notes |
|---|---|---|
| Mandatory derived Outcomes present (web: validation-error + session-expired) | 30/40 | validation-error: present and well-annotated (`blank-send-blocked-min`). session-expired: legitimately N/A for a 单机无登录 product — but the N/A adjudication ("session-expired — N/A：单机产品无登录会话 / 过期概念…source: inferred") exists only in journey.md's Derived Outcomes section; no contract file carries any trace of it. A consumer of the contract set alone cannot see that the second mandated web outcome was considered (−10). |
| Surface-appropriate language | 35/35 | Steps 3/4 use proper web language (rail 入口、hero 相位、CTA、tab、输入区聚焦回显). Steps 1/2 appropriately use OS/installer language for OS-level phases while keeping browser-observable assertions ("无报错弹窗、无白屏停留"). |
| TUI timeout Outcomes | 25/25 | Non-TUI surface — full marks per rubric. |

### Dimension 6: Internal Consistency — 135/150

| Criterion | Score | Notes |
|---|---|---|
| Invariants hold in every Contract | 60/60 | Both journey invariants restated and upheld; offline invariant actively exercised by step-2's offline Outcome. |
| Cross-Contract state references consistent | 50/50 | Chain 1→2→3→4 verified consistent; forward references ("供 Step 2 行使", "见 Step 3 断言") resolve. |
| Outcome Preconditions consistent with preceding States | 25/40 | −15: `second-launch-consistent` contradicts the state it chains to. Its precondition: "应用已安装且此前至少完整启动过一次（衔接 success 终态），机器状态未变" chains to `success`'s terminal State "应用进程运行、主窗口就绪". Under that state, a second launch hits the single-instance lock (fact ELECTRON_MAIN: "requestSingleInstanceLock false ⇒ quit") — the second process exits before opening any window, i.e., the existing window is focused/接管, NOT "主窗口再次打开并在等待窗口内到达首屏". The Outcome's own reasoning comment acknowledges the semantics ("单实例锁下二次启动自有接管/退出语义，非安装回归异常") yet the Output was never reconciled with it. Either the precondition must pin the first instance as closed (cold relaunch scenario) or the Output must describe lock-handoff semantics. As written the Outcome is unexecutable when chained and wrong when read against the cited fact. |

### Dimension 7: Anchor Integrity — 100/100

Handbook `design/page-map.md` exists → dimension active. Page-anchor map built from handbook:

| Handbook entry | Route | Layout |
|---|---|---|
| 工作台 · 会话视图（默认态） | `workbench/session` | WorkbenchLayout（左 rail / 中会话面板 / 右 dock） |
| 工作台 · 知识库视图（浏览页签） | `workbench/knowledge` | WorkbenchLayout（左 rail / 中知识面板全宽） |
| 添加项目（两段模态流程） | `modal/add-project` | 覆盖中区的模态 |

Per-contract itemization:

| Contract | page | route | layout | Verdict |
|---|---|---|---|---|
| step-1 | "" | "" | "" | OS 级安装场景 — anchors empty, honestly declared: "OS 级安装场景，无 web 页面对应——锚点留空（不猜测）". System-level steps legitimately anchor to no page; declaration is explicit. No deduction. |
| step-2 | "" | "" | "" | Same honest declaration ("OS 级启动场景…"). No deduction. |
| step-3 | 工作台·会话视图（默认态） | workbench/session | WorkbenchLayout（左 rail / 中会话面板 / 右 dock） | Match (typographic-space difference vs handbook heading "工作台 · 会话视图（默认态）" is not a value mismatch). Hero phase correctly modeled as a phase within this view per handbook section "hero 相位｜HeroEmpty（项目数=0 时中区替换呈现）". |
| step-4 | 工作台·会话视图（默认态） | workbench/session | WorkbenchLayout（左 rail / 中会话面板 / 右 dock） | Exact match. |

- Anchor field completeness: 40/40 (no missing fields; empties are declared system-level steps)
- Anchor values match handbook: 30/30 (0 mismatches)
- Handbook internal consistency: 30/30 (3 unique view-states, no duplicate/conflicting routes or navigation paths)

### Dimension 8: Fixture Specification — 0/100 (VETO TRIGGERED)

**Entity completeness (veto item): 0/40.**

Two independent failures:

1. **Invented non-domain entity.** Every `fixture_spec.entities` entry in all four contracts is `entity_type: "InstallerArtifact"`. Cross-referenced against the Design domain model — `design/er-diagram.md` (PROJECTS, KNOWLEDGE_ENTRIES, KNOWLEDGE_RECALL_LOGS, APP_KEY_LOGS, SCHEMA_META) and `design/tech-design.md` Field Quick Reference (same five models) — no such entity exists. The installer artifact is a build product with fact support (INSTALLER_CONFIG) but it is not a domain-model entity; semantic verification per the rubric fails.
2. **Referenced entity types missing from `fixture_spec.entities`.** Steps 3 and 4 declare `state_requirements` with `prerequisite_entity: "Project"` inside the Preconditions fixture block ("全新安装零项目态（用户数据零项目记录——hero 确定相位的 Given）"), yet `Project` appears in no `entities` list. Step 4's success State additionally creates a session ("会话视图 + 新建会话") which is referenced but undeclared (dsh-domain entity, disclaimed in Side-effect yet present in State). Per the rubric: "Score 0 if any entity type referenced in the Contract's Preconditions, Input, or State changes is missing from `fixture_spec.entities` — this triggers the veto."

**Veto application**: entity completeness = 0 → entire dimension = 0.

Had the veto not applied (for the reviser's information): relationship/constraint coverage would score 35/35 (single-entity contracts) and min_count 25/25 (InstallerArtifact min_count 1 is sufficient for install scenarios). The clean fix: declare `Project` with `min_count: 0` in steps 3/4 (which also elegantly encodes the zero-project hero Given), and either anchor `InstallerArtifact` to a design-side definition or model machine/install state via an explicitly-marked environment construct rather than an entity.

---

### Cross-Dimension Coherence Check

- Completeness (structure) is full while Fixture Specification is zero — the contracts are structurally complete but their data declarations are not executable against the Design domain model. Not contradictory; the fixture gap is the dominant failure.
- The Dimension 3 overlap and the Dimension 6 contradiction share a root cause in step-2's derived outcomes (`success` under-specifies environment/history; `second-launch-consistent` chains ambiguously). Charged once per dimension aspect (selection ambiguity vs. state contradiction), not quadruple-charged.
- The Dimension 4 facility claims (network recorder, fault injection) and blindspots 2/3 describe the same underlying executability risk from the scoring and QA-channel sides respectively — scored under Dimension 4, flagged for the reviser under blindspot.

---

## Phase 3 — Blindspot Hunt

1. **[blindspot] Wait-window boundary value never quantified.** Step-2 success: "装载在等待窗口内完成（超时未呈现即冒烟失败，口径见 launch-failure-fail-fast）" and fail-fast State: "冒烟失败判定成立（等待窗口超时可观测）" — no duration appears anywhere in the contract set, while fact `ELECTRON_MAIN` documents "boot watchdog 180s exit(3)" that would anchor it. The decisive pass/fail boundary for the whole smoke is left for the generator to invent. Must improve: pin the wait window (cite the 180s boot watchdog or specify a smoke-appropriate bound, e.g., "首屏在启动后 N 秒内呈现").
2. **[blindspot] Offline fixture has no declared realization channel.** "目标机器断网环境（网络请求全部不可达）" — no mechanism (OS-level network disable? request interception?) is named, and the observation channel "启动期网络请求记录" references a recorder that exists in no e2e infrastructure fact (E2E_INFRA enumerates boot/RPC/UI/session-log probes only). A Playwright `_electron` launch does not give OS-level offline for free. Must improve: declare how offline is realized and how remote requests are observed (or mark the channel UNKNOWN).
3. **[blindspot] Launch-fault modes assert an injection capability that does not exist.** "已安装但启动路径异常（运行时缺失 / 首启崩溃 / 白屏类故障注入或预置）" — three fault modes, no realization path; `FAULT_INJECTION_CONTRACT`: "No setFault/injectFault/faultPoint in shipped code … e2e lacks a fault facility". "运行时缺失" is realizable by tampering with installed files; crash/white-screen injection has no seam. Must improve: per-fault-mode feasibility notes or narrowing to realizable modes.
4. **[blindspot] No machine reset/teardown discipline across step-2's four Outcomes.** "本 Contract 各 Outcome 的前置数据状态并集：InstallerArtifact（已安装 / 断网 / 异常预置 / 二次启动四态）" — the four Outcomes require mutually incompatible machine states (pristine install vs. tampered runtime vs. post-first-launch); no reinstall/snapshot/reset discipline is declared between scenarios. Without it, outcome ordering contaminates results (e.g., running fail-fast's tamper before second-launch breaks it). Must improve: declare per-outcome machine reset (fresh VM/snapshot or reinstall).
5. **[blindspot] blank-send Input conflicts with the documented mechanism.** Input "直接点发送" vs fact `EMPTY_SEND_GUARD`: "send button disabled when empty" — clicking a disabled button is not executable in browser automation (Playwright rejects clicks on disabled elements). The Outcome's observables are right ("不发送——无消息上屏、无 agent 往返"), but the literal Input is unperformable. Must improve: phrase as attempted submit with interception asserted (e.g., "提交被拦截（按钮禁用或空提交无效果）").
6. **[blindspot] Step 1 models success only — install failure has no outcome and no scope note.** Output asserts absences ("无错误弹窗、无中途回滚迹象") which name rollback as a conceivable failure mode, yet the contract defines no install-failure outcome and — unlike launch failure (journey 2c, explicitly booked) — carries no note explaining why install failure is out of scope. Contrast with the honest N/A pattern used for session-expired. Must improve: an explicit scope note (M8 bookkeeping) or a minimal install-abort outcome.

---

## Final Summary Block

```
SCORE: 915/1100 — FAIL (target 935; Fixture Specification below min threshold 60)
DIMENSIONS:
  Completeness: 150/150
  Semantic Purity: 194/200
  Precondition Exclusivity: 130/150
  Fact Alignment: 116/150
  Surface Fitness: 90/100
  Internal Consistency: 135/150
  Anchor Integrity: 100/100
  Fixture Specification: 0/100 (veto: entity completeness)
TOP DEFECTS (reviser priorities):
  1. Fixture veto: InstallerArtifact is not a Design domain entity; Project referenced in Preconditions (steps 3/4) but absent from fixture_spec.entities — declare Project (min_count 0) and re-anchor InstallerArtifact.
  2. second-launch-consistent Output ("主窗口再次打开") contradicts the success terminal state it chains to ("应用进程运行") under single-instance-lock semantics (ELECTRON_MAIN).
  3. Zero fact_id citations in dimension values; two facility claims (network-request recorder, fault injection) unverified and unmarked UNKNOWN.
  4. success Outcome in step 2 declares neither network environment nor launch history → precondition overlap with both derived outcomes.
  5. Wait window for launch never quantified despite documented 180s boot watchdog fact.
```
