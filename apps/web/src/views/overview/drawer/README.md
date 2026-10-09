# views/overview/drawer/

定位：**业务** —— 任务详情弹窗（m3.1 D21：右缘全高抽屉退役 → 可拖动弹窗；D23 挂载半：挂载独立于 dock 概览 tab）。两分块（任务内容/时间线——v11 裁决）+ 顺滑折叠（grid 0fr/1fr 就地更新）+ 类型模板 ×20 + 覆盖率 + 现状条/事件流沿袭；数据 = `rpc tasks.detail` → TaskDetail DTO。
边界：禁 import `../../session/` `../../knowledge/`（依赖铁律③ 同级业务互禁）；rpc 仅经 `rpc/` client。

## 文件职责

| 文件 | 职责 |
|---|---|
| `collapse.ts` | 弹窗交互数学面：宽度钳制 [320, 760]（窄屏 = min(760, 视口×0.92)）/ ±32 键盘步进 / 左右缘对侧锚定拖宽（`drawerWidthFromEdgeDrag`）/ 默认起始位（水平居中 + 视口高 14%——`defaultDrawerPosition`）/ 标题栏拖移视口钳制（4px 边距 + 标题栏恒可见）/ 会话级存储单例（**仅折叠态**——宽度/位置不入：裁决 #3 不记忆） |
| `index.tsx` | `TaskDrawerBody`（纯渲染体——弹窗壳[标题栏全窗拖移手柄 `data-dswf-td-head` + 左右缘手柄 + 几何 inline 注入] + 两分块 + kv 标签行 + 转移入口）+ `TaskDrawer`（装载壳：`useTaskDetail` 拉取 + 事件推送静默重取 + Esc capture + **逐开几何本地态**（宽/位 mount 效应落定，关闭随壳卸载弃置 = 重开回默认起始位）+ 会话级折叠注入；单例——taskId props 变更不卸载原位换内容） |
| `drawer.css` | 弹窗壳样式（fixed 浮窗 + 层级 `--dsh-dockkit-float-layer` + 抬升面；**滑入动画零在场**——右缘抽屉形态退役；拖示手柄/折叠过渡沿袭） |
| `detail-model.ts` | TaskDetail 投影纯函数：kv chips / 目标·结果推导 / 改动范围投影 / vars 负载解析 / gate M·N 计数 |
| `coverage-bar.tsx` | 覆盖率组件（进度条 + 阈值刻度线 + 判定徽标） |
| `timeline.tsx` | 块二：现状条 + 事件流（verb 分色 + 关联信息织入） |
| `type-templates/` | 六族模板路由（20 值穷尽）+ 族模板 + 共享子件 |
| `transition-dialog.tsx` | 转移对话框（3.8；m3.1 D23：随弹窗挂 ShellHost——遮罩 `pointer-events` 恢复命中） |

挂载（D23）：`TaskDrawer` 消费方 = `workbench/ShellHost.tsx`（`shell.overlay` 槽常驻树）经桥 `drawerTaskId` 受控条件挂载——独立于 dock 概览 tab（对话中直接打开，不依赖 dock 展开/概览选中）；`OverviewDockBody` 仅消费 `activeTaskId` 行高亮。打开通道四路：三视图任务行 / DAG 节点 / 泳道卡（经 `onOpenTask` → 桥 `openTaskDrawer`）+ 会话头挂接 pill（plugin.ts 直开）。

## e2e / 走查锚（权威台账）

`data-dswf-td-drawer`（弹窗壳）· `data-dswf-td-head`（标题栏——全窗拖移手柄，m3.1 D21 新增）· `data-dswf-td-resize="<left|right>"`（左右缘拖宽手柄——拖拽/双击复位/←→ 键盘步进；m3.1 D21 值化为缘侧，旧无值锚退役）· `data-dswf-td-close`（✕）· `data-dswf-td-kv`（kv 标签行）· `data-dswf-td-sect="<content|timeline>"` / `data-dswf-td-sect-body`（块头折叠——aria-expanded 断言位）· `data-dswf-td-goal` / `data-dswf-td-result`（目标/结果对行）· `data-dswf-td-ref="<docRel>"` / `data-dswf-td-ref-unresolved`（参考文档 chip）· `data-dswf-td-cov` / `data-dswf-td-cov-verdict`（覆盖率）· `data-dswf-td-note`（备注）· `data-dswf-td-eval-empty`（eval 空态注记）· `data-dswf-td-now`（现状条）· `data-dswf-td-ev-verb="<verb>"`（事件流节点）· `data-dswf-td-sess="<sessionId>"`（挂接 pill——跳会话点击位）· `data-dswf-td-commit`（commit 徽标）· `data-dswf-td-trans`（转移入口——3.8）· `data-dswf-td-skeleton` / `data-dswf-td-error` / `data-dswf-td-retry`（三态面）。
转移对话框（3.8，随弹窗同宿主）：`data-dswf-td-tr-mask` / `data-dswf-td-tr-dialog` / `data-dswf-td-tr-to` / `data-dswf-td-tr-reason` / `data-dswf-td-tr-error="<kind>"` / `data-dswf-td-tr-terminal` / `data-dswf-td-tr-cancel` / `data-dswf-td-tr-confirm`。

## m3.1 锚点迁移对照台账（D21 弹窗化 + D23 挂载半——断言零弱化硬条款，P1.1 先例）

> 口径：迁移前基线 = HEAD（抽屉形态）；计数 = `it/test(` 用例数 × `expect(` 断言数（行计数）。
> 零弱化判定 = **迁移族合计计数不减** + 逐锚迁移映射在场（退役锚须有退役记账或承接面）。

