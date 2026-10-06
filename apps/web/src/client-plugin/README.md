# client-plugin/

定位：**装配** —— 产品 client 插件（vite 第二入口产物 `forge-client.js`，母本模式同型；1.5 立骨架，2.7 承载槽位替换，fix-25 官方基座降位登记族）。

- 入图 = `shell/boot.ts` 掌舵：`__DSH_BOOT__` 追加行（immediately 预取）→ 模块系统 classic script
  装载 → `window.__ModuleLoader__.load` 注册工厂 → Loader 激活（与官方 ui-\* 同门进入组合）。
- 形状契约：产物零 import/export 语句（classic script）；vite 构建以形状 pin 断言（vite.config.ts）。
- 激活标记：`__DSH_FORGE_CLIENT__`（e2e 自证面；先于槽位注册立标）。
- **登记族（fix-25 官方缝全集 = 九登记，plugin.ts 唯一源）**：apply 经 `ctx.slots.inject` 注册——
  - `sidebar.workspaces`（2.7 槽位路线 A：产品面板替换官方 ui-workspace 浏览器，
    priority -100 影子：single 槽 lowest renders）+ `sidebar.brand.mark` / `sidebar.brand.name`
    （品牌行内容）；
  - `main` keyed `'dswf-hero'` / `'dswf-knowledge'`（官方全局面板 roster——ui-layout
    `selectPanel` 互换；先例 ui-plugin-manager/ui-schedule）；
  - `sidebar.panellist` `'dswf-knowledge'`（官方 PanelRow 行——知识入口）；
  - `conversation.view` `'dswf-recall'`（官方页签 roster——ui-trajectory 同型先例；
    对话 = 官方 'chat' 直用、轨迹 = 官方 'trajectory' 直用——fix-29 退役产品
    'dswf-trajectory' 复刻）；
  - `conversation.hero.workspace` 影子（fix-24①——single 槽 -100：新会话输入框上方
    工作区控件改列 forge 项目；不声明 children，官方登记行恒供养 directoryFlow 子洞）；
  - `shell.overlay` `'dswf-host'`（AppFrame root 五子槽——常驻壳宿主：UF-3 流程 + 相位/视图
    镜像锚 + hero 面板驱动 + 右栏联动面 + 概览项目上下文锚定写回[4.1 经桥——inject 面携
    bridge]）；
  - `sidebar.right.pane.tab` keyed `'dswf-overview'` / `'dswf-doc'`（4.1 右栏 dock tab 两段
    注册第二段：官方右栏 tab 体 keyed 槽——dispatch 键 = tab 类型定义 id；概览 body 注入面
    = 桥 + 跳会话动作，文档 body 自足；useTabInfo 由 seat 声明 inject 恒递达占用者）。
  - `main.conversation` 影子登记**缺席**（fix-25：官方 ConversationRoot 直渲——renderSlot
    per-entry children 授权铁律下产品影子恒拿不到官方头部链子座渲染权，fix-23 探针实证）。
- 依赖服务 `inject = ['slots', 'sessions', 'uiWorkspace', 'workspaces', 'sidebarRight',
  'sidebarRightTabs', 'layout', 'locale']`（cordis 注入等待，ui-workspace 同型先例；fix-23：
  sidebarRight = 官方 ui-sidebar-right 服务切片；4.1：sidebarRightTabs = 官方右栏 tab 类型
  注册表——两段注册第一段[registerDockTabs：dswf-overview 页型 + guide 入口卡 order 0 排
  最前 / dswf-doc 资源型 multiple + address 去重]；fix-25：layout = 官方 ui-layout 服务
  切片——面板选择窄面 + 桥 nav 绑定；fix-33 ⑧：locale = 行 label NS 面）。
- 组件源纪律：注册组件**不进本 bundle**（自含 classic script + React 单例）——经壳 bundle
  发布面 `window.__DSH_FORGE_VIEWS__`（`src/product-views.ts`）递达；缺席即 fail-loud
  （装配断裂不静默）。注入面（dsh 账本/归属快照源 + openSession + 桥/官方面板窄面）随注册
  携带，面板侧直读（SC2 零缓存零副本）。工作台桥本体经发布面工厂
  （`createWorkbenchBridge`——nav 闭包绑定官方 `layout.selectPanel`）创建并发布页内全局
  `__DSH_FORGE_WORKBENCH__`。
- 卸载语义：注册经 `ctx.slots.inject` 挂本插件 fiber——插件卸载级联回收（桥发布随壳宿主
  登记同期撤销），官方占用者还原。
