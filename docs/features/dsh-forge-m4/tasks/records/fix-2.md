---
status: "completed"
started: "2026-09-30 04:00"
completed: "2026-09-30 04:12"
time_spent: "~12m"
---

# Task Record: fix-2 Fix: SC7 家族回归 — 4.5 首启默认 blob 恢复清空激活自动展开(stored 字段修法)

## Summary
SC7 家族回归根因修复(stored 行存在信号修法,4.6 诊断采纳):4.5 布局记忆引擎对无 project_ui_state 行的项目(默认布局)也执行 restore —— 空默认 tree 分支既进 restoredTree 观测面(parent-fed 受控 layout 经 useSyncExternalStore 同步)又触发 notifyRestored,覆写新激活项目组的 §2.3 激活祖先链自动展开;SC4 因 caret 用户路径(ensureProjectGroupExpanded)确定性通过,SC7 家族在该分支上稳定红。修法三处(additive,零形状破坏):①内核 getProjectUiState(apps/desktop/src/main/workbench/ipc/services.ts)回传体新增 stored 布尔(row 存在性;无行 = 默认布局 + stored:false;违规重置默认的行仍 stored:true —— 行在,记忆语义在),接口类型(ipc/types.ts)与 preload 转型同步;②client 桥孪生(packages/plugins/forge-workbench/src/client/ipc/workbench.ts)返回体新增可选 stored?:boolean(旧宿面形状兼容);③引擎(layout/persistence.ts)loadAndReplay 在 stored!==true 时早退 —— 无行 = 默认布局:不发布 tree feed(仅换台的 resetFragments undefined 通知)、不重放(默认 blob 的重放计划本就为空),采集照常(首笔 seam 报告写首行,下次进入即有真记忆)。断言零弱化,反向增强:内核动词面 5 处断言补钉 stored 位;引擎新增『无行 = 默认布局』回归测试(全腿 tripwire 面 + tree feed 静默 + 首行写入),verbs fake 补 kernel 形态 stored 回传。验证:SC7 + SC4 家族同轮 4/4 绿(playwright forge-m3-e2e,workers:1,重建三件套后);定向单测 97 绿(layout-memory + workbench-ui-state + workbench-ipc);全单元道 2448 绿/2 跳过;compile 门 388 收集 OK;oxlint 改动文件 0 错误(仓级 lint 失败 = apps/desktop/e2e 存量,非改动文件);全量 e2e 前单实例锁探测(无活跃实例)。

## Changes

### Files Created
- docs/features/dsh-forge-m4/tasks/process/record-fix-2.json
- docs/features/dsh-forge-m4/tasks/records/fix-2.md

### Files Modified
- apps/desktop/src/main/workbench/ipc/services.ts
- apps/desktop/src/main/workbench/ipc/types.ts
- apps/desktop/src/preload/index.ts
- packages/plugins/forge-workbench/src/client/ipc/workbench.ts
- packages/plugins/forge-workbench/src/client/layout/persistence.ts
- packages/plugins/forge-workbench/tests/layout-memory.spec.ts
- apps/desktop/tests/workbench-ui-state.spec.ts
- apps/desktop/tests/workbench-ipc.spec.ts

### Key Decisions
- 修法采 4.6 裁决的 stored 字段方案而非在 client 侧判『默认布局即跳过』:默认 blob 与『用户真的收起了一切后离开』的合法记忆在内容上同形(全空 tree 也是合法离开前布局),只有行存在性可区分 —— 内容判别会把合法的空记忆恢复错杀,行存在信号才是无损判据。
- stored=true 判定取严格等值(缺席/undefined 一律按默认 blob 路径):旧宿面(client 桥孪生保持 stored?:boolean 可选)降级方向 = 不重放,宁可少恢复也不覆写激活自动展开 —— 与本修的失效模式对称。
- 违规重置默认的行保持 stored:true:行在即记忆语义在(读侧 sanitize 已 log ERR_LAYOUT_INVALID),默认 blob 内容的重放计划为空、tree feed 发布空块会覆写激活展开 —— 该边角(损坏 blob 项目)接受与修前同形的行为,不为边角再开判别面(最小修边界)。
- 内核侧 stored 为必填布尔(实现恒回传,主进程内部精度),client 桥孪生为可选(跨宿 additive 纪律;presence check 只验成员可调,不检返回形状,零 4.1 schema/白名单触碰)。
- 引擎早退覆盖整个恢复应用而非仅 tree 腿:stored=false 时 layout 恒为 DEFAULT_PROJECT_LAYOUT(services.ts 既定),其重放计划为空(planLayoutReplay 对默认 blob 的设计即 no-op)—— 早退与『仅跳过 tree 腿』行为等价,但语义更直白(无记忆 = 无可重放)。

## Test Results
- **Tests Executed**: Yes
- **Passed**: 2452
- **Failed**: 0
- **Coverage**: 96.0%

## Acceptance Criteria
- [x] SC7 家族(sc7-task-session-trace.spec.ts)与 SC4 家族(sc4-split-windows.spec.ts)同轮全绿,零断言弱化
- [x] layout-memory + ui-state 单元套件绿(含新增回归覆盖)
- [x] 全单元道绿(VITEST_MAX_WORKERS=4 vitest run 全仓)
- [x] 确定性纪律:重建三件套(desktop build + build:plugins + stage:plugin-tarballs)后跑 e2e;批次前单实例锁探测;workers:1
- [x] additive 修法:无破坏性形状变更(新可选字段),4.1 schema/白名单不触碰

## Notes
覆盖说明:引擎新增 1 测试(无行 = 默认布局:tree feed 静默 + 零重放 ops + 首行写入),verbs fake 回传 kernel 形态 stored;内核动词面 5 断言补钉 stored 位(无行 false / 有行 true / 违规重置行 true / 钳制行 true);workbench-ipc 桩同步;e2e 断言本体零改动。执行前核verify:forge prompt 的 fix-record-missed 前提不成立 —— 工作树零代码改动、stored 字段全仓无匹配(git status 仅任务簿记),前次会话在实现前即中断;按派发指令实施修复而非 blocked。SC4 重进恢复腿不受伤的机理:该腿项目已有行(debounce 写过),stored=true 全恢复。4.5 解锁:fix-2 完成后源任务 4.5 自动回 pending(依赖全齐);其 process/record-4.5.json 保持 completed 记录,回归修复事实由本 record 承载。lint 存量 = apps/desktop/e2e/tray-residence(max-len x5)+ multi-install(arrow-parens x1)+ helpers/journeys.ts(arrow-parens,2026-09-20 起)—— 均非本次文件。
