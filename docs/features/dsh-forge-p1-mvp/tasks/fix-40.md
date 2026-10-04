---
id: "fix-40"
title: "Fix: Windows 壳标题栏模式未激活——preload 缺 `<html data-platform>` / `data-windows-titlebar` / `--dsh-windows-titlebar-height` 标记，会话头右上角图标钮（右栏展开钮等）沉入原生 WCO 覆盖条不可见"
priority: "P1"
estimated_time: "3h"
complexity: "medium"
dependencies: []
surface-key: ""
surface-type: "web"
breaking: false
type: "coding.fix"
mainSession: false
---

# Fix: 会话页右上角图标按钮「太高、在边界之外看不到」（用户验收 2026-10-05 报障②）

## 症状（用户原话）

「已发送消息的对话页面右上角的图标按钮似乎太高了，在边界之外，看不到。」

## 根因（本会话勘察结论，官方源码逐点核实）

**产品 preload 从未标记桌面壳身份，官方 web 壳的 Windows 标题栏补偿全套未激活，会话头从 y=0 起排，右上角图标钮沉入原生 WCO 覆盖条（32px 白条）之下。**

证据链：

1. **宿主侧**（apps/host/src/window/create.ts:31-42，fix-2）：窗口 `titleBarStyle:'hidden'` + `titleBarOverlay:{height:32, color:'#fff'}`——原生窗口钮（最小化/最大化/关闭）**悬浮绘制在 web 内容之上**，覆盖窗口右上约 32px 带区。
2. **官方契约**（dsh-client-ui-primitives lib/index.js 注释原文）：*"the Electron preload marks `<html>` with `data-platform="darwin"`; plain web never sets it"*——**桌面壳身份标记是官方 Electron preload 的职责**，web 层只读不写（全 pnpm 树扫描：`data-platform`/`data-windows-titlebar`/`--dsh-windows-titlebar-height` 只有读取面，零写入面）。
3. **官方补偿面**（dsh-client-ui-layout client.js css）：`[data-windows-titlebar] .pI_x6G_frame{ padding-top:var(--dsh-windows-titlebar-height); ... }` + `:before` 拖拽条 + `.pI_x6G_handle{top:...}`——**整帧内容下压到原生覆盖条之下**；dockkit 读 `documentElement.style.getPropertyValue('--dsh-windows-titlebar-height')`（内联样式）；sidebar 折叠钮/新会话钮 `position:fixed; top:calc((高-28)/2)` 同模式。
4. **产品 preload**（apps/host/src/ipc/preload-api.ts + preload.mts）：只暴露 `dshForge`（boot manifest + RPC）与 `__DSH_DIRECTORY_PICKER__`——**不标 `data-platform`、不标 `data-windows-titlebar`、不设高度变量**。apps/web 壳内核（src/shell/boot.ts）同样零标记。
5. **症状落点**：有会话（已发送消息）后官方会话头在位——面包屑 + `conversation.session.header.actions`（子代理目录/团队/预设标签/任务列表图标钮）+ `.utilities`（日程/在应用中打开/日志下载图标钮）+ `.headerCorner`（**右栏展开钮 ExpandButton**，`[data-sidebar-right-expand]`，ui-sidebar-right 经 corner 槽登记，28px 图标钮，右栏收起时在渲染）——整行自 y≈0 起排，最右数钮位于 WCO 覆盖条正下方 → **不可见且不可点**（用户所述「太高、在边界之外」）。
6. 连带失活面（同根因，一并修好）：官方侧栏折叠钮/新会话钮错位（darwin 位基准）、帧顶拖拽条缺失（顶部不可拖窗）、dockkit 浮动窗顶钳制、settings 全屏覆盖层顶部内边距、右栏全屏圆角；`data-platform` 缺席另使 `detectEnvironment`（dsh-client-shortcuts）判 runtime="web" 而非 desktop（快捷键解析面受染）。

## 修复方案

**preload（apps/host preload.mts / preload-api.ts 逻辑面）在文档起跑处标记桌面壳身份**（`document.documentElement`，官方 preload 同位职责）：

