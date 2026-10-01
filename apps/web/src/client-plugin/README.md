# client-plugin/

定位：**装配** —— 产品 client 插件（vite 第二入口产物 `forge-client.js`，母本模式同型；1.5 立骨架，2.7 承载槽位替换）。

- 入图 = `shell/boot.ts` 掌舵：`__DSH_BOOT__` 追加行（immediately 预取）→ 模块系统 classic script
  装载 → `window.__ModuleLoader__.load` 注册工厂 → Loader 激活（与官方 ui-\* 同门进入组合）。
- 形状契约：产物零 import/export 语句（classic script）；vite 构建以形状 pin 断言（vite.config.ts）。
- 激活标记：`__DSH_FORGE_CLIENT__`（e2e 自证面；先于槽位注册立标）。
- **2.7 槽位路线 A**（tech-design Integration）：apply 经 `ctx.slots.inject` 注册三洞位——
  `sidebar.workspaces`（产品面板替换官方 ui-workspace 浏览器，priority -100 影子：
  single 槽 lowest renders）+ `sidebar.brand.mark` / `sidebar.brand.name`（品牌行内容）。
  依赖服务 `inject = ['slots', 'sessions', 'workspaces']`（cordis 注入等待，ui-workspace 同型先例）。
- 组件源纪律：注册组件**不进本 bundle**（自含 classic script + React 单例）——经壳 bundle
  发布面 `window.__DSH_FORGE_VIEWS__`（`src/product-views.ts`）递达；缺席即 fail-loud
  （装配断裂不静默）。注入面（dsh 账本/归属快照源 + openSession）随注册携带，
  面板侧直读（SC2 零缓存零副本）。
- 卸载语义：注册经 `ctx.slots.inject` 挂本插件 fiber——插件卸载级联回收，官方占用者还原。
