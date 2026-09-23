# Journey Eval Report — iteration 2

- **Document**: `docs/features/dsh-forge-m2/testing/plugin-management/journey.md` (revised since iteration 1)
- **Rubric**: `skills/eval/rubrics/journey.md` (1150 pts, target 975, every dimension ≥ threshold)
- **Surface**: web (`rules/surface-web.md`); test strategy Web = balanced 50/50; mandatory derived outcomes: `validation-error` + `session-expired`
- **Scorer persona**: Senior QA Engineer (adversarial)
- **Verdict**: **PASS** — Total 1101/1150 (≥ 975); every dimension ≥ threshold. Residual findings listed below are non-blocking.

| Dimension | Score | Threshold | Pass |
|---|---|---|---|
| 1. Completeness | 200/200 | 120 | ✓ |
| 2. Semantic Purity | 197/200 | 120 | ✓ |
| 3. Precondition Exclusivity | 150/150 | 90 | ✓ |
| 4. Fact Alignment | 129/150 | 90 | ✓ |
| 5. Surface Fitness | 135/150 | 90 | ✓ |
| 6. Internal Consistency | 144/150 | 90 | ✓ |
| 7. Workflow Coverage | 146/150 | 90 | ✓ |
| **Total** | **1101/1150** | 975 | **✓** |

---

## Iteration-1 resolution verification (claimed fixes audited against the revised page + sources)

| # | Iteration-1 attack | Status | Evidence in revised document / sources |
|---|---|---|---|
| 1 | Surface-web required_outcomes unengaged (5a=15/60) | **fixed** | Two mapping comments added: `validation-error` (line 70, no-form-face reasoning + forbidden-action analog → Step 1b) and `session-expired` (line 80, offline-desktop rationale + channel-invalidation analog → Step 1c, ERR_PLUGIN_RUNTIME_STATE). Rule citation + reasoning present for both. |
| 2 | Step 5 not executable (config-internals as user action) | **fixed** | User Action is now "启停操作完成后,用户在插件管理区重新浏览插件列表"; file-face assertion routed via "文件面断言经 Setup 跨面口径". |
| 3 | Unannotated inferences 3b/4b | **fixed** | `source: inferred` comments with basis at 3b (UF6 transitioning semantics) and 4b (UF6 Data Requirements "运行时启停状态(同一配置)"). Both bases verified verbatim in prd-ui-functions.md. |
| 4 | 2/2b precondition overlap | **fixed** | Step 2 now "其注入内容未在活跃会话/挂接视图内在线使用(常规启停场景)"; 2b "正在活跃挂接会话内在线使用…与 Step 2 常规场景互斥" — explicitly mutually exclusive, with distinct observable (UF5 third-party-disabled 态). |
| 5 | Cancel edge missing | **fixed (content) / annotation gap introduced** | Step 3c added with full no-state-change assertions — but without a `source: inferred` annotation (charged under Fact Alignment, see below). |
| 6 | Setup below family convention | **fixed** | Disposable fixture + isolated userData + cleanup; plugin provisioning (≥2 third-party, mechanism cited "按 6.5 任务注记" — verified at tasks/6.5 Implementation Notes line 49); restart/lock assumption ("等待进程退出 + 单实例锁释放…ERR_SINGLE_INSTANCE" — verified BIZ-coexistence-001); cross-surface oracle channel ("sha256 前后对拍…不以「没报错」为据" — verified task 6.5 Hard Rules). |
| 7a | Optional: plugin-list load/channel failure edge | **taken** | New Step 1c (plugin-runtime.json tampered/corrupt → startup unblocked, manifest state rendered), inferred-annotated with verified basis (tech-design Interface 4 line 206/268 + landed sc6 e2e SC6-2). |
| 7b | Optional: disabled-state rendering assertion | **taken** | Step 3 now "该插件行转为已停用态(状态 + "启用"动作)" (UF6 disabled state verbatim). |
| 7c | Optional: bilingual copy assertion | **not taken** | Still open (blindspot, non-blocking). |
| 7d | Optional: toggle-failure edge (BIZ-resilience-001) | **not taken** | Still open (small 7b deduction + blindspot). |

