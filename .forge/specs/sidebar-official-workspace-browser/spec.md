# Spec：左栏项目列表官方 WorkspaceBrowser 直渲（呈现层换装）

> Roadmap：`project-management-officialization` · Milestone：M1（a7f81789-76df-4c97-bd9d-db5d93539bed）
> 共识来源：grilling 访谈（2026-11-23）——Q1-Q17 全分支裁决，零沉默假设。

## 1. 用户旅程

**根本需求界定**：简化 dsh-forge 项目管理面，尽量复用官方 dsh 的 UI 与机制。左栏项目列表现状 = 自绘 ForgeSidebarSlot 以 -100 影子顶替官方 WorkspaceBrowser，自维护项目树/交互语言；目标形态 = 卸影子归还官方直渲（树视图/拖拽/归档/置顶/快捷键全白拿），forge 侧只补三块官方面没有的：添加项目入口转接（保留 forge 项目机制）、文案改写（语言包正门）、官方删除/重命名的事件侧跟随。

**意图推断**：refactor（呈现层换装，数据层零改动）——推理：用户明确「简化现有设计，尽量利用官方的 UI 和机制」「需要保留项目机制」，且裁决数据层退役类问题为「后续批次」（Q9 Roadmap 档），故本轮范围收敛到呈现层 + 善后跟随。

**关键裁决链**：
- Q3+Q8+Q12-Q16：直用官方列表；文案改写经穷举（locale 覆盖 duplicate-throw / 子插槽零触及标题 / vendor 纪律封死）定谳唯一合法路径 = 语言包正门 + 用户手切；覆盖表 = workspace NS 全部 16 键 + common NS 1 键（行语境=Worktree，面板/入口语境=项目，树视图=按目录树）。
- Q4+Q11：hero 选择器与 hero CTA 不动；侧栏添加入口占官方 `sidebar.workspaces.directoryFlow` 缝转接 AddProjectFlow。
- Q17：官方删除（domain/changed 事件订阅级联善后 + 对账反转）与重命名（双向同步）都被跟随——WYSIWYG 收口。
- 数据层（projects 表/五通道/归属判据/hero picker）零改动（用户裁决「保留项目机制」+「暂时不动」）。

## 2. 方案

```mermaid
flowchart LR
  subgraph 官方机械（零改动白拿）
    SB[dsh-client-ui-sidebar 声明 sidebar.workspaces] --> WB[官方 WorkspaceBrowser 直渲<br/>树视图/拖拽/归档/置顶/快捷键]
    WB --> REG[workspaceRegistry<br/>worktree 三径已注册·层级天然呈现]
  end
  subgraph 产品插件（本轮改动面）
    RETIRE[退役 ForgeSidebarSlot 影子<br/>-100 登记删除] --> WB
    FLOW[占 sidebar.workspaces.directoryFlow 缝<br/>转接 AddProjectFlow] --> WB
    LANG[语言包正门覆盖<br/>16+1 键·fallback zh-CN] -.单键覆盖回落.-> WB
  end
  FLOW --> APF[AddProjectFlow 五字段注册<br/>projects 表 + registry create] -->|onPicked 回呼| WB
  REG -.domain/changed 事件.-> FOLLOW[事件侧跟随<br/>删除级联·改名双向同步]
```

- **卸影子**：删除 `sidebar.workspaces` 的产品 -100 影子登记（ForgeSidebarSlot 及自绘项目块退役），官方 WorkspaceBrowser 直渲。
- **添加入口转接**：产品以第三方公共通道 `ctx.slots.inject("sidebar.workspaces.directoryFlow", ...)` 占缝（single，先到先得）——官方「+」/Cmd+O/菜单 Add 项由缝在位性驱动激活；占缝组件消费 owner props `{open, busy, onPicked, onCancel, onError}`，open 时转接 AddProjectFlow，注册成功回呼 `onPicked(path)` 由官方 `createWorkspace → workspaceRegistry.create` 收尾；取消/失败不回呼，零半注册残留。
- **文案改写**：`addLanguage` 注册自造语言（fallback=zh-CN），按覆盖表改写 workspace NS 16 键 + common NS 1 键；**零 setLocale 代写**，用户设置页手切一次生效。
- **普后跟随**：forge host 订阅官方 workspace 存储域事件（`domain/changed`，过滤 workspace 域 deleted/updated）——删除级联善后 + 对账策略反转；重命名双向同步。
- **术语**：影子 = single 槽 lowest-renders 顶替占用；directoryFlow 缝 = 官方留出的目录选取子槽（槽空 = 添加入口整体不存在）。

