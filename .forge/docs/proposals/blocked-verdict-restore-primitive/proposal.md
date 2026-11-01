# 提案：blocked 裁决-恢复原语（裁决即恢复）

- **parent_proposal_id**：loop-consol-flywheel-hardening（2.4.4 转出，随其 D4 裁决登记 2026-10-31）
- 模式：机械增强（远征量级），本提案仅立项不实施

## 1. 背景

blocked 任务经主会话裁决修订 AC 后，无轻量恢复原语——每轮被迫立「确认口径在场并触发恢复」的 validation 空转任务（实证：loop-consol-flywheel-hardening 链上 fix-6/9/10/11 四次同构空转）。

## 2. 目标形态（候选，随设计定稿）

- **裁决即恢复**：updateTask 修订 blocked 任务（AC/简报/依赖）时支持同事务附裁决引用并触发 blocked→pending 恢复；或提供主会话轻量 restore 动词。
- 可行性先例：submit-task 的 fix 径自动恢复（完成即 restore hook）已证明 blocked 恢复机械可行；task-pause-primitive 的 suspended 收编 + resume 时点批量恢复形态可参照（转移矩阵显式加边优于借道）。

## 3. 约束

- 恢复必须留审计（裁决引用），不产生无因 pending。
- agent/human 双通道语义一致；转移矩阵单源不双轨。
