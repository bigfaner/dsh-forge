---
title: 软约束失效面按机械词表全集枚举，不按语义列举
summary: >-
  提案声明「软约束失效面收敛于 N 个状态」时，必须以机械放行集（状态词表全集 − 幂等守卫）逐态反推，不能按语义近似列举——本特性循环首验即漏计
  superseded→accepted 这条失效面最重路径（decided_at 覆写 + expedition 同事务复活成链）。
keywords:
  - 失效面
  - 词表
  - assertDomainTransition
  - 软约束
  - 幂等守卫
  - superseded
domainPath: .knowledge/conventions/
来源容器: implicit-stage-approval
来源任务: 形式化验证（verification/report.md V-4、report-round2.md V-4）
bug id: 无
id: soft-constraint-failure-surface-enumerate-from-mechanical-vocab
status: unconfirmed
type: conventions
version_ts: '2026-11-05T00:00:00.000Z'
---

# 软约束失效面按机械词表全集枚举

## 规则

提案/设计中凡声明「软约束失效面收敛于 {…}」，收敛集必须按机械放行集机械推导：

- 放行集 = 状态词表全集（`labels` 里 PROPOSAL_STATUSES 等正本词表）− 幂等/重复守卫排除集（`assertDomainTransition` 的 to≠cur）。
- 逐态过一遍「from ∈ 放行集 且 提示词软约束失效」的组合，每个命中态都要给出后果链评估（是否有覆写、是否触发派生动作）。
- 语义近似列举（「就是草稿和评审中两个态吧」）不算核销。

## 依据

implicit-stage-approval 首轮验证 V-4：提案 §2.2 声明失效面收敛于 {draft, under-review, rejected} 三态，但机械放行集 = 词表去 accepted = {draft, under-review, **rejected, superseded**}——漏计的 superseded→accepted 恰是失效面最重路径（decided_at 覆盖改写 + expedition 模式同事务复活成链新建 feature）。措辞级修补后（失效面补 superseded + AC2 补例外断言）收口。

## 反例边界

- 只适用于「机械放行面 ⊇ 软约束声明面」的软约束场景；若守卫在 tool parse 层有机械强制（本提案 transition-feature 的前缀正则即此类），则失效面以 parse 拒集为准，不需按词表全集枚举。
- 幂等守卫在场时（to=cur 被拒）对应态可从失效面剔除，但要写明守卫锚点。
