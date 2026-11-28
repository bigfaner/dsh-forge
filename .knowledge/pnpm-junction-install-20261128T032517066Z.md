---
title: pnpm 虚拟仓库 junction 空目录致宿主启崩：判别链与 install 修不了的坑
summary: >-
  pnpm 虚拟仓库条目损坏（.pnpm 下某包目录存在但为空）会让宿主启动即崩、e2e 全量崩塌且零业务红。判别：junction 目标为空 +
  require.resolve 复现 + dist 陈旧。修复的坑：普通 pnpm install 与删空目录再 install 均报 Already up
  to date 无效；--frozen-lockfile exit 0 是假健康信号。可靠修法只有删整个 node_modules
  重建。防空壳抽查不能只抽一个包。
keywords:
  - pnpm
  - junction
  - 空目录
  - 虚拟仓库
  - node_modules
  - host启动崩
  - e2e全红
  - already-up-to-date
  - frozen-lockfile
  - worktree
  - 环境判别
id: pnpm-junction-install
status: unconfirmed
version_ts: '2026-11-28T03:25:17.066Z'
updated: '2026-11-28T03:25:17.066Z'
type: pitfalls
candidate_of: boot-profile-renderer
---
# pnpm 虚拟仓库 junction 空目录：host 启崩的判别与修复

## 症状

e2e 或宿主启动时：

```
Error: Cannot find module '@deepseek-ai/dsh/package.json'
Require stack: apps\host\dist\profile\paths.js
```

e2e 全量崩塌（判例：267 failed / 6 passed），**所有失败同一签名、全在 launch 阶段、零业务断言红**。

## 根因形态

pnpm 的 `node_modules/.pnpm/<pkg>@<ver>_<hash>/node_modules/<pkg>/` 目录**存在但为空**（无 package.json）。`apps/host/node_modules/<pkg>` 的 junction 指过去，解析即失败。

诱因：workspace 里加/删依赖后 peer 组合变化，pnpm 为新组合建了目录但未物化内容（`.modules.yaml` 的 `prunedAt` 不更新即印证）。

## 判别链（五步，廉价）

1. `apps/host/node_modules/<pkg>` 是 junction？目标在哪
2. 目标目录 `Test-Path`——存在？里面有几个文件（0 = 空壳）
3. 从报错栈所在目录 `require.resolve('<pkg>/package.json')` 复现
4. 根 `node_modules/<scope>/` 是否缺席
5. `apps/host/dist` 时间戳 vs HEAD——dist 早于 HEAD 说明源码改动未编译，修依赖后还要重建

**三类归因**：全量同签名 + 零业务红 + 失败面在依赖装配不在改动面 = 环境问题，非本批回归。

## 修复的坑

**普通 `pnpm install` 修不了**：报 `Already up to date`、exit 0、几百毫秒完事，目录依旧空。它只比对锁文件，不看包在不在盘。

**删掉那个空目录再 install 也修不了**：同样 `Already up to date`，连目录都不重建。

**局部修补无效**（与 `worktree-pnpm-install` 一致）。可靠办法 = 删整个 `node_modules` 按锁文件重建。但重建前确认没有进程（宿主 GUI、运行中的循环）正装载该目录。

**假健康信号**：`pnpm install --frozen-lockfile` exit 0 + `Already up to date` + 锁文件 git 干净——三者全绿的同时宿主起不来。锁文件正确 ≠ 依赖目录物理完整。

## 规避

- 依赖闭包核验卡（如「install 后反查」）的防空壳抽查，**不要只抽一个包**——判例里抽了 picomatch 非空就过了，漏掉 `@deepseek-ai/dsh`
- 收口门绿后加一条「`apps/host` 能真启动」冒烟；质量门验证源码，不验证 `node_modules` 的物理完整性
- 在 worktree 内跑过 install 之后尤其要查（见 `worktree-pnpm-install`）

## 判例

容器 `plugins-remediation-m1-legacy-retirement` 任务 4.6（2026-11-28），`@deepseek-ai/dsh@0.2.2-rc.5` 空目录，1283 个包里唯一一个，10:23 创建（3.1/3.2 加依赖时段）。诊断全文：任务目录 `4.6/001-e2e-env-broken/diagnosis.md`。
