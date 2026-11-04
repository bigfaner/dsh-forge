---
title: 真机取证任务简报须携带检出环境前置命令清单
summary: >-
  worktree 全新检出缺 profile.install 依赖树，dist:win 首跑必 ASSEMBLE FAILED 一次（fail-loud
  提示给修复命令后才重试通过）——涉及 dist/staging/installer 真机取证的简报应前置检出命令清单，消化「首跑必失败一次」的环境税。
keywords:
  - 环境前置
  - worktree
  - profile.install
  - 真机取证
  - 简报
domainPath: lessons
status: unconfirmed
source_container: packaging-guard-hardening
source_task: packaging-guard-hardening/1.5
id: fresh-checkout-env-prerequisite-in-brief
type: pitfalls
version_ts: '2026-11-05T00:00:00.000Z'
---

# 检出环境前置：首跑失败是环境税不是缺陷

## 现象

- 全新 worktree 跑 `pnpm dist:win` 首跑 `ASSEMBLE FAILED: .../@deepseek-ai/dsh/package.json 未就位`——缺 `apps/host/profile.install` 依赖树。
- fail-loud 提示直接给出 `pnpm -C apps/host/profile.install install`，一次重试即过；属环境检出前置，非方案缺陷。

## 规避方式

1. 派发涉及 dist/staging/installer 真机取证的任务时，简报附带检出前置命令清单（profile.install 安装等）。
2. 首跑此类失败先归类为环境前置：看报错是否 fail-loud 给出修复命令，照做重试，不进根因排查。

## 推广：检出基线事实同此理

- 同属「简报应前置携带的环境/基线事实」的还有：全仓 lint 门内既有的 HEAD 基线错误清单。判例 expert-headhunter-tools/1.1：worker 以 scoped 口径代偿全仓 `pnpm lint:ox` 门禁，被 ERR_AC_NOT_MET 拒一轮——基线事实进简报后该发现成本可前置消除（容器复盘 1.5 W2 节）。
- 口径：凡「worker 各自会重新发现一遍、且内容随检出态漂移」的事实（依赖树、基线错误清单、宿主运行态），都属简报前置面。

## 反例边界

- 只对「fresh 检出 + 未装依赖树」成立；依赖树已就位的 warm 环境无此税，不必强制重跑安装。
- 若 fail-loud 提示缺席或重试仍败，则升级为真实缺陷排查。

## 来源

- 复盘 `packaging-guard-hardening/retro/first-pass-1.6.md` 第三节第 1 条（F2 建议）；取证 `walkthrough/1.5-dist-win-check-hook/profile-install.log`、timestamps exit 1→0。
- 推广段来源：`logs/expert-headhunter-tools/1.5/retro-first-pass.md` W2 节（expert-headhunter-tools/1.6 沉淀合并）。
