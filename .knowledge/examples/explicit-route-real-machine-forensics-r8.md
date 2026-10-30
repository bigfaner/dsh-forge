---
title: provider/model 显式路由真机取证程序（r8 正例）
summary: 项目层档案遮蔽（显式 provider/model，字节级核验无 BOM）+ hostlog 插桩 route 行 + request/header config 与 subagent descriptor 原文摘录三锚点取证，测毕整目录还原 worktree 干净——显式路由/档案合成类 AC 的可复用取证程序。
keywords: [取证程序, 遮蔽档案, hostlog, header, 现场还原]
status: draft
source_container: expert-squad-forge-2
source_task: expert-squad-forge-2/1.21
---

# 显式路由真机取证程序（r8 模板）

## 步骤

1. **造因**：worktree cwd 重建项目层遮蔽档案 `.dsh/experts/<key>.md`，frontmatter 显式 `provider` + `model`；写后字节级核验无 BOM。
2. **环境前置核验**：凭据面（API key 透传）与 dev 宿主启动 cwd 逐项核验，无关告警如实记录不混入判定。
3. **插桩**：hostlog 加 `route=<provider>/<model> persona=<yes|no>` 探针行（消费点单点插桩）。
4. **取证**：GUI 真实派发；摘录 request/header config 与 subagent descriptor 原文（不得只引日志措辞）；默认回落用例取 route=inherit 旁证。
5. **现场还原**：测毕整目录移除遮蔽、核对 status 干净与 HEAD 未动——取证不留持久态。

## 正例出处

walkthrough/retest-1.13-r8/evidence.md（首测即 PASS，零产品源码改动）。
