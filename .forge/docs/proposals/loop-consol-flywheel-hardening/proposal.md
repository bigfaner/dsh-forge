# 提案：循环消息收敛飞轮硬化 wave2（loop-consol-flywheel-hardening）

- **parent_proposal_id**: loop-consol-flywheel-improvement（注册时由 createProposal 填写源提案 id）
- 来源：loop-consol-flywheel-improvement first-pass 复盘（任务 1.9）

## 1. 背景与指标

first-pass 快照：一次通过率 1、返工增量比 0.0%、**修正波次 19（≥ 阈值 6，越阈）**、fix 密度 55.6%。

结构性返工连续两轮保持 0（评审前置有效）；本轮恶化集中在**真机取证面**——修正波次与 fix 密度的增量主要产生于取证环境干扰（夹具内归属模型自主处置）与探针方法返工（仪表化引发错误风暴），非产品码缺陷密度上升。本轮取取证方法视角改进。

## 2. 改进项

### 2.1 真机走查预案的状态窗口保障（压修正波次）

- 翻车点：1.5 三轮走查均无法稳定捕获 suspended/终态徽标——归属模型对 followup 消息自作处置（`taskStats` 误判、`stopTaskLoop` 停循环、自行 `dispatchTask` 重启），002 轮 8 分钟 103 次回翻；已尝试的压制（模型切换、owner 轮掐断）均不彻底。
- 改进：run-tests 技能走查预案新增一条——凡断言依赖**状态窗口稳定**的真机走查（三态徽标、进度态等），预案必须声明归属模型约束方式（强指令遵循模型档，或人工值守会话 + 暂停 ask 应答路径），未声明 = 走查前整改。
- 落点：`packages/plugin-forge/skills/run-tests/SKILL.md` 走查预案段。

### 2.2 CDP 探针先零仪表化对照（压探针方法返工）

- 翻车点：1.4 仪表化 v1（patch scrollTop setter，defineProperty 自有属性）引发官方渲染器错误风暴（2419 例）并阻断组卡渲染，一轮探测整轮作废。
- 改进：CDP 探针脚本规范新增——凡需观测官方组件内部行为的探针，第一轮必须为零仪表化对照轮（确认基线行为与脚本侧无害），仪表化只能在对照轮之后叠加。
- 落点：`AGENTS.md` §2「CDP 调试脚本统一放 `cdp/` 目录」条目扩一句纪律（或其引用的 cdp 规范正本，以评审定落点）。

### 2.3 等效证据口径 convention 晋升裁决

- `.knowledge/conventions/equivalent-evidence-over-visual-artifact.md` 与 `.knowledge/conventions/review-note-deferred-fact-backfill-gate.md` 申请晋升 `docs/conventions/` 正本（随本提案裁决，不直改技能检查项之外的正本）。前者已在本特性 1.5 走查被主会话终裁实际采用（AC4 等效证据口径），具备晋升事实基础。

### 2.4 待用户裁决清单

| # | 决策点 | 备选 | 倾向 |
|---|---|---|---|
| D1 | 2.2 落点形态 | AGENTS.md 内扩一句（轻）；或独立 cdp 探针规范正本（重，但可承载更多判例） | AGENTS.md 扩句，判例留 knowledge |
| D2 | 2.3 双 convention 晋升 | 两件均晋升 / 仅晋升 equivalent-evidence（已有终裁事实）/ 均留 .knowledge | 两件均晋升 |

## 3. 改动范围（file 粒度）

- `packages/plugin-forge/skills/run-tests/SKILL.md`（走查预案状态窗口约束 +1）
- `AGENTS.md`（CDP 探针零仪表化对照纪律 +1 句）
- `docs/conventions/`（晋升后的正本，若 2.3 获裁）

## 4. 验收标准

1. run-tests 技能走查预案含状态窗口稳定约束（归属模型约束方式声明为前置）。
2. CDP 探针零仪表化对照纪律落在裁决确定的正本位置。
3. 2.3 裁决结果（晋升/不晋升，逐件）落档。

## 5. 裁决台账

| # | 决策点 | 裁决 | 日期 |
|---|---|---|---|
| 提案裁决 | accept/reject | 待裁决 | — |

## 指标对比附录（飞轮派生提案必带）

| 指标 | 基线（本提案注册时） | 目标 |
|---|---|---|
| 修正波次 | 19（越阈，阈值 6） | < 6 |
| fix 密度 | 55.6% | 下降 |
| 一次通过率 | 1 | 保持 1 |
| 返工增量比 | 0.0% | 保持 0.0% |
