---
title: Electron 真机 boot 冒烟在 DSH 派生会话内 EPERM：条件跳过与判别
summary: >-
  三个 Electron 真机 boot 冒烟在 DSH 派生会话（DSH_SHELL=1）内恒 EPERM：缺省临时目录下子进程 mkdir
  被拒；改指工作区后能启动但子进程建出的目录带 Everyone Deny Delete ACE，清理 rmSync 再次被拒。同一 shell 的
  PowerShell 与普通 node 子进程不受限。处置 = it.skipIf(DSH_SHELL) 只在 DSH
  会话跳过，独立终端照常跑；勿当测试回归修。
keywords:
  - electron
  - eperm
  - 沙箱
  - dsh-shell
  - boot-smoke
  - skipif
  - 环境失败
  - windows
id: electron-boot-dsh-eperm
status: unconfirmed
version_ts: '2026-11-28T14:47:57.836Z'
updated: '2026-11-28T14:47:57.836Z'
type: pitfalls
candidate_of: boot-profile-renderer
---
# Electron 真机 boot 冒烟在 DSH 派生会话内 EPERM

## 现象

`apps/host/src/boot` 下三个真机 Electron 启动冒烟（`boot-spawn-smoke`、`delegate-visibility-smoke`、`worktree-rpc-boot`）在 DSH 派生的会话（环境变量 `DSH_SHELL=1`）里跑：

- 缺省临时目录下：Electron 子进程 `mkdir <tmp>/user-data` 直接 `EPERM`；
- 把临时目录改指工作区（`HOST_TEST_TMP_ROOT` / `TEMP`）：Electron 能启动，但子进程建出的目录带 `Everyone Deny DeleteSubdirectoriesAndFiles` ACE，测试清理 `rmSync` 再报 `EPERM`。

同一个 shell 发起的 PowerShell 与普通 node 子进程在同一目录建删都正常——受限的只有 Electron 后代进程。属会话沙箱的环境边界，不是仓库缺陷。

## 处置口径（用户裁决 2026-11-28）

三例改为 `it.skipIf(process.env.DSH_SHELL === '1')`：只在 DSH 派生会话跳过，独立终端照常执行（提交 `114e82a9`）。

## 判别要点

- 失败签名是 `EPERM ... mkdir` 或 `EPERM ... rmSync`，且只出现在 spawn 了 Electron 的用例——与断言失败分类隔离，不要当测试回归修。
- 误伤面：若 CI 也运行在 `DSH_SHELL=1` 环境，真机冒烟会被静默跳过；需在独立终端定期复核。

## 测试判例

- flaky 史：boot 冒烟 ×3；环境 = DSH 派生会话；复发轮次 = 同容器收口门两轮（t7 轮 1、轮 2）+ 主会话清账一次。
- 既有机制：`HOST_TEST_TMP_ROOT` 可改临时目录基目录，但解决不了清理阶段的拒绝删除 ACE。

溯源：来源容器 plugins-remediation-m2b-iron-rule-settlement；来源任务 t7。
