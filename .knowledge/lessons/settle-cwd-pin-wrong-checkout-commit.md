---
title: worker 误落 main 检出——提交落错分支由 settle-cwd-pin 结算门兜底，简报须锚定容器检出根
summary: worker 在主检出（main）而非容器 worktree 跑任务 → 提交落 main 分支，settle-cwd-pin 结算门拒绝。处置 = cherry-pick 迁容器分支 + main reset 清退误提交（成孤儿）。教训：任务简报必须锚定容器检出根；结算门是误落 main 的兜底网，不是阻止首犯的闸。
keywords: [worktree, settle-cwd-pin, cherry-pick, 误落 main, 简报]
status: draft
source_container: e2e-upstream-drift-reds-triage
source_task: 1.3
source_bug: —
---

# 误落 main 检出：结算门兜底与首犯预防

## 现象与处置

- worker 在主检出（main）而非容器 worktree 内执行任务，提交落到 main 分支；settle-cwd-pin 结算门检出并拒绝结算。
- 处置：`cherry-pick` 迁移提交到容器分支 → main 上 `reset` 清退误提交（清退后误提交成孤儿，不影响分支历史）。

## 教训

1. 任务简报必须显式锚定容器检出根（cwd），不依赖 worker 自行推断工作目录。
2. 结算门的定位是**兜底网**——它能拦住误落 main 的提交进入结算，但拦不住首犯发生；防首犯靠简报锚定，防漏网靠门。

## 边界

适用于容器/worktree 任务执行面；非 git 目录内的一次性探针任务无提交落点问题，不入此口径。
