# Contract Eval Report — worker-provisioning / iteration 1

- **Scorer**: adversarial contract scorer (rubric `skills/eval/rubrics/contract.md`, 1100 pts, target 935)
- **DOC_DIR**: `docs/features/dsh-forge-m3-bootstrap-presets/testing/worker-provisioning/contracts/`（5 files, 13 Outcomes）
- **Surface**: web（rule `gen-journeys/rules/surface-web.md`；handbook `design/page-map.md` 在场）
- **Date**: 2026-10-08

## Verdict

**SCORE: 890/1100 — FAIL**（target 935；Fixture Specification 0/100 触发 veto 且低于维度门槛 60）

| Dimension | Score | Threshold |
|---|---|---|
| Completeness | 150/150 | 90 ✓ |
| Semantic Purity | 173/200 | 120 ✓ |
| Precondition Exclusivity | 110/150 | 90 ✓ |
| Fact Alignment | 136/150 | 90 ✓ |
| Surface Fitness | 93/100 | 60 ✓ |
| Internal Consistency | 138/150 | 90 ✓ |
| Anchor Integrity | 90/100 | 60 ✓ |
| Fixture Specification | **0/100 (veto)** | 60 ✗ |

---

## Phase 1 — Reasoning Audit

结构忠实度良好：旅程 13 步（1/1b/1c/1d/2/2b/3/3b/4/4b/5/5b/5c）与合约 13 个 Outcome 一一对应，无漏步；每份合约含 4 条旅程不变量复述；web 派生 Outcome（validation-error / session-expired）在每份文件头部有显式裁决注释，承载步落 step-1（表单原生形态 + 配置时效本地化）——与旅程 Derived Outcomes 裁决一致。

主要独立判断（预评分锚点，后经维度核验证实）：

1. step-1 success 前置「三项未配置或可重配置」与 unconfigured-placeholder 前置「三项未填齐」在「未配置」状态区重叠；
2. step-5 prefix-bifurcation 双夹具状态包含 success 单夹具状态；
3. fixture_spec 实体覆盖存在真实缺口（详见维度 8 veto 论证）；
4. step-4 frontmatter `page` 为空串而 handbook 在场；
5. 维度值普遍内嵌实现标识（task_session_links / toolFilter / block_source / forge-settings.json 原子写机制）。

事实面对账（.forge/fact-table.json，139 条）：M3_SETTINGS_FILE、M3_AGENT_OPTIONS_SOURCE、M3_WORKER_TOOL_MATRIX、M3_WORKER_GLOBAL_DENY、M3_WORKER_FORGE_FACE、M3_FORGE_EVENT_TYPES、M3_BLOCK_SOURCE_ATOMIC、M3_FIX_CHAIN_MAX_DEPTH、M3_ADDTASK_PREFIX_SEMANTICS、M3_RESTORE_HOOK、M2_EVENT_PUSH_CHAIN、M2_LINKS_WRITE_SOURCE、M3_PRESET_BLITZ_SKILL_DIRS、M3_PRESET_REGISTRY_DEFAULT 等主张全部与事实表一致，未发现与事实矛盾的主张。

---

## Phase 2 — Rubric Scoring

### 1. Completeness — 150/150

- **四维非空（0-50）= 50**：13 个 Outcome 的 Preconditions / Input / Output / State 全部非空；Side-effect 全部显式给出（含 "none（拒绝形态）" 等默认语义）；Invariants 可选且部分 Outcome 携带。无缺失。
- **Journey Invariants（0-50）= 50**：5 份合约均有 `## Journey Invariants` 且各含 4 条，与旅程 4 条不变量逐字一致。
- **happy path + surface 派生（0-50）= 50**：每步 happy Outcome 在场；web 必选派生 validation-error / session-expired 由 step-1 承载（"unconfigured-placeholder" / "config-timing-boundary"），其余 4 份文件以头部注释显式裁决 N/A 并给理由（如 step-3：「validation-error = N/A（本步为契约面工具断言，无表单交互面）」）。

### 2. Semantic Purity — 173/200

