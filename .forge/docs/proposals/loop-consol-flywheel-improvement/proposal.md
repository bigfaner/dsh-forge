# 提案：循环消息收敛飞轮改进（loop-consol-flywheel-improvement）

- **parent_proposal_id**: loop-message-consolidation（注册时由 createProposal 填写源提案 id）
- 来源：loop-message-consolidation first-pass 复盘（任务 1.8）

## 1. 背景与指标

first-pass 快照：一次通过率 1、返工增量比 0.0%、**修正波次 8（≥ 阈值 6，越阈）**、fix 密度 36.4%。

结构性返工已被评审拦在拆解前（返工增量比 0），fix 集中在实现期暴露的两类盲区——与 expert-squad 复盘「fix 密度两视角定性」同构，本轮取实现视角改进。

## 2. 改进项

### 2.1 唤醒类消息信息集清单前置（压 fix 密度）

- 翻车点：异常唤醒卡首轮 FAIL（挂起卡非唯一 + 处置入口缺失 + 错误原文截断），fix 占本特性 fix 面大头。
- 改进：把「wakeup 消息最小充分信息集五要素」（任务标识/错误原文+全文引用/阶段/重试计数/处置入口，见 `.knowledge/conventions/wakeup-notification-minimal-info-set.md`）写入 review-proposal 检查项——凡提案含新增 wakeup 径，AC 必须逐要素断言，缺失 = Blocker。
- 落点：`packages/plugin-forge/skills/review-proposal/SKILL.md`。

### 2.2 计数类走查断言的实例边界口径（压修正波次）

- 翻车点：「恰一张」断言被派生 fix 任务的同径唤醒打破，fix-3 后仍需口径澄清才收敛。
- 改进：真机取证 AC 模板新增一条——计数类断言（tally/行数/badge）必须先以循环实例边界（最近一枚 startup 事件圈定区间）定义口径，并声明派生任务计入与否。
- 落点：走查 AC 模板 / run-tests 技能验收清单段。

### 2.3 提炼态 convention 晋升裁决

- `.knowledge/conventions/wakeup-notification-minimal-info-set.md` 申请晋升 `docs/conventions/` 正本（随本提案裁决，不直改技能检查项之外的正本）。

## 3. 改动范围（file 粒度）

- `packages/plugin-forge/skills/review-proposal/SKILL.md`（检查项 +1）
- `packages/plugin-forge/skills/run-tests/SKILL.md`（取证断言口径 +1）
- `docs/conventions/`（晋升后的正本，若 2.3 获裁）

## 4. 验收标准

1. review-proposal 技能检查项含 wakeup 信息集五要素，含提案触发条件（新增 wakeup 径）。
2. run-tests/走查口径含计数断言实例边界要求。
3. 2.3 裁决结果（晋升/不晋升）落档。

## 指标对比附录（飞轮派生提案必带）

| 指标 | 基线（本提案注册时） | 目标 |
|---|---|---|
| 修正波次 | 8（越阈，阈值 6） | < 6 |
| fix 密度 | 36.4% | 下降 |
| 一次通过率 | 1 | 保持 1 |
| 返工增量比 | 0.0% | 保持 0.0% |