No claimed-but-unresolved fixes found — every mandatory revision priority is genuinely implemented on the page with verifiable source grounding. No new Internal Consistency deductions on that account.

---

## Phase 1 — Reasoning Audit (pre-score anchors)

**Chain check (problem → solution → evidence → success criteria)**: The journey exercises Story 7 (插件管理·两级模型) end to end: Step 1 ← AC1/UF6 flow 1; Steps 2–3 ← AC2/UF6 flow 2 + validation rules; Step 3 additionally asserts the UF6 `disabled` row rendering; Step 4 ← AC3; Step 5 ← AC4 (with the upgrade/reinstall parenthetical honestly scoped family-unowned — verified true: no journey in the set covers install/upgrade). Edges: 1b ← SC6/UF6 mandatory state; 1c ← tech-design Interface 4 (verified real); 2b ← UF6 validation rule + UF5 third-party-disabled; 3b ← UF6 transitioning (annotated inferred); 3c ← dialog-cancel boundary; 4b ← restart persistence (annotated inferred); 5b ← AC2 blast radius. The narrative genuinely exercises the claimed story.

**Pre-score anchors recorded before rubric scoring**:

1. **Anchor A (structural failure resolved, quality to verify)**: both mandatory web outcomes now carry mapping comments. Independent verification of the mapping bases: "无表单输入面(插件区唯一可写件 = 第三方行启停动词,无自由文本输入)" — confirmed against task 5.12 build spec (rows = 名称/版本/描述/启停开关, no free text); "离线桌面应用(继承 M1 无端口/无服务端会话模型)" — confirmed against PRD 继承约束. The mappings are reasoned, not decorative.
2. **Anchor B (annotation machinery inconsistently applied)**: 1c/3b/4b are annotated `source: inferred` with real, verified bases; the NEW edge 3c (cancel → no state change, no overlay write) is exactly the same inference class ("无 PRD 明文") but carries no annotation. Verified: PRD/UF6 contain no cancel semantics for the disable dialog; the UI prototype (ui/prototype/overview.html "禁用插件确认(UF6)") defines a cancel button but neither the no-write behavior nor the journey cites it. This is the document violating its own freshly established convention.
3. **Anchor C (fixture covers plugins, not session surfaces)**: Setup provisions plugins/userData/restart/oracles but never states the project/task/hooked-session fixture that 2b ("正在活跃挂接会话内在线使用"), 5b ("依次使用任务看板、任务详情、一键发起会话"), and Step 3's "任务看板/会话挂接等核心能力不受影响" require to be observable.
4. **Anchor D (1c under-discriminating)**: 1c asserts only the browser-face convergence; the landed guard for variant ② (bad JSON → isolate `.corrupt-<ts>` + rebuild) is a file-face fact the edge never routes through the Setup channel — a guard regression would pass this leg as written.
5. **Anchor E (structure sound)**: `risk_level: High` correct; density 7 edges ≥ 5 happy steps; `golden_path: false` correct feature-level delegation; invariants strengthened with a falsifiability note ("Setup ≥2 第三方装置下可证伪"); no "或"-forked expected results; headline facts PRD-verbatim.

---

## Phase 2 — Rubric Scoring

### 1. Completeness — 200/200

**1a. Journey metadata (50/50)** — Name `plugin-management` kebab-case; `risk_level: High` valid and justified (mutates plugin load state, SC6 data-integrity stakes, restart/concurrency boundaries); `golden_path: false` consistent with feature-level delegation; surfaces populated; sources list all three PRD files; `generated` present. Full marks.

**1b. Steps complete with required fields (80/80)** — All 5 happy steps carry User Action + Expected Result; all 7 edges carry Precondition + User Action + Expected Result; sequence coherent. Step 5 is now a genuine user browsing action ("用户在插件管理区重新浏览插件列表") — iteration-1's verification-only-step defect is gone. Full marks.

**1c. Outcomes cover happy path + required derived scenarios (70/70)** — Both mandatory web outcomes considered with explicit mapping comments and mapped edges (1b, 1c); dialog-cancel boundary present (3c); upgrade/reinstall clause explicitly scoped out with an honest family-unowned note ("本 feature 旅程集无对应腿,family-unowned(留安装/升级验收),本旅程不作断言" — verified true). Domain edges exceed High-risk density. Full marks.

