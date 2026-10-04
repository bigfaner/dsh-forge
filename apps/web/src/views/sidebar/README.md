# views/sidebar/

定位：**业务** —— UF-1 左栏导航 rail 的产品面板（任务 2.7：槽位路线 A 替换官方 ui-sidebar 壳
`sidebar.workspaces` 洞位）。

## 组合缝（谁渲染谁）

```
官方 ui-sidebar SidebarRoot（壳：几何/收展 56px rail ↔ 展开宽/品牌行/新会话/快捷键）
  └─ renderSlot('sidebar.workspaces', { wide, expandSidebar })   ← 洞位（本目录占用）
       └─ ForgeSidebarSlot（接线层）
            ├─ useSyncExternalStore(sessions / workspaces)        ← dsh 账本实时读（零缓存零副本 SC2）
            ├─ useForgeProjects()                                 ← forge:projects/list（RPC）
            ├─ sidebarActions(openSession)                        ← 导航动作绑定（单参——fix-25 后桥参数退役）
            └─ ForgeWorkspacePanel（纯面板：宽态/rail 态/四相位）
```

- 组件本体在**壳 bundle**；产品 client 插件（`src/client-plugin/`）槽位注册经发布面
  `window.__DSH_FORGE_VIEWS__`（`src/product-views.ts` 求值期发布）取 `ForgeSidebarSlot`
  作注册组件——插件 bundle 保持自含 classic script（React 单例不破坏）。
- 品牌行内容洞位（`sidebar.brand.mark` / `sidebar.brand.name`）= `ForgeBrand.tsx`
  （行本体与「整块 = 新会话快捷」交互归壳——AC3 品牌行点击走官方 startSession）。

## 数据面（AC2）

| 面 | 源 | 纪律 |
|---|---|---|
| 会话行 | `ctx.sessions.list` 快照源（插件 inject face 注入） | useSyncExternalStore 直读，无本地快照持有/落盘（SC2 零缓存零副本） |
| 会话归属 | `ctx.workspaces.list` 快照源（sessionIds） | 同上；快照身份变化兼作项目列表刷新锚 |
| 项目树 | `forge:projects/list`（rpc/client） | mount + 刷新锚 + 重试；失败 fail-soft 错误条（profile core 行未启用期即此相位） |

行语言（dsh 行语言 = 官方 ui-workspace Rows 刻度）：状态点官方 StateDot 四态
（pendingInteraction→warning / completed→done / running→ongoing / 其余 idle）、
标题 `displayTitle`、相对时间官方 `relativeTime` 桶化 + zh 文案；顶层行口径：无父行、
空白会话仅显示被选中者；未注册为项目的 workspace 会话不入树（产品面 = 注册项目口径）。

## 导航动作（AC5）

`sidebar-actions.ts`：会话行 → `openSession`（官方 uiWorkspace.openSession 单径——选择+
呈现+`layout.selectPanel(null)` 回会话面板一体，UF-5「切回会话视图 + 锚定」官方收口）。
fix-25：知识库入口迁官方 `sidebar.panellist` 行（PanelRow → `layout.selectPanel`，产品 nav
行退役）；工作台桥消费面随视图态机退役（桥本体 = workbench/workbench-bridge）。

## 契约 pin（G1 契约面清单第 3 项——S2 残留 #1 本任务清点入池）

- `sidebar.workspaces`：single/root，owner = `{ wide: boolean, expandSidebar: () => void }`
  （上游 ui-sidebar `contract/slots.ts` 的 `SidebarSectionOwnerProps`）。
- `sidebar.brand.mark` owner `{ size }`；`sidebar.brand.name` owner `{ children?: never }`。
- single 槽影子序：priority 升序最低者渲染（lowest renders）；官方占用者缺省 0，
  产品行 `-100`（`client-plugin/plugin.ts` `SIDEBAR_SHADOW_PRIORITY` 常量 pin）。
