---
feature: "app-observability"
journey: "packaged-error-four-route-capture"
risk_level: "High"
golden_path: true
surface_types: ["web"]
surface_keys: ["host"]
sources:
  - .forge/docs/proposals/app-observability/proposal.md
  - .forge/docs/proposals/app-observability/review/report.md
generated: "2026-10-19"
---

# Journey: packaged-error-four-route-capture

**Risk Level**: High

## Overview

打包形态（无终端）下，四路错误源（main 兜底钩 / child stderr / renderer console / host IPC handler 捕获错误）分别注入测试错误 → `data/logs/app-*.jsonl` 各出现一条含完整栈的结构化行；会话/项目域错误行携带 `projectId`/`sessionId`/`cwd`。这是提案需求锚点「排查 = 打开一个文件」的核心场景（方案 1/2/4 ↔ 验收 1），本特性 Golden Path。取证纪律：真实多进程（打包运行中的 main/child/renderer 三进程）取证，四路注入必须在各自真实进程内发生，**不可 fake**——不得以单进程 stub 事件或伪造 JSONL 行替代。

## Setup

- 应用以**打包形态**运行（无终端窗口，非 dev 生境，`DSH_FORGE_DEV_PROFILE` 未设）
- 已注册项目并打开一个会话（保证 `projectId`/`sessionId`/`cwd` 可用）
- `data/logs/` 目录可写，测试前记录既有 JSONL 行数基线
- 四路注入探针已装配（打包版内的注错入口，如测试专用 IPC 命令或受控触发场景）

## Happy Path

### Step 1: 注入 main 兜底钩错误（uncaughtException / unhandledRejection）

**User Action**: 通过注错入口在 main 进程触发一次未捕获异常（含可辨识标记消息与深层调用栈）

**Expected Result**: `app-*.jsonl` 新增一行：`process=main`、含完整 `stack`（栈行含函数名与文件位置）、`level=error`、`event` 标识兜底钩来源；崩溃路径豁免成立——该行经同步写/退出前 flush **确定落盘**（进程退出后行仍在）

### Step 2: 注入 child stderr 错误

**User Action**: 在 child 进程（worker）中经 stderr 输出一条含栈的错误文本（真实 spawn `'pipe'` 管道链路）

**Expected Result**: JSONL 新增一行：`process=child`、stderr 内容被 main 转译为诊断事件后落行、栈行完整（回显转写不截断栈帧）、`timestamp` 为转译时刻

### Step 3: 注入 renderer console 错误

**User Action**: 在 renderer 中调用 `console.error`（含 `Error` 对象带栈）——模拟「被 UI 层捕获但从不外泄」的证据缺口②场景

**Expected Result**: JSONL 新增一行：`process=renderer`、`level=error`、消息与栈完整（console-message 官方事件转译）；`console.warn` 同样落行（`level=warn`）；同文重复行折叠计数生效（折叠行不丢计数事实）

### Step 4: 注入 host IPC handler 捕获错误

**User Action**: 经 `dshForge.invoke` 调用一个 handler 会抛错的 IPC 方法（rpc-envelope 信封单点路径）

**Expected Result**: 错误回包正常返回给调用方（业务语义不破）**且** JSONL 同步新增一行：`event` 标识 `ipc-handler`、含完整栈——「捕获即静默」面消除（验收 6 同源场景）

### Step 5: 检查上下文字段与行格式

**User Action**: 打开 `data/logs/app-*.jsonl`，逐行核对四路新行的固定字段全集

**Expected Result**: 每行 `timestamp`（UTC ISO 8601）/`level`/`process`/`message` 恒在；会话/项目域错误行含 `projectId`/`sessionId`/`cwd`（可用者呈现，三字段均缺席则上下文段省略）；无 trace_id 行以 `-` 占位且 JSONL 格式不破（jq 可逐行解析）

## Edge Cases

### Step 1b: main 错误触发进程退出（崩溃路径豁免验证）

**Precondition**: 注入的错误选择 uncaughtException 路径（必然伴随退出的形态）

**User Action**: 注错后等待 main 退出，再读日志文件

**Expected Result**: 兜底钩行已落盘（同步写/flush 豁免生效）——核心证据行不因退出丢失；应用重启后日志文件可继续追加（滚动/追加模式不破）

### Step 2b: child stdout 背压/暂停

**Precondition**: child 进程高频输出使管道进入背压

**User Action**: child 持续 console 输出超过管道消费能力

**Expected Result**: main 侧丢弃超量行 + 内存计数（宁丢日志不卡业务）；child 的 console 调用**不阻塞**（业务路径零反压）；计数事实可从落盘行或重启摘要确认

### Step 2c: child spawn 形态核销

**Precondition**: 检查点——child spawn 必须为 `'pipe'`（`inherit` 不可拦截）

**User Action**: 打包运行中观察 child stderr 是否可被捕获

**Expected Result**: stderr 经管道进入 main（若 spawn 回退为 inherit 则本旅程 Step 2 取证失败——如实记红，不以其他进程日志行冒充）

### Step 3b: renderer 低级别日志不转发

**Precondition**: renderer 输出 `console.log`/`console.info` 级别内容

**User Action**: renderer 混合输出多级别日志后核对日志文件

**Expected Result**: 仅 warn/error 级落行（转发限级成立）；log/info 级零落行、零性能税

### Step 4b: IPC handler 错误时调用方语义不变

**Precondition**: 注错 handler 的调用方为正常 UI 流程

**User Action**: UI 触发该 IPC 调用

**Expected Result**: 调用方收到与既有契约一致的错误回包（错误提示行为与提案落地前无差异）——诊断埋点零行为差异；日志落行不阻塞回包（fire-and-forget）

### Step 5b: 日志文件缺目录/写失败

**Precondition**: `data/logs/` 不可写（句柄占用或权限收窄）

**User Action**: 四路任一注错

**Expected Result**: 业务路径不受阻照常完成；写失败降级为内存计数不反压；应用不因日志链故障崩溃

## Journey Invariants

- 统一日志汇 = main 唯一写者的单一 JSONL 文件（方案 A：central 单文件）；四路证据全部收敛到同一文件，排查 = 打开一个文件
- 所有埋点 = 一次诊断事件 emit；appender 为 `diag/log` 事件域唯一订阅者；四路取证不产生对 appender 的静态依赖
- appender 写盘 fire-and-forget，业务路径永不 await；唯一豁免 = 崩溃路径兜底钩行（同步写/flush 确定落盘）
- 打包版 CDP 端口不开放；诊断能力只由日志链承担
- 每行 JSONL 固定字段恒在（timestamp/level/process/message），可选字段缺席省略；无 trace_id 以 `-` 占位
- 诊断埋点零行为差异：四路注错前后，UI/业务契约行为不变
