# 评审报告 — forge-verification-hardening

评审人：独立 subagent（review-proposal），仅以提案文本与代码库实读为据。
评审对象：`proposals/forge-verification-hardening/proposal.md`
仓库根：`Z:\project\dsh\dsh-forge`

---

## 结论

**不放行。Blocker ×2**（标记/硬指标/飞轮的机械落点缺失；knowledge 机制在本仓未激活致 AC5 不可测），另 Question ×3、Note ×4。两条 Blocker 均属「需求-改动面不对等/承重前提未定」，返工量不大（把已半承认的决策提入提案范围即可），清零后可放行。

先说核对通过的底座（提案 §3 复用核销表三条断言 + 技能文件清单逐一实读）：

| 断言 | 核销结果 | 证据 |
|---|---|---|
| ① knowledge 插件机制 | **机制为真**（forgeKnowledge 服务、knowledge_search / knowledge_read_abstract 工具、条目 title/summary/keywords/domainPath、domain=目录路径、`.knowledge` 目录） | `packages/knowledge/src/plugin.test.ts:52,71`、`tools/read-abstract.ts:46-52`、`tools/search.ts:85-93`、`prompt/index.ts:43-44`、`integration-core.test.ts:34`。但**本仓未激活**，见 Blocker 2 |
| ② evidence_debt 结算自动派生任务 | **为真**：success 结算 submit record 携带 evidenceDebt → 自动生成同容器 test-run 欠账任务（dependsOn 实现卡），fail-soft | `packages/plugin-forge/src/dispatch-core/settle.ts:86-121, 282-285`、`result.ts:27-28`、`settle-e2e-debt.test.ts:109-139` |
| ③ 循环尾「无任务可派」可挂接 | **为真**：no-task 三态判词与 settled 收口路径集中在 loop driver，存在明确挂接位 | `packages/plugin-forge/src/loop/driver.ts:1078`（claim no-task 分流）、`:1488-1490`（三态判词与终局收口）、`dispatch-core/core.ts:338`（no-task 池快照） |

技能文件 8 条路径全部存在（write-prd / review-prd / review-tech / tech-design / submit-task / quick-tasks / review-proposal / skills-blitz/grilling 的 SKILL.md 均 Test-Path 为真）。需求覆盖矩阵 M1→AC1/AC10、M2→AC2、M3→AC3、M4→AC4、M5→AC5/AC6、M6→AC7、突击同步→AC8、M7→AC9——逐条有方案有验收，无整条漏项。

---

## Blocker

### B1 — 标记体系 / 硬指标 / 飞轮自动触发：需求承重、§3 无机械落点

**证据**：提案 §2 M5 标记体系小节要求「五类标记按打点时机**自动落**、只追加、随容器状态持久化」（AC6 同口径：「自动落，只追加不可改写」）；M7 要求「越阈 → **强制**发起改进提案，不得静默放行」（AC9：「自动触发改进提案」）。但 §3 改动影响范围的机械面只列两处：循环尾复盘任务派生、submitTask 强制域取证校验——**标记打点、计数器快照、append-only 持久化、指标计算、越阈触发的宿主代码均不在清单内**。技能文件改动（write-prd 等）承载不了「自动落标记」。

**判定**：需求覆盖有洞（Blocker 判据「需求覆盖有洞 / 验收不可测」双中）。AC6/AC9 在现 §3 改动面下不可执行。

**具体替代方案（两选一，均可闭环）**：
- **方案 A（机械）**：§3 增列第三处机械——容器状态层的 append-only 里程碑事件表 + 打点挂接（first-pass-complete 挂 driver.ts settled 收口位、retro-done 挂复盘任务结算、review-wave-N 挂 fix 链收口），并明确 stabilized/merged 的触发主体（见 Q2）。代价：plugin-forge src 改动从「两处」变「三处」。
- **方案 B（降机械）**：砍掉全部标记机械，标记与四项硬指标改为**复盘任务的台账产物**（markdown 表格，循环尾复盘任务负责填报 first-pass 基线与增量），飞轮触发改为复盘任务结论中的显式建议 + 提案管线人工确认。改动面最小，且仍满足「跨特性横向对比」的本质需求；代价是 AC6/AC9 的「自动」二字须改写为「复盘任务产出、可审计」。