1. `data-platform`：`process.platform` 直映（`darwin` / `win32`——官方消费面只比对这两值，其余平台不标或标 linux，执行时对齐 primitives 注释口径：非桌面载体本来就没有 preload，天然不标）；
2. Windows 且窗口为 WCO 形态：`data-windows-titlebar` 属性 + **内联** `--dsh-windows-titlebar-height:32px`（`documentElement.style.setProperty`——dockkit 按内联读取；值 = create.ts `titleBarOverlay.height` 单源对齐，建议抽共享常量防漂移）；
3. 标记时机：preload 顶层即标（早于任何 React 渲染——官方注释「may arrive as late as DOMContentLoaded」容忍迟到，但早起无害且消除闪烁窗）；
4. 单测：preload-api 逻辑面注入 fake document 断言三标记（platform 映射 / win32 组合 / 非 win32 不标 titlebar 面）；e2e：Windows 载体断言 `html[data-platform="win32"]`、`html[data-windows-titlebar]`、内联变量值 32、`getComputedStyle(frame).padding-top=32px`、`[data-sidebar-right-expand]` boundingBox.y ≥ 32 且可见可点（对 WCO 带区外）。

### 附加项 B（可选，同面已知债，执行时裁决并入或另立）

- WCO `color:'#fff'`/`symbolColor` 为浅色静态实值（create.ts 注释自认）——暗色主题下白条刺眼；如官方宿主有 setTitleBarOverlay 主题联动机制则镜像（无官方先例则暂不动，注记留痕）；
- `data-fullscreen` 标记（dockkit/layout 消费）：官方在 macOS 全屏态切换——产品暂无全屏入口，先留痕不实现。

## 验收

1. 发送消息后会话头整行（面包屑/actions/utilities/corner）完整可见：右上角图标钮（右栏展开钮等）在原生窗口钮带区**之下**渲染，无遮挡、可点击、tooltip 正常；
2. 官方侧栏折叠钮/新会话钮落在 32px 带区内垂直居中（windows-titlebar 模式 fixed 定位生效）；顶部空白带恢复可拖拽移窗；
3. macOS 形态零回归（data-platform=darwin 路径不走 titlebar 面——本任务在 Windows 验收，darwin 分支仅静态保证）；
4. 全套单测/e2e 绿（现有 e2e 几何断言如有依赖旧错位的，随本修正对齐官方形态更新）。

## Reference Files

- apps/host/src/window/create.ts:26-50（titleBarStyle/overlay 32px——高度单源锚）
- apps/host/src/ipc/preload-api.ts + preload.mts（标记落位；现只暴露 dshForge/picker 桥）
- 官方契约：dsh-client-ui-primitives lib/index.js（isDarwinDesktop 注释——preload 标记职责原文）；dsh-client-ui-shortcuts lib/client.js detectEnvironment（runtime=web/desktop 判据）
- 官方消费面：dsh-client-ui-layout client.js（`[data-windows-titlebar] .pI_x6G_frame` padding-top/`:before` 拖拽条/`.pI_x6G_handle`）；dsh-client-ui-sidebar client.js（折叠钮/新会话钮 fixed top 公式）；dsh-client-ui-dockkit index.js drag()（内联变量读取）；dsh-client-ui-settings-account（overlay padding-top）；dsh-client-ui-sidebar-right client.js ExpandButton（corner 槽登记 + `[data-sidebar-right-expand]`）
- 官方会话头：dsh-client-ui-conversation client.js（ConversationHeader：titleRow/actions/utilities/corner 槽结构 + `data-conversation-header-corner`）
- 关联：fix-2（窗口形态立形——本任务补其 preload 半边）、fix-23（右栏官方接管——ExpandButton 即其收起态入口）、fix-25（官方基座降位——会话头归官方）

## 边界与不做

- 不自绘标题栏/不自创补偿 CSS（官方补偿面已完备——只补身份标记激活，官方优先红线）；
- 不改官方任何包（标记是宿主 preload 的官方法定职责位）；
- 高度值不另立刻度（与 titleBarOverlay.height 单源，防宿主-壳漂移）；
- 不动 darwin 专项面（traffic lights/窗口拖拽 recall——本任务 Windows 主战场）。
