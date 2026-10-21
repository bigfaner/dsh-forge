---
feature: "app-observability"
journey: "dist-win-packaged-observability"
risk_level: "High"
golden_path: true
surface_types: ["web"]
surface_keys: ["host"]
sources:
  - .forge/docs/proposals/app-observability/proposal.md
  - .forge/docs/proposals/app-observability/review/report.md
  - .forge/docs/proposals/app-observability/testing/packaged-error-four-route-capture/journey.md
  - .forge/docs/proposals/app-observability/testing/prompt-send-trace-id-full-chain/journey.md
generated: "2026-10-19"
---

# Journey: dist-win-packaged-observability

**Risk Level**: High

## Overview

在 **dist:win 打包产物**（非 dev 生境、无终端窗口）上完成观测面取证闭环：`pnpm dist:win` 构建 + staging 装配物化 → 打包 exe 真机启动 → 四路注错（main 兜底钩 / child stderr / renderer console / host IPC handler）→ `data/logs/app-*.jsonl` 各落一条含完整栈的结构化行 → 错误回包 causeStack 生境断言（生产零税）→ 一次真实 prompt 发送全链共享同一 `trace_id`。这是提案验收 1/6/7 在打包形态上的合流取证面——dev profile 启动无法承载的缺口由此旅程闭合。

**取证纪律（不可 fake，硬边界）**：真实多进程（打包运行中的 main/child/renderer）取证——四路注入必须在各自真实进程内发生，trace_id 必须从真实传播机制（ALS 进程内 + bridge 显式携带）取到；不得以单进程 stub 事件、伪造 JSONL 行、预生成 id 硬塞替代。**装配面取证纪律适用**：dist:win 装配（staging 物化 + electron-builder 封包）属外部依赖装配面，fake/单测绿灯不算数，以打包 exe 真机端到端取证为结算门。

## Setup

- **dist:win 构建前置**：完整执行 `pnpm dist:win`（= `pnpm build` → `pnpm dist:stage` → `node scripts/dist-win.mjs`），产物 `release/installer/win-unpacked/dsh-forge.exe`。**陈旧 release 伪装回归防线**：构建产物时间戳必须晚于本轮被测改动 commit——先重建、后取证，禁复用旧包冒充
- **装配物化核销**：`release/staging` 内 `runtime/host-dist`、`runtime` hoisted 运行时树、`web-dist`、`staging-manifest` 齐备（`MATERIALIZE_ONLY` 幂等校验面可复用）；被测改动涉及的闭包（如日志链代码）确认已进 staging
- **非 dev 生境**：直接启动打包 exe（无终端窗口、`DSH_FORGE_DEV_PROFILE` 未设）——禁以 dev profile 启动替代打包形态
- 已注册项目并打开可用会话（`projectId`/`sessionId`/`cwd` 可用；模型链可真实完成一次发送）
- `data/logs/` 可写；测试前记录既有 `app-*.jsonl` 行数基线与时间戳游标
- 打包版内四路注错入口可用（测试专用 IPC 命令或受控触发场景，随包装配）

## Happy Path

### Step 1: 四路注错 → JSONL 栈行落位

**User Action**: 经打包版内注错入口依次注入：① main 进程未捕获异常（可辨识标记 + 深层调用栈）；② child 进程 stderr 输出含栈错误文本；③ renderer `console.error`（`Error` 对象带栈）；④ 经 `dshForge.invoke` 调用会抛错的 IPC handler

**Expected Result**: `data/logs/app-*.jsonl` 各新增一行——`process` 如实标注 main/child/renderer/main、含完整 `stack`（函数名 + 文件位置）、`level=error`；④ 的错误回包同时正常返回调用方（业务语义不破，rpc-envelope 单点）；会话/项目域行含 `projectId`/`sessionId`/`cwd`

### Step 2: causeStack 回包生境断言（打包形态 = 生产零税）

