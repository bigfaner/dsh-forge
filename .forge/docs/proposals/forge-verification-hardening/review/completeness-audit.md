# 体系完备性审计 — forge-verification-hardening

审计人：独立评审员（不继承先前讨论），仅以 proposal.md 与 review/report.md 为据。
审计问题：①体系是否完备；②回溯路径是否全覆盖。

---

## 1. 总结论

**体系骨架完备，8 条回溯链中 3 条完全成立、5 条存在缺口（无断链级致命洞，但 5 处缺记录点/口径定义，均可小改补齐）。**

体系内全部记录点清单（从 M1–M7 提炼）：

| 记录点 | 域 | 载体 |
|---|---|---|
| R1 五类里程碑标记 + 计数快照 | 标记域 | forge.db `container_marks`（纯净 append-only） |
| R2 四项硬指标 | 标记域 | 由 R1 快照派生计算 |
| R3 复盘任务及其产物 | 任务域 | 循环尾派生 doc 任务；knowledge 条目落 `.knowledge` |
| R4 knowledge 条目（lessons/examples + 溯源字段：来源容器/任务/bug id） | 知识域 | `.knowledge` markdown 直写 |
| R5 提案承接链 | 提案域 | `proposals.parent_proposal_id` 自联结 |
| R6 bug 台账 recurrence 链（existing） | 缺陷域 | recordBug/resolveBug，recurrence_of + source_task_id |
| R7 任务结算记录 ac_evidence（existing） | 任务域 | submitTask 结构化字段 |
| R8 fix 任务链（existing） | 任务域 | fix-N 派生 + block_source |
| R9 walkthrough 归档 / 裁决台账段（M6 制度化） | 文档域 | `proposals/<slug>/walkthrough/`、PRD 裁决清单/台账段 |
| R10 evidence_debt 欠账任务（existing） | 任务域 | test-run debt 任务 |

缺口清单：**G1** commit 计数口径未定义（链1/8）；**G2** 纯净表约束与 retro-done entry_id 清单自相矛盾（链2/3）；**G3** 标记→返工任务清单靠时间窗拼接，查询链未写明（链2）；**G4** 突击模式裁决台账无落点（链2/7）；**G5** 改进提案↔受影响容器/前后指标对比无连接记录点（链4）；**G6** merged 打点依赖纪律、漏打无兜底（链8）；**G7** 取证产物留盘不进 git 的长期寿命风险（链5，提示级）。

---

## 2. 逐链验证表

| # | 回溯场景 | 查询链 | 判定 | 缺口 |
|---|---|---|---|---|
| 1 | 这个特性首次完整后改动了多少 | R1：`first-pass-complete` 快照 vs `merged`/`stabilized` 快照，差值即增量；四项硬指标直接可算 | **有洞（G1）** | 「累计 commit 数」进快照，但容器→commit 的口径未定义（任务结算 commit_hash 集合？git log 区间？squash 合并后漂移？），机械实现时无依据会各写各的 |
| 2 | 这个返工为什么发生 | R8 fix 任务（source_task 链）→ 触发源三路可查：走查会任务产物（R9 walkthrough）、裁决台账段（R9 PRD 段）、bug 台账（R6 recurrence + source_task_id）→ `review-wave-N` 标记（R1）记波次幅度 | **有洞（G2/G3/G4）** | ①标记纯净（零业务引用）⇔ retro-done 快照含「entry_id 清单」自相矛盾；②标记→该波任务清单无直接连接，只能按标记时间戳开窗过滤任务域，此拼接链提案未写明，实际回溯时可能走不通；③裁决台账段落只写入 write-prd/review-prd（远征），突击链 grilling/quick-tasks 未承接「逐条落档」段 |
| 3 | 这类经验沉淀在哪、被哪些后续改进引用 | 正向：R4 条目溯源字段→来源容器/任务/bug；反向：R4 ← retro-done 标记 entry_id 清单 / 复盘任务结算 ac_evidence → 改进提案（R5 parent 链） | **弱成立（G2）** | 条目→来源方向可走；「lesson 被哪些改进引用」反向无结构化字段——改进提案文档正文自由文本，引用哪些 entry id 无约定，只能全文搜 |
| 4 | 这个改进提案的效果如何验证 | 前向：R5 自联结可答「源提案触发了哪些改进」✓；后向：改进前后两特性 R1 标记指标对比 | **有洞（G5）** | 「前后指标对比留档」（AC9）无落点；改进提案与其验证用的前后容器之间无任何连接字段/约定——突击模式容器键是 proposal 还是 feature 也未明说 |
| 5 | 这个 AC 当初怎么验收的 | R7 ac_criteria/ac_met/ac_evidence（结构化、逐条对照）→ 取证产物路径（walkthrough 截图、task_logs、e2e 证据）；欠账走 R10 debt 任务 | **成立（G7 提示）** | 链路端到端可走；唯一风险：walkthrough/截图按约留盘不进 git，长期回溯受盘寿命约束——属既有工作区约定，非本提案引入，知悉即可 |
| 6 | 这个 bug 的复发史 | R6 recurrence 链（existing，unchanged）＋ R4 溯源字段含 bug id + R8 fix 任务 source_task_id 关联到容器 | **成立** | 新体系与既有台账衔接点齐备（knowledge 溯源字段、fix 链、复盘任务提取翻车点），无新增断链 |
| 7 | 双模式各自的链路 | 远征：PRD→feature 容器→R1 标记→复盘→R5；突击：proposal 直挂任务→R1 标记→复盘→R5（M7 明示双模式各自落标记、分模式统计） | **有洞（G4/G5 部分）** | 骨架对称成立；缺口：突击侧裁决台账段落无落点（同链2③）、container_marks 容器键是否涵盖 proposal 容器未明写、循环尾复盘派生对 proposal 容器 loop 同样触发未显式声明（同构可推，宜一句话写死） |
| 8 | 跨特性长期趋势（多次 merged 横向对比） | R1 append-only 随容器持久化 + merged 全量终值快照 → 一次通过率趋势归档为 knowledge lessons（M7 周期复盘） | **有洞（G1/G6）** | 数据源可持续性依赖每次合并会话自觉打点——merged 触发主体是「执行合并的会话」，漏打无检测无兜底，趋势曲线从此断点；commit 口径同 G1 |

