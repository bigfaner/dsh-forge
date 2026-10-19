# closed IPC 通道上无 callback 的 child.send() 异步 emit 'error'——主进程崩溃且 try/catch 不可达

## Problem

安装版（Electron 主进程）执行 `/run-dag-tasks mobile-ui` 时整 app 崩溃：原生
「A JavaScript error occurred in the main process」对话框，`ERR_IPC_CHANNEL_CLOSED`，
栈顶 `target.send (node:internal/child_process:777)` → `sendToChild (run.js:266)` →
`new Promise` → `proxy.listProjects` → `ipc/projects-rpc.js`。崩溃时 boot child 已先行
退出（IPC 通道关闭），随后任意 renderer RPC（项目解析/任务面 → `forgeProjects.listProjects`）
触发 `createBridgeChannel.call → sendToChild → child.send`。

## Root Cause

`sendToChild` 已有 try/catch 且 `child.send()` 同步返回 `false`——但现代 Node 在 closed
IPC 通道上**无 callback** 的 `send()` 还会**异步 emit `'error'`（ERR_IPC_CHANNEL_CLOSED）
到 ChildProcess 实例**（经 processTicksAndRejections）。boot ready 后 `waitForReady` 的
临时 `error` 监听已 cleanup 撤走，实例上无任何 `error` 监听——EventEmitter 的 `'error'`
特例：无监听 = 未捕获异常，主进程直接崩。try/catch（同步窗）与 `false` 返回值（同步
结算）均不可达该异步路径。对话框里的栈是**错误构造点**栈（send 调用链），极具误导性：
看起来像同步 throw 穿透了 try/catch，实际是异步事件外溢。

## Solution

`sendToChild` 的 `child.send(message, callback)` **恒携带回调**：回调在场 = 错误进回调
（console.warn 留痕），Node 不再 emit 实例 `'error'`。单一收口点覆盖全部主→子发送面
（rpc / tunnel-toggle / tunnel-fallback / pin-reset / pin-consent / shutdown）；异步写
失败的 pending 结算仍归既有 `close` 全量拒绝兜底（commit 3b66d5d7）。

## Reusable Pattern

- 长寿 `ChildProcess` + IPC 的宿主：**每次 `send` 都带 callback**，或给实例挂常驻
  `on('error')` 监听；二选一缺位，closed 通道上的一次 send 就是宿主进程崩溃。
- 排障判据：崩溃栈停在 `target.send` 且外层明明有 try/catch → 不是同步 throw，查
  `Emitted 'error' event` 类异步外溢。
- 最小复现：spawn 带 `ipc` 的子进程 → 等其 `close` → `child.send(msg)`（无 callback）
  → 进程以未捕获 `ERR_IPC_CHANNEL_CLOSED` 退出（node 24.9 实测；Electron 内置 Node 同源）。
- 测试定式：真实 spawn + close 后经生产 API 触发 send，断言实例 `error` 事件零触发
  （监听在场使其可观测而非致命）——见 `apps/host/src/boot/run.test.ts`
  「closed 通道 send 的异步 error 外溢」组。

## Related Files

- `apps/host/src/boot/run.ts` — `sendToChild` / `waitForReady`（error 监听生命周期）
- `apps/host/src/boot/run.test.ts` — 契约 + 真实 IPC 集成回归
