---
status: "completed"
started: "2026-10-04 15:09"
completed: "2026-10-04 15:22"
time_spent: "~13m"
---

# Task Record: fix-28 Fix: typed error 跨 boot-child 桥灭失——dispatchRpc catch 只保 message（code/data 丢）→ 信封判型失败 fail-loud → Electron reject 包装 → UI 错误文案分支全灭（恒默认分支）

## Summary
typed error 跨 boot-child 桥保真（fix-28）：recovery 前提证伪（全分支零 fix-28 提交、apps 零未提交改动、bridge.ts 仍纯 string 形态——「前次已完成实现」不成立），按派发注记转真实现。桥错误面三处落地：BridgeRpcResultMessage.error 双形态（string | {code?,message,data?}）+ 子侧 serializeBridgeError（serializeRpcError 判型镜像，contracts ERROR_CODES import——rpc-envelope 同源先例）+ 主侧 rebuildBridgeError 纯函数（run.ts pending 表 reject 位消费）重建带 code/data 的 Error → rpcEnvelope 判型通过 → 带内 RpcErr 信封 → renderer RpcClientError instanceof 恢复命中 → UI 六码文案映射通路（child 产品形态下首次生效）。wire 兼容：string 旧形态原样（非 typed fail-loud 语义零回退）；伪造码最终门仍在 serializeRpcError（单一判型源）。e2e 走查另实证 fix-27 遗留 Step3c 夹具缺陷（占位 seed 缺前置活删 → seed 自撞 UNIQUE(workspace_id) 恒红 + attachExistingRow 幂等消费令 ③ 不可达）并修复——两分支标题断言（补偿已执行/挂接未补偿）均实机绿。

## Changes

### Files Created
无

### Files Modified
- apps/host/src/boot/bridge.ts
- apps/host/src/boot/run.ts
- apps/host/src/boot/bridge.test.ts
- apps/host/src/ipc/rpc-envelope.test.ts
- e2e/specs/p1mvp/project-registration-compensation.spec.ts

### Key Decisions
- recovery 存在性对照（全分支 grep fix-28 零命中 + apps 工作树零改动 + 落点文件逐行核对）证伪「已实现」前提——依派发翻转注记直接真实现（fix-6 形态第六例），非 blocked
- 判型镜像自持 bridge.ts（host 禁 import core 错误类 pin 保持——结构同型即判型）；重建逻辑亦落 bridge.ts 纯函数面（进程编排归 run.ts 的既有模块分工），消费点 = run.ts rpc-result 结算 reject 位（call 链源头——代理面 reject 已是重建后 Error，createBridgeProxy 零改动）
- rebuildBridgeError 防御性双形态解码（message 非法字符串化降级绝不抛——child/main 版本错配期不炸）；code 属性按在场透传不再复验（envelope 面单源复验伪造码拒绝）
- Step3c 夹具修复（fix-27 遗留、本任务走查发现）：占位 seed 前补 WAL 活删 own-a 应用侧行（挂接可达前置 = 应用库零行，同 Step1/2 口径），终态行数断言 1→0；修复属任务文件预见范围（「fix-27 幂等化后改用可构造场景」）
- e2e 判别力强化：failure 面板「注册失败」Tag 常驻故旧 containText 断言在桥灭失期也绿（补偿细节由 .dswf-ap-raw 原始 message 携带）——改以 .dswf-ap-feedback-title toHaveText 钉分支文案

## Test Results
- **Tests Executed**: Yes
- **Passed**: 987
- **Failed**: 0
- **Coverage**: 81.7%

## Acceptance Criteria
- [x] AC1 人为触发 typed 失败（测试面）：UI 失败面板标题命中对应分支（如「应用库写入失败（补偿已执行）」），非「未预期错误」
- [x] AC2 非 typed 编程错误仍 fail-loud 上抛（Electron reject 面可见）——语义不回退
- [x] AC3 桥单测双形态（string/结构化）解码通过
- [x] Desc1 桥错误结构化：BridgeRpcResultMessage.error 双形态 + 子侧 catch 判型镜像 serializeRpcError（bridge.ts 自持，contracts ERROR_CODES 可 import）
- [x] Desc2 主侧代理重建：结构化 error → 带 code/data 的 Error → rpcEnvelope 判型通过 → 带内 {ok:false,error:{code,message,data}} 信封
- [x] Desc3 wire 兼容：error 字段双形态解码（string 旧形态现行为 / 结构化新形态）——版本错配期不炸
- [x] Desc4 单测（bridge.test.ts 双形态 + rpc-envelope.test.ts 桥重建判型）+ e2e typed 失败 UI 标题分支断言

## Notes
质量门（终态复跑）：compile=playwright --list 62 例（worktree 映射 -c e2e/playwright.config.ts）；fmt=仓内无 formatter（oxlint 风格道等价，0 违规）；lint=pnpm lint 全五段 EXIT=0（含 tsc -b）；unit=987/987（30/30 于两个触达测试文件；vite dockkit sourcemap ENOENT 为已知环境噪音）。e2e 零褪色实证（单 spec 两例，继承用户 TMP）：compensation 冒烟 39.7s 绿（含新增「应用库写入失败（补偿已执行）」标题断言）；Step3c 37.2s 绿（夹具修复后「应用库写入失败（挂接既有，未补偿）」标题断言）。coverage 81.67 = vitest --coverage(v8) 全仓语句面实测；触达面 boot/bridge.ts 100% lines（95.77% stmts——残差为既有守卫分支），run.ts 8% = 进程编排面归 e2e 口径（fix-25 同径）。知识通道（同桥）自动受益（任务边界注记），未单独接线。
