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
            ├─ sidebarActions({openSession, startSession,         ← 导航/变更动作绑定（fix-42：deps 面——
            │     updateProject, onProjectsMutated})                新会话官方面 + projects/update patch +
            │                                                      变更后静默重拉）
            └─ ForgeWorkspacePanel（纯面板：宽态/rail 态/四相位）
                 ├─ SidebarProjectsZone（宽态受控件：段头四件/过滤/视图/相位——fix-42 视图态 + 行动作用）
                 ├─ SidebarRail（收起态受控件：搜索/＋/项目 folder 图标列——fix-42 空轨道退役）
                 └─ 改名模态（官方 Modal——ellipsis 菜单改名动作的态机宿主）
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

## 导航动作（AC5 + fix-42 行尾动作）

`sidebar-actions.ts`（deps 注入面）：会话行 → `openSession`（官方 uiWorkspace.openSession
单径——选择+呈现+`layout.selectPanel(null)` 回会话面板一体，UF-5「切回会话视图 + 锚定」
官方收口）；项目行尾「新会话」→ `startSession(workspaceId)`（官方新会话流——reuse-or-create
blank + 呈现一体，插件 inject face 递达）；改名/归档切换 → `forge:projects/update` patch 面
（name patch 的 workspace 标题对齐 = core 侧 fix-33 ⑪ 联动，web 侧零额外编排）+ 变更后
静默重拉（应用侧行改写不触发 workspace 快照锚）。
fix-25：知识库入口迁官方 `sidebar.panellist` 行（PanelRow → `layout.selectPanel`，产品 nav
行退役）；工作台桥消费面随视图态机退役（桥本体 = workbench/workbench-bridge）。

## 视图态（fix-42：官方 ViewOptionsMenu P1 裁剪）

`sidebar-model.ts` 纯投影：`groupBy` 二值（tree = 项目树 / flat = 全会话平铺按 updatedAt
降序）+ `archivedFilter` 三态（default 全显含归档弱化 / hide 不含归档 / only 仅归档——项目
行 archived 口径，会话 archive 态未入账本镜像窄面不消费）；`sidebarViewOfPick` 菜单项 id →
视图态投影。视图态 = 纯视图微观态（同 collapsedIds 口径，P1 不持久化——官方
`dsh.workspace.view.v5` persist 形态归后续里程碑）。orderBy/手动换序/工作区树嵌套不做
（菜单项不出现）。

## 契约 pin（G1 契约面清单第 3 项——S2 残留 #1 本任务清点入池）

- `sidebar.workspaces`：single/root，owner = `{ wide: boolean, expandSidebar: () => void }`
  （上游 ui-sidebar `contract/slots.ts` 的 `SidebarSectionOwnerProps`）。
- `sidebar.brand.mark` owner `{ size }`；`sidebar.brand.name` owner `{ children?: never }`。
- single 槽影子序：priority 升序最低者渲染（lowest renders）；官方占用者缺省 0，
  产品行 `-100`（`client-plugin/plugin.ts` `SIDEBAR_SHADOW_PRIORITY` 常量 pin）。

## M3.1 左栏残差记账（D3——官方 Rows meta 偏离）

项目行**仅名称一行**（`SidebarProjectNode.name`），canonical 路径（`wsPath`，ProjectSummary
直投影）转**原生 `title` 悬停提示**（`ForgeWorkspacePanel.tsx` 项目块 `title` 属性）——
显式偏离官方 ui-workspace Rows 的 meta 常驻次行（用户裁决 R16 / 差异清单 D3；官方
`Tooltip` 件迁移归 D30 悬浮提示轮）。WCO 竖线/收起 rail 偏离（D1/D2）为壳层 CSS 面，
载体 = `apps/web/src/styles/wco.css`（见其头注记账）。
