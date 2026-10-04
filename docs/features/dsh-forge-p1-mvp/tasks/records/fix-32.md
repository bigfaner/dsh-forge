---
status: "completed"
started: "2026-10-04 19:40"
completed: "2026-10-04 19:51"
time_spent: "~11m"
---

# Task Record: fix-32 Fix(P1): 文档债批次——web-ui-composition 按 fix-25 现态重写 / tech-design 加 child 形态 errata / 三 README 缝名册同步 / page-map 标 stale（评审四路 P1 文档发现集中清偿）

## Summary
文档债批次四项交付（fix-25/29 官方基座重排后清偿）：web-ui-composition.md 按 HEAD 现态全量重写（五层分层图 + 产品九官方缝名册 + RPC 真实路径勘误 + 退役结构历史注记章）；tech-design.md 文首加「勘误与形态演进」章（S1 直跑裁决被 fix-1 child 形态翻案、五层现态引用、Interface 4 补 fs 通道、core 双服务依赖注记——正文历史裁决零改动）；apps/web README/注释批清与 plugin.ts 九登记同步（workbench 三签终态、client-plugin 缝全集补 hero.workspace 影子、knowledge/sidebar README 与 KnowledgeView/RecallTab 注释退役签名全清）；page-map.md 头部 stale 标注。纯文档面：2 个源文件仅注释改动，运行时行为零变化。

## Changes

### Files Created
无

### Files Modified
- docs/architecture/web-ui-composition.md
- docs/features/dsh-forge-p1-mvp/design/tech-design.md
- docs/features/dsh-forge-p1-mvp/design/page-map.md
- apps/web/src/workbench/README.md
- apps/web/src/client-plugin/README.md
- apps/web/src/views/knowledge/README.md
- apps/web/src/views/sidebar/README.md
- apps/web/src/views/knowledge/KnowledgeView.tsx
- apps/web/src/views/session/RecallTab.tsx

### Key Decisions
- 恢复任务假前提处置：核验确认前次执行仅产出评审诊断（发现清单即任务文件本体），四项交付物零实现——按派发指令执行真实现（同 fix-17/24/26/28/30 零实现先例），非 verify-only
- 五层分层图自 HEAD 代码重建（评审会话底稿不可得）：L1 Electron 宿主（boot child 形态）/ L2 壳内核（AppWebEntry+掌舵）/ L3 官方插件层（AppFrame+ConversationRoot）/ L4 产品插件（九缝登记+桥）/ L5 产品视图（workbench/views/flows）
- RPC 双径勘误口径：__DSH_TRANSPORT__ carrier = 官方 dsh 面通路声明（官方连接层/ws 消费）≠ 产品 RPC；产品 forge:* 真实路径 = window.dshForge.invoke preload 桥 → IPC（双侧 allowlist）→ host main → boot child 桥 dispatchRpc → core 双服务
- 九缝名册以 plugin.ts 逐行转录（key/id/order/label/priority/注入面），含 fix-24① hero.workspace 影子与「不声明 children」例外注记；main.conversation 影子缺席明记
- tech-design 只加文首 errata（S1 翻案/组件图形态注记/Interface 4 补 forge:fs/listDir/core 依赖扩 workspaceController+workspaceRegistry 双服务），正文裁决记录不动保可追溯
- 注释批清范围按发现清单：knowledge README/KnowledgeView/sidebar README/RecallTab；显式「fix-25 前」框架的历史注记（ForgeWorkspacePanel 同型引、KnowledgePanel 锚迁移注）保留
- 验证走 worktree 等价面（无 justfile）：tsc -b（compile）/ pnpm lint 五段全绿 / vitest run 全量

## Test Results
- **Tests Executed**: Yes
- **Passed**: 1009
- **Failed**: 0
- **Coverage**: 0.0%

## Acceptance Criteria
- [x] web-ui-composition 与 HEAD 代码逐节对照零失实（缝名册 = plugin.ts 实况）；RPC 路径描述与 rpc/client 实现一致
- [x] tech-design 读者经 errata 能得到正确的五层认知
- [x] 全仓 grep 退役符号（WorkbenchPanel/zones/view.rightDock/dswf-trajectory 自登记表述）在 docs/apps README 零活引用（历史注记除外）

## Notes
验证输出：tsc -b exit 0；pnpm lint（ox/imports/tokens/selftest/types）exit 0；vitest run 100 文件 1009 测试全过 exit 0（期间 vite 读 dsh-client-ui-dockkit 依赖 sourcemap ENOENT 告警为依赖侧噪音，非失败）。台账侧第 5 项（fix-24 blockedReason 残留清除）评审会话已完成，本任务无操作。grep 复核：README 层退役符号残留均为显式退役框架历史注记（workbench/client-plugin/session/shell README + web-ui-composition §11）。
