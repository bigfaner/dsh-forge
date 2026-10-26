---
title: __DSH_BOOT__ 不携带 workspace，取 WorkspaceView.path
summary: 官方 boot 注入线 window.__DSH_BOOT__ / WebBootEntry 经全文 grep 无任何 workspace/cwd 字段；client 侧工作区路径正缝是 workspace-controller client store 的 WorkspaceView.path / WorkspaceSnapshot。
keywords: [__DSH_BOOT__, workspace, WorkspaceView, client, 取值来源]
domainPath: docs/conventions/reuse-official-mechanisms.md
来源容器: expert-squad
来源任务: 评审 Q3 → 1.10 实现（review-tech-report 复审）
bug id: 无
---

# __DSH_BOOT__ 不携带 workspace

## 翻车点

设计写「client 从宿主 boot 上下文取工作区路径」，与官方源码不符——`__DSH_BOOT__` 图里没有 workspace 字段，照此实现会在运行期取到 undefined。

## 正解

- client 侧经 `@deepseek-ai/dsh-api-workspace-controller/client` 的 `WorkspaceView.path`（`packages/api/workspace-controller/src/feed.ts:26`）取当前选中工作区；ui-workspace/ui-layout 即此取法先例。
- 显式参数随请求携带 + zod 门校验，canonical 化归 host 状态层，杜绝进程级 cwd 串域（Q2 双取值点钉死）。
