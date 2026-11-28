---
title: pnpm 虚拟仓库 junction 空目录致宿主启崩：判别链与 install 修不了的坑
summary: >-
  pnpm 虚拟仓库条目损坏（.pnpm 下某包目录存在但为空）会让宿主启动即崩、类型门与 e2e 全量红且零业务断言红。普通 install、删空目录再
  install、删 .modules.yaml 均报 Already up to date 无效；--frozen-lockfile exit 0
  是假健康信号。可靠修法只有把整个 node_modules 改名挪开后按锁文件重建。同会话第二次复现即止损整树重建。
keywords:
  - pnpm
  - junction
  - 空目录
  - 虚拟仓库
  - node_modules
  - already-up-to-date
  - frozen-lockfile
  - worktree
  - cannot-find-module
  - 整树重建
  - 环境判别
id: pnpm-junction-install
status: unconfirmed
version_ts: '2026-11-28T14:46:45.811Z'
updated: '2026-11-28T14:46:45.811Z'
type: pitfalls
supersedes: '2026-11-28T03:25:17.066Z'
---
# pnpm 虚拟仓库 junction 空目录：host 启崩的判别与修复

## 症状

e2e 或宿主启动时：

```
Error: Cannot find module '@deepseek-ai/dsh/package.json'
Require stack: apps\host\dist\profile\paths.js
```

e2e 全量崩塌（判例：267 failed / 6 passed），**所有失败同一签名、全在 launch 阶段、零业务断言红**。类型门同样会红（`tsc` 报 `Cannot find module '@deepseek-ai/dsh/...'`）。

## 根因形态

pnpm 的 `node_modules/.pnpm/<pkg>@<ver>_<hash>/node_modules/<pkg>/` 目录**存在但为空**（无 package.json）。`apps/host/node_modules/<pkg>` 的 junction 指过去，解析即失败。

诱因：workspace 里加/删依赖后 peer 组合变化，pnpm 为新组合建了目录但未物化内容。**另一种复发形态**：整树重装后包在场，跑完宿主启动 / 派发类测试套件后同一目录再次变空（m2b 判例三次复现，清空者未查明——目录带 `Everyone Deny Delete` ACE，疑为 DSH 会话子进程）。

## 判别链（五步，廉价）

1. `apps/host/node_modules/<pkg>` 是 junction？目标在哪
2. 目标目录 `Test-Path`——存在？里面有几个文件（0 = 空壳）
3. 从报错栈所在目录 `require.resolve('<pkg>/package.json')` 复现
4. 根 `node_modules/<scope>/` 是否缺席
5. `apps/host/dist` 时间戳 vs HEAD——dist 早于 HEAD 说明源码改动未编译，修依赖后还要重建

**三类归因**：全量同签名 + 零业务断言红 + 失败面在依赖装配不在改动面 = 环境问题，非本批回归。

**第一动作是检索知识库**：m2b 判例里主会话没先查知识库，逐点探测 + 三次半修复耗掉约半小时，而本条与 `worktree-pnpm-install` 早已写明修法。

## 修复的坑

**普通 `pnpm install` 修不了**：报 `Already up to date`、exit 0、几百毫秒完事，目录依旧空。它只比对锁文件，不看包在不在盘。

**删掉那个空目录再 install 也修不了**：同样 `Already up to date`，连目录都不重建。删 `.modules.yaml`、移走 `.pnpm/lock.yaml`、`--force --filter` 同样无效。

**止损口径**：出现一次按下面可靠修法处理；**同一会话第二次复现即停止逐点排查**，直接整树重建，并把「谁清空的」立为独立环境问题，不混在收口门里追。

## 可靠修法（整树重建，约 25 秒，离线可用）

1. 确认没有进程（宿主 GUI、运行中的循环）正装载该目录。
2. 把 `node_modules` **改名**挪开（如 `node_modules.reinstall-old`）——改名是原子的，不遍历、不会顺 junction 误删源码目录。
3. `pnpm install --frozen-lockfile --prefer-offline`——1282 个包全部从本地仓库复用，lock 不变。
4. 用 `Test-Path apps/host/node_modules/@deepseek-ai/dsh/package.json` 验收，再删旧目录（删含 junction 的大树要避免 PowerShell `Remove-Item -Recurse` 顺链接删目标）。

**假健康信号**：`pnpm install --frozen-lockfile` exit 0 + `Already up to date` + 锁文件 git 干净——三者全绿的同时宿主起不来。锁文件正确 ≠ 依赖目录物理完整。

## 规避

- 依赖闭包核验卡的防空壳抽查，**不要只抽一个包**——判例里抽了 picomatch 非空就过了，漏掉 `@deepseek-ai/dsh`
- 质量门绿后加一条「`apps/host` 能真启动」冒烟；质量门验证源码，不验证 `node_modules` 的物理完整性
- 在 worktree 内跑过 install 之后尤其要查（见 `worktree-pnpm-install`）
- 收口门简报里写明：遇到 `Cannot find module '@deepseek-ai/dsh/...'` 先探测该包是否在位，不在位即停下上报，不要当成测试回归、也不要自行逐点修

## 判例

- 容器 `plugins-remediation-m1-legacy-retirement` 任务 4.6（2026-11-28 10:23 创建空目录），`@deepseek-ai/dsh@0.2.2-rc.5` 空目录，1283 个包里唯一一个。诊断全文：任务目录 `4.6/001-e2e-env-broken/diagnosis.md`。
- 容器 `plugins-remediation-m2b-iron-rule-settlement`（2026-11-28 21:00–22:20）：同一包在整树重装后三次于跑完 `apps/host/src` 与 `plugins/task-loop/tests` 套件后变空；t7 收口门与主会话各撞一次，三次整树重建恢复，清空者未查明。来源任务 t7、fix-5。

溯源：来源容器 plugins-remediation-m2b-iron-rule-settlement / plugins-remediation-m1-legacy-retirement；来源任务 t7、4.6。
