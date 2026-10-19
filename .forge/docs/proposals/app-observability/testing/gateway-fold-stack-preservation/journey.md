---
feature: "app-observability"
journey: "gateway-fold-stack-preservation"
risk_level: "Medium"
surface_types: ["web"]
surface_keys: ["host"]
sources:
  - .forge/docs/proposals/app-observability/proposal.md
  - .forge/docs/proposals/app-observability/review/report.md
generated: "2026-10-19"
---

# Journey: gateway-fold-stack-preservation

**Risk Level**: Medium

## Overview

模拟网关错误折叠（`gateway/internal` 类非 RemoteError）→ 日志含**原始 TypeError 栈帧**（含函数名与文件行号）——缺口①「网关 dispatch 折叠错误时丢弃原始栈」的消除验证（方案 3 ↔ 验收 2）。取证纪律：折叠模拟在真实网关调用路径上触发（真实 dispatch 走到折叠点），落盘行必须携带抛出点原始栈，**不可 fake**——不得手写栈文本塞入日志。

## Setup

- 宿主以可触发网关错误折叠的生境运行（可控上游/受控注错挂点，使 dispatch 路径真实产生 `gateway/internal` 类错误）
- `data/logs/app-*.jsonl` 就绪，记录行数基线
- 已知注错后预期的原始 TypeError 抛出点（函数名 + 文件行号，供事后断言比对）

## Happy Path

### Step 1: 触发网关错误折叠

**User Action**: 经受控挂点使一次真实网关 dispatch 抛出非 RemoteError 的内部错误（如 TypeError），走完折叠路径

**Expected Result**: 下游用户可见行为与既有契约一致（错误被折叠为既有错误呈现）——折叠点落栈不影响下游语义；诊断事件已在抛出点 emit（栈在手上，与下游如何被吞无关）

### Step 2: 断言日志含原始栈帧

**User Action**: 打开 `data/logs/app-*.jsonl`，检索该次折叠的诊断行

**Expected Result**: 新增一行 `event` 标识网关折叠（如 `gateway-fold`）、`level=error`；`stack` 字段含**原始 TypeError 栈帧**——断言三点：错误类型名（TypeError）、抛出函数名、文件行号三者与 Step 1 已知抛出点一致（非折叠后的泛化消息、非下游重组栈）

### Step 3: 断言折叠不吞上下文

**User Action**: 核对该行其余字段

**Expected Result**: `timestamp`/`process`/`message` 恒在；可用时携带 `sessionId`/`projectId`/`cwd` 上下文段；若该错误处于某次发送链内，`trace_id` 同链携带（与旅程②口径一致）

## Edge Cases

### Step 1b: RemoteError 不走折叠落栈

**Precondition**: 上游返回合法 RemoteError（业务错误语义，非内部错误）

**User Action**: 触发一次 RemoteError 类失败

**Expected Result**: 不触发 `gateway-fold` 诊断行（折叠落栈仅对 `gateway/internal` 类非 RemoteError 生效）；RemoteError 既有处理路径零变化

### Step 1c: 折叠点挂接循官方缝

**Precondition**: 检查点——折叠点挂接方式（TypertGatewayService.invokeRpc 方法 wrap + wireStream.failure 属性替换，评审已核销）

**User Action**: 注错后观察官方包行为

**Expected Result**: 官方包零改制（文件哈希不变）；挂接只落在官方留缝；官方机械既有行为（折叠本身）不被改变

### Step 2b: 栈被下游吞掉后仍可取证

**Precondition**: 折叠后的错误再经一层捕获（toast 面等）不再外泄

**User Action**: 触发会走到深层捕获的折叠错误

**Expected Result**: 日志行仍含原始栈——落栈发生在抛出点，不依赖下游任何环节的转交（缺口①的核心断言）

### Step 2c: 高频折叠噪音不淹没日志

**Precondition**: 短时间触发多次折叠错误

**User Action**: 连续注错多笔

**Expected Result**: 每笔各落一行（错误类事件不做同文折叠丢失——或按噪音治理策略折叠计数但计数事实落盘）；JSONL 仍逐行可解析；业务路径零阻塞

## Journey Invariants

- 栈在抛出点即在手上——落栈与下游如何被吞、如何呈现完全解耦
- 折叠点挂接只循官方留缝（方法 wrap / 属性替换），官方包零改制、折叠既有语义零变化
- 诊断埋点零行为差异：折叠错误的用户可见呈现与落地前一致
- 日志行携带的栈 = 抛出点原始栈（类型名/函数名/行号可断言），非下游重组