### 单测锚迁移

| 文件 | 用例（前→后） | 断言（前→后） | 迁移说明 |
|---|---|---|---|
| `drawer/collapse.test.ts` | 11 → 14 | 34 → 46 | 右锚拖宽数学（`drawerWidthFromDrag`：宽 = 视口 − clientX）退役 → 左右缘对侧锚定（`drawerWidthFromEdgeDrag`）；新增位置数学组（默认起始位/拖移钳制/标题栏恒可见）；宽度会话级保持退役（`setWidth` 不在存储面 = 机械面断言——裁决 #3） |
| `drawer/index.test.tsx` | 27 → 29 | 102 → 112 | 弹窗壳组改写：`data-dswf-td-resize` 无值锚 → `left|right` 双值锚（`role="separator"` ×2）；新增 `data-dswf-td-head` 标题栏拖移锚 + 位置 inline 注入断言；**滑入动画零在场**（`no-anim`/`animate` props 退役——显式否定断言在场）；装载壳首帧 = 起始位 CSS 兜底（inline `left:` 零注入断言） |
| `workbench/dock-tabs.test.tsx` | 22 → 21 | 51 → 50 | **弹窗/对话框挂载断言随装配体退役**（D23：本体迁 ShellHost）——「抽屉开 = 壳挂载」改写为「弹窗壳零挂载 + 行高亮源注入」（负向断言在场）；「转移对话框挂载」块退役 → 承接面 = `workbench-bridge.test.ts` 转移缝（`openTaskTransition` nonce 重开）+ e2e `task-overview-review` Step5 对话框全旅程（`data-dswf-td-tr-*` 锚经新挂载路径全量在场） |
| `workbench/ShellHost.test.tsx` | 9 → 12 | 21 → 26 | **新增弹窗宿主组**（D23）：桥 `drawerTaskId` 在场 = 弹窗壳挂载（`data-dswf-td-drawer`/`-close`/`-head`）；缺席 = 零挂载（关闭即卸载——几何不记忆的挂载面）；无锚诚实降级 |
| `workbench/workbench-bridge.test.ts` | 6 → 7 | 29 → 41 | **新增弹窗/转移双缝组**：`openTaskDrawer`/`closeTaskDrawer`（幂等 no-op / 切任务变更通知 = 单例原位换内容语义）/ `openTaskTransition`（nonce 自增重开）；快照缺省扩两缝 + 缝独立 |
| `client-plugin/plugin.test.ts` | 26 → 26 | 157 → 162 | 会话头 pill 注入面：`onOpenTask` → 桥 `openTaskDrawer` 直开断言（fail-soft 下仍直开——挂载独立于 dock 的机械面）；ShellHost 注入面三窄面（`onOpenSession`/`openSession`/`openDocResource`）在场断言 |
| **单测合计** | **113 → 121** | **519 → 580** | 合计不减（+8 用例 / +61 断言） |

### e2e 锚迁移

| spec | 用例（前→后） | 断言（前→后） | 迁移说明 |
|---|---|---|---|
| `m2/task-overview-review.spec.ts` | 11 → 11 | 105 → 121 | Step6 抽屉旅程 → 弹窗旅程：内容/时间线锚全量保留；新增几何组（默认宽 440/水平居中/14vh → 标题栏拖移平移 → 右缘拖宽 560 对侧锚定 → ✕ 关 → **重开回默认起始位**[裁决 #3 不记忆] → Esc 关闭双通道） |
| `m2/sc6-session-links.spec.ts` | 1 → 1 | 20 → 22 | pill 导航全链路：弹窗开锚保留 + **新增挂载独立断言**（D23）：弹窗宿主 = `[data-dswf-workbench]`（ShellHost 常驻树）+ 概览 tab body（`OV_PANEL`）内零弹窗节点——旧「随概览挂载」形态的分水岭断言 |
| `m3/uf3-dispatch-entry.spec.ts` | 2 → 2 | 19 → 19 | 零改动（`TD_DRAWER`/`data-dswf-td-close`/「零单任务执行入口」锚原样通过——受控面契约不动仅换壳的回归面） |
| `m2/task-session-linkage.spec.ts` | 8 → 8 | 56 → 56 | 零改动（`data-dswf-td-sess` 挂接 pill 锚原样通过） |
| `m3/overview-entry-new-session.spec.ts` | 3 → 3 | 81 → 81 | 零改动（`data-dswf-td-diag` 诊断面锚原样通过） |
| **e2e 合计（改动两件）** | **12 → 12** | **125 → 143** | 合计不减（+18 断言）；未改动 spec 的 td-* 锚零漂移 |

### 退役面记账（零在场断言承载）

- 右缘 `position:fixed; right:0` 全高抽屉 / 左缘独手柄拖宽 / 滑入动画（`no-anim` 类·`animate` props·`@keyframes` 滑入）：**退役**——`drawer.css` 零在场 + `index.test.tsx` 显式否定断言（`not.toContain('no-anim')`）；
- 宽度会话级保持（`setWidth` 存储缝）：**退役**——`collapse.test.ts` 显式否定断言（`'setWidth' in store === false`）；
- 弹窗/转移对话框 dock 装配体挂载（`OverviewDockAssembly`/`OverviewDockBody` 本体）：**退役**——`dock-tabs.test.tsx` 负向断言（弹窗壳零挂载）+ 承接面见上表；
- 双形态内容面（简要 440 ↔ 完整 720，D22）不在本轮（1.2 = 壳 + 挂载半；内容双形态归后续任务）。
