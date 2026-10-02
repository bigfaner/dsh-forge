# Eval Report: knowledge-recall-flywheel (Journey) — Iteration 2

- **Document**: `docs/features/dsh-forge-p1-mvp/testing/knowledge-recall-flywheel/journey.md`
- **Feature**: dsh-forge-p1-mvp
- **Surface**: web (SURFACE_RULE: gen-journeys `rules/surface-web.md`)
- **Scorer persona**: Senior QA Engineer (adversarial)
- **Rubric**: journey.md (1150 pts, 7 dimensions, target 975, per-dimension min thresholds)
- **Iteration**: 2 (previous: `eval/iteration-1.md`, score 880/1150 — FAIL)
- **Verified against** (this iteration, independently re-checked): prd-user-stories.md (Story 1 AC1, Story 2 AC1, Story 3 AC3, Story 4 AC1–AC3), prd-spec.md (流程三, 召回飞轮流 Mermaid incl. no-hit branch and 会话发起/恢复 entry, DF003–DF006, Security Requirements), prd-ui-functions.md (UF-2/3/4/6 — 统计头/分组行字段、占位文案、行级失效标注、事件即时累积、三页签不重置), proposal.md (Key Scenario 召回飞轮, SC10, SC-MVP, 降级预案「能力面先以产品内部 API 直测承接」, token 预算极简值设计期定, e2e 分层).

---

## Phase 0 — Previous Attack-Point Resolution Verification

Scored independently on the page as it stands; no credit for effort. Resolution status of every iteration-1 attack:

