# client-plugin/

定位：**装配** —— 产品 client 插件（vite 第二入口产物 `forge-client.js`，母本模式同型；1.5 立骨架，2.7 承载槽位替换，fix-25 官方基座降位登记族）。

- 入图 = `shell/boot.ts` 掌舵：`__DSH_BOOT__` 追加行（immediately 预取）→ 模块系统 classic script
  装载 → `window.__ModuleLoader__.load` 注册工厂 → Loader 激活（与官方 ui-\* 同门进入组合）。
- 形状契约：产物零 import/export 语句（classic script）；vite 构建以形状 pin 断言（vite.config.ts）。
- 激活标记：`__DSH_FORGE_CLIENT__`（e2e 自证面；先于槽位注册立标）。
- **登记族（fix-25 官方缝全集）**：apply 经 `ctx.slots.inject` 注册——
  - `sidebar.workspaces`（2.7 槽位路线 A：产品面板替换官方 ui-workspace 浏览器，
    priority -100 影子：single 槽 lowest renders）+ `sidebar.brand.mark` / `sidebar.brand.name`
    （品牌行内容）；
  - `main` keyed `'dswf-hero'` / `'dswf-knowledge'`（官方全局面板 roster——ui-layout
    `selectPanel` 互换；先例 ui-plugin-manager/ui-schedule）；
  - `sidebar.panellist` `'dswf-knowledge'`（官方 PanelRow 行——知识入口）；
  - `conversation.view` `'dswf-trajectory'` / `'dswf-recall'`（官方页签 roster——ui-trajectory
    同型先例；对话 tab = 官方 'chat' 直用）；
  - `shell.overlay` `'dswf-host'`（AppFrame root 五子槽——常驻壳宿主：UF-3 流程 + 相位/视图
    镜像锚 + hero 面板驱动 + 右栏联动面）。
  - `main.conversation` 影子登记**缺席**（fix-25：官方 ConversationRoot 直渲——renderSlot
    per-entry children 授权铁律下产品影子恒拿不到官方头部链子座渲染权，fix-23 探针实证）。
- 依赖服务 `inject = ['slots', 'sessions', 'uiWorkspace', 'workspaces', 'sidebarRight', 'layout']`
  （cordis 注入等待，ui-workspace 同型先例；fix-23：sidebarRight = 官方 ui-sidebar-right
  服务切片；fix-25：layout = 官方 ui-layout 服务切片——面板选择窄面 + 桥 nav 绑定）。
- 组件源纪律：注册组件**不进本 bundle**（自含 classic script + React 单例）——经壳 bundle
  发布面 `window.__DSH_FORGE_VIEWS__`（`src/product-views.ts`）递达；缺席即 fail-loud
  （装配断裂不静默）。注入面（dsh 账本/归属快照源 + openSession + 桥/官方面板窄面）随注册
  携带，面板侧直读（SC2 零缓存零副本）。工作台桥本体经发布面工厂
  （`createWorkbenchBridge`——nav 闭包绑定官方 `layout.selectPanel`）创建并发布页内全局
  `__DSH_FORGE_WORKBENCH__`。
- 卸载语义：注册经 `ctx.slots.inject` 挂本插件 fiber——插件卸载级联回收（桥发布随壳宿主
  登记同期撤销），官方占用者还原。
