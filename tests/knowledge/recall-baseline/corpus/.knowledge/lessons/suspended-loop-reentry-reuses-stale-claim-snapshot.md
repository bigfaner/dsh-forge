---
id: suspended-loop-reentry-reuses-stale-claim-snapshot
status: unconfirmed
type: pitfalls
version_ts: '2026-11-05T00:00:00.000Z'
title: 挂起循环 re-entry 复用旧 claim 快照，改型后须 pauseTask 重建 claim
summary: >-
  任务改型（coding-fix→gate）绕开守卫判别面后，dispatchTask resume 仍被旧理由拦截——挂起循环 re-entry
  复用了挂起前的 claim 快照（旧 taskType），守卫按快照而非库内现值判据。处置 = pauseTask 硬暂停挂起任务（丢弃在途快照、卡片回
  pending）再 resume，claim 重建后新快照生效。附带：agent 面结算必经
  claim（suspended/pending→completed 非法），claim 被另一机械闸门拦时形成双闸死锁，改型 + 快照重建是合规出路组合。
keywords:
  - 挂起循环
  - claim 快照
  - pauseTask 重建
  - 双闸死锁
  - 改型绕行
---