现状两头不靠：提案想要自动化的验收（AC6/AC9），却只申报了承载不了它的改动面。

### B2 — knowledge 机制存在但本仓未激活，AC5 承重前提被推迟决策

**证据**：机制在 `packages/knowledge/src` 齐全（核销表①），但：(a) dsh-forge 仓库根与当前 worktree 均无 `.knowledge` 目录（Test-Path 双 False）；(b) `packages/plugin-forge/src` 全文 grep `forgeKnowledge` 仅命中「knowledge 同型」注释，**forge 宿主不 provide forgeKnowledge**——知识库注册面在宿主 profile（`prompt/index.ts:43`："A project knowledge base **may be** registered for this workspace"），本仓未见装配证据；(c) 提案 §2 M5 自己写明「是否完整复用 knowledge 插件（服务注入双模式会话）**另行评估**」。

**判定**：被「另行评估」的恰是 AC5（复盘产物 knowledge_search 可命中）的唯一检索通道。评估推迟 = AC5 不可测 = 假设的既有能力（在本仓可用）不成立。且提案 §3 改动清单不含 knowledge 插件挂载或 `.knowledge` 初始化的任何落点——复盘任务写条目后谁来 rebuildIndex、worker 会话能否 inject forgeKnowledge，全悬空。

**具体替代方案**：把激活决策提入本提案范围，二选一并写入 §3：
- **A**：宿主 profile 装配 knowledge 插件（改动落装配缝，plugin-portability 口径），AC5 原样可测；
- **B**：不激活插件，复盘产物按 `.knowledge` 目录约定**直写 markdown 条目**（frontmatter 同构：title/summary/keywords/domain，`integration-core.test.ts:90-92` 为格式正例），可检索性验收降级为「文件落位 + 字段齐备」，检索体验待激活后兑现——并在提案内如实标注该降级。

---

## Question

### Q1 — 「evidence_debt 同构先例」的时点错位表述

M5 称循环尾复盘派生「复用 evidence_debt 的循环尾自动派生先例」。实际先例发生在**结算时点**（`settle.ts:282-285`，submit 携带 evidenceDebt → 自动建欠账任务），不是循环尾；循环尾派生是 `driver.ts:1488-1490` settled 收口路径的**新挂接**。位置存在、可挂接（核销表③为真），但「同构先例」会让实施者低估改动面。建议提案改述为「挂接点参照 driver no-task settled 收口位，派生模式参照 evidence_debt 结算派生」。

### Q2 — `stabilized` 与 `merged` 标记的触发主体未定，空转风险真实

循环结束后无存活进程，「连续 48h 零新增 fix」（标记 4）由谁检测？merged 标记（标记 5）依赖人工合并纪律（AGENTS 5.1），由谁在何时补打？无触发主体的标记永不落，派生指标（一次通过率分母 = merged 时任务数）随之空转。替代：stabilized 改 lazy 判定（下个特性循环启动时回溯上一容器的静默期），merged 由合并后首个会话动作补打——需在提案内写明。

### Q3 — M2「批次末真机走查会」的挂载机制未指明

走查会需要批次暂停等用户批量裁决——走 dispatch 循环 suspension 通道？循环尾钩子？还是人工发起的独立会话？若是前两者，属 §3 未列的第三处机械；若是人工发起，AC2 的「批次内清零」实际靠什么保证不积压。裁决时一并定。

---

## Note

1. **M1 降级路径的兜底未写**：§3 诚实声明「结算面校验成本高则降级为技能判据」，但降级后强制域全靠 agent 自证——与根因 1（自产自证）正面冲突。应写明降级时的兜底（review-prd 门核对 + M2 走查会）。
2. **术语歧义**：「收口」双义——M4「规格转向显式收口」（文档/代码一致性行为）vs M5「收口标记」（容器里程碑事件）。标记体系小节已用「里程碑标记」，建议统一，避免 AC6 的「收口标记」被读成 M4 的收口行为。
3. **M4「doc-review 批次末强制门」无落点文件**：两技能包均无 doc-review 技能目录（doc-review 是管线任务类型非技能），§3 清单不含承载该门检查项的文件。应指明写进哪个技能（review-prd？tech-design？）。
4. **字段名微偏**：提案写条目字段「title/summary/keywords/domain」，源码实为 `domainPath`（`read-abstract.ts:52`）；lessons/examples 两个 domain 值是否能过「domain=目录路径」的分类口径，实施时定目录名即可，无碍。