- **自然语言非代码/regex（0-80）= 80**：全文无 regex（`\d`/`.*`/字符类）、无 CSS/XPath 选择器、无框架断言调用（`expect(...)` 类）。
- **前置为声明式状态（0-60）= 55**：前置总体声明式。扣分点：step-1 config-timing-boundary 前置「一个 worker 已在途（派发时档位 = 旧档）；**用户随后改档并保存成功**」——后半句是动作时序叙述而非状态描述（fixture_spec 里的「worker 段已改为新档（保存成功）」才是正确形态，正文未对齐）。
- **无实现耦合（0-60）= 38**：维度值大量内嵌内部机制标识（可逐字引用）：
  - step-1 success Output：「持久化（用户数据域 forge-settings.json——**core forgeSettings 单门读写**）、下次派发生效（**dispatchTask 实时读**，无重启）」——内部服务名 + 内部工具名；
  - step-1 success State：「forge-settings.json 写入 worker 段（**原子写——同目录临时文件加改名**，崩溃无半写）」——写实现机制；
  - step-2 success State：「任务 pending → in_progress（**claim 写 task_session_links** 派发挂接）」——数据库表 + 内部动词；
  - step-2 success Side-effect：「**task-claimed / task-spawned 事件（含 workerSessionId / toolFilter / model）落事件日志**」——内部事件名与字段清单；
  - step-3 success State：「各 worker 按 deny 面 spawn（**toolFilter 携带矩阵派生拒绝集**）」；step-5 success Output：「**block_source 单事务**、链深 ≤6、恢复钩子」。
  这些主张与事实表相符（M3_FORGE_EVENT_TYPES 等），作为「契约面」断言对象有其设计动机，但按 rubric「describe system-level behavior, not internal function calls, database queries, or file system paths」口径构成系统性耦合（约 -22）。

### 3. Precondition Exclusivity — 110/150

- **前置互异（0-60）= 45**：step-1 success 前置「worker 小节三项**未配置**或可重配置」的第一析取支与 unconfigured-placeholder 前置「worker 小节三项**未填齐**」语义近等同——同一状态区两个 Outcome 的前置同时为真（-15）。其余各步互异清晰（step-2 显式构造了「一致 vs 不同」互斥对，值得肯定）。
- **前置足以唯一定选（0-50）= 25**：两处状态区重叠导致仅凭前置无法唯一定选：
  1. 状态「三项未填齐」下，step-1 success 与 unconfigured-placeholder 前置同时成立，需靠 Input（填齐保存 vs 直接尝试保存）消歧；
  2. step-5 prefix-bifurcation 前置「两个受阻场景各一在场——独立问题型与阻塞问题型」蕴含 success 前置「注定受阻的任务 fixture 已派发」（阻塞问题型即其一），双夹具状态下两 Outcome 同时可选。
  另：step-5 success Output 断言「前缀按语义二分：disc-N …/ fix-N …」——success 夹具（AC gate 拒型）未被指明诱导哪一支前缀，行为断言为析取式，前置不足以钉死期望值（该钉死由 prefix-bifurcation 补位，但 happy Outcome 自身欠定）。
- **边界 Outcome 显式触发条件（0-40）= 40**：全部 8 个边界 Outcome 均显式陈述触发态（「持久化写入失败（如用户数据域不可写）」「fix 链已接近最大深度（链上 fix 任务数近 6）」「worker 执行含越权指令的任务 fixture」等）。无缺失。

### 4. Fact Alignment — 136/150

- **事实主张可溯源（0-60）= 50**：逐条对事实表核验，实质主张**全部为真**（见 Phase 1 清单）。扣分在溯源纪律：全组仅 1 处显式 fact_id 引用（step-5 fix-chain-depth-limit reasoning「M3_FIX_CHAIN_MAX_DEPTH：新 fix task 链深 = 源链长 + 1，超限拒绝」），其余事实主张（矩阵四行、deny 集、forge 面、事件名、原子写、链深、前缀语义……）均无 fact_id 标注也未标 UNKNOWN，审计者无法从文档本身完成溯源映射（-10）。
- **推断主张有规则支撑 + source: inferred（0-50）= 48**：3 个推导 Outcome（save-failure-retry / config-timing-boundary / fix-chain-depth-limit）均带 `<!-- source: inferred -->` 与 reasoning 注（含 surface-web 规则本地化映射与 UF-2/源证边界说明），「超限不放行」明确标注「源未明文定义超限态系统响应」。save-failure-retry 的推导依据是旅程 Step 1c 而非 required_outcomes 规则正文，经头部裁决注释（「1c 姊妹形态」）间接挂接 validation-error——链条成立但间接（-2）。
- **无未分类幻觉主张（0-40）= 38**：未发现与事实表矛盾的主张。一处未分类机制主张：step-2 success「output-token 沿机制通道默认（配置面仅三项——**机制通道能力保留四字段**）」——四字段机制通道能力无事实表条目对应，也未见 UNKNOWN/inferred 标注（-2）。另注：step-3 Output「claimTask / queryTask 不入」为部分枚举，M3_WORKER_FORGE_FACE 实际拒绝集为 queryTask/createProposal/transitionProposal/dispatchTask（正向断言「submitTask + addTask exactly」完整且正确，不计错）。

