---
id: "fix-32"
title: "Fix(P1): 文档债批次——web-ui-composition 按 fix-25 现态重写 / tech-design 加 child 形态 errata / 三 README 缝名册同步 / page-map 标 stale（评审四路 P1 文档发现集中清偿）"
priority: "P1"
estimated_time: "3h"
complexity: "low"
dependencies: []
surface-key: ""
surface-type: "web"
breaking: false
type: "coding.fix"
mainSession: false
---

# Fix(P1): 文档债批次（评审 fix 来源）

> 来源：四路 subagent 架构评审（2026-10-04）横切路 + web 路 P1 文档发现。横切总裁决：「代码面一致性成立，主要债在文档层——下一迭代优先还文档债」。

## 发现清单（评审实证）

1. **[docs/architecture/web-ui-composition.md](../../../docs/architecture/web-ui-composition.md):30-66,109-171**（P1）：唯一顶层架构文档仍停 fix-25 前世界——main.conversation 影子/WorkbenchPanel/zones dock/view-state/SessionToolbar 均已退役仍整章描述；§9 RPC 路径**错误**（称产品 RPC 走官方 __DSH_TRANSPORT__ carrier，实际走 window.dshForge preload→IPC→桥）；§11 已知未对齐项全部已解。其自订「改装配结构须同步本文档」契约被 fix-23/24/25/29 连续四轮违反；
2. **docs/features/dsh-forge-p1-mvp/design/tech-design.md:24-58,443**（P1）：组件图仍 direct-in-main 形态（无 boot child 进程/桥协议层）；:443 S1 裁决「直跑可行」无 fix-1 翻案注记（direct 形态工具派发恒挂起）；:208-210 Interface 4 通道清单缺 forge:fs/listDir、Layer 表 core 依赖缺 workspaceController rename（fix-24②）；
3. **apps/web 三处 README**（P2 批）：workbench/README.md:30-33,65-66（仍记 'dswf-trajectory' 自登记——fix-29 已退役）；client-plugin/README.md:9-19（缝全集仍列 dswf-trajectory、漏列 fix-24 hero.workspace 影子）；knowledge/README、KnowledgeView、sidebar/README、RecallTab 注释批量引用退役签名（zones 容器/view.center/双参 sidebarActions/SessionPanel pane）；
4. **docs/.../design/page-map.md**：三区工作台/右栏 dock 描述为设计期基线，fix-25 降位后仅历史参考——无 stale 标注。

## Description

1. **web-ui-composition.md 重写**（fix-25 现态）：五层分层图（评审横切路已产出文字版可作底稿）+ 产品九官方缝名册（3 sidebar + 2 main keyed + 1 panellist + 1 conversation.view + 1 hero.workspace 影子 + 1 shell.overlay，id/order/注入面逐项）+ RPC 真实路径（preload→IPC→桥）+ 官方头部链/页签行/右栏白拿口径 + 退役结构清单（一段历史注记）；
2. **tech-design.md errata 章**：不动正文（历史裁决记录），文首加「勘误与形态演进」——S1 直跑裁决被 fix-1 翻案（child 形态实证）、五层现态图引用 web-ui-composition、Interface 4 补 fs 通道与 workspaceController 依赖注记；
3. **apps/web 三 README + 注释批清**：与 plugin.ts 九登记同步；退役签名引用全清；
4. **page-map.md** 头部加 stale 标注（历史设计基线，现行见 web-ui-composition）；
5. 台账侧（已完成）：fix-24 blockedReason 残留已由评审会话清除（2026-10-04）。

## 验收

1. web-ui-composition 与 HEAD 代码逐节对照零失实（缝名册 = plugin.ts 实况）；RPC 路径描述与 rpc/client 实现一致；
2. tech-design 读者经 errata 能得到正确的五层认知；
3. 全仓 grep 退役符号（WorkbenchPanel/zones/view.rightDock/dswf-trajectory 自登记表述）在 docs/apps README 零活引用（历史注记除外）。

## Reference Files

- 见发现清单逐项定位；横切评审五层分层图（本会话 2026-10-04）作重写底稿；plugin.ts（九缝唯一源）

## 边界与不做

- 不改任何运行时代码（纯文档批）；
- tech-design 正文历史内容不动（只加 errata，保裁决可追溯）。
