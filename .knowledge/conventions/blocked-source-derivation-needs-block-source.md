---
title: blocked 源的派生修复任务必须 block_source=true 建 fix 链
summary: >-
  源任务已 blocked 时，派生修复任务若不带 block_source=true，等待边不建立——fix
  完成后源无法自动恢复，派生径判失败（triage-outcome outcome=failed）；「源 blocked ⇒ 必须补 block_source
  建 fix 链」是派生操作的前置规则。
keywords:
  - blocked
  - block_source
  - fix 链
  - triage 派生
  - 等待边
domainPath: .knowledge/conventions/
来源容器: expert-headhunter-tools
来源任务: first-pass 知识沉淀（1.6）；事件源自 triage 首次派生失败
bug id: 无
id: blocked-source-derivation-needs-block-source
status: unconfirmed
type: conventions
version_ts: '2026-11-05T00:00:00.000Z'
---

# blocked 源的派生修复任务必须 block_source=true 建 fix 链

## 规则

- 对 blocked 源任务派生修复任务时，`block_source=true` 与 `source_task_slug`/`source_task_local_id` 是必配组合：同一事务建「修复完成即解除源阻塞」的等待边。
- 缺 block_source 的派生是普通 disc 后继（源继续等别的东西），fix 完成对源零作用——机械回执会以 outcome=failed 明示「不带 block_source 的派生不会建等待边」。
- 加重条：源 blocked 且缺 block_source 时 `addTask` 直接 ERR_BLOCK_SOURCE_REQUIRED 拒绝——不要试图绕过该拒绝面，那是机械护栏不是障碍。

## 反例边界

- 源未 blocked（仅 pending/in_progress）时 block_source 语义不同：显式 false 才是刻意的 disc 后继，此时不带属正常。
- 【待核·已被部分取代 2026-11-01】blocked 任务的唯一合法出口是 fix 链完成自动恢复；agent 侧直接把 blocked 转 completed 会被状态机以 ERR_INVALID_TRANSITION 拒绝（判例 S3），不要尝试捷径。
  - 更新：blocked-verdict-restore-primitive 落地后 agent 面新增双出口直达——`blocked→completed`（submitTask success，理由必带）与 `blocked→pending`（unblockTask，reason 必带）已合法；原判例仅在双出口原语落地前的基线成立。修复链仍是 blocked 原因仍在时的正道。见 `blocked-verdict-dual-exit-with-mandatory-reason.md`。

## 来源锚点

- `logs/expert-headhunter-tools/1.5/retro-first-pass.md` S1/S3 节（triage-outcome 失败原因 + 账面 line 15-16、28 双源锚定）。
- 后续 fix-1 建链成功、fix-2 完成后 1.3/1.1 按链自动恢复——机制正确性的正例对照。