### 职责单一性检查

- 标记表纯净约束：M5/M7 反复申明「承接关系归提案域、标记表不承载」——**一致** ✓；唯一违例是 retro-done 快照的 entry_id 清单（G2，见下）。
- 知识域：直写 `.knowledge` 不激活插件、格式同构零迁移——边界清晰 ✓。
- 术语：M4「收口行为」与 M5「收口标记」已作术语约定切割 ✓。
- 强制域归属：标记域管度量、提案域管承接、派发域管强制（§5）——各机制描述一致 ✓。

---

## 3. 缺口补法（逐条具体）

- **G1（commit 口径）**：在 M5 标记体系小节定义计数快照口径一句话：「累计 commit 数 = 该容器全部任务结算记录 commit_hash 去重集合数；合并 squash 导致的漂移以 merged 打点时 git log `<first-commit>..main` 区间复核」。或干脆从快照中砍掉 commit 项、返工增量比改用任务/fix 计数——二选一，写死即可。
- **G2（纯净表矛盾）**：把 retro-done 的「entry_id 清单」从标记快照移出，归**复盘任务的结算记录**（ac_evidence 引用条目路径，任务域天然承载引用）；标记只记 `retro-done` + 计数。纯净表约束随之无例外成立，entry 清单仍可经「容器→复盘任务→结算记录」回溯。
- **G3（标记→波任务清单）**：在 M5 补一句标准查询链：「wave-N 的返工任务清单 = 任务域按结算时间落在 (wave-N-1, wave-N] 开窗 + type=coding-fix/source 含 fix 链过滤」；或给 review-wave 标记加一个可选 `wave_kind` 枚举（walkthrough/fix-chain/bug），不破坏「零业务引用」。
- **G4（突击裁决台账落点）**：突击同步段补一条：grilling/brainstorm 提案模板含「用户裁决台账」段（super-composer §6-§8 形态），quick-tasks 拆解时校验其存在；container_marks 容器键显式声明涵盖 feature 与 proposal 两类容器；循环尾复盘派生对 proposal 容器 loop 同样生效，一句话写死。
- **G5（前后指标对比落点）**：AC9 的「对比留档」落点写入改进提案文档本身（提案域，符合职责切分）：提案模板固定附录段「改进前后指标对比」（两个容器 slug + 四项指标表）；同时明示突击模式 R5 链中容器键即 proposal slug，使 parent_proposal_id → 容器 → container_marks 全程可查。
- **G6（merged 漏打兜底）**：同 stabilized 的 lazy 判定同构——下个容器循环启动（或任意 dispatch 会话开跑）时校验上一容器有无 merged 标记，缺则提示补打；一句话进标记机械描述即可。
- **G7（取证产物寿命）**：提示级，不改提案；实施时在 submit-task 技能口径中统一 ac_evidence 写「workspace 相对路径」，保证盘上可定位。

以上均为**一句话级/模板级补丁**，无需新增机械、不扩改动面；补齐后 8 条链全部端到端可走，体系判定完备。

— 独立评审员（完备性审计）
