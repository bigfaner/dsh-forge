---
id: "fix-37"
title: "Fix(P2): e2e 基建批——support/ 支撑层抽取（~600 行 ×11 样板：launch/dismiss/forgeInvoke/registerProject/解码族）+ anchors.ts 常量面 + 端口分配器 + 清理/closeApp 统一 + 双 installer/flywheel 归并 + 对账细节回迁 core 集测"
priority: "P2"
estimated_time: "6h"
complexity: "high"
dependencies: []
surface-key: ""
surface-type: "web"
breaking: false
type: "coding.fix"
mainSession: false
---

# Fix(P2): e2e 基建批（clean code e2e 路 B → 消「横切迁移全量重写」维护税）

> 来源：clean code e2e/跨包夹具评审（2026-10-04，B：断言/诊断/溯源 A 级，支撑层完全未抽取）。closeApp 竞态止血与 StubRegistry 收编已拆 fix-34，本批做结构性抽取。

## 清单

1. **`e2e/support/` 支撑层**（消除 ×11 逐字样板，分叉以参数承载并注取舍）：
   - `launchHost`（boot 就绪链 + 端口分配 + userData 管理）+ `closeApp`（进程退出等待 + 2s 静置——全员强制，吸收 fix-34③止血）；
   - `dismissOnboardingModals`（统一 30s 窗；超时显式失败或留痕——两值并存终结）；
   - `forgeInvoke`（×9 同体）、`registerProject`（RPC 直注 + 等待收敛）、`selectWorkspaceViaChip`；
   - 会话文件解码族（decodeSessionFile/bestSessionLog/waitForFixtureSession ×3+1）、`rmDirBestEffort`（×3，统一 4 种清理写法）、`openStateDb`+MinimalStmt（×4）；
2. **anchors.ts 常量面**：data-* 锚散字面量 55+ 处 → 官方锚/产品锚分区常量（`[data-dswf-workbench]` 等 12 文件），下次迁移改一处；
3. **端口分配器**：17 个魔法基数已现两对撞段（19810、19710 各一对）→ 基+序号计数器入 launchHost；
4. **死重归并**：installer-smoke 旧版保留 fail-fast 差异面，安装/启动/主界面三步并入 p1mvp 版（双跑分钟级 NSIS 链终结）；flywheel ↔ krf 同 dogfood 链归并或头注明确分工（凭据播种/叠层/解码器三份拷贝随 support 收编；krf inline heat evaluate 降级拷贝复用 invokeHeat 版）；
5. **跨层边界**：e2e 直写 core 私有 schema SQL（compensation INSERT projects / kb INSERT recall_logs ↔ core/service.test 互为拷贝）→ core 导出 seed 帮助器或 e2e 改 RPC+只读探针；手抄 ProjectSummaryLike/RegisterResultLike ×5 → import contracts typed DTO；
6. **e2e/单测边界回迁**：compensation.spec 三测试（548/603/640，每条 60-90s 纯 RPC+直查）→ 对账语义归 core 集测，e2e 留一条 boot 期自动触发实证；knowledge-browsing:493 服务端口径断言归 browse-service 单测；
7. **死夹具**：session-workbench:98/314 `LaunchOpts.dogfood` 死旗标删除；hero-control:248 死 pageErrors 收集补断言或去监听；`projects.find(...)!` 非空断言 → 显式 expect(...).toBeDefined()（hero-control:140、session-workbench:183）。

## 验收

- 16 spec 全部消费 support/（grep 逐字样板清零）；端口撞段消除（分配器单测）；
- installer 链单跑；对账三测试回迁后 e2e 总时长下降；全套 e2e 绿。

## Reference Files

- e2e/specs/ 全 16 spec + e2e/playwright.config.ts；core/index.test.ts（fix-35 前为 service.test.ts）（seed 帮助器源）；评审报告（本会话 2026-10-04）为规格源

## 边界与不做

- 断言本体零弱化（评审亮点保持：取证倾倒/留痕 skip/SMOKE-LEDGER 台账纪律不动）；与 fix-34③④衔接（closeApp/StubRegistry 先止血后入 support）。