### 2. Semantic Purity — 197/200

**2a. Natural language outcomes (80/80)** — No regex, selectors, XPath, or framework assertions; outcomes describe user/system observables; "(见注)" pointers resolve to the adjacent source comments; "(状态 + "启用"动作)" is UF6's own state vocabulary. Full marks.

**2b. Preconditions declarative (60/60)** — All edge preconditions are states ("一次启停操作正在执行(行处于操作中 transitioning 指示)", "禁用二次确认对话框已打开(Step 2 发起后)", "隔离 userData 内的 plugin-runtime.json 失效(…fixture 预置后启动)" — the last is a state-at-launch clarification, not a procedure). Full marks.

**2c. No implementation coupling in Step descriptions (57/60)** — Steps 1–5 and 1b/1c/2b/3b/3c are user-level. Dock −3: Step 4b's User Action embeds a test-harness procedure —
> "**User Action**: 重启应用并打开插件管理区与工作台(e2e 驱动面:测试进程等待进程退出与单实例锁释放后重新启动,见 Setup)"

The primary action is user-level and the parenthetical is labeled "e2e 驱动面", but harness procedure text belongs in Setup (where it already exists verbatim); the User Action field should stay purely user-level. No API/DB/function coupling anywhere.

### 3. Precondition Exclusivity — 150/150

**3a. Preconditions distinct across outcomes (60/60)** — The iteration-1 2/2b overlap is resolved with an explicit mutual-exclusion declaration on both sides:
- Step 2: "第三方插件处于启用状态,其注入内容未在活跃会话/挂接视图内在线使用(常规启停场景)"
- Step 2b: "待禁用第三方插件的注入内容正在活跃挂接会话内在线使用(会话界面可见其注入内容;与 Step 2 常规场景互斥)"

The pair is now mutually exclusive and jointly exhaustive over the online dimension, and 2b carries a distinct observable. 4b/5b share the disabled base state but differ in action and observables (legitimate divergent continuations under the family Nb-variant convention). 1b/1c/3b/3c preconditions are distinct and specific.

**3b. Preconditions sufficient to uniquely select (50/50)** — Step 3 (confirm) vs 3c (cancel) are action-differentiated off the same declared dialog-open state; every other variant is state-differentiated. No scenario where two outcomes prescribe overlapping observables remains. Full marks.

**3c. No missing preconditions for error/boundary outcomes (40/40)** — All seven edges state triggers, including the two enumeration variants inside 1c ("①被篡改塞入必备名;②坏 JSON 解析失败"). Full marks.

### 4. Fact Alignment — 129/150

**4a. Factual claims traceable or marked UNKNOWN (55/60)** — Traceability remains the document's strength and the new content is well-grounded: every annotation basis was independently verified real — tech-design Interface 4 (line 206/268: "剔除违规条目回退清单态 + log;插件区显示清单态"), task 6.5 Implementation Notes ("若需第三插件样例,fixture 内动态注册") and Hard Rules ("清单只读断言用文件哈希前后对拍"), BIZ-coexistence-001 (ERR_SINGLE_INSTANCE), UF6 Data Requirements (4b basis, verbatim). Dock −5: Step 3c asserts specific system behavior with no fact reference and no inferred marking —
> "**Expected Result**: 对话框关闭且无任何状态变化:该插件仍启用、注入内容保持在线;启停覆盖文件未被写入(校验通道见 Setup)"

Verified: no PRD/UF6 text defines cancel semantics for the disable dialog (the UI prototype defines a cancel button, not the no-write behavior, and is neither cited in `sources:` nor referenced here). By the document's own convention — it annotates exactly this "无 PRD 明文" class at 3b/4b/1c — 3c is an unmarked inference.

