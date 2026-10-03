---
status: "completed"
started: "2026-10-03 17:32"
completed: "2026-10-03 18:10"
time_spent: "~38m"
---

# Task Record: fix-12 Fix(P0): 预览版说明模态无法关闭——官方 welcome ack volatile 写在产品宿主下静默丢弃（阻断所有新用户）

## Summary
P0 解卡 + 根因定性收口：「预览版说明」模态在产品宿主形态关不掉（fresh 用户全阻断）。解卡 = 产品 boot overlay 内置第三行 ui-settings-general.welcomeNoticeVersion="2026-09-28.1" 等值预确认（dev/打包两形态 bare 裸启动 20s 窗口模态不现，probe6/probe6s + e2e 组零实机证）+ 上游版本常量 pin 单测（读 profile.dev vendored 副本内官方 WELCOME_NOTICE_VERSION 断言等值，升级窗口机械核查）。根因定性（三分叉择 (c)）：probe5 插桩捕获 settings/mutate RPC 响应 {ok:false, error:{code:'settings/rejected', message:'dsh: profile reload requires the root Include entry'}}——RPC 层响应携错、客户端 ConfigFormController.mutate 静默 recover() 吞细节仅示通用 welcomeError；子因 = dev 形态宿主 dsh-app-boot 模块二象性（boot/child 链 = workspace .pnpm 实例跑 mountRootInclude 记账 bootstrapIncludes WeakMap；loader 插件链 = profile.dev 平铺 vendored 物理副本的 reconcileProfilePatches 查自家空 WeakMap 恒 throw → profile patch 文档写入后被回滚＝「写零落盘」真相）。分支 (a) dshDesktop 缺席证伪（仅 onboarding payload 消费，client.js:4009-4010）；分支 (b) child 形态不持久化证伪（ConfigEditor 全链路落 profileContext.patchPath）。打包形态单容器（staging 平铺 runtime/node_modules + host-dist 同容器）静态无二象性、写路径可用。e2e 载体迁移：10 套件预确认叠层全撤（flywheel/session-workbench/knowledge-recall-flywheel dogfood 叠层保留模型行去 welcome 行；knowledge-browsing/compensation 叠层改 writeProviderOverlay 仅留 provider 行——API-key 弹窗预免防复启毒化非本任务面），smoke-skeleton 组零新增裸启动真实路径用例（无 DSH_FORGE_PATCH_FILES，20s 持续在场轮询断言模态不现——消除 e2e 全预确认盲区），断言语义零弱化（仅载体/env/清理面变更）。

## Changes

### Files Created
- tmp-ui-review/welcomeprobe5.mjs
- tmp-ui-review/welcomeprobe6.mjs
- tmp-ui-review/welcomeprobe6s.mjs
- .claude/agent-memory/forge-task-executor/dsh-forge-p1-welcome-ack-fix12.md

### Files Modified
- apps/host/src/boot/overlay.ts
- apps/host/src/boot/overlay.test.ts
- e2e/specs/smoke-skeleton.spec.ts
- e2e/specs/knowledge-integration.spec.ts
- e2e/specs/flywheel.spec.ts
- e2e/specs/installer-smoke.spec.ts
- e2e/specs/p1mvp/session-workbench.spec.ts
- e2e/specs/p1mvp/knowledge-recall-flywheel.spec.ts
- e2e/specs/p1mvp/project-registration.spec.ts
- e2e/specs/p1mvp/knowledge-browsing.spec.ts
- e2e/specs/p1mvp/project-registration-compensation.spec.ts
- e2e/specs/p1mvp/installer-smoke.spec.ts
- e2e/SMOKE-LEDGER.md
- tmp-ui-review/welcomeprobe3.mjs

### Key Decisions
- 解卡载体 = 既有产品 boot overlay（child.ts 每启重写 boot-overlay.yml，runProfile patchFiles 用户层后应用）而非 profile 模板：dev 形态不经模板物化，overlay 是唯一双形态统一缝；任务 Description 明示该落点
- welcome 版本常量 YAML 双引号标量（yamlQuote）——官方 WelcomeNoticeStore 逐字 === 比对，防 YAML 日期式再解析
- pin 测试读 profile.dev/node_modules vendored 副本（dev 形态 loader 插件链真实消费实例）而非 workspace .pnpm 路径（store hash 不稳定）；paths.test 已有同依赖先例
- 根因处置采「定性入记录、不修 dev 二象性」：修 = child 入口迁 profile 容器（大动宿主形态）；预确认落地后产品形态 welcome 写永不再发生；打包形态写路径本就单容器可用
- e2e 断言形态：裸启动模态不现用循环轮询持窗 20s（playwright toHaveCount(0) 即时通过盖不住迟到挂载——实测无预确认挂载 ~+7s）；标题级判别（预览版说明|Preview Notice）避开 API-key onboarding 模态误伤

## Test Results
- **Tests Executed**: Yes
- **Passed**: 141
- **Failed**: 0
- **Coverage**: 100.0%

## Acceptance Criteria
- [x] 解卡：fresh userData 裸启动（无 DSH_FORGE_PATCH_FILES）dev + 打包两形态说明模态不再出现
- [x] 根因定性入执行记录（三分叉择一 + 插桩证据）
- [x] e2e 补真实路径用例：fresh 启动不预置叠层走真实验证；既有 e2e 预确认叠层改由产品 overlay 承载后全绿、断言语义不弱化
- [x] tsc + lint + 定向单测绿

## Notes
插桩证据资产：tmp-ui-review/welcomeprobe5.mjs（RPC 响应体捕获——dsh-forge://app/api/settings/mutate 200 + settings/rejected 信封，两次点击同错）、welcomeprobe6{,s}.mjs（dev/staged 双形态裸启 20s 模态缺席验收，OVERLAY_ON_DISK 面证第三行落地）。实测验证面：单测 host 项目 126/126 + overlay 定向 6/6（含 pin）；e2e 裸跑 smoke-skeleton 4（含新增组零）+ knowledge-integration 2 + session-workbench 6（1 既有留痕 skip）+ installer-pipeline 3（pnpm dist:stage 重新物化 STAGE_OK 26454 files 后 staged runtime 含新 overlay 行）全绿；覆盖率 = 修复面 overlay.ts 语句 6/6（v8 provider 实跑输出）。静态门：tsc -b 0 错误（root/host/web 全图）+ pnpm lint 五件套 0 违规（顺带修 walkthrough 遗留 welcomeprobe3.mjs 三处 no-unused-vars——预存文件、语义零改）。已知限制（定性推论入账）：dev 形态宿主内任何 volatile 命名空间设置写（Settings 面板开关同族）因同一模块二象性恒拒——产品口径不受影响（打包形态单容器可用），后续若需 dev 形态设置面可用性再立任务。上游 pin 未动；官方 welcome 模态 UI 逻辑零改写（全部改动在产品 overlay/e2e/台账/探针面）。