| # | Iteration-1 attack | Status | Evidence in current document |
|---|---|---|---|
| 1 | Web mandatory derived outcomes absent (D1.3 −30 / D4.2 −30 / D5.1 0/60) | **RESOLVED** | "## Derived Outcomes（Web Surface 必察项）" section present; `validation-error` covered by real Step 3b（空问题发送被拦截，断言无消息/无往返/无事件链）; `session-expired` classified N/A — "单机产品无登录会话 / 过期概念（PRD 单机安全边界……）"， verified against prd-spec Security Requirements（本机回环、无远程暴露面、凭证归 dsh profile 域） |
| 2 | Steps 4b/4c/4d User Actions not performable (D1.2 −10) | **RESOLVED** | 4b: "产品 UI 无直调检索原语的入口，本步经能力面 contract 直测通道驱动（source: inferred——测试基建契约……提案降级预案同通道）"; 4c: "经同一 contract 通道发起不带域前缀的 search 查询”； 4d reframed: "在对话 tab 发送 Q1（search 未获命中为该库态下的确定前置，非用户动作）" |
| 3 | Boundary fixtures unplanted, contradict baseline, no isolation (D3.3 −15) | **RESOLVED** | Setup plants K1（部署）/ K2（构建，超长正文）/ 后端域条目若干 with "K1 / K2 关键词零交集，命中确定”； "场景隔离：Step 2b / 2c 以……专属工作区独立启动；Step 4d 以全字段不含「部署」「构建」的无关库工作区独立启动……均不与基线（Q1 / Q2 可命中）叠加” |
| 4 | Step 7 "+1" without baseline; 统计头 not instantiated (D6.2 −15) | **RESOLVED** | Setup: "使用事件基线 = 0（目标项目全新注册，Step 1 从零项目走全链，无预置事件）——热度断言基线，无需前置观察步”； Step 7 instantiates "召回次数 = 1、覆盖条数 = 1（事件基线 0 + 本链 1 次）"; Step 8: "K1 热度徽章 = 1（基线 0 + 本链 +1）" |
| 5 | Event counting unit ambiguous (D6.1 −10 / B4) | **RESOLVED** | Invariant 1: "「一次召回」计数口径 = 一次命中的检索链记 1 条（source: inferred……）；实现若按工具调用逐条计则热度 +2 ≠ 断言 +1，断言失败即缺陷信号”； mermaid both-branches fact verified accurate |
| 6 | Event-table / index equality unobservable (D2.1 −15 / D5.3) | **RESOLVED** | Channel splits with inferred marks: Step 1 proxy ("其可观察代理 = Step 8 知识库网格呈现 K1 / K2 卡片"), Step 2 ("本断言经能力面 / 插件契约通道承载"), Step 7 ("浏览器侧以本步实例化数字断言，事件表逐条核对归审计通道（状态层直读）") |
| 7 | Nondeterministic golden path, no fixture/retry (B2 / D5.3) | **RESOLVED** | Fixture Q1/Q2 defined with rationale; "稳定性策略……观察窗 = 提问后 120s 内回答完成且轨迹出现检索链；窗内无链 → 同一 fixture 问题重发 ≤2 次；仍无 → 降级能力面 contract 通道验证同等断言并记 flake" — but see new blindspot BS4 on retry×count interaction |
| 8 | Trajectory tab never exercised (B1) | **RESOLVED** | New Step 6: "切「轨迹」tab 验证检索链时序……含 search 与 read-abstract 两条且 search 先于 read-abstract……切回对话 tab 不重置——回答仍在原位" |
| 9 | Aggregation untested with divergent numbers (B3 / D7.2 −10) | **PARTIAL** | Step 8b adds a second recall (K2) — but "统计头召回次数 = 2、覆盖条数 = 2" keeps both metrics EQUAL; the claim "聚合语义可区分于回显” only proves temporal accumulation, not 次数-vs-覆盖 separation. Residual deduction kept |
| 10 | Step 2b bundles 未配置/为空 states (D3.2 −10) | **RESOLVED** | Split into 2b (未配置) and 2c (已配置但为空) with distinct preconditions; 2c marks 注入口径 UNKNOWN and defers to design ("分歧交设计期裁决") |
| 11 | 关键词细分 not distinctly exercised (D7.3a) | **PARTIAL** | Fixture design now makes keyword discrimination load-bearing ("K1 / K2 关键词零交集，命中确定”) and Step 4's chain includes "关键词细分”, but no assertion names it as its target (SC10: "关键词细分生效（e2e 各一条）"). Small residual kept |
| 12 | Restore/restart durability untested (B5 / D7.3b) | **NOT RESOLVED** | Mermaid entry "会话发起 / 恢复” verified in prd-spec; journey still has no restore case and no deferral note |
| 13 | Step 2b unclassified inference (D4.2/D4.3) | **RESOLVED** | "（无知识库可召回——Story 4 AC1 的反向派生，无 PRD 原文，source: inferred）" |
| 14 | No UNKNOWN marking (D4.1 −20) | **RESOLVED** | UNKNOWN marks on token threshold ("阈值设计期定，UNKNOWN"), 动词取值 ("动词取值 UNKNOWN，见 Invariants"), 知识段注入口径 (2c) |
| 15 | dsh runtime failure path absent (B6) | **PARTIAL** | session-expired N/A now names the nearest neighbor ("最近邻 = dsh 运行时不可用，属环境故障非过期（Setup 环境前置）") — a reasoned disposition, but the user-facing failure branch (send error surfaced / retry / no data loss) remains untested. Kept as blindspot BS1 |

**No regressions introduced**: step renumbering (happy 1–8, edges 2b/2c/3b/4b–4e/7b/7c/8b) is internally consistent; all cross-references resolve (Step 4→6, Step 1→8, 4d→7b, 8b→Step 7, 3b→Derived Outcomes, Setup→4e/8b).

---

## Phase 1 — Reasoning Audit (pre-score anchors)

1. **Core workflow**: Happy Path Steps 1–8 cover the SC-MVP chain (注册 → 会话 → 召回链 → 事件 → tab → 热度， verified verbatim against proposal SC-MVP and prd-spec 流程三/召回飞轮流) plus the new trajectory-evidence step. Genuinely the golden path, semantically matched to Story 4's three ACs.
2. **Executability**: previously four blockers, all now removed (contract channel declared for 4b/4c; 4d reframed; fixtures planted; isolation declared; stability window/retry/degrade encoded). Remaining executability friction is localized: Step 4e's assertion has no declared observation channel; Step 4c has no concrete query/fixture for its cross-domain claim; Step 7c's stale branch has no setup path.
3. **Observable vs internal**: the channel-split discipline is now applied everywhere it was flagged (Steps 1/2/7/8b) — the one lapse is 4e.
4. **Consistency**: no invariant violated; counting 口径 now defined with an explicit failure-mode diagnostic.

---

## Phase 2 — Rubric Scoring (verification stance)

### Dimension 1: Completeness (完整性) — 198/200 (min 120: PASS)

| Criterion | Score | Justification |
|---|---|---|
| 1.1 Metadata | 50/50 | `journey: "knowledge-recall-flywheel"` kebab-case ✓; `risk_level: "High"` justified — state mutation (project registration, real dsh session creation, usage-event writes) matches the High criterion; `golden_path: true` consistent; sources/surface/generated populated ✓. |
| 1.2 Steps complete | 78/80 | All 18 steps (8 happy + 10 edge) carry User Action + Expected Result in a coherent ordered sequence; all 10 edge cases state Preconditions ✓. −2: Step 4's User Action "将问题交由 agent 处理（agent 自主编排检索）" is a hand-off clause, not a performable operation — the executable instruction (send Q1) lives in Step 3, leaving a downstream test with no operation for this step; it functions as an outcome host for the SC10 chain assertion. |
| 1.3 Outcomes: happy + required derived | 70/70 | validation-error covered by executable Step 3b with full negative chain ("无消息上屏、无 agent 往返、无检索链与使用事件”) and UF-4-grounded empty-session state; session-expired classified N/A with PRD-verified rationale; boundary layer otherwise rich (2b/2c 配置态边界、4b/4c 检索范围、4d 降级、4e 摘要默认、7b 空态、7c 跳转+失效、8b 累积). |

### Dimension 2: Semantic Purity (语义纯度) — 198/200 (min 120: PASS)

| Criterion | Score | Justification |
|---|---|---|
| 2.1 Natural language, not code/regex | 78/80 | No regex/selectors/framework assertions anywhere ✓; internal-data equality assertions all re-channeled (Step 1 proxy, Step 2 channel, Step 7 audit-channel split) ✓. −2: Step 4e's Expected Result asserts an internal control state — "默认返回摘要而非整段正文——token 预算受控" — inside a web journey, with no observation proxy or channel note (the discipline applied at Steps 1/2/7 lapses here). |
| 2.2 Preconditions declarative | 60/60 | All ten edge preconditions are declarative state descriptions ("项目知识目录未配置”, "知识库同时存在前端域与后端域知识条目”, "同一会话中已发生过一次召回（衔接 Step 7 终态……）"); no setup-code phrasing. |
| 2.3 No implementation coupling in Steps | 60/60 | Plugin naming removed from Step 4 (was −5 in iter 1); `search`/`read-abstract` are PRD domain vocabulary; contract-channel mentions in 4b/4c are test-infrastructure channel declarations (exactly what iter 1 required), not app-internal coupling. |

### Dimension 3: Precondition Exclusivity (前置条件互斥性) — 141/150 (min 90: PASS)

| Criterion | Score | Justification |
|---|---|---|
| 3.1 Preconditions distinct across Outcomes | 60/60 | Ten edge preconditions pairwise distinct and non-overlapping; each step has one outcome; the iter-1 2b bundle is now split into 2b/2c with distinguishable states ("未配置” vs "已配置且为空……与 2b 未配置态可区分”). No ambiguous pair; −20 rule not triggered. |
| 3.2 Sufficient to uniquely select an Outcome | 45/50 | −5: Step 7c bundles two outcomes under one Precondition ("召回 tab 存在分组行条目”) — normal jump vs stale-row annotation — selecting between them only via the inline conditional "若索引未命中该知识（已被外部删除）"; the discriminator lives in the outcome text, not the precondition, so the stated precondition under-determines which branch applies. |
| 3.3 No missing Preconditions for error/boundary Outcomes | 36/40 | All boundary cases state their trigger ✓; scenario isolation declared for 2b/2c/4d ✓. −4: Step 4c's fixture is insufficient for its asserted observation — Setup plants "后端域条目若干（供 4b 对照）” with unspecified keywords, so "前端域与后端域条目均可命中” cannot be deterministically produced; no query text is given for the channel-driven search. |

### Dimension 4: Fact Alignment (事实依据) — 147/150 (min 90: PASS)

Independent verification re-performed this iteration: every PRD-cited claim checked against the four sources. Verified matches include Story 4 AC1's 知识段三要素 (Step 2), AC2's chain (Steps 4–5), AC3's event/tab/热度 triple (Steps 7–8), UF-4's 统计头/分组行 field names and "「本会话暂无召回」占位” verbatim (Step 7b), UF-4's "索引未命中时行级失效标注，不阻塞列表” verbatim (Step 7c), UF-4's "事件即时累积” (Step 8b), UF-6 heat badge + drawer (Step 8/7c), mermaid no-hit branch "agent 转常规检索原语 grep / glob 等” (4d), proposal "省略 = 全域” (4c), SC10 域前缀过滤/摘要默认 (4b/4e), SC-MVP chain (golden path), 降级预案通道 (4b's contract channel), "token 预算极简值设计期定” (Setup's UNKNOWN), Security Requirements 单机边界 (session-expired N/A). **No counterfactual claim found.**

| Criterion | Score | Justification |
|---|---|---|
| 4.1 Factual claims traceable / UNKNOWN | 57/60 | Document-level PRD 溯源 verified accurate; per-claim UNKNOWN marking now present at all PRD-undecided points (token 阈值、动词取值、注入口径) and channel splits carry inferred marks. −3: Step 3b's "焦点仍在输入框” micro-behavior has no source and rides under the blanket Derived-Outcomes annotation rather than its own inferred/UNKNOWN mark ("空会话引导态保持” itself is UF-4-grounded — "空会话 \| 引导输入”). |
| 4.2 Inferred claims with rule support + source: inferred | 50/50 | Eleven-plus `source: inferred` annotations, each with a specific basis: fixture 措辞 ("PRD 未定义问题文本”), stability ("依提案 e2e 分层与降级预案”), Step 1 proxy ("PRD 未定义索引态的 UI 暴露”), 2b ("Story 4 AC1 的反向派生，无 PRD 原文”), 2c (UNKNOWN + 分歧交设计期), 3b ("surface-web required_outcomes 必察项 × UF-4；……与兄弟 Journey session-workbench 同口径”), 4b channel ("提案降级预案同通道”), Step 7 split ("PRD 未定义”), Invariant 计数口径 ("PRD 未定义计数单位……Mermaid 中 search 与 read-abstract 两支均汇入事件节点” — verified accurate against the mermaid), session-expired N/A ("PRD 单机安全边界” — verified). |
| 4.3 No hallucinated unclassified claims | 40/40 | Zero fabricated behavior found; the iter-1 unclassified negative-case inference (2b) is now classified. −30 hallucination rule not triggered. |

### Dimension 5: Surface Fitness (Surface 适配, web-parameterized) — 143/150 (min 90: PASS)

| Criterion | Score | Justification |
|---|---|---|
| 5.1 Mandatory derived Outcomes present | 60/60 | surface-web.md mandates validation-error + session-expired "must be considered for every Web Journey": validation-error = executable Step 3b on the journey's only input face (chat composer), asserting non-submission, no round trip, no event; session-expired = N/A with verified single-machine rationale (no login session concept; nearest neighbor mapped to environment precondition). Iter-1's 0/60 fully cured. |
| 5.2 Test strategy proportions (Web: balanced 50/50) | 46/50 | 8-step deep golden chain (journey-smoke) + granular capability assertions (4b/4c via declared contract channel) + boundary cases = balanced mix with per-case level declarations ✓. −4: Step 4e is the one capability-shaped assertion left without a level declaration — User Action is journey-level ("在对话 tab 发送 Q2”) while the Expected Result asserts capability-plane tool-return behavior ("默认返回摘要而非整段正文”) that UF-4's 轨迹台账 ("本轮消息与工具调用时序列表”) does not expose; a test-gen agent cannot tell whether to drive it via contract channel (as 4b/4c do) or what to observe in-browser. |
| 5.3 Environment/execution assumptions realistic | 37/40 | Browser interaction model ✓; credential domain declared per prd-spec Security ✓; scenario isolation with dedicated workspaces ✓; async containment for the real agent round trip (120s observation window keyed to an observable exit condition "轨迹出现检索链”, retry ≤2, contract-channel degrade + flake record) ✓. −3: Step 4c's cross-domain assertion cannot be deterministically produced as specified (unspecified back-end keywords + no query text — cross-ref D3.3). |

### Dimension 6: Internal Consistency (一致性) — 148/150 (min 90: PASS)

| Criterion | Score | Justification |
|---|---|---|
| 6.1 Invariants hold in every Step | 60/60 | No step violates any invariant; iter-1's counting-unit ambiguity is resolved with an explicit 口径 plus failure-mode diagnostic ("实现若按工具调用逐条计则热度 +2 ≠ 断言 +1，断言失败即缺陷信号”)； 3b/4d uphold the no-event side; Step 6 upholds the tab-no-reset invariant with an explicit assertion; no step writes to repo/knowledge dir. |
| 6.2 Cross-Step references consistent | 48/50 | All references resolve: Step 4→"Step 6" evidence ✓, Step 1→"Step 8" proxy (Step 8 does render K1/K2 cards) ✓, 4d→"Step 7b 互证” ✓, 8b→"Step 7 的 1/1" ✓, Setup 基线→Steps 7/8 numbers ✓, 7→"见 Invariants” ✓. −2: Steps 2b/2c assert system-prompt content ("系统提示词不含知识段”) but rely on silently inheriting Step 2's channel declaration ("本断言经能力面 / 插件契约通道承载”) — a downstream agent consuming a single step misses that the assertion is not browser-observable. |
| 6.3 Risk level consistent | 40/40 | High = state mutation — project registration, real dsh session creation, usage-event writes; consistent with sibling calibration. |

### Dimension 7: Workflow Coverage (工作流覆盖度) — 139/150 (min 90: PASS; veto NOT triggered)

| Criterion | Score | Justification |
|---|---|---|
| 7.1 Golden Path existence (veto) | 60/60 | Steps 1→8 contiguous, domain-level (注册、建会话、提问、看轨迹、切页签、看卡片)， semantically matching SC-MVP's verified 6-step chain plus Story 4's three ACs and 流程三/召回飞轮流. `golden_path: true` metadata matches content. |
| 7.2 Multi-step coverage depth | 45/50 | Error recovery (4d), scope variants (4b/4c), negative input (3b), empty state (7b), cross-entity navigation (7c), staleness (7c), temporal accumulation (8b) — deep. −5: the recall tab's two aggregate metrics remain numerically identical in every scenario — Step 8b asserts "召回次数 = 2、覆盖条数 = 2" after golden path 1/1; an implementation that echoes one counter into both slots passes all assertions. A same-item repeat recall (e.g., Q1 again → 次数 3 / 覆盖 2) is the missing differential. |
| 7.3 Completeness against PRD scope | 34/40 | Story 4's three ACs, Story 1/2/3 prefixes, SC10's 域前缀/省略/摘要默认/知识段/真实调起/事件/tab 一致， and SC-MVP all covered ✓. −3: SC10 requires "关键词细分生效（e2e 各一条）” — the journey exercises it only implicitly via fixture design ("K1 / K2 关键词零交集，命中确定”) and the parenthetical in Step 4's chain ("`search`（选前端域前缀 + 关键词细分）”), never as a named assertion with its own observable. −3: the mermaid's verified entry "会话发起 / 恢复” — recall-tab/heat persistence across session restore or app restart — has no case and no deferral note (the durability behind "哪些知识在哪些会话被用了”). |

### Cross-dimension coherence check

- The 4e channel lapse manifests in D2.1 (−2, internal-state assertion) and D5.2 (−4, missing level declaration) — its primary home is D5.2 per criterion text; D2.1 carries the purity facet only.
- The 4c fixture gap manifests in D3.3 (−4) and D5.3 (−3): primary home D3.3 (fixture sufficiency), D5.3 carries the determinism facet.
- The aggregation collapse is counted once (D7.2) with its overclaim facet in blindspot BS3; runtime-error and durability gaps live in blindspots (BS1/BS2) with the durability PRD-scope facet counted once in D7.3.

---

## Phase 3 — Blindspot Hunt (QA-domain patterns outside rubric dimensions)

- **[blindspot] BS1 — riskiest dependency's failure path still untested**: Setup declares "dsh 会话运行时可用（模型 API 凭证归 dsh profile 域，产品不经手）” and the session-expired N/A reclassifies runtime unavailability as environment ("最近邻 = dsh 运行时不可用，属环境故障非过期（Setup 环境前置）”). The proposal's #1/#3 Key Risks (插件↔能力面缝、e2e 对真实往返的稳定性) make this the most probable real-world failure, and surface-web lists network-error among common web boundaries — yet no branch verifies the user-facing failure surface (send error surfaced, no data loss, retry possible). Must improve: an error-path case or an explicit in-document deferral with reason, not just environment preconditioning.
- **[blindspot] BS2 — flywheel record durability never verified**: Overview sells "「哪些知识在哪些会话被用了」可见” and the verified mermaid entry is "会话发起 / 恢复” — no case checks recall-tab entries or heat badges surviving session restore or app restart; the event-accumulator's persistence is asserted nowhere. Must improve: a restore/restart case (reopen session → 召回 tab 条目与热度仍在) or an explicit deferral note.
- **[blindspot] BS3 — distinguishability claim the test cannot cash**: Step 8b claims "（与 Step 7 的 1/1 分离，聚合语义可区分于回显）” — but with two distinct items each recalled once, 次数 = 覆盖 = 2 in both correct and echo-bug implementations; only temporal accumulation is proven, not metric separation. Must improve: recall the same item twice in-session and assert 次数 > 覆盖.
- **[blindspot] BS4 — retry policy can poison the count it asserts**: stability policy "窗内无链 → 同一 fixture 问题重发 ≤2 次” interacts with Step 7's "召回次数 = 1（事件基线 0 + 本链 1 次）”： if the first run's chain lands late (after the 120s window) or the retry fires after a slow partial success, two usage events exist and the =1 assertion fails as a false defect — the policy states no guard (retry only when no chain AND no event recorded, or assertion tolerant of retry-induced counts). Must improve: condition the retry on zero recorded events, or state the expected count under retry paths.
- **[blindspot] BS5 — edge-case fixture mutation can poison later assertions**: Step 7c's stale branch requires "若索引未命中该知识（已被外部删除）” — an external deletion of a knowledge file mid-suite. 场景隔离 covers only 2b/2c/4d workspaces; if 7c deletes K1 (or K2) in the baseline library, Step 8b's "K1 徽章保持 1” / K2 assertions and any later runs are poisoned, and no re-seed or ordering statement exists. Must improve: declare the deletion target/clone and the ordering/re-seeding rule for post-golden-path edge cases.

---

## Deduction Rule Applications

| Rule | Applied | Detail |
|---|---|---|
| Missing required field/section → 0 for dimension | Not applied | All required sections present (Overview/Setup/Happy Path/Edge Cases/Derived Outcomes/Journey Invariants); frontmatter complete. |
| Hallucinated unclassified claim −30 | Not applied | All load-bearing claims verified against PRD/spec/proposal sources this iteration; zero counterfactuals. |
| Surface type violation −25 | Not applied | No cross-surface constructs; contract-channel usage is a declared test channel, not a surface violation. |
| Invariant violation −40 | Not applied | No invariant violated by any step. |
| Precondition overlap −20/pair | Not applied | No two outcomes share a precondition (7c is a within-outcome conditional, scored under 3.2 sufficiency instead). |
| Golden Path veto | Not triggered | Golden path present, semantically verified against SC-MVP / Story 4 (D7.1 = 60). |
| API-level golden path steps −15/step | Not applied | Golden-path steps are domain-level user operations; tool-level framing occurs only in edge cases with declared channels. |

---

## Final Summary

```
SCORE: 1114/1150
DIMENSIONS:
  Completeness: 198/200
  Semantic Purity: 198/200
  Precondition Exclusivity: 141/150
  Fact Alignment: 147/150
  Surface Fitness: 143/150
  Internal Consistency: 148/150
  Workflow Coverage: 139/150
```

**Verdict: PASS** (total 1114 ≥ 975; every dimension ≥ its min threshold: 198/198/141/147/143/148/139 vs 120/120/90/90/90/90/90).

**Resolution scoreboard**: of iteration-1's 15 attack points — 11 fully resolved (mandatory derived outcomes, executability channels, fixtures/isolation, heat baseline, event counting unit, observability channel splits, stability policy, trajectory step, 2b bundle, unclassified inference, UNKNOWN marking), 3 partially resolved (aggregation differential, 关键词细分 distinctness, runtime failure path), 1 unresolved (restore durability). No new defects introduced by the revision.

**Residual gaps (non-blocking, for future hardening)**: Step 4e's missing observation-channel declaration (D5.2); Step 4c's unspecified query/cross-domain fixture (D3.3/D5.3); 次数/覆盖 differential (D7.2/BS3); Step 7c's conditional bundle and undeclared deletion setup (D3.2/BS5); retry×count guard (BS4); restore/restart durability case or deferral (D7.3/BS2); dsh runtime error path or deferral (BS1).