---

## 放行结论

**不放行（Blocker ×2）**。B1/B2 均为「已半承认的决策未提入提案范围」型返工：B1 选定标记机械方案 A 或台账降级方案 B 并对齐 §3/AC6/AC9；B2 选定 knowledge 激活方案 A 或直写降级方案 B 并纳入 §3。返工（brainstorm 修订）后重评，Blocker 清零即可随 Q1-Q3 一并提请用户裁决。

— 独立评审员，2026-02-05

---

## 复评（第 2 轮）

评审人：独立 subagent（review-proposal 复评），只核验本轮返工是否清零，不重复全面评审。未改动提案正文。

### Blocker 核验

**B1 — 清零。** 提案 §3 改动机械面已从两处增列为「三处最小机械」，第三处即上轮要求的方案 A：**容器 append-only 里程碑事件表**（标记/快照持久化），并显式标注其为「五标记自动落与硬指标计算的承重机械，AC6/AC9 依据」。AC6（五类标记自动落、只追加不可改写 + 四项硬指标可计算）与 AC9（波次越阈自动触发改进提案）在该机械下均有落点、可执行。M5 标记体系小节同步补齐了 stabilized / merged 的触发主体（stabilized 由标记机械按零新增 fix 时长自动判定；merged 由执行合并的会话在人类批准的合并动作后打点）——上轮 Q2 的空转风险随之消除。

**B2 — 清零。** M5 已改为方案 B：复盘产物以 markdown 条目**直写 workspace `.knowledge` 目录**（lessons/examples 按 domainPath 分类），条目字段与 knowledge 插件格式同构（title/summary/keywords/domainPath）+ 溯源字段（来源容器/任务/bug id）；并如实标注「knowledge 插件未在本仓激活，search/read-abstract 检索能力待激活后另评，直写格式保证激活后零迁移」。§3 复用核销表第一条同步改写为「复用 knowledge 目录格式，直写不激活」。AC5 相应修正为可测措辞：**markdown 条目落盘 + 字段同构核验 + 溯源字段齐备**——不再依赖未激活的检索服务，验收可执行。

### Question / Note 处置情况

**已顺带修复：**
- Q1（evidence_debt 时点错位）：M5 已改述为「先例由 submitTask evidence_debt 提供，位于结算时点，本项机械与其同构但挂接在循环尾时点」，核销表同步改口径。
- Q2（stabilized/merged 触发主体）：标记体系表后新增专门段落写明两个主体（见 B1）。
- Q3（走查会挂载机制）：M2 已明确「走查会 = 批次末显式任务（任务拆解时建，独立于编码任务）」，不依赖临场发挥。
- Note1 部分修复：M4 批次末文档一致性核对已落到 review-prd 检查项（§3 括注）；术语歧义（Note2）已消——M5 增加术语约定（「收口」只指容器终态，循环首次无可派任务用「first-pass」）；Note3 同 Note1 前半（doc-review 门落点已指明为 review-prd）；Note4 字段名已改正为 `domainPath`。

**仍未决（留给用户裁决时一并定）：**
- Note1 后半：M1 结算校验「成本高则降级为技能判据」的降级兜底仍未写明（建议补一句：降级时强制域由 review-prd 取证门核对 + M2 批次末走查会兜底）。
- Q2 遗留细节：stabilized 的阈值（如 48h）提案仍写「评审时定」，属刻意推迟，可接受，裁决时知悉即可。

### 新引入矛盾（1 处，措辞级）

**§5 意图推断与 §3 口径不一致**：§5 仍写「**两处**最小机械（循环尾复盘任务派生、结算取证校验）」，而 §3 已是**三处**（新增里程碑事件表）。属返工时漏改的计数措辞，不影响方案实质与 AC，但建议裁决前顺手改齐（一词之改：两处→三处，并补列事件表）。

### 放行结论

**放行（Blocker ×2 均清零）**。两条 Blocker 均按上轮给出的方案闭合且证据到位；剩余未决项（Note1 降级兜底、stabilized 阈值、§5 措辞改齐）均为裁决时一句话可定的小项，不构成再返工理由。

— 独立评审员（复评），2026-02-05
