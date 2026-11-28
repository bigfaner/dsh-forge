---
title: 测试夹具用虚构盘符路径时，被测代码的真探针不可达
summary: >-
  测试夹具用不存在的盘符路径时，被测代码里「现查外部状态」的分支（如 spawnSync git 探针）因 cwd 不存在报 ENOENT 并被
  fail-soft 吞成缺席，分支实际未执行、断言红。签名是「spawnSync git ENOENT」而非 git 未装。处置 = 经既有注入缝（如
  porcelainRun）注桩，或夹具改用真实临时目录。
keywords:
  - spawnsync
  - enoent
  - cwd
  - 测试夹具
  - 虚构路径
  - git-探针
  - 注入缝
  - master-arbitration
id: spawnsync-enoent-cwd-git-master-arbitration
status: unconfirmed
version_ts: '2026-11-28T14:47:57.868Z'
updated: '2026-11-28T14:47:57.868Z'
type: pitfalls
---
# 测试夹具用虚构盘符路径时，被测代码的真探针不可达

## 现象

`tests/structure/master-arbitration.test.ts` 用 `ROOT = 'C:/repo'` 这类不存在的路径做夹具。前三例通过，因为走的是「主树行必胜」短路；第四例「主树判缺席 → 退 worktree 清单核验」要调 `isGenuineGitRoot`，其退路②是真实的 `git worktree list --porcelain` 探针（`spawnGitWorktreePorcelain`），`cwd` 指向不存在的目录即 `spawnSync git ENOENT`，fail-soft 返回 false，被测分支根本没被执行到，断言 `expected null to match object { projectId }` 变红。

日志里的 `git porcelain 探针失败 fail-soft：spawnSync git ENOENT` 就是签名——不是 git 没装，是探针的 cwd 不存在。

## 处置

被测装配（`createWorktreeIdentity`）本来就有 `porcelainRun` 注入缝（第四个参数，单测注桩、生产缺省真探针）。测试经该缝注入与 `gitStub` 同锚集合的 porcelain 文本桩，退路②分支才真正被执行。桩只存在于测试进程，正式装配组合根不变（提交 `7e4d2047`）。

## 判别要点

- `spawnSync <bin> ENOENT` 先查两件事：可执行文件在不在 PATH、**传入的 cwd 在不在盘上**；
- 夹具路径是虚构的，而被测代码有「现查外部状态」的分支时，该分支要么注桩、要么换成真实临时目录，不能让 fail-soft 把它吞成「缺席」还继续断言结果；
- 同族 flaky 史：master-arbitration 第 4 例在 t1 串跑链与 t7 两轮各红一次。

溯源：来源容器 plugins-remediation-m2b-iron-rule-settlement；来源任务 t7。
