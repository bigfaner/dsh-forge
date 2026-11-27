---
title: 结算 commit_hash 转写错位：只取 rev-parse 原样值
summary: >-
  dispatch 结算 commit_hash 手工转写错位（尾部错值）致 branch --contains malformed
  误导报、循环挂起（本仓二度复发）——哈希只取 git rev-parse HEAD 原样输出，提交后 branch --contains 预检通过再结算。
keywords:
  - 结算
  - commit-hash
  - rev-parse
  - 转写错位
  - settle-cwd-pin
  - 循环挂起
id: commit-hash-rev-parse
status: confirmed
version_ts: '2026-11-21T04:09:50.282Z'
updated: '2026-11-21T04:09:50.282Z'
type: pitfalls
candidate_of: quote-plugins-flows
confirmed_at: '2026-11-22T15:34:52.583Z'
---
# 翻车链

dispatch 循环任务结算（settle-cwd-pin）记录的 commit_hash 尾部错位（记录 ...487，仓内无此对象；真实提交尾 ...38a9）——核验 `git branch --contains <错哈希>` 报 malformed object name，落点核验被拒、任务转 interrupted、循环挂起，同一任务**两度**复发（bug 4431c0ca，同族 0b33bcc4）。真实工作零损失，纯哈希转写错位。

# 规避

- 结算 commit_hash **只取 `git rev-parse HEAD` 原样输出**，禁止从提交输出/记忆手工转写、截取。
- 提交后先跑 `git branch --contains <hash>` 预检通过再 submitTask。
- 核验侧误导性报错（malformed ≠ 提交丢失）先查「哈希对象是否存在」（`git cat-file -t`）再归因。
