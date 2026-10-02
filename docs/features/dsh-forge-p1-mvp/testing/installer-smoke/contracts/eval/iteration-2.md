# Contract Eval Report: installer-smoke — Iteration 2

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
- **Iteration**: 2 (previous: `eval/iteration-1.md`, 915/1100 FAIL)
- **Scorer stance**: adversarial, verification-first (Senior QA Engineer persona); scored on the page as it stands now — no credit for effort or delta.

**Verdict: 1094/1100 — PASS** (total ≥ 935; every dimension above its min threshold; Fixture Specification veto resolved).

---

## Step 1: Previous Attack-Point Resolution Verification

Each iteration-1 defect re-verified against the current text, independently re-scored.

### #1 Fixture Specification veto (was 0/100)

**RESOLVED.** The iteration-1 fix path was "declare `Project` (min_count 0) … and either anchor `InstallerArtifact` to a design-side definition or model machine/install state via an explicitly-marked environment construct". The reviser took the environment-construct path:

- All four contracts now declare `entity_type: "Project"` with `min_count: 0`; `Project` is a genuine design domain entity (PROJECTS in `design/er-diagram.md`), so semantic verification passes.
- The invented `InstallerArtifact` entity is gone. Machine/install states moved to `state_requirements` with explicit abstraction annotations: `"abstraction: \"environment-state（安装产物/机器安装态为 OS 层构建概念，非 er-diagram.md 领域实体）\""` (step-1), `"environment-state（OS 层机器态，非 er-diagram.md 领域实体）\""` (steps 2–4).
- `prerequisite_entity: "Project"` entries in state_requirements now resolve to a declared entity.
- The one remaining undeclared reference — session creation in step-4 State — is explicitly adjudicated extra-domain: `"会话为 dsh 侧实体，非本应用领域模型实体——账本不走查，见 Side-effect"`. Session is not a design domain entity (er-diagram.md has PROJECTS / KNOWLEDGE_ENTRIES / KNOWLEDGE_RECALL_LOGS / APP_KEY_LOGS / SCHEMA_META only); declaring it as `entity_type` would have re-committed the iteration-1 error. The disclaimer is the correct treatment. No veto.

### #2 second-launch-consistent contradiction (was −15 Internal Consistency)

**RESOLVED.** Precondition now pins the cold-restart scenario: `"此前至少完整启动过一次且首实例已正常退出（冷重启——衔接 success 终态后关闭应用）"`; state_requirements add `"无存活的首实例（冷重启——单实例锁无竞争，fact ELECTRON_MAIN）"`. The Output is reconciled with the lock semantics it cites: `"冷重启下新进程获得单实例锁、主窗口再次打开并在等待窗口（180s，fact ELECTRON_MAIN）内到达首屏…首实例存活时的二次启动为锁接管 / 退出语义（fact ELECTRON_MAIN），非本 Outcome 口径"`. Under fact ELECTRON_MAIN ("requestSingleInstanceLock false ⇒ quit") the outcome is now executable as chained and the lock-handover path is explicitly bracketed out. No contradiction remains.

### #3 Zero fact citations + two unmarked facility claims (was −34 Fact Alignment)

**RESOLVED.** Fact citations now appear throughout dimension values — INSTALLER_CONFIG (steps 1, per-user path `%LOCALAPPDATA%\Programs`, NSIS-default shortcuts, extraResources/安装期零网络), ELECTRON_MAIN (180s watchdog exit(3), single-instance lock), HERO_PHASE (项目数 0 ⇒ hero, CTA「＋ 添加项目」), VIEW_STATE_MACHINE (dock 默认收起), NEW_SESSION_ENTRIES (新会话钮 = 品牌行 onClick startSession), EMPTY_SEND_GUARD (空输入判据 / 按钮禁用 / 双重护栏). Every citation spot-checked against `.forge/fact-table.json`: all accurate. Both iteration-1 facility claims are now marked UNKNOWN with fact-anchored justification:
- Offline: `"断网实现通道 UNKNOWN——OS 级断网或请求拦截桩均需 harness 提供（fact E2E_INFRA 既有探针不含该设施）"` and `"观察通道 = UNKNOWN——fact E2E_INFRA 既有探针 = boot ready / RPC / UI / session log，无网络请求记录器，需 harness 新增请求监听设施，落地前不臆断通道"` — verified against E2E_INFRA's probe enumeration; accurate.
- Fault injection: `"首启崩溃 / 白屏注入通道 UNKNOWN（fact FAULT_INJECTION_CONTRACT：e2e 无故障设施）——由 harness 以文件级预置破坏落地，不臆断注入点"` — matches FAULT_INJECTION_CONTRACT verbatim intent; the realizable mode (运行时缺失 via 删除/改名) is named.

