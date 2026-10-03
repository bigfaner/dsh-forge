---
name: dsh-forge-p1-welcome-ack-fix12
description: fix-12 welcome 模态 P0 定性与修复——dev 形态宿主 dsh-app-boot 模块二象性致 volatile 设置写全拒；产品 boot overlay 内置预确认（10 套件叠层全撤 + pin 测试）
metadata:
  type: project
---

dsh-forge P1 fix-12（2026-10-03）——「预览版说明」模态关不掉 P0：

**根因定性（probe5 插桩实证，三分叉择 (c)）**：`settings/mutate` RPC 响应携 `settings/rejected: "dsh: profile reload requires the root Include entry"`、客户端 `ConfigFormController.mutate` 静默 recover() 吞细节只示通用 welcomeError。子因 = **dev 形态宿主 dsh-app-boot 模块二象性**：boot/child 链（apps/host workspace `.pnpm` 实例）跑 `boot()→mountRootInclude` 在其 `bootstrapIncludes` WeakMap 记账；loader 插件链（`profile.dev/node_modules` 平铺 vendored 物理副本）的 `dsh-config-editor→reconcileProfilePatches` 查自家空 WeakMap → 恒 throw → patch 文档写入后被回滚（"写零落盘"真相）。**推论：dev 形态宿主内任何 volatile 命名空间设置写（Settings 面板所有开关！）同因全拒**——不只 welcome。打包形态单容器（staging 平铺 runtime/node_modules + host-dist 同容器）无二象性、写路径可用。分支 (a) dshDesktop 证伪（仅 onboarding payload 用）；(b) child 形态不持久化证伪。

**修复（两层）**：① 解卡 = 产品 boot overlay 第三行 `- id: ui-settings-general / welcomeNoticeVersion: "2026-09-28.1"`（`WELCOME_NOTICE_ACK_VERSION` 常量 + overlay.test 读 profile.dev vendored `dsh-client-ui-settings-models/lib/client.js` 内 `WELCOME_NOTICE_VERSION` pin 断言——上游 bump 即红，升级窗口机械核查）。② 定性入记录不修 dev 二象性（修 = child 入口迁 profile 容器，大动宿主形态）。

**e2e 迁移（10 套件）**：全部 `writeAckOverlay`/叠层 welcomeNoticeVersion 行撤销——预确认唯一载体 = 产品 overlay；smoke-skeleton 组零新增裸启动（无 DSH_FORGE_PATCH_FILES）20s 窗口「预览版说明」不现真实路径用例（`toHaveCount(0)` 即时通过盖不住迟到挂载——须循环轮询持窗）。**保留的叠层**：flywheel/session-workbench/knowledge-recall-flywheel 的 dogfood 模型行（llm-pi-ai/agent-default-model）；knowledge-browsing/project-registration-compensation 的 provider 行（API-key 弹窗预免防复启毒化，改名 writeProviderOverlay）。验证面：smoke-skeleton 4 + knowledge-integration 2 + session-workbench 6(+1 既有 skip) + installer-pipeline 3（staged 重跑 `pnpm dist:stage` 后）全绿；probe6/probe6s 双形态裸启 20s 无模态。

**Why**: e2e 曾全预确认叠层 = 产品 overlay 形态从未被裸跑证过（本缺陷漏网主因）；叠层与 boot overlay 同走 runProfile patchFiles，但 e2e 叠层在 `extraPatchFiles`、产品行在前——载体迁移零行为差。
**How to apply**: 触 boot/overlay/e2e 载体任务先读本条；升级上游 pin 后先跑 overlay pin 测试（红 = welcome 常量需跟随 bump）；dev 形态内做设置面手工验证时预期 volatile 写恒拒（勿再当新缺陷排查——归 dev 二象性已知限制）；改 e2e 新套件时 welcome 预免勿再自带叠层。关联 [[dsh-forge-p1-dogfood-tool-hang]]（4.2 预确认叠层记载——载体已被本条迭代）、[[dsh-forge-4-1-installer-pipeline]]（staged 单容器形态）。
