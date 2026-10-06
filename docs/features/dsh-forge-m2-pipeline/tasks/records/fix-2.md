---
status: "completed"
started: "2026-10-07 07:03"
completed: "2026-10-07 07:22"
time_spent: "~19m"
---

# Task Record: fix-2 Fix: 概览 feature 子 tab 文档行不渲染——列举读面缺失（document-browsing 4 例红）

## Summary
补齐概览 feature 子 tab 文档行列举读面全链：contracts FEATURES_CHANNELS 增 listDocs（forge:features/listDocs，平铺键 featuresListDocs，allowlist 27→28）+ dto ListFeatureDocsQuery/FeatureDocumentRow 负载映射与 ForgeFeaturesService 第五法；core listFeatureDocs（feature_documents 全行确定性序 feature_id × doc_kind，纯读零事件）；host 五通道注册锚（features-rpc 四→五）+ 桥白名单 FEATURES_SERVICE_METHODS 增 listFeatureDocs；web client features.listDocs + 概览列路（features 子 tab）三路并发并列拉 docs + OverviewFrame 透传 docs → FeaturesTab 文档行渲染。document-browsing e2e 由 1/5 → 5/5 全绿（原 4 红同根因消除；悬空容错例另修夹具相位——惰性首开单径裁决下删除前先触达列举读面使索引行落库）。

## Changes

### Files Created
无

### Files Modified
- packages/contracts/src/channels.ts
- packages/contracts/src/channels.test.ts
- packages/contracts/src/dto/forge.ts
- packages/contracts/src/dto/forge.test.ts
- packages/core/src/forge/small-domains/features.ts
- packages/core/src/forge/small-domains/features.test.ts
- packages/core/src/forge/service-assembly.test.ts
- apps/host/src/boot/bridge.ts
- apps/host/src/boot/bridge.test.ts
- apps/host/src/ipc/features-rpc.ts
- apps/host/src/ipc/features-rpc.test.ts
- apps/host/src/ipc/m2-wiring.test.ts
- apps/host/src/ipc/forge-channels.test.ts
- apps/web/src/rpc/client.ts
- apps/web/src/rpc/client.test.ts
- apps/web/src/views/overview/overview-data.ts
- apps/web/src/views/overview/overview-data.test.ts
- apps/web/src/views/overview/OverviewTab.tsx
- apps/web/src/views/overview/OverviewTab.test.tsx
- apps/web/src/views/overview/feature-tab.tsx
- apps/web/src/views/overview/feature-tab.test.tsx
- apps/web/src/views/knowledge/EntryDrawer.test.tsx
- apps/web/src/views/overview/drawer/index.test.tsx
- e2e/specs/m2/document-browsing.spec.ts

### Key Decisions
- 通道归属 FEATURES 族（forge:features/listDocs）而非 DOCS 族——对齐任务书『host 五通道注册锚』（features-rpc.ts 注册行四→五通道）；P1 projects 五通道锚零波及
- 服务方法 listFeatureDocs 挂 Interface 2 纯读面：零事件发射（写后事件只及写动词）、确定性序 feature_id × doc_kind、行归属过滤归 UI（无 search 面——子 tab 搜索由 features.list 服务端过滤承载，未命中 feature 不渲染其文档行）
- docs 注入点 = 概览列路 features 子 tab（fetchOverviewList 与 features.list ∥ proposals.list 三路并发同径），非头路——文档行仅 features 子 tab 呈现
- 悬空容错 e2e 例修测试侧而非生产：惰性首开单径（record 5.summary §5.2——onRegistered 协作者缝在场未接线，建库归 ensureOpen 首次 forge 域触达）下，原夹具在首次触达前 rmSync 文件致索引行从未建（docCount=0）；修为删除前先 forgeInvoke FEATURES_CHANNELS.list 使行落库，再删文件模拟分支切换（索引行在场、盘上缺席——与用例意图一致）
- 三消费 pin 面同步收口：web 两处全通道记录桩 fake client 补 listDocs、m2-wiring 16→17 通道、forge-channels 27→28、bridge 白名单 4→5、contracts 通道族 pin/服务面方法数 pin 同步更新

## Test Results
- **Tests Executed**: Yes
- **Passed**: 208
- **Failed**: 0
- **Coverage**: 85.2%

## Acceptance Criteria
- [x] core feature_documents 列举读面在场（listFeatureDocs——确定性序 + 纯读零事件 + 与 docCount 同源）
- [x] RPC 通道三处一体：contracts CHANNELS + dto 负载映射 + web client Record + host 五通道注册锚 + 桥服务白名单
- [x] OverviewTab 装配注入 docs：列路 features 子 tab 拉取 + OverviewFrame 透传 + FeaturesTab 文档行渲染
- [x] contracts 三消费 pin 面不破（web/host/桥/allowlist 计数与键集同步）
- [x] e2e/specs/m2/document-browsing.spec.ts 4 例红转绿（T-test-run 阻塞解除）

## Notes
验证：just compile/just lint 全绿；目标单测 203 通过（contracts 2 文件 + core 2 文件 + host 4 文件 + web 6 文件）；document-browsing e2e 5/5 通过（3.1-3.6m）。覆盖率 = 改动源文件域 v8 语句 85.17%（目标 60%）。共享 worktree 纪律：他人未提交改动（task-tab-data.ts、其余 m2 e2e specs、index.json 等）不在本任务提交面，提交显式列文件。
