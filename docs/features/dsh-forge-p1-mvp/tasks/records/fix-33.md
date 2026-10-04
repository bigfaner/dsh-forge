---
status: "completed"
started: "2026-10-04 20:52"
completed: "2026-10-04 21:24"
time_spent: "~32m"
---

# Task Record: fix-33 Fix(P2): 架构评审加固批次——host 桥 send 防护/DSH_HOME 环境态告警/pin 韧性 + web 钩子形制/桥撤销对称/残械清理/label locale + core 测试类型门/rename 联动/记账防护/死字段 + 桥白名单类型锚

## Summary
四路架构评审 P2 加固批次 16 项全落地。host：① child send 防护（bridge.sendGuarded——IPC 序列化抛错回填保 id 降级 error-result，不再落 unhandled rejection）；② DSH_HOME 环境态第三层检测告警（main.ts warn + paths.ts 文档化三层）；③ host-main pin 韧性（importSpecifiersOf 扫描面补双引号/无插值模板串/动态 import()/require()）；④ resolveChildEntry 半成型资源直接 throw（不再回退 dev 入口）。web：⑤ ShellHost 条件钩子抽 PanelInfoAnchor 子件 + readActivePanelId 纯函数（hooks 规则合规）；⑥ 桥缝族对称（apply catch 补撤销桥/locale 词典 + overlay dispose 清 __DSH_FORGE_CLIENT__ 标记 + publishWorkbenchBridge 双径注记）；⑦ RecallTab keep-alive 残械删除（visible/hold 分支——官方 only:id 挂载下生产不可达）；⑧ 行 label 接官方 locale NS（inject 加 locale 服务、register(NS,{zh,en})+bind+label thunk——官方 ui-trajectory 同径）；⑨ projectAnchorOf workspaceId 收紧必填。core/contracts：⑩ 测试类型门（七份 tsconfig.test.json + 根 lint:test-types 并入 pnpm lint；补 rename 桩 + 修全部潜伏测试类型错 TS2741/2532/2345/18046/18048/2722/1360/7016/2571）；⑪ updateProject name patch 成功后 fire-and-forget alignWorkspaceTitle（fix-24 注记耦合收口）；⑫ attachExistingRow 自愈失败 best-effort 记账（scope=reconcile warn）再降级；⑬ 对账逐项 catch 内 recordKeyLog 套 try（记账抛错不截断本轮剩余行）；⑭ RegisterResult.compensated 死字段删除（CompensatedInfo 保留为错误附载形状）；⑮ 桥白名单 satisfies + AssertNever 覆盖完备性类型锚（改名/漂移编译期显形 + assertType 单测）；⑯ contracts BrowseKnowledgeService 命名类型收口第八法四处手工同步（core knowledge-service/host run.ts/host knowledge-rpc/core browse-service）+ knowledge tsconfig 残留 ../core 引用删除（boundaries/scaffold pin 同步）。

## Changes

### Files Created
- packages/contracts/tsconfig.test.json
- packages/path-key/tsconfig.test.json
- packages/core/tsconfig.test.json
- packages/knowledge/tsconfig.test.json
- apps/host/tsconfig.test.json
- apps/web/tsconfig.test.json

### Files Modified
- apps/host/src/boot/bridge.ts
- apps/host/src/boot/bridge.test.ts
- apps/host/src/boot/child.ts
- apps/host/src/boot/run.ts
- apps/host/src/boot/run.test.ts
- apps/host/src/ipc/knowledge-rpc.ts
- apps/host/src/ipc/preload-api.test.ts
- apps/host/src/ipc/projects-rpc.test.ts
- apps/host/src/main.ts
- apps/host/src/profile/paths.ts
- apps/web/src/client-plugin/plugin.ts
- apps/web/src/client-plugin/plugin.test.ts
- apps/web/src/views/session/ConversationViews.tsx
- apps/web/src/views/session/RecallTab.tsx
- apps/web/src/views/session/RecallTab.test.tsx
- apps/web/src/views/session/README.md
- apps/web/src/workbench/ShellHost.tsx
- apps/web/src/workbench/ShellHost.test.tsx
- apps/web/src/workbench/panel-model.ts
- apps/web/src/workbench/panel-model.test.ts
- packages/contracts/src/dto/knowledge.ts
- packages/contracts/src/dto/project.ts
- packages/contracts/package.json
- packages/core/src/forge/project-service.ts
- packages/core/src/forge/project-service.test.ts
- packages/core/src/forge/reconcile-queries.test.ts
- packages/core/src/db/db.test.ts
- packages/core/src/knowledge/browse-service.ts
- packages/core/src/knowledge/knowledge-service.ts
- packages/knowledge/src/boundaries.test.ts
- packages/knowledge/tsconfig.json
- packages/path-key/package.json
- tests/contract/pin-03-sidebar-slots.test.ts
- tests/contract/pin-04-workspace-registry.test.ts
- tests/contract/pins.ts
- tests/structure/host-main.test.ts
- tests/structure/installer-pipeline.test.ts
- tests/structure/scaffold.test.ts
- tests/tsconfig.json
- package.json
- pnpm-lock.yaml

