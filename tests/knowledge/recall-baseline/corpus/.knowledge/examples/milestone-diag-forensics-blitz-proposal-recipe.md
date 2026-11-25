---
title: 里程碑诊断行真机取证配方：极小 blitz 提案全管线驱动
summary: >-
  验证成功里程碑埋点（settle/dispatch/setEnabled 等）的真机取证配方——dev 实例注册轻量项目，经 HTTP
  路由真实调用目标面，再以极小提案走 blitz 全管线（4 次 settle）+ 新会话 /run-dag-tasks 指令径，从 app-*.jsonl
  回放 info 行原文作主证据。
keywords:
  - 真机取证
  - 里程碑埋点
  - blitz 管线
  - JSONL 回放
  - 走查夹具
domainPath: .knowledge/examples/
来源容器: diag-milestone-coverage
来源任务: 1.9 test-run 真机走查 batch-1（三清单全通过）
bug id: 无
id: milestone-diag-forensics-blitz-proposal-recipe
status: unconfirmed
type: lessons
version_ts: '2026-11-05T00:00:00.000Z'
---

# 里程碑诊断行真机取证配方：极小 blitz 提案全管线驱动

## 驱动序列

1. dev 启动 `pnpm dev:debug`（CDP 9222 探活；隔离 userData = `apps/host/userdata.dev`）。
2. dev 实例注册轻量项目（如 download 目录）作走查夹具。
3. 可路由面（如 expert-squad enable/disable）走 HTTP 路由真实调用——选真实生产面而非已退役 UI 径；双向（enable+disable）均取证。
4. settle 里程碑：极小提案（hello-forge）走 blitz 全管线，4 次 settle 全落 info。
5. dispatch 里程碑：新会话发 `/run-dag-tasks` 指令径（注意既有会话 materialized 路径按设计跳过 commit，取证要走新会话径）。
6. 主证据 = dev 实机 `app-*.jsonl` 中 info 行原文摘录（timestamp/level/process/event/projectId 齐全）归档 jsonl；截图作场景留痕（菜单同位、Explorer 目录）。

## 判据要点

- 打开面验收对齐「同位 + 同交互词汇 + 无第二入口」：宿主菜单项与既有「打开日志」同形制（button+menuitem）、词汇平行、消费面全 web 单点。

## 边界

- 走查夹具数据（注册项目、提案、产物文件）留在隔离 userData / 夹具目录，不进 git；裁决文档须标注夹具留痕范围。
- 若项目根非 git 仓库，first-pass 循环不收敛（见 lessons/first-pass-no-convergence-non-git-root），备 `/stop-dag-tasks` 终止。

- 依据：`.forge/docs/proposals/diag-milestone-coverage/walkthrough/batch-1/裁决.md`（含 info 行 JSONL 原文与四张截图）。
