---
feature: "app-observability"
journey: "prompt-send-trace-id-full-chain"
risk_level: "Medium"
surface_types: ["web"]
surface_keys: ["host"]
sources:
  - .forge/docs/proposals/app-observability/proposal.md
  - .forge/docs/proposals/app-observability/review/report.md
generated: "2026-10-19"
---

# Journey: prompt-send-trace-id-full-chain

**Risk Level**: Medium

## Overview

真实发送一次 prompt → 该次发送派生链上的全部诊断日志行（prompt / judge / reroute / sessionCreate / attachment）共享同一 `trace_id`——跨进程证据可对齐，回答「哪次请求」（提案缺口④ ↔ 方案 7/13 ↔ 验收 7）。取证纪律：走真实发送链路（host prompt dispatch 入口 → 拦截层派生调用 → child bridge），trace_id 必须从真实传播机制（AsyncLocalStorage 进程内 + bridge 显式携带）取到，**不可 fake**——不得预生成 id 硬塞日志行。

## Setup

- dev 或打包生境均可（trace_id 非诊断增强，两种生境均生效；dev causeStack 断言不在本旅程）
- 已注册项目并打开可用会话（模型链可真实完成一次发送）
- `data/logs/app-*.jsonl` 就绪；测试前记录行数基线与时间戳游标

## Happy Path

### Step 1: 发送一次 prompt

**User Action**: 在会话输入框发送一条短 prompt（可辨识标记，如含唯一 token 的消息），等待发送流程完成

**Expected Result**: 发送链正常完成（回复照常返回）；`data/logs` 中出现该次发送的 `prompt` 诊断行，携带新生成的 `trace_id`（非 `-`）；同一次发送全程无第二 trace_id

### Step 2: 核对派生调用同 trace_id

**User Action**: 以 Step 1 的 trace_id 过滤 JSONL 行

**Expected Result**: `judge`/`reroute`/`sessionCreate`/`attachment` 等同链派生调用的诊断行全部命中同一 trace_id——拦截层为天然挂点，ALS 包裹覆盖全部派生调用；无一行派生调用掉链（trace_id=`-`）

### Step 3: 核对跨进程显式携带

**User Action**: 继续以同一 trace_id 过滤，检查 main↔child bridge 侧的诊断行

**Expected Result**: child 侧同链行同样携带该 trace_id（ALS 过序列化断点的显式传递生效）；`process` 字段如实标注所在进程

### Step 4: 核对无 trace 行的占位格式

**User Action**: 检查非本发送链的日志行（如启动期、后台轮询）

**Expected Result**: 无 trace_id 的行 `trace_id` 字段为 `-` 占位，JSONL 逐行可解析（jq 零报错），格式不破

## Edge Cases

### Step 1b: 两次连续发送 trace 隔离

**Precondition**: 第一条 prompt 未完成时（或紧接其后）发送第二条 prompt

**User Action**: 连续发送两条可区分 prompt

**Expected Result**: 两条链各自持独立 trace_id；ALS 上下文不串线（第一条的派生行不携带第二条的 id，反之亦然）

### Step 1c: 发送中途失败（上游错误）

**Precondition**: 发送链中途遇上游/网关错误

**User Action**: 发送注定失败的 prompt

**Expected Result**: 失败点前的诊断行已携带同一 trace_id（证据链对失败请求仍完整）；错误行含栈（与旅程③衔接）；发送失败的用户可见行为不变（诊断零行为差异）

### Step 2b: 链 A forge IPC 独立链

**Precondition**: renderer 经 `dshForge.invoke`（preload 单点生成 trace_id）发起链 A 调用

**User Action**: 触发一次 forge IPC 调用（非 prompt 链）

**Expected Result**: 链 A 行携带 renderer 侧 preload 单点生成的 trace_id；handler 内日志自动携带（rpc-envelope 读入 ALS）；链 A 与链 B 的 trace_id 命名空间互不混淆

### Step 2c: 诊断增强生产零税

**Precondition**: 生产生境（`DSH_FORGE_DEV_PROFILE` 未设）

**User Action**: 发送 prompt 后检查错误回包

**Expected Result**: 回包 `details` 无 `causeStack` 字段（零税成立）；trace_id 传播不受生境影响

## Journey Invariants

- trace_id 覆盖范围如实收窄为「单次发送的完整派生链」；跨 bundle 独立请求以 sessionId+时间对齐，不虚构全局 trace
- trace_id 生成点：链 A = preload 单点（`preload-api.ts` invoke 面）；链 B = 宿主 prompt dispatch 入口；进程内经 AsyncLocalStorage 传播，跨进程经 bridge 显式携带
- 官方无 trace 机械（rpcId 为对账 UUID 非关联 ID）——不依赖、不改制官方 trace；跨 bundle 固定版 UI 不可注入 header 的约束不被绕过
- 诊断埋点零行为差异：trace 注入前后发送链用户可见行为不变
- 无 trace_id 行恒以 `-` 占位且 JSONL 格式不破
