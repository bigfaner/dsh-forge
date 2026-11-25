---
title: blocked 卡双出口直达——submitTask success 结算 / unblockTask 回 pending，理由必带
summary: >-
  主会话判定问题已解决的 blocked 卡有两条 agent 面直达出口：`submitTask` success 走
  `blocked→completed` 直接结算；`unblockTask`（薄壳，仅 reason 参数）走 `blocked→pending`
  回队列重新 claim。两条边均落 state-machine 矩阵单源，共用 submit 记录单事务机械（转移+审计+恢复钩子+相位重算）；结算
  summary 与 unblock reason 均必带（无因转移拒绝），unblockTask 不接受 gate/AC 负载。
keywords:
  - blocked
  - 双出口
  - submitTask
  - unblockTask
  - 裁决理由必带
  - 状态机矩阵
domainPath: .knowledge/conventions/
来源容器: blocked-verdict-restore-primitive
来源任务: first-pass 知识沉淀（1.7）；判例源自 1.1–1.5 实施链
bug id: 无（零缺陷轮）
id: blocked-verdict-dual-exit-with-mandatory-reason
status: unconfirmed
type: conventions
version_ts: '2026-11-05T00:00:00.000Z'
---

# blocked 卡双出口直达——submitTask success 结算 / unblockTask 回 pending，理由必带

## 规则

- blocked 卡在「主会话判定阻塞问题已解决」时不再被迫立空转 fix 任务绕道（历史实证：loop-consol-flywheel-hardening 链被迫 4 次同构 validation 空转任务触发恢复）：
  - **结算出口**：`submitTask` result=success——转移 `blocked→completed`，summary 即裁决审计理由。
  - **回队出口**：`unblockTask`——转移 `blocked→pending` 回队列走正常 claim；仅 reason 一个参数，非结算语义故不接受 gate/AC 负载。
- 承载面分工刻意名实相符：结算复用既有 submitTask（description 零增量），解除阻塞走独立薄壳动词——误用面为零，不产生无因 completed / 无因 pending。
- 范围边界：`blocked→blocked`、`blocked→skipped/rejected` 仍被拒；不设卡型限制（不限 fix 链源）。

## 反例边界

- 出口适用于「判定已解决/已失效」的人工裁决场景；blocked 原因仍在时的正道仍是修复链（`block_source=true` 派生 fix，完成自动恢复），双出口不替代 fix 链机械。
- 恢复钩子/相位重算等机械联动不变；源卡属挂起循环仍走 `dispatchTask(resume: true)` 重入，双出口不新增机械。
- 结论前提是形式化验证裁定：恢复钩子单层但「每级进入满足集独立触发」链式完备，「fix 完成后源短暂 blocked」多为正常中间态——勿据中间态误判需要级联恢复。

## 来源锚点

- `proposals/blocked-verdict-restore-primitive/proposal.md` §2 目标形态 / §4 根因事实（formal-verifier 裁定 2026-11-01）。
- 实施 1.1–1.5 全首提 success；落盘证据 `logs/blocked-verdict-restore-primitive/`（1.2 TDD 红相输出、1.4 gates.md）。