### Key Decisions
- send 防护落 bridge.ts 纯函数面（sendGuarded(message, send)）而非 child.ts 内联——零 node 依赖可逐项单测，child.ts 仅一行包裹
- DSH_HOME 第三层双管齐下：main.ts 环境态在场即 console.warn（一行，保 ≤110 行 pin）+ paths.ts resolveDshHome 文档化为第 0 层
- label locale 采用官方 ui-trajectory 全径（inject 'locale' 服务 + register(NS,{zh,en}) 词典 + bind + label thunk + locale NS 登记声明），非注记降级；zh 值与原字面量等值（zh-CN 机器 e2e 文案零变化，浏览器 tag 主子段匹配 zh）
- 桥/locale 词典撤销三径：apply catch 补撤销（revokeBridgeAndLocale）+ overlay dispose（桥全局/激活标记/词典三清）；publishWorkbenchBridge 双径原因注记（发布须早于任何槽位入座，撤销只能骑 overlay 洞 dispose）
- RecallTab 残械选删除而非注记（only:id 挂载机制已承载 AC-4 语义，hold 分支生产不可达）；recallLoadPlan/runRecallLoad/applyRecallOutcome/useSessionRecall API 同步收窄
- 测试类型门选独立 noEmit project（七份 tsconfig.test.json extends 本包配置，exclude:[] 显式清空——继承排除会假绿）而非 vitest typecheck；knowledge/host 测试配置放宽 rootDir（测试面相对引 core 源码）
- 新依赖最小面：contracts/path-key devDeps 仅 @types/node（scaffold 零依赖 pin 放宽为仅允许该项）；根 devDeps 补 better-sqlite3+@types/better-sqlite3（tests/contract pin-04 type-only import）
- 白名单锚双面：源侧 satisfies readonly (keyof T)[] + AssertNever<Exclude<...>> 覆盖完备性（缺方法编译期点名）；测试侧 assertType<never>(undefined as Coverage) 经测试类型门消费
- RegisterResult.compensated 删除（成功径永不置位——实际载体 = ProjectWriteError.data.compensated/RpcErrorPayload.data）；e2e 本地自声明接口不受影响
- knowledge tsconfig ../core 引用删除连带两处结构 pin 更新（boundaries.test 显式 not.toContain + scaffold references 拓扑期望表）

## Test Results
- **Tests Executed**: Yes
- **Passed**: 1023
- **Failed**: 0
- **Coverage**: 82.2%

## Acceptance Criteria
- [x] 四路评审 P2 清单 16 项逐项闭环（做/显式不做注记）
- [x] 现有测试池全绿（单测 1023/1023 + web-shell e2e 实证插件/locale 激活链）
- [x] 新增防护各有单测：send 降级（sendGuarded 三例）/钩子形制（PanelInfoAnchor+readActivePanelId）/白名单锚（assertType+覆盖度）/记账防护（⑫自愈记账+⑬记账不截断）
- [x] 测试类型门落地（lint:test-types 并入 pnpm lint，TS2741 等潜伏错全数显形并修复）
- [x] 全批零运行时行为变更（除防护新增）——label zh 值等值、DSH_HOME 仅新增告警、resolveChildEntry throw 仅半成型资源径

## Notes
恢复任务假前提（对照 dsh-forge-p1-fix-record-recovery 形态）：恢复 prompt 声称实现已完成，实证零实现（无 fix-33 commit、child.ts 裸 process.send、白名单无类型锚）——按派发指令执行真实现。验证口径：pnpm build（tsc -b + vite 含 client-plugin bundle 形状 pin）绿、pnpm lint 全链（ox/imports/tokens/selftest/types/test-types）绿、vitest 1023/1023 绿、playwright web-shell.spec 绿（30s）；just fmt 无对应物（本 worktree 未配置格式化器——oxlint 风格门承载）。发现并留档：apps/web tsconfig exclude 花括号 glob 从未匹配，web 测试一直随 tsc -b 检查（d.ts 入 dist-types）。dogfood 重负载 e2e（flywheel/session-workbench 标签字面量断言）未全量重跑——zh 主子段匹配分析 + web-shell 实证承载，label 值等值。
