---
id: "fix-28"
title: "Fix: typed error 跨 boot-child 桥灭失——dispatchRpc catch 只保 message（code/data 丢）→ 信封判型失败 fail-loud → Electron reject 包装 → UI 错误文案分支全灭（恒默认分支）"
priority: "P1"
estimated_time: "2h"
complexity: "low"
dependencies: []
surface-key: ""
surface-type: "web"
breaking: false
type: "coding.fix"
mainSession: false
---

# Fix: typed error 跨桥保真（code/data 过 child 桥）

> 来源：fix-27 走查实机呈现：「应用库写入失败（补偿已执行）」typed 细节在文案里，但 UI 标题落「注册失败（**未预期错误**）」默认分支——code 映射失效的独立缺陷。

## 根因（源码逐跳实证）

错误跨三跳，第二跳灭失：

1. **child（core 服务）**：`ProjectWriteError`（typed：`code='ERR_PROJECT_WRITE'` + `data.compensated`）正常抛出 ✓；
2. **child→main 桥**（[apps/host/src/boot/bridge.ts:164-167](../../../apps/host/src/boot/bridge.ts) `dispatchRpc` catch）：`error = cause instanceof Error ? cause.message : String(cause)` —— **BridgeRpcResultMessage.error 为纯 string，code/data 全灭**；
3. **main RPC 边界**（[rpc-envelope.ts:17-22](../../../apps/host/src/ipc/rpc-envelope.ts) `serializeRpcError`）：收到无 code 普通 Error → 判型 undefined → 按「非 typed fail-loud」设计**原样上抛** → Electron `ipcRenderer.invoke` reject 包装（"Error invoking remote method…"）→ renderer 侧 `toFlowFailure` 的 `RpcClientError` instanceof 失败 → code=null → **registerFailureCopy 恒默认分支**。

影响面：全部 `forge:*` 通道的 typed 错误呈现（六码文案映射 + compensated 口径）在 child 形态（产品唯一形态）下**从未生效过**——非 register 独有。

## Description

1. **桥错误结构化**：`BridgeRpcResultMessage.error: string` → `string | { code?: string; message: string; data?: unknown }`——子侧 catch 判型镜像 `serializeRpcError` 逻辑（Error 且 code ∈ ERROR_CODES → 结构化；否则 message string——fail-loud 语义不变）；
   - 判型逻辑放 bridge.ts 内自持（host 禁 import core 源码结构 pin 保持；contracts ERROR_CODES 可 import——rpc-envelope 同源先例）；
2. **主侧代理重建**：`createBridgeProxy` 的 call 链收到结构化 error → 重建带 `code`/`data` 属性的 Error（普通 Error + 赋属性，或复用 rpc-envelope 侧形状）→ `rpcEnvelope` 判型通过 → 带内 `{ok:false,error:{code,message,data}}` 信封 ✓；
3. **wire 兼容**：error 字段双形态解码（string 旧形态 = 无 code——现行为；结构化新形态）——child/main 版本错配期不炸；
4. 单测：bridge.test.ts 补「typed error 过桥结构化保真 / 非 typed string 形态不变 / 双形态解码」；rpc-envelope.test.ts 补「桥重建 Error 判型通过」；e2e 或 dogfood：触发一个 typed 失败（如注册 UNIQUE 场景——fix-27 幂等化后改用可构造场景）断言 UI 标题命中分支文案。

## 验收

1. 人为触发 typed 失败（测试面）：UI 失败面板标题命中对应分支（如「应用库写入失败（补偿已执行）」），非「未预期错误」；
2. 非 typed 编程错误：仍 fail-loud 上抛（Electron reject 面可见）——语义不回退；
3. 桥单测双形态（string/结构化）解码通过。

## Reference Files

- [apps/host/src/boot/bridge.ts](../../../apps/host/src/boot/bridge.ts)（:49-56 消息形状 / :159-168 dispatchRpc catch / :174-184 主侧代理）；[apps/host/src/ipc/rpc-envelope.ts](../../../apps/host/src/ipc/rpc-envelope.ts)（判型镜像源）；apps/web/src/flows/add-project/flow-model.ts `toFlowFailure`/`registerFailureCopy`（文案映射消费面）；apps/web/src/rpc/（RpcClientError 重建面）
- 关联：fix-27（本缺陷的发现场景）、fix-1（桥建制）

## 边界与不做

- 不改 rpcEnvelope 的 fail-loud 设计（非 typed 上抛语义正确）；
- 不动 child 侧错误类定义（结构同型判型——既有口径）；
- knowledge 通道（同桥）自动受益，无需单独接线。
