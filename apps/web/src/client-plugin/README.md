# client-plugin/

定位：**装配** —— 产品 client 插件（vite 第二入口产物 `forge-client.js`，母本模式同型；1.5 填充骨架）。

- 入图 = `shell/boot.ts` 掌舵：`__DSH_BOOT__` 追加行（immediately 预取）→ 模块系统 classic script
  装载 → `window.__ModuleLoader__.load` 注册工厂 → Loader 激活（与官方 ui-\* 同门进入组合）。
- 形状契约：产物零 import/export 语句（classic script）；vite 构建以形状 pin 断言（vite.config.ts）。
- 1.5 骨架：apply 仅立激活标记（`__DSH_FORGE_CLIENT__`，e2e 自证面）；2.x 起承载槽位替换
  （sidebar.workspaces）与产品视图挂载（域件经 zones 槽位渲染）。
