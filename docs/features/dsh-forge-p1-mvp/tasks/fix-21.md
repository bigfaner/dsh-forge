---
id: "fix-21"
title: "Fix(P0): 侧栏「＋」点击后系统文件浏览器不出现——host 侧 showOpenDialog 无 parent 无前台激活（Windows z-order 偶发不可见），对齐官方 host-directory-picker 前台工程"
priority: "P0"
estimated_time: "2h"
complexity: "medium"
dependencies: []
surface-key: ""
surface-type: "web"
breaking: false
type: "coding.fix"
mainSession: false
---

# Fix(P0): 「＋」直达系统对话框——无 parent 前台权缺陷

> 来源：走查人实机（2026-10-04）「左侧栏：点击添加项目图标按钮没有出现文件浏览器」。用户预期＝点击即出系统「选择文件夹」对话框（fix-16 直达语义）。

## 症状与探针裁决（tmp-ui-review/fix21-probe{,2,3}.mjs）

点击「＋」后**无任何可见反馈**（无 OS 对话框、无模态）。探针三轮定谳（spawn+CDP+净化 env、dev profile、隔离 userData）：

- **直达链全通**：几何命中 ✓（elementFromPoint=钮内 svg）；点击事件派发 ✓（捕获期 pointerdown/click 落 svg）；`handle.open()` 真被调（页内对象包装计数 1→2 ✓）；`pick()` 被真实调用（contextBridge 代理吞写——包装读回 `writeStuck:false`，前两轮 pickEvents 空是**仪器假象**）；
- **系统对话框确实打开**：点击后进程 `MainWindowTitle` 翻为「选择文件夹」（PowerShell 枚举，两轮复现）——当前 dist 机制面**工作正常**；
- 探针机前台时序恰好拿到前台权 → 对话框可见；**用户长驻实例前台权丢失 → 对话框开在主窗后面/不可见** → 叠加 fix-16「取消＝静默干净退出（模态不出场）」→ 零反馈。

## Root Cause（源码级）

[apps/host/src/main.ts:79](../../../apps/host/src/main.ts)：

```ts
registerDirectoryPickerChannel(ipcMain, () => dialog.showOpenDialog({ properties: ['openDirectory'] }))
```

`dialog.showOpenDialog` **无 parent 窗口**、从 `ipcMain.handle` 回调（main 进程）发起——Windows 前台激活权（foreground activation rights）不在手时对话框**不置顶**（开在别的窗后/不激活），是 Electron/Win32 已知行为域。

**官方对齐证据**（同问题官方专门工程化解决）：[@deepseek-ai/dsh-host-directory-picker-native/lib/index.js](../../../apps/host/profile.dev/node_modules/@deepseek-ai/dsh-host-directory-picker-native/lib/index.js) Windows 路径**不用** Electron dialog——spawn 子进程跑 COM `IFileOpenDialog`，且「*preceded by a synthesized Alt press so the dialog activates as foreground even when a background host spawned the child*」（spawnDialogWorker 注释 :68-71 + 模块注释 :280-283）。官方把「对话框必出前台」当硬语义；产品薄宿主是 Electron main、有窗口在手，官方等价机制 = **parent 窗口形参**（Electron 原生支持：对话框对父窗模态 + 正确 z-order/前台）。

次因（顺手对齐）：官方对话框标题 `DIALOG_TITLE = "Select Workspace Directory"`（:111）；产品当前缺省标题（「打开」）。

## Description

**给对话框挂 parent 窗口**（机制修正，不动 fix-16 流程语义）：

- `registerDirectoryPickerChannel`（[apps/host/src/ipc/directory-picker-channel.ts:31](../../../apps/host/src/ipc/directory-picker-channel.ts)）通道签名升级：handler 收 `event` → `BrowserWindow.fromWebContents(event.sender)` 作 `showOpenDialog(parent, { properties: ['openDirectory'], title })` 的 parent；
  - `OpenDirectoryDialog` 注入形状相应调整（main.ts 绑定 lambda 传入 electron `BrowserWindow` 工厂或由通道内解析——保 electron 依赖隔离 + 可测注入面）；
  - parent 解析为 null（sender 无窗，理论不可达）→ 回退现行无 parent 形参（fail-soft，不比现状差）；
- title 对齐官方（`Select Workspace Directory`；若产品文案口径要中文，与官方英文标题不一致时以官方为准记录备注）；
- 单测：通道 handler 经 fake ipcMain 捕获 event.sender → 断言 parent 传入 + title；现有 directory-picker-channel.test.ts 扩展；
- 验收（双形态 dev + packaged）：
  1. 主窗失焦态（先点其他应用窗）点「＋」→ 对话框**仍立即出现在主窗之上**（前台/模态）；
  2. 选目录 → 表单相位模态揭示；取消 → 静默干净退出（现行语义不变）；
  3. 表单「浏览…」/repick 同径受益（同一通道）。

## 探针/证据

- 机制链证据：tmp-ui-review/fix21-probe2.mjs（flowOpens 计数 + 几何 + 事件层）、fix21-probe3.mjs（contextBridge 吞写读回 + MainWindowTitle=「选择文件夹」两轮）；
- 截图：tmp-ui-review/fix21-A-after-add.png（点击后页面无模态——取消静默语义侧证）。

## 边界与不做

- 不改 fix-16 状态机/相位语义（取消静默是设计：冷启直达取消零模态残留）；
- 不引入官方 koffi/子进程 COM 方案（我们是 Electron main，parent 形参即官方语义等价物；官方方案解决的是「无窗口 node 宿主」场景）；
- macOS/Linux 形态：parent 形参跨平台一致受益，无需分支。
