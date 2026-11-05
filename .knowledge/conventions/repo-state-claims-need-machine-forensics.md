---
title: 提案现状证据必须附机械取证命令与输出
summary: >-
  提案/方案文本中的仓库现状数字（计数、分支状态、追踪面）凭记忆或目测书写会漂移——workspace-artifact-governance
  提案三处失准（worktree 计数 11 vs 实测口径漂移、test-fhf「独立提交」实为 main 祖先、验收 4 与 `.forge/docs`
  231 个已追踪 .md 矛盾），全部被形式化验证以 `git worktree list` / `git merge-base` / `git
  ls-files` 现场取证捕获；执行期零成本受益于派发前拦截。
keywords:
  - 现状取证
  - 事实漂移
  - 形式化验证
  - 提案生成
  - git 取证命令
domainPath: .knowledge/conventions/
来源容器: workspace-artifact-governance
来源任务: 1.8（first-pass 复盘 §6 分歧②，源 formal-verification.md B1/B2/Q2/N1）
bug id: 无
id: repo-state-claims-need-machine-forensics
status: unconfirmed
type: conventions
version_ts: '2026-11-05T00:00:00.000Z'
---

# 提案现状证据必须附机械取证命令与输出

## 规则

提案/方案中每一条仓库现状陈述（「N 个文件」「分支有独立提交」「已被 ignore」）必须附产生该数字的机械取证命令及其输出（`git worktree list`、`git merge-base --is-ancestor`、`git ls-files <path>`、`Test-Path` 计数等），不接受凭记忆的数字。提案模板检查项：现状证据段逐条可重放。

## 实证

formal-verification.md 现场取证抓获三处生成侧失准：

- worktree 清单漏项（packaging-guard-hardening 不在回收清单，验收 2 按原文必假，B1）；
- test-fhf「有独立提交」不实（`main..test-fhf` = 0 commit，54dc3a42 是 main 祖先，Q2）；
- 验收 4「`.forge/` 零入库」与 `.forge/docs` 下 231 个已追踪 `.md` 的现状矛盾（B2）。

三处均在派发前修订，执行期未为之买单（1.8 retro：修正波次仅 2 直接受益于审查链前置拦截）。

## 反例边界

- 判定「现状陈述失准」需先做现场取证再断言，不能以另一份记忆对抗记忆——本判例的方法与对象是同一条：一切现状数字以当场命令输出为准。
- 探索性讨论/口头估算不强制附输出；入库的提案与验收条款强制。