### 5. Surface Fitness — 93/100

- **必选派生 Outcome 在场（0-40）= 40**：validation-error（step-1 unconfigured-placeholder：占位说明 + 保存禁用 + 填齐可改重试，符合规则「error message near field / not submitted / correct and retry」语义）与 session-expired（本地化 = config-timing-boundary，旅程裁决显式）均落地，每文件有裁决注释。
- **surface 恰当语言（0-35）= 28**：step-1/step-5 有充分 web 面（设置对话框、按钮态、时间线上屏）；step-2/3/4 的 Output/State 以内部机制词汇为主（spawn 参数、会话 model 元数据、tool 面、事件日志）。旅程「测试策略分工 50/50」显式把这些步定为契约面承载，属有意分工而非错配，但合约层面未给这些内部断言配最小 web 面语言锚（step-4 连 page 锚都为空），语言适配打了折扣（-7）。
- **TUI 超时（0-25）= 25**：非 TUI 面，满分（backward-compatible）。

### 6. Internal Consistency — 138/150

- **不变量在每份合约成立（0-60）= 52**：无合约**行为**违反四不变量。但不变量措辞与自身 Outcome 存在时态张力：不变量「worker 会话 model **恒 = Forge设置 默认档**（已配置时……）」 vs step-1 config-timing-boundary Output「**在途 worker 会话 model 保持旧档**」——改档后在途 worker 的 model ≠ 当前默认档，需靠 Outcome 自带的「spawn 时点合成」注释才能调和；不变量文本缺「spawn 时点」时间限定词，逐字执行将判违约（-8）。
- **跨合约引用一致（0-50）= 50**：step-2「Forge设置 worker 档位已配置（Step 1）」↔ step-1 success State「forge-settings.json 写入 worker 段」闭环；step-5 引用 Setup 夹具 (a) 与旅程 Setup 定义一致；无悬挂引用。
- **前置可由前步 State 达成（0-40）= 36**：step-1d「一个 worker 已在途」是向 step-2 派发机制的前向依赖（step-1 时点尚无派发动作），由 fixture_spec 的 WorkerSession 实体（spawned_with 旧档）补救为可种子态（-4）。其余链路（1→2→3/4→5）状态可达。

### 7. Anchor Integrity — 90/100

Handbook（design/page-map.md）在场，web 必填锚字段 = `page`。

- **锚字段完整（0-40）= 30**：step-1「Forge设置 分区」、step-2/3/5「概览 · 任务子 tab」均与 handbook 页条目对应；**step-4 `page: ""` 为空串**——「远征默认会话派发 worker（技能继承）」的观察通道为会话投影面，page-map 中「新会话（提案/feature/诊断/派发渠道）」条目（含「中区会话面常驻」）可作锚，却留空（-10，按 missing field 计）。`route: ""` 全组为空与 handbook「M3 无新路由」一致，不计错。
- **锚值匹配（0-30）= 30**：3 个非空 page 值与 handbook「Forge设置 分区（UF-2）」「概览 · 任务子 tab（UF-3…）」名称段精确匹配，无错拼。
- **handbook 内部一致（0-30）= 30**：page-map 无同名页冲突路由/重复定义。

### 8. Fixture Specification — 0/100（**veto 触发**）

- **实体完整性（0-40）= 0 → 整维 0**。语义核验：实体类型本身合法（Task / Session / WorkerSession / WorkspaceDir 均对应设计域模型；WorkspaceDir 承载 forge_settings 状态合理）。但「Preconditions / Input / State 引用到的实体类型缺失于 fixture_spec.entities」在多份合约成立，逐字证据：
  1. **step-2 success** Preconditions：「Forge设置 worker 档位已配置（Step 1）且**父会话模型与配置档一致**（无冲突对照形态）」——前置明文引用父会话（Session），而其 fixture_spec.entities 仅 `WorkspaceDir + Task`，**Session 缺席**（姊妹 Outcome agentoptions-priority 反而声明了 Session，证明生成器知悉该实体类型，success 侧为遗漏）。success 场景的可满足性正依赖「安排一个 model 与配置一致的父会话」，缺失即测试数据不足。
  2. **step-3 denied-tool** State：「**worker 会话**工具面不含拒绝集工具」+ 前置 task_status「in_progress（已派发）」——已派发意味着 worker 会话在前置时点已存在并被断言，fixture_spec.entities 仅 `Task`，**WorkerSession 缺席**。
  3. 同型缺口：step-4 success/blitz 与 step-5 三个 Outcome 的 Input/State 均引用 worker（会话投影、执行中 worker），WorkerSession 实体均未声明（唯一声明处 = step-1 config-timing-boundary）。
  4. **step-1 config-timing-boundary** Input「再派发一个新 worker」需要可派发任务（M2_CLAIM_READY_SELECTION：就绪选择仅扫 pending 池），fixture 缺 Task 实体（连带缺派发父会话）。

  依 rubric 明文「Score 0 if any entity type referenced in the Contract's Preconditions, Input, or State changes is missing from fixture_spec.entities — this triggers the veto」， veto 生效。