The −4 in-contract `source: inferred` gap on blank-send is also fixed (see #6).

### #4 success under-specification → precondition overlap (was −20 Precondition Exclusivity)

**RESOLVED.** Step-2 `success` now declares both missing axes: `"目标机器联网（网络可用），且为首次启动（此前无成功启动记录，用户数据目录未初始化）"`. The four outcomes partition cleanly on 完好×联网×启动历史: success (联网+首次+完好), offline (断网+首次+完好), fail-fast (预置破坏, 网络不设限, explicitly `"与 success / offline 的完好前置互斥"`), second-launch (联网+冷重启+完好). No ambiguous pair remains; every machine state matches at most one Outcome.

### #5 Wait window unquantified (was blindspot 1)

**RESOLVED.** Pinned everywhere it matters: success Output `"等待窗口 = 180s——boot watchdog 上界，超时 exit(3)，fact ELECTRON_MAIN"`, success State, offline State `"等待窗口同 success = 180s"`, fail-fast Output/State. Matches fact ELECTRON_MAIN ("boot watchdog 180s exit(3)") exactly.

### #6–#8 Minor deductions (Surface Fitness −10, Fact Alignment −4, blindspots 2/3/4/5)

**RESOLVED.**
- session-expired adjudication now carried in-contract (step-4 comment: `"surface 必察项 adjudication：session-expired — N/A：单机产品无登录会话 / 过期概念…source: inferred（surface-web required_outcomes × PRD 安全边界映射）；validation-error 已由 blank-send-blocked-min 实步承载"`).
- `blank-send-blocked-min` header comment now carries the literal `source: inferred` plus the rule citation (validation-error 必察项) and journey Step 4b provenance.
- Machine-reset discipline added in step-2 Fixture Specification: `"逐 Outcome 从同一基线（全新安装已就位、零项目用户数据、无存活实例）以快照恢复或重装置置；fail-fast 的破坏预置在其场景内施加并在结束时还原，second-launch 在首实例正常退出后行使"`.
- blank-send Input made performable: `"空态按钮禁用——fact EMPTY_SEND_GUARD，自动化对禁用钮的常规点击不成立，故以强制点击 / 回车 / 程序化 submit() 触发提交意图"`.

### #9 Semantic Purity −6 (implementation coupling in Output values)

**NOT ADDRESSED.** The audit-channel vocabulary inside dimension values was retained verbatim (see Dimension 2 below). Same defect on the page, same deduction.

### New issues introduced?

None found. The new `abstraction` annotations, `state-verification` header comments, and fixture-spec prose are consistent with the rest of the set; external references re-verified this iteration (proposal "G1 门" at proposal.md:76/161; M8 "三平台安装包与更新检测"/"空错态与过渡打磨" at proposal.md:153; NFR "无 CDN / 远程脚本 / 远程字体" at proposal.md:67; UF-1 rail entries 品牌行/新会话/知识库/设置 and interaction rule 1 at prd-ui-functions.md:23-27,57; blank-send delegation target exists as `session-workbench/contracts/step-2-new-session-roundtrip.md` Outcome "blank-send-blocked" — no dangling cross-journey reference).

---

## Step 2: Phase 1 — Reasoning Audit

1. **Faithful decomposition — YES.** Steps 1–4 map 1:1 to the journey; edge cases carried in-contract (2b → `offline-launch-self-sufficient`, 2c → `launch-failure-fail-fast`, 4b → `blank-send-blocked-min`); one inferred extension (`second-launch-consistent`) properly annotated with reasoning and fact anchoring. Scope bookkeeping (全新安装单边界；覆盖安装/升级/残留数据归 M8) preserved.
2. **Mutual exclusivity / executability — YES.** The 2×2 environment/history partition plus the tampered axis makes each step-2 Outcome uniquely selectable; the previously unexecutable second-launch outcome is now cold-restart-pinned and executable. blank-send chains unambiguously to step-4's own success terminal state ("Step 4 会话已建").
3. **Cross-contract references — CLEAN.** 1→2→3→4 chain intact (Step 1 State registers shortcuts ↔ Step 2 "从安装入口（Step 1 快捷方式）启动"; Step 2 terminal 首屏到达 ↔ Step 3 precondition; Step 3 ↔ Step 4). Offline's deferral ("首屏可达，见 Step 3 断言") resolves.
4. **Journey invariants — HOLD.** Both invariants restated in all four files; the no-remote-resources invariant is exercised by step-2b and carried on the product side by step-1's artifact check; no contract violates either.
5. **Remodel coherence — YES.** state_requirements + abstraction annotations consistently mark OS-layer states as environment (non-domain); per-outcome machine reset documented; 180s watchdog quantification applied uniformly across all four step-2 outcomes; fact citations accurate throughout.

---

## Step 3: Phase 2 — Rubric Scoring

### Dimension 1: Completeness — 150/150

| Criterion | Score | Notes |
|---|---|---|
| All four mandatory dimensions per Outcome | 50/50 | All 8 Outcomes across 4 files: non-empty Preconditions / Input / Output / State; Side-effect explicit everywhere (including the disclaimed `"none（新会话建立为 dsh 侧行为，不走查其账本）"`). |
| Journey Invariants section present | 50/50 | `## Journey Invariants` with both entries in every file. |
| Happy path + surface-mandated derived scenarios | 50/50 | 4/4 happy paths; validation-error materialized (`blank-send-blocked-min`); session-expired adjudicated N/A in-contract; launch failure booked (`launch-failure-fail-fast`). |

### Dimension 2: Semantic Purity — 194/200

| Criterion | Score | Notes |
|---|---|---|
| Natural language, no code/regex/selectors | 80/80 | No regex, CSS/XPath selectors, or framework assertion calls. UI copy references (「＋添加项目」CTA) are user-visible text, appropriate for web. `exit(3)` is an OS-observable process exit code cited to a fact, not an internal call. |
| Preconditions declarative | 60/60 | All Preconditions lead with state descriptions ("安装完成且完好…启动路径无异常预置"), never setup procedures; realization guidance (删除/改名文件实现运行时缺失) lives inside fixture state_requirements where it belongs. |
| No implementation coupling | 54/60 | −6: the iteration-1 coupling class persists verbatim in Output values — step-1 `"验证通道 = 安装产物与构建配置检查（审计通道承载）"`; step-2 `"装载机制（薄宿主 + 自有前端入口 + 壳内核经 boot manifest 掌舵）为架构内部件（提案 In Scope M0），由契约面 pin 测试（G1 门）承载，非浏览器可观察断言"`. These are scope disclaimers inherited from the journey, but naming internal mechanisms ("薄宿主", "boot manifest", "G1 门") inside dimension values couples the executable spec to implementation/test-infrastructure concepts. Iteration-1's suggested improvement (move audit-channel notes to a contract-level annotation outside the Output value — the `<!-- state-verification: partial -->` header comment already exists as a natural home) was not taken. The new `"程序化 submit() 触发提交意图"` (step-4 Input) is within the same vocabulary class but is fact-anchored and load-bearing for input performability, so it is not charged separately. |

### Dimension 3: Precondition Exclusivity — 150/150

| Criterion | Score | Notes |
|---|---|---|
| Preconditions distinct across Outcomes | 60/60 | Step 2's four Outcomes partition on 完好(联网×首次 / 断网×首次 / 联网×冷重启) + tampered(网络不设限) — no two share semantically equivalent Preconditions. Step 4's two Outcomes occupy distinct phases (首屏可达 vs 空会话已建+空输入). |
| Sufficient to uniquely select an Outcome | 50/50 | For every machine state in the tested matrix exactly one Outcome applies; fail-fast's tampered precondition is disjoint from all three intact-precondition Outcomes by construction and says so ("与 success / offline 的完好前置互斥"). |
| Error/boundary Outcomes state triggers explicitly | 40/40 | `launch-failure-fail-fast`: "启动路径被预置破坏（运行时缺失 / 首启崩溃 / 白屏类故障）"; `blank-send-blocked-min`: "对话 tab 输入框为空或仅空白字符（空输入判据 = draft 去空白后为空且无附件——fact EMPTY_SEND_GUARD）". |

### Dimension 4: Fact Alignment — 150/150

| Criterion | Score | Notes |
|---|---|---|
| Factual claims traceable to fact_id or marked UNKNOWN | 60/60 | Every behavioral claim now cites its fact (INSTALLER_CONFIG / ELECTRON_MAIN / HERO_PHASE / VIEW_STATE_MACHINE / NEW_SESSION_ENTRIES / EMPTY_SEND_GUARD / E2E_INFRA / FAULT_INJECTION_CONTRACT); all spot-verified accurate against `.forge/fact-table.json`. The two previously unmarked facility claims (offline realization/observation channel; crash/white-screen injection) are now explicitly UNKNOWN with fact-anchored justification. External citations re-verified: proposal G1 门/M0/M8/NFR lines and prd-ui-functions UF-1/UF-2/UF-4 all exist as quoted. |
| Inferred claims have required_outcomes support + source: inferred | 50/50 | `blank-send-blocked-min`: in-contract `source: inferred` + rule citation (validation-error 必察项) + journey 4b provenance. session-expired N/A adjudication: in-contract `source: inferred（surface-web required_outcomes × PRD 安全边界映射）`. `second-launch-consistent`: `source: inferred` + reasoning basis (冒烟基线 / 范围记账 / 不变式蕴含 / ELECTRON_MAIN 锚定). |
| No hallucinated unclassified claims | 40/40 | No unclassified behavioral claims found; scope bookkeeping ("归 M8") verified against proposal.md:153. |

### Dimension 5: Surface Fitness — 100/100

| Criterion | Score | Notes |
|---|---|---|
| Mandatory derived Outcomes (web: validation-error + session-expired) | 40/40 | validation-error: present as `blank-send-blocked-min` with mechanism-level assertion ("提交被拦截——无消息上屏、无 agent 往返…按钮禁用 + click guard + submit() 双重护栏，fact EMPTY_SEND_GUARD"). session-expired: adjudicated N/A in-contract with reasoning — a contract-set consumer now sees both mandated outcomes accounted for. |
| Surface-appropriate language | 35/35 | Steps 3/4 use proper web language (rail 入口、hero 相位、CTA、tab、输入区聚焦回显、弹窗); steps 1/2 appropriately use OS/installer vocabulary while keeping browser-observable assertions (无报错弹窗、无白屏停留). |
| TUI timeout Outcomes | 25/25 | Non-TUI surface — full marks per rubric. |

### Dimension 6: Internal Consistency — 150/150

| Criterion | Score | Notes |
|---|---|---|
| Invariants hold in every Contract | 60/60 | Both invariants restated and upheld in all four files; offline outcome actively exercises the no-remote-resources invariant's runtime half. |
| Cross-Contract state references consistent | 50/50 | 1→2→3→4 chain verified; forward references resolve; the cross-journey delegation ("完整行为断言由兄弟 Journey session-workbench Step 2c 承载") resolves to an existing Outcome (`blank-send-blocked` in session-workbench step-2 contract) carrying exactly the deferred assertions (焦点保持/引导态保持). |
| Preconditions consistent with preceding States | 40/40 | second-launch's cold-restart precondition ("首实例已正常退出") is now achievable from success's terminal state plus the documented close step, and the fixture section books the ordering discipline that makes it hold. Steps 3/4 chain states match their predecessors exactly. |

### Dimension 7: Anchor Integrity — 100/100

Handbook `design/page-map.md` exists → dimension active. Handbook pages: 工作台·会话视图（默认态）`workbench/session`; 工作台·知识库视图 `workbench/knowledge`; 添加项目模态 `modal/add-project`.

- **Anchor field completeness: 40/40.** Steps 3/4 carry page/route/layout matching the 会话视图 entry (hero correctly modeled as a phase within it, per handbook "hero 相位｜HeroEmpty（项目数=0 时中区替换呈现）"). Steps 1/2 anchors are empty with honest, explicit declarations ("OS 级安装场景，无 web 页面对应——锚点留空（不猜测）") — running an installer / launching a process genuinely has no web page; no handbook entry exists for them either. knowledge/add-project pages belong to other journeys' contracts, outside this journey's scope.
- **Anchor values match handbook: 30/30.** route `workbench/session` and layout `WorkbenchLayout（左 rail / 中会话面板 / 右 dock）` match exactly; page value differs from the handbook heading only by a typographic space — not a value mismatch.
- **Handbook internal consistency: 30/30.** Three distinct view-states, no duplicate or conflicting routes/navigation paths.

### Dimension 8: Fixture Specification — 100/100 (veto resolved)

| Criterion | Score | Notes |
|---|---|---|
| Entity completeness (veto item) | 40/40 | `entity_type: "Project"` in all four contracts; Project is a design domain entity (PROJECTS, er-diagram.md). Every domain-entity reference resolves (`prerequisite_entity: "Project"` ↔ declared entity). Machine/install states remodeled as `state_requirements` with `abstraction: "environment-state…非 er-diagram.md 领域实体"` annotations — the treatment iteration-1 endorsed. The dsh-side session reference is explicitly adjudicated non-domain with ledger-not-walked (correct: declaring it would invert into the iteration-1 error). |
| Relationship and constraint coverage | 35/35 | Single-entity contracts (Project only); no parent-child relationships to declare; the load-bearing constraint (zero projects = hero Given) is encoded via `min_count: 0` + prerequisite_entity + explicit state description ("全新安装零项目态（用户数据零项目记录——hero 确定相位的 Given）"). |
| Minimum data quantity declarations | 25/25 | `min_count: 0` for Project is exactly sufficient — every scenario in the journey requires zero projects ("本旅程全程不发生项目注册"); no list/pagination or delete-one-of-many scenario exists here. Step 2's fixture section additionally states the per-outcome baseline and reset discipline so the zero-state is guaranteed at each Outcome. |

---

### Cross-Dimension Coherence Check

- The environment-state remodel simultaneously satisfies Fixture Specification (no invented entities), Precondition Exclusivity (network/history axes became selectable state), and Fact Alignment (abstraction notes cite er-diagram.md) — no tension between the three.
- The 180s watchdog quantification is applied uniformly (success/offline/second-launch/fail-fast) and matches the cited fact; no outcome uses a divergent window.
- The only deduction (Semantic Purity −6) is inherited scope-disclaimer vocabulary that all other dimensions treat consistently as annotation, not assertion — a single localized issue, not an incoherence.
- Blindspots 1 and 2 below concern execution readiness outside the rubric's eight dimensions; they do not contradict any scored criterion (the UNKNOWN markings are the rubric-compliant treatment).

---

## Step 4: Phase 3 — Blindspot Hunt

1. **[blindspot] Install phase still has no failure accounting and no time bound — the launched app got a watchdog, the installer got nothing.** Step-1 Output: `"安装流程走完并给出完成反馈，无错误弹窗、无中途回滚迹象"` — the Output names install failure modes (error dialogs, mid-way rollback) but the contract defines no install-failure Outcome and carries no scope note for it (contrast: launch failure is explicitly booked as `launch-failure-fail-fast` with `"记账：失败可检出，失败态呈现不属本旅程"`; session-expired got an N/A adjudication). And unlike launch (`"等待窗口 = 180s——boot watchdog 上界"`), "安装流程走完" has no quantified window — a hung installer hangs the smoke indefinitely. Must improve: a one-line install-failure scope note (mirroring the fail-fast 记账 pattern) plus a bounded install wait window, even a generous one.
2. **[blindspot] The offline outcome's distinguishing assertion is unexecutable today, and the contract does not say who unblocks it.** Step-2 offline Output: `"观察通道 = UNKNOWN——fact E2E_INFRA 既有探针 = boot ready / RPC / UI / session log，无网络请求记录器，需 harness 新增请求监听设施，落地前不臆断通道"`. The UNKNOWN marking is correct per rubric, but as an executable spec the generator can today realize only the weaker observable shared with success ("首屏可达") — the zero-remote-fetch assertion that makes this Outcome distinct over the smoke baseline is parked on an unbuilt facility with no owner, deliverable, or blocked-status marker. Must improve: mark the Outcome (or that assertion) execution-blocked pending the named harness facility, so gen-test-scripts and the quality gate surface the dependency instead of silently testing the weak form.
3. **[blindspot] Machine-reset discipline omits network-state restoration.** Step-2 Fixture Specification: `"逐 Outcome 从同一基线（全新安装已就位、零项目用户数据、无存活实例）以快照恢复或重装置置"` — the baseline enumerates install/project/instance state but not network state, while the outcomes straddle 联网/断网; and the named realization candidates are machine-global ("OS 级断网或请求拦截桩均需 harness 提供"). If offline is realized OS-level, "恢复基线" for the subsequent 联网 Outcomes (success/second-launch) requires undoing it — nowhere stated. Must improve: add network state to the per-outcome baseline/reset enumeration (e.g., "每 Outcome 前网络态复位为该 Outcome 声明的联网/断网前置").

All three blindspots cite current text; none rises to a scored dimension violation under the rubric as written.

---

## Final Summary Block

```
SCORE: 1094/1100 — PASS (target 935; all dimensions above min thresholds; fixture veto resolved)
DIMENSIONS:
  Completeness: 150/150
  Semantic Purity: 194/200
  Precondition Exclusivity: 150/150
  Fact Alignment: 150/150
  Surface Fitness: 100/100
  Internal Consistency: 150/150
  Anchor Integrity: 100/100
  Fixture Specification: 100/100
RESIDUAL DEFECTS (informational):
  1. Semantic Purity −6: audit-channel/implementation vocabulary (薄宿主 / boot manifest / G1 门 / pin 测试) retained inside Output values — move to the state-verification header comment.
  2. [blindspot] Install failure unaccounted + install walk has no time bound (launch got 180s; installer got none).
  3. [blindspot] Offline outcome's zero-remote-fetch assertion parked on an unbuilt harness facility without blocked-status/owner.
  4. [blindspot] Per-outcome machine-reset baseline omits network-state restoration.
```