**4b. Inferred claims have rule support + `source: inferred` (42/50)** — The machinery now exists and is correctly used three times: 1c carries both the `session-expired` rule mapping and `source: inferred` (the only truly rule-derived edge, correctly double-annotated); 3b/4b carry `source: inferred` with UF6-semantic bases (domain inferences, correctly not claiming rule-mandation). Dock −8: 3c — a derived boundary outcome (the surface rule's dialog-choice-respected analog) — cites neither a rule nor an inference basis.

**4c. No hallucinated unclassified claims (32/40)** — No invented or PRD-contradicting behavior; the one unclassified assertion is 3c's cancel-no-op ("对话框关闭且无任何状态变化…启停覆盖文件未被写入"). It is plausible, single-behavior, PRD-consistent, and partially foreshadowed by the UI prototype's cancel button — −8 (not the full −30 hallucination rate; same calibration logic as iteration-1's treatment of the then-unannotated 3b).

### 5. Surface Fitness — 135/150

**5a. Mandatory derived outcomes present (58/60)** — Both present, with reasoning quality well above the family baseline:
- `validation-error` (line 70): "本旅程无表单输入面(插件区唯一可写件 = 第三方行启停动词,无自由文本输入);非法请求类比 = 对必备插件发起禁用(越权启停请求),映射为必备行不渲染禁用入口 + 写路径守卫拒绝 = 本边" — no-form-face claim verified against task 5.12's build spec.
- `session-expired` (line 80): "本旅程为离线桌面应用(继承 M1 无端口/无服务端会话模型),无字面会话过期面;通道失效类比 = 运行时启停状态通道失效…按 ERR_PLUGIN_RUNTIME_STATE 处置 = 本边" — rationale verified against PRD 继承约束 and tech-design.
Dock −2: the `validation-error` comment claims the analog maps to "必备行不渲染禁用入口 + 写路径守卫拒绝 = 本边" (both layers), while the 1b body asserts only the render layer — see 6b for the consistency charge; here the mapping slightly overstates what the mapped edge executes in the browser face.

**5b. Test strategy proportions 50/50 Contract/Journey (47/50)** — Shape balanced (5 journey-smoke steps + 7 contract-grade edges); oracle concreteness much improved (Step 3 row-state rendering, Step 5 list-state rendering, 5b concrete observables "任务看板正常渲染依赖树与状态分组、任务详情可读、发起会话入口可用"). Dock −3: a few oracles remain state-summary grade — 2b's "会话本体不中断" (what does the user observe that proves it?), 4b's bare "数据完整" (Step 4 says "数据完整(校验通道见 Setup)"; 4b drops the channel reference), 1c's "应用不崩溃" (negative framing without a positive observable beyond the adjacent list assertions).

**5c. Realistic web environment/execution assumptions (30/40)** — Setup is now at full family convention: disposable fixture + isolated userData + cleanup, plugin provisioning with mechanism, restart/lock assumption with error code, cross-surface oracle channel with anti-"没报错" discipline, browser-side no-file-observation rule. Three residual charges:
- −6: fixture covers plugins but not the surfaces three assertions depend on — 2b's precondition requires "正在活跃挂接会话内在线使用" (a task with execution prompt + initiated session + session-visible injected content); 5b requires "依次使用任务看板、任务详情、一键发起会话等核心能力"; Step 3 asserts "任务看板/会话挂接等核心能力不受影响". Setup states only "应用已启动并进入工作台" — entering the workbench presupposes an activated project, but task/session-hooking fixtures are a stronger requirement never stated. A downstream agent must invent the session fixture.
- −4: Step 1c is under-discriminating as written — "启动不阻断;插件区按清单态呈现——必备插件全数在位且必备徽标在,两级行态不受违规内容影响" is browser-face only. For variant ② (bad JSON), a parse-failure fallback alone (guard regression, corrupt file left in place) still renders manifest state and passes; the discriminating fact (violating file cleaned/isolated, empty overlay rebuilt — asserted by the landed SC6-2 leg) is a file-face check the edge never routes through the Setup channel, unlike Steps 3/3c/4/5b which all say "校验通道见 Setup".
- −0: the restart leg and single-instance hazard are now properly assumed; 1b's formerly universal negative is now bounded to "渲染面不存在禁用 forge 核心插件的通道". Both iteration-1 charges withdrawn.

### 6. Internal Consistency — 144/150

**6a. Invariants hold in every step (60/60)** — All four invariants hold everywhere, and each is now exercised with falsification power: invariant 1 by 1b/1c/4b (incl. post-corruption "必备插件全数在位且必备徽标在"); invariant 2 by Steps 3/4/3b/3c (overlay-not-written on cancel is invariant-consistent); invariant 3 by Step 5 via the sha256 channel; invariant 4 by Steps 3/5b under the ≥2 fixture. Iteration-1's −2 (page never states where disable state persists) is resolved — invariant 2 now says "启停仅写运行时启停覆盖文件(同一配置的可写区)" and 4b's note explains cross-start persistence. No violation, no −40 event.

**6b. Cross-step references consistent (44/50)** — "该插件"/"另一第三方插件" references now have fixture backing; "(见注)" resolves to adjacent comments; "校验通道见 Setup" and "见 Setup" resolve. Two charges:
- −4: the 1b mapping comment and the 1b body contradict on scope — comment: "映射为必备行不渲染禁用入口 + 写路径守卫拒绝 = 本边" vs body: "纵深第二层(对必备名启停写请求的守卫拒绝)由 SC6 验收,不在浏览器面断言". An executor reading the comment would expect 1b to cover guard rejection; the body disclaims it. The comment should scope the analog to the render layer (guard layer already honestly delegated).
- −2: the per-assertion channel-reference convention is applied inconsistently — Step 4 "数据完整(校验通道见 Setup)" vs 4b's bare "数据完整"; 1c likewise omits it (charged substantively in 5c; charged here only for convention drift).

**6c. Risk level consistent (40/40)** — High remains exactly right (load-state mutation, SC6 data-integrity stakes, restart/concurrency/corruption boundaries). Full marks.

### 7. Workflow Coverage — 146/150

**7a. Golden Path existence, veto item (60/60 — NOT triggered)** — Semantic verification performed: Steps 1–5 map one-to-one onto Story 7 AC1–AC4 (AC1 two-tier view → AC2 disable+confirm → AC3 re-enable → AC4 post-toggle list state + manifest intact), all domain-level operations (打开插件管理区 / 点击"禁用" / 确认禁用 / 点击"启用" / 重新浏览插件列表), zero API-level descriptions. Iteration-1's −2 (verification-only terminal step) withdrawn: Step 5 is now a real browsing action whose shape mirrors AC4's own check-shaped Given/When. `golden_path: false` frontmatter remains correct feature-level delegation; the veto tests content, which qualifies.

**7b. Multi-step coverage depth (46/50)** — Deep: full enable→disable→enable lifecycle; forbidden-action negative (1b); startup corruption recovery (1c — now a genuine error-recovery path); online-content disable (2b); double-submit (3b); dialog cancel (3c); restart persistence (4b); cross-entity blast radius into task board/detail/session (5b); cross-plugin isolation under the ≥2 fixture. Dock −4: the toggle operation itself is still modeled only as transitioning→success — no operation-failure edge (e.g., overlay write failure) and no reconciliation with BIZ-resilience-001's silent-degradation mandate (see Phase 3); a downstream author must guess between "error toast" (rule-blocked) and "silent stuck transitioning".

**7c. Workflow completeness against PRD scope (40/40)** — Story 7 AC1–AC4 covered; UF6 flows 1–3 covered; all three UF6 validation rules covered; UF6 States fully asserted (mandatory/enabled/disabled/transitioning); UF5 third-party-disabled covered (2b); SC6 behavioral surface covered with honest layer-delegation (guard → SC6, verified real at task 6.5 SC6-1). The upgrade/reinstall scope is explicitly family-unowned rather than dangling. No uncovered primary workflow found.

### Cross-dimension coherence check

- **3c unannotated inference** is the sole Fact Alignment driver: charged across 4a (traceability −5), 4b (annotation machinery −8), 4c (classification −8) — three rubric-defined facets of one root cause, mirroring iteration-1's established 4a/4c split for 3b; no −30 hallucination rate (plausible, single-behavior, prototype-foreshadowed).
- **1b comment/body scope tension** charged once under 6b (−4, internal contradiction) and lightly under 5a (−2, mapping overstates executed coverage) — two facets, one root cause, acknowledged.
- **1c file-face oracle gap** charged substantively once under 5c (−4, discriminative power); its convention-drift facet folded into the 6b −2 (together with 4b's dropped channel reference).
- **Session/task fixture gap** charged once (5c −6). **Toggle-failure depth** charged once (7b −4); its business-rule reconciliation facet is rubric-external → blindspot 2. **4b harness parenthetical** charged once (2c −3). No text is penalized twice within a dimension.
- Score movement 935 → 1101 is driven by: surface-rule engagement (5a 15→58) with verified-real bases, Setup execution discipline (5c 18→30), annotation machinery (4b 20→42), the 2/2b fix (3a/3b to full), and executable Step 5 (1b/2c/5c/7a/7c facets cleared).

---

## Phase 3 — Blindspot Hunt ([blindspot] = outside all rubric dimensions)

1. **[blindspot] Bilingual copy is required by the PRD and still never asserted** (carried from i1 blindspot 3, optional, not taken). UF6 Data Requirements: "影响说明文案 | text | 静态 | 中英双语"; PRD Compatibility: "工作台 UI 文案中英双语(继承 M1 壳级决定)". Steps 2/2b assert the confirmation copy's content — "出现二次确认,说明影响(仅该插件注入内容退出;forge 数据与工作台核心能力不受影响)" — but no step, edge, or invariant touches its language, nor that of the third-party-disabled 说明. No rubric dimension covers locale/i18n. *Fix: add a copy-language assertion (or invariant) for the confirmation and third-party-disabled 文案.*

2. **[blindspot] Toggle failure semantics remain silent where a business rule speaks** (carried from i1 blindspot 5, optional, not taken; 7b charges only the state-machine depth facet). The journey's only in-flight model is "行保持操作中指示直至本次操作完成" — completion. BIZ-resilience-001 mandates silent degradation + ERR_* structured log (no dialogs, no blocking) for non-fatal failures; if the overlay write fails mid-toggle, expected UX is undefined in the journey, so a test author must guess. Business-rule reconciliation is not a rubric dimension. *Fix: add an operation-failure edge whose expected behavior cites BIZ-resilience-001 (silent degradation + log, no modal error), or state the delegation explicitly.*

3. **[blindspot] 4b's control clause is non-discriminating as provisioned.** Expected: "另一第三方插件启停状态不受牵连" — but Setup fixes the other fixture as enabled ("第三方 fixture 插件 ≥2 个且均启用"), and an enabled plugin's state is trivially unaffected by an overlay wipe (the disabled one flipping back to enabled is what 4b's primary assertion catches). The clause adds no discriminating power. *Fix: disable BOTH third-party fixtures before the restart leg and assert both disabled states persist — turns the clause into a real oracle.*

4. **[blindspot] Only the click path is modeled; the surface rule's accessibility principle is untouched.** Surface-web General Testing Principles #4 requires keyboard reachability and ARIA presence for dynamic content; every interaction in the journey is click-shaped — "**User Action**: 对第三方插件点击"禁用"". Not a rubric dimension, and typically deferred to test-script generation, but a High-risk journey governing a destructive-ish action could carry one keyboard-path assertion. *Fix: optional — note keyboard reachability of 启停 verbs as a contract-level expectation.*

Resolved from i1: blindspot 1 (channel/load failure → Step 1c), blindspot 2 (≥2 fixtures → Setup), blindspot 4 (restart lock hazard → Setup assumption) — all verified implemented; withdrawn.

---

## Revision Priorities (residual, non-blocking)

1. Annotate Step 3c `source: inferred`(basis: 确认对话框取消语义无 PRD 明文;或引用 ui 原型 disable-confirm 的取消钮 + 补行为推断依据)— fixes the last Fact Alignment gap.
2. Align the 1b mapping comment with the body's scoping ("渲染层 = 本边;守卫层由 SC6 验收"), and restore "(校验通道见 Setup)" on 4b's "数据完整" and 1c's cleanup assertion; ideally add the file-face cleanup/isolation oracle to 1c via the Setup channel.
3. Extend Setup with the project/task/hooked-session fixture statement that 2b/5b/Step 3 depend on.
4. Optional: bilingual copy assertion; toggle-failure edge citing BIZ-resilience-001; dual-disable 4b control; move 4b's harness parenthetical to Setup.

**Final: 1101/1150 — PASS (total ≥ 975; all dimensions ≥ threshold). No further revision required by the gate.**