## 3. 改动范围（file 粒度 + 复用核销）

**预期改动**：
- `apps/web/src/client-plugin/plugin.ts`——卸 #1 影子登记（`sidebar.workspaces`）
- `apps/web/src/views/sidebar/`（ForgeSidebarSlot 接线层与 ForgeWorkspacePanel 退役或瘦身，删改面以实现时触点为准）
- 新增：directoryFlow 缝占用组件（plugins/project/ui 或 apps/web/client-plugin 内，装配时定名）+ AddProjectFlow 转接适配
- 新增：语言包注册模块（addLanguage + 覆盖表 dict）
- 新增：workspace domain/changed 事件订阅 + 级联善后（host 侧，进程归属以实现期核销为准）
- `packages/core/src/forge/project-service.ts`——reconcileAtStartup 对账策略反转（孤儿不再无条件重建）
- `tests/`（左栏 e2e 旅程 spec 更新锚 + 新增缝占用/语言包/善后链契约测试）
- `docs/conventions/official-face-contract-anchors.md`——登记升版漂移面
- `docs/architecture/web-ui-composition.md`——§2 名册/§6 左栏同步回写

**复用核销结论（源码级，全部已核）**：
- 官方 locale：单占用者防重入（duplicate-throw，client-locale client.js:1387-1396）；语言包正门 = `addLanguage`/`register`/fallback 链（index.d.ts:159-170）——改字唯一合法缝。
- ui-workspace 槽位穷举表（0.2.0-rc.2 pin）：标题为 WorkspaceBrowser 内部裸 JSX（:3117），无子槽触及；`sidebar.workspaces.directoryFlow` single 缝声明/占用解耦，官方 picker-native/browse 经同一公共通道占缝，第三方可顶替（README 有第三方扩展示例先例）。
- 官方添加链：`createWorkspace({path})` → `ctx.remote.workspace.create` → `workspaceRegistry.create`（幂等 resolveByPath 查重）；owner props 契约 `{open, busy, onPicked, onCancel, onError}`（:1945-1957）。
- worktree 三径注册官方 registry（create 前移/ensureWorkspace 懒物化/list 只读）——官方树视图层级天然呈现，零新机制。
- **项目级菜单扩展缝（前瞻事实，本轮零影响）**：0.2.0-rc.2 pin 的 workspace 行菜单硬编码于 ProjectRowItem（仅 rename/delete，无 slot）；0.2.2-rc.1 起迁 `contextMenus` 服务（workspace 为一等 target kind，官方 open-in-app「在文件夹显示」即同形示范）——M2 后若需在项目级菜单挂 forge 动作（如「创建工作树」），随 pin 升级走该缝，本轮不触及。
- **善后链现状（零事件订阅定谳）**：forge 与官方 workspace 域纯 pull 关系；官方删除被启动对账重建回滚（project-service.ts:946-994）、官方改名被 alignWorkspaceTitle 覆盖回（:689-704）、knowledge 两表（bindings.json + knowledge_registry）无删除锚只增不删；官方事件源 `domain/changed` 现成（dsh-storage-domain index.js:214-218，workspaceController 同款消费先例 :54-55）。
- vendor 路径排除：AGENTS §1.5 禁 vendor + §1.1 只插孔不改制。

**零改动面（回归红线）**：`forge:projects/*` 五通道契约、INV-B/INV-U 归属判据、ForgeHeroWorkspacePicker、`conversation.hero.workspace.directoryFlow`、AddProjectFlow 注册语义本体（projects 表 schema 不动；行为面仅 Goal 4 善后链触及行级语义）。

## 4. tiers 交付档位

`ui`（官方列表走查 + E2E：列表呈现/树层级/添加转接/语言包生效/删除改名跟随）+ `api`（directoryFlow 缝占用、语言包注册与善后链的契约测试）。

## 5. Goals / AC 全集

**Goal 1 卸影子：官方 WorkspaceBrowser 直渲左栏**
- `sidebar.workspaces` 槽的产品 -100 影子登记退役（ForgeSidebarSlot 不再渲染），官方 WorkspaceBrowser 直渲左栏项目列表
- 官方能力走查可用：按工作区/按工作区树/单列表分组切换、工作区与会话拖拽排序、归档/置顶/重命名、Cmd/Ctrl+O 快捷搜索
- E2E：左栏 e2e 锚更新为官方面，项目列表呈现与项目→worktree 层级断言通过
- 升版漂移面（WorkspaceBrowser 内部 JSX、locale 注册链、directoryFlow owner props）登记进 official-face-contract-anchors 台账并配锚定测试

