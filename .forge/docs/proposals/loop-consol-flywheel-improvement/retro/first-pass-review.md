# loop-consol-flywheel-improvement first-pass 复盘报告

- 日期：2026-10-28 ｜ 任务：loop-consol-flywheel-improvement/1.9 ｜ 类型：doc（复盘沉淀）
- 术语：first-pass = 首次无可派任务；收口 = merged 终态。

## 1. 飞轮硬指标（检查点快照直算）

| 指标 | 值 | 对比上轮（loop-message-consolidation） |
|---|---|---|
| 一次通过率 | 1 | 持平（尚无 merged 帧，基线即当前） |
| 返工增量比 | 0.0% | 持平（结构性返工仍被评审拦在拆解前） |
| 修正波次 | **19（≥ 阈值 6，越阈）** | 恶化（8 → 19） |
| fix 密度 | **55.6%** | 恶化（36.4% → 55.6%） |

**越阈判定**：修正波次 19 ≥ settings `flywheel.reviewWaveThreshold` 生效值 6 → **已越阈，注册硬门生效**——本复盘 AC 要求注册改进提案（parent_proposal_id 指向本提案）。

## 2. 恶化集中点（fix 分布定性）

- 本轮 fix 集中在**真机取证会**（1.5）：三态徽标的 suspended/终态窗口被夹具内归属模型自主工具调用淹没（模型自停/重启循环，002 轮 8 分钟 103 次 terminal→running 回翻）——取证环境干扰类。
- CDP 归因（1.4）四轮对照：仪表化 v1 引发官方渲染器错误风暴，返工在**探针方法**侧而非产品码侧。
- 进度卡去重（fix-7）与条目行口径类修正为常规实现期修正。

## 3. 多 agent 交叉核验

- 方式：预设双 agent 独立提取后比对。**实际受限**：①subagent 派发超深度上限（maxDepth 1，实测报错）；②专家池本会话为空（`list_experts` 返回 none，先例 1.7 尚有 code-reviewer 可用）——第二视角 agent 不可达。
- 处置：按双视角结构化自查替代（复盘执行视角 + 评审记录视角分别独立梳理后比对），留痕 `{task_logs}/1.9/001-first-pass-review/consensus.md`；执行局限如实记录于 §6。
- **共识（入沉淀）**：夹具内模型自主处置不可约束（lesson）、CDP 归因先零仪表化对照（example）、等效证据口径（convention）、评审 Note 实现期回填以映射表门槛兜底（convention）。
- **分歧**：无对峙性分歧。`loop/blocked-pool` 三态归属（评审 N-2 建议 suspended，实现裁定 running）已在 1.5 映射表落档为已裁决项，不重复入沉淀。

## 4. 沉淀清单（五件，落 `.knowledge/`，同构字段 + 溯源齐全）

| 类 | 文件 | 一句话 |
|---|---|---|
| conventions | equivalent-evidence-over-visual-artifact.md | 视觉件不可达时以 DOM 锚 + aria 断言 + 持续采样为主证据、回放轨视觉件归档为等效证据 |
| conventions | review-note-deferred-fact-backfill-gate.md | 评审 Note 的「实现期可闭合事实」以单源映射表/清单门槛兜底前移，不在提案期强判定 |
| lessons | walkthrough-fixture-model-self-disposition.md | 隔离夹具内归属模型自主工具调用不可约束，淹没状态窗口——走查预案需强指令遵循档或人工值守 |
| lessons | smooth-follow-inflight-window-release.md | 官方 smooth 追底动画在飞窗口 + >25px 阶跃 = settle 释放窗；补落底须以增高前偏离判据守门 |
| examples | cdp-attribution-four-round-contrast.md | CDP 归因四轮对照法（仪表化错误风暴 → 零仪表对照 → 监听采样 → 收窄定谳） |

本会话无 learn 技能可调，五件按目标给定字段规范手写落盘；提炼态 conventions 晋升 `docs/conventions` 正本仍走提案管线裁决，未直改技能检查项。

## 5. 越阈改进提案

- 派生提案文档已成稿：`proposals/loop-consol-flywheel-hardening/proposal.md`（parent = loop-consol-flywheel-improvement，含指标对比附录）。
- **已在提案域注册**（fix-11 落地）：提案 id `050c6538-f1bb-4da1-b932-bd747fdc739e`，状态 draft，parent_proposal_id = `049dc11a-d238-4269-ae4f-e104aa8ae990`（本提案），注册于 2026-10-28。

## 6. 执行局限（如实记录）

1. subagent 派发超深度上限（worker maxDepth 1）——双 agent 交叉核验不可达，以双视角结构化自查替代。
2. 专家池为空（先例 1.7 有 code-reviewer），delegate_expert 第二视角亦不可达。
3. worker 面无 createProposal tool（FORGE_DENY 契约拒绝）——改进提案状态行注册须回主会话完成，文档已成稿待注册。