**User Action**: 检查 Step 1-④ 的错误回包 `details` 字段

**Expected Result**: 打包形态（生产生境）回包 `details` **无** `causeStack` 字段（零税面成立）；dev 生境的 causeStack 正向断言（DevTools Network 可见）归 dev 旅程与验收 4 承载，本旅程不跨生境混跑

### Step 3: 一次真实 prompt 发送 → 全链同 trace_id

**User Action**: 在打包版会话输入框发送一条含唯一 token 的短 prompt，等待发送链完成

**Expected Result**: 发送正常完成；`app-*.jsonl` 出现该次发送的 `prompt` 诊断行，携带新 `trace_id`（非 `-`）；以该 id 过滤——`judge`/`reroute`/`sessionCreate`/`attachment` 等派生调用行全部命中同一 trace_id（无一行掉链）；child 侧同链行同样携带（bridge 显式携带生效），`process` 字段如实标注

### Step 4: 无 trace 行占位与格式完整性

**User Action**: 检查非本发送链的日志行（启动期、后台轮询、Step 1 的四路错误行）

**Expected Result**: 无 trace_id 的行 `trace_id` 字段为 `-` 占位；全文件 JSONL 逐行可解析（jq 零报错）；固定字段（timestamp/level/process/message）恒在

## Edge Cases

### Step 1b: 崩溃路径豁免（打包形态核心证据不丢）

**Precondition**: 注入 uncaughtException 路径错误（必然伴随 main 退出）

**User Action**: 注错后等待打包 exe 的 main 退出，再读日志文件；随后重启 exe

**Expected Result**: 兜底钩行已落盘（同步写/退出前 flush 豁免生效）；重启后日志文件继续追加（滚动/追加模式不破）——打包版无终端，此文件是唯一证据面

### Step 1c: child spawn 'pipe' 形态核销（打包版内）

**Precondition**: 打包 exe 运行中观察 child stderr

**User Action**: 触发 child 注错

**Expected Result**: stderr 经 `'pipe'` 管道进入 main 转译落行——若打包闭包内 spawn 回退 `inherit`（不可拦截），本路取证如实记红，不以 main/renderer 日志行冒充

### Step 2b: 两次连续发送 trace 隔离

**Precondition**: 第一条 prompt 未完成时（或紧接其后）发送第二条

**User Action**: 连续发送两条可区分 prompt

**Expected Result**: 两条链各持独立 trace_id，派生行不串线

### Step 2c: 注错前后业务零行为差异

**Precondition**: 四路注错入口由正常 UI 流程触发

**User Action**: 注错前后各执行一次正常业务操作（会话发送、项目切换）

**Expected Result**: 用户可见行为与注错前无差异（诊断埋点零行为差异）；日志写失败/背压场景业务不受阻（降级计数，与旅程④衔接）

### Step 3b: 既有漂移不纳入断言（边界声明）

**Precondition**: 取证过程中观察到非本提案域的基线红灯

**User Action**: 核对红灯归属

**Expected Result**: scaffold / worker-face / e2e-baseline 既有漂移**不纳入本旅程断言**（由基线收口任务承接）；下游 contracts/test scripts/run-tests 不得为消除上述红灯修改断言或被测代码

## Journey Invariants

- 全程打包形态（dist:win 产物、非 dev 生境、无终端）；dev profile 启动的取证对本旅程无效
- 装配面先重建后取证：staging/exe 时间戳晚于被测改动 commit，陈旧 release 视为无效证据
- 真实多进程取证不可 fake：四路注入在各自真实进程内发生，trace_id 来自真实传播机制
- 四路证据收敛到 main 唯一写者的单一 JSONL 文件（排查 = 打开一个文件）；打包版 CDP 端口不开放
- 生产生境零税：错误回包无 `causeStack`；诊断埋点注错前后用户可见行为不变
- 既有漂移（scaffold/worker-face/e2e-baseline）排除在断言外，归属基线收口任务
