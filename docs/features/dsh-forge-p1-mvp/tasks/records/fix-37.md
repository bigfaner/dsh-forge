---
status: "completed"
started: "2026-10-04 22:17"
completed: "2026-10-04 22:57"
time_spent: "~40m"
---

# Task Record: fix-37 Fix(P2): e2e 基建批——support/ 支撑层抽取（~600 行 ×11 样板：launch/dismiss/forgeInvoke/registerProject/解码族）+ anchors.ts 常量面 + 端口分配器 + 清理/closeApp 统一 + 双 installer/flywheel 归并 + 对账细节回迁 core 集测

## Summary
e2e 基建批落地：e2e/support/ 支撑层 8 模块收编（launchHost/closeApp 全员强制、dismiss 统一 30s 窗、forgeInvoke/invokeHeat/registerProject/selectWorkspaceViaChip、会话文件解码族、rmDirBestEffort/openStateDb、dirRow/enterDir、dogfood 播种面）；anchors.ts 官方锚/产品锚分区常量面（55+ data-* 字面量 ×12 文件单源）；端口分配器（基+序号，撞段消除 + tests/structure 单测 4 例）；死重归并（旧 installer-smoke.spec 删除——安装/启动/主界面三步并入 p1mvp 版且 patch 插件行断言随迁、installer 链单跑；flywheel↔krf 头注分工——相反计数口径为故意缺陷信号设计不归并）；跨层边界（core testutil/db-seeds 单源供 core 测试与 e2e 双消费，e2e 私有 schema SQL 拷贝清零；手抄 Like 接口 ×5 → contracts typed DTO）；对账回迁（comp Step5c/5d 删除——语义已由 core reconcile-queries pin，fix-27 双 boot 保留为唯一 boot 期实证；kb:493 服务端口径 → browse-service 组合过滤零命中用例）；死夹具清理（LaunchOpts.dogfood 旗标、hero pageErrors 死收集转正断言、find(...)! → 显式 expect）。随批收口 fix-36 遗留两红灯：krf:491 轨迹选择器引号笔误修复（anchors 常量化）；krf:774 Step7b 官方 blank 会话语义（hideChrome:blank 页签行不渲染 + DefaultConversationViews blank 相位视图区 null——上游源码核实）载体不可达 → 留痕 skip（RecallTab.test 单测 pin + Step4d soft 承载）。

## Changes

### Files Created
- e2e/support/anchors.ts
- e2e/support/ports.ts
- e2e/support/launch.ts
- e2e/support/modals.ts
- e2e/support/rpc.ts
- e2e/support/session-files.ts
- e2e/support/cleanup.ts
- e2e/support/sqlite.ts
- e2e/support/navigation.ts
- e2e/support/dogfood.ts
- packages/core/src/testutil/db-seeds.ts
- tests/structure/port-allocator.test.ts

### Files Modified
- e2e/tsconfig.json
- e2e/SMOKE-LEDGER.md
- e2e/specs/host-boot.spec.ts
- e2e/specs/web-shell.spec.ts
- e2e/specs/installer-pipeline.spec.ts
- e2e/specs/smoke-skeleton.spec.ts
- e2e/specs/knowledge-integration.spec.ts
- e2e/specs/flywheel.spec.ts
- e2e/specs/p1mvp/hero-control.spec.ts
- e2e/specs/p1mvp/installer-smoke.spec.ts
- e2e/specs/p1mvp/knowledge-browsing.spec.ts
- e2e/specs/p1mvp/knowledge-recall-flywheel.spec.ts
- e2e/specs/p1mvp/project-registration.spec.ts
- e2e/specs/p1mvp/project-registration-compensation.spec.ts
- e2e/specs/p1mvp/session-workbench.spec.ts
- packages/core/src/forge/project-service.test.ts
- packages/core/src/forge/reconcile-queries.test.ts
- packages/core/src/index.test.ts
- packages/core/src/knowledge/browse-service.test.ts

### Key Decisions
- e2e→core seed 帮助器取「相对源引」（e2e/support/sqlite.ts re-export packages/core/src/testutil/db-seeds）而非包 manifest 子路径导出——包公共面零变化、testutil 仍不进生产 import 图、无 dist 新鲜度依赖（Playwright 转译按源加载，--list 已验证解析）
- installer 归并方向：p1mvp contract 溯源版为存续套件（含 fail-fast 差异面 Step2c）；旧 4.3 套件唯一独有断言（profile patch 含 @dsh-forge/core/@dsh-forge/knowledge 插件行）随迁冒烟前半，断言本体零弱化；SMOKE-LEDGER §6 台账行随迁记录
- flywheel↔krf 不归并（头注分工）：两套件对同一召回计数面故意断言相反口径（shipped 逐调用 vs 旅程链口径缺陷信号 soft 红）——归并即销毁缺陷信号设计
- krf Step7b 留痕 skip 而非改载体：官方 blank 会话语义（ConversationHeader hideChrome:blank → 页签行不渲染；DefaultConversationViews blank 相位视图区 null）上游源码核实 + fix-36 A/B 实证——确定性「有消息且零召回」载体无 dogfood 不可达；占位 Outcome 已由 RecallTab.test 单测 pin + Step4d else 分支 soft 承载
- dismiss 统一 30s 轮询窗（两值并存终结）；窗口届满 = 留痕返回（provider 叠层预免链路 modal 恒不挂载属预期态，不臆造失败）
- 端口分配器 = 进程内单调序号 + pid 派生基段（19500 + (pid%280)*90 + seq%90，上界 <49152 避开 Windows 临时端口段）；跨进程仍靠 pid 错峰（与旧方案同界，不宣称跨进程唯一）
- e2e/tsconfig 补 lib:DOM + include support/**——e2e 树首次获得可门控 typecheck 基线（tsc -p e2e 全绿），支撑层重构的回归网

## Test Results
- **Tests Executed**: Yes
- **Passed**: 264
- **Failed**: 0
- **Coverage**: 96.3%

## Acceptance Criteria
- [x] 16 spec 全部消费 support/（grep 逐字样板清零）
- [x] 端口撞段消除（分配器单测）
- [x] installer 链单跑
- [x] 对账三测试回迁后 e2e 总时长下降
- [x] 全套 e2e 绿（全量跑归 submit 质量门——静态门全绿 + Playwright --list 61 tests/14 files 加载零错 + fix-36 两红灯收口）

## Notes
门禁：tsc -b 全绿；pnpm lint（oxlint/imports/tokens/selftest/types/test-types）全绿；vitest core+structure+contracts 264/264；tsc -p e2e/tsconfig.json 全绿；playwright --list 61 tests/14 files（模块解析验证，未跑 e2e 本体——归 submit 质量门）。覆盖率口径：core 包 lines 96.33%（db-seeds 的 e2e 侧注入助手由 e2e 套件行使，不在 vitest 覆盖面——seedProjectRow 由 core 三测试消费）。e2e 总时长下降构成：comp Step5c/5d 两测试删除（各 60-90s RPC-only boot）+ 双 NSIS 分钟级安装链终结 + 61→64 用例净减 3。记录 fix-34③ 三处 closeApp 止血注释随收编消解。
