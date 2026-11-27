---
title: 结算 commit_hash 转写错位：只取 rev-parse 原样值
summary: >-
  共享 worktree 多容器并发下 HEAD 是移动锚（并发卡提交会推进它）——评审/回填简报禁用「HEAD」指代，必须显式携带 rev-parse
  原样哈希并回显自证对象存在。
keywords:
  - head-漂移
  - 提交锚
  - 并发派发
  - rev-parse
  - 评审对象
id: commit-hash-rev-parse
status: unconfirmed
version_ts: '2026-11-22T17:05:13.025Z'
updated: '2026-11-22T17:05:13.025Z'
type: pitfalls
procedure: true
supersedes: '2026-11-21T04:09:50.282Z'
---
# 翻车链（续版：HEAD 漂移面）

窄域评审任务声明「评审对象 = HEAD 最新提交」，实际 HEAD（5af665f）已被**并发卡的提交**推进（task-loop 0.20.0，与被评审卡无关），被评审卡 1.9 的变更在 HEAD~1（5cdda55e）——锚位错位致评审开篇即需自查改锚（should 项留痕）。

# 规避（在「只取 rev-parse 原样值」纪律之上追加）

- 共享 worktree 上多容器并发派发是常态——**HEAD 是移动锚**，引用「HEAD 最新提交」必须随取随用（引用时点 rev-parse），禁止在任务简报里用「HEAD」指代未来时点的提交。
- 窄域评审/修复任务的简报**显式携带具体提交哈希**（rev-parse 原样值），不用 HEAD 相对描述。
- 结算/回填锚写完后跑 `git rev-parse <hash>^{commit}` 回显自证（对象存在 + 归属分支）。