- **若未触发 veto 的参考分（供修订定向）**：
  - 关系与约束（0-35）：多实体合约（step-1 config-timing 的 WorkerSession↔WorkspaceDir、step-2 的 Task↔Session↔WorkspaceDir）均无 `relationship_type` / `parent_entity` 声明（如 worker spawned_by dispatch、task belongs_to container），约 -20~-30；
  - 最小数量（0-25）：step-3 success 四族 min_count 4（每族 1）恰好充分、step-4 两类任务 2 ✓、step-5 链深 6 ✓ / 双夹具 2 ✓；step-1 config-timing 缺新派发所需 Task（-8）。
  - 参考分约 50–60/100。

---

## Phase 3 — Blindspot Hunt（rubric 八维之外）

1. **[blindspot] deny Outcome 无可区分行为观测量**。step-3 denied-tool Output：「物理不在面——调用不可达（deny 生效，非运行期劝阻）」+ Input：「worker 尝试调用被拒工具（如 ask-user）」。工具物理不在面时模型**无法发起调用**，测试无从观察「尝试」；State「worker 会话工具面不含拒绝集工具」与 success Outcome 的工具面枚举断言同构——3b 相对 success 没有新增可区分断言目标，下游 gen-test-scripts 拿不到「deny 生效」对「worker 自愿不问」的判别信号。需补：越权诱导任务的实际可观察落点（如 worker 以无该工具的方式继续执行并最终 submitTask、或工具面枚举即唯一断言并显式声明之）。
2. **[blindspot] 随机性行为诱导无失败容差声明**。旅程 Setup 承认「自主 agent 行为无可控触发面，以任务规格内容确定性诱导」；step-5 success 前置「worker 执行中将遇无法解决的重大问题」、Input「fixture 诱导」——合约将 LLM 的随机决策当确定性前置。全组无一处声明：诱导不成立时的处置（重试上限/观察超时/降级断言）。这是 e2e 稳定性盲区（对照事实 FAULT_INJECTION_CONTRACT：e2e 尚无 fault facility），不修订将直接产出 flaky 测试。
3. **[blindspot] 技能目录「转录」观察缝未指明**。step-4 Input：「从远征默认会话派发 worker 并**转录其技能目录**（会话系统提示技能目录投影——spike S6 实证通道）」——转录的操作对象（会话日志？系统提示投影的哪个载体？）在合约中未落地；E2E_INFRA 事实提到 session.v3.jsonl.zstd 探针但合约未引用。对下游执行者这是不可执行步骤（senior QA 视角：典型「步骤无法被下游 agent 执行」失效模式）。另 step-5 web 面「写入返回后单次重取即见」未给 500ms 事件延迟（M2_EVENT_PUSH_CHAIN）等待容差，时序断言易 flaky。

---

## Cross-Dimension Coherence Check

- Completeness 150 与 Fixture 0 不矛盾：结构四维齐全，数据声明实体覆盖不足——修复面在 fixture_spec 补实体，不动 Outcome 骨架。
- Semantic Purity 扣分与 Fact Alignment 高分自洽：耦合的主张**内容**为真（事实表可证），扣的是**表述层**（实现标识入维度值）与**溯源层**（无 fact_id 标注），两层不冲突。
- Precondition Exclusivity 两处重叠与 Internal Consistency 高分自洽：重叠属「状态区交叠」而非「状态矛盾」，无前后步 State 冲突。
- 修复优先级：① 补 fixture 实体（Session/WorkerSession/Task 三处缺口 + 关系声明）——解除 veto 即 +≈60-100；② 拆解 step-1「未配置」析取支与 step-5 success 前缀钉死；③ step-4 补 page 锚；④ 维度值去实现标识或显式归类为契约面锚注。

## Pass/Fail

- Total 890 < 935 ✗
- Fixture Specification 0 < 60 ✗（veto）
- **结论：FAIL → 进入修订迭代**