**Goal 2 添加项目入口：官方缝转接 AddProjectFlow**
- 产品占 `sidebar.workspaces.directoryFlow` single 缝，「+」按钮、Cmd/Ctrl+O、菜单 Add 项激活
- 入口点击转接 AddProjectFlow（五字段项目注册机制保留），注册成功后回呼 onPicked(path) 由官方 createWorkspace 收尾
- 注册取消/失败不回呼 onPicked，无半注册残留（启动 reconcile 不新增孤儿行）
- `conversation.hero.workspace.directoryFlow` 缝与 ForgeHeroWorkspacePicker 零改动（hero 链行为零变化）

**Goal 3 文案改写：语言包正门全 NS 覆盖**
- addLanguage 注册自造语言（fallback=zh-CN），按下方覆盖表覆盖 `workspace` NS 全部 16 个含「工作区」字样用户可见键（0.2.0-rc.2 15 键 + 0.2.2-rc.1 新增 `draft.workspaceRequired`）+ `common` NS `workspace.defaultName`；其余键 fallback 回落 zh-CN
- 零 setLocale 代写——语言切换由用户手动完成，插件零偏好写入
- 语言包升版重核销点（addLanguage/register/fallback 链语义 + 新增含「工作区」键的补盖）登记台账

**覆盖表（已确认映射原则：列表行/行操作语境=Worktree，面板/入口语境=项目）**

| 键 | 现值 zh | 覆盖值 |
|---|---|---|
| section.workspaces | 工作区 | 项目 |
| groupBy.workspace | 按工作区 | 按 Worktree |
| groupBy.workspaceTree | 按工作区树 | 按目录树 |
| workspace.add | 添加工作区 | 添加项目 |
| menu.addWorkspace | 添加工作区… | 添加项目… |
| rename.workspace.title | 重命名工作区 | 重命名 Worktree |
| field.workspaceName | 工作区名称 | Worktree 名称 |
| conflict.named | 已存在名为"{name}"的工作区。 | 已存在名为"{name}"的 Worktree。 |
| delete.workspace | 删除工作区 | 删除 Worktree |
| delete.desc | 将把"{name}"从工作区列表中移除。… | 将把"{name}"从项目列表中移除。… |
| delete.pending | 正在删除工作区… | 正在删除 Worktree… |
| picker.loading | 正在加载工作区… | 正在加载项目… |
| defaultWorkspace.failed | 无法创建默认工作区，请通过"选择工作区"选择文件夹 | 无法创建默认项目，请通过"选择项目"选择文件夹 |
| shortcut.directoryBusy | 正在选择或添加工作区 | 正在选择或添加项目 |
| actions.workspace.aria | 工作区"{name}"的操作 | Worktree"{name}"的操作 |
| draft.workspaceRequired（0.2.2 新增，升版补盖） | 请先选择工作区 | 请先选择项目 |
| common NS `workspace.defaultName` | 默认工作区 | 默认项目 |

不覆盖：`groupBy.flat`（单列表）、排序/筛选/会话级文案（无「工作区」字样或语义不变）。

**Goal 4 普后跟随：官方删除/重命名的事件侧级联**
- forge host 新增 workspace 存储域事件订阅（官方 `domain/changed` 事件，过滤 `change.domain==='workspace'` 的 deleted 操作）——事件源已核销（dsh-storage-domain 每次 durable 写 emit），非 wrap 拦截
- 官方删除（删注册行保目录保会话）→ forge 级联善后：projects 行降级/删除（目录在世时降级语义需实现期定案）+ knowledge-bindings.json 刷新 + knowledge_registry.remove 级联（方法已存在零调用方）
- 对账策略同步反转：reconcileAtStartup 对「registry 已删、projects 行仍在」不再无条件 registry.create 重建——删除被尊重，不再静默回滚
- 官方重命名（registry.setTitle，只改显示名不动目录）→ 双向同步：回写 projects.name；保留既有 projects.name→registry.title 单向链，两方向幂等不乒乓
- 普后链可观测：级联动作经 emitDiag 输出诊断日志（AGENTS §7），失败 fail-soft 不阻断官方操作

**Goal 5 质量门与回归**
- `pnpm lint:types` / `pnpm lint` 通过；受影响单测针对性通过
- projects 表、forge:projects/* 五通道、INV-B/INV-U 契约锚定测试全绿（数据层 diff 为零，普后 Goal 除外）
