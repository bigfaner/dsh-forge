# shell/

定位：**基础** —— 壳接入：boot 消费、`__DSH_TRANSPORT__` carrier（1.5 填充）。
边界：禁 import `views/`、`flows/`（依赖铁律① 基础↛业务）；域内容归 views/flows。

- `bridge.ts` —— preload 桥：`window.dshForge.getBootManifest()` 读取面 + manifest 形状校验（G1 第 1 项）。
- `carrier.ts` —— `__DSH_TRANSPORT__` carrier：`{ownsHost, streamBaseUrl}`（G1 第 2 项；dsh 面 RPC 通路声明）。
- `boot.ts` —— boot manifest 消费主流程：carrier → `applyIndexInjections`（官方 ui-* 入页）→ 掌舵
  （产品 client 插件行追加 `__DSH_BOOT__` 图）→ `__DSH_BOOT_READY__` 门放行。
- `dsh-globals.d.ts` —— dsh 页面全局形状（`__DSH_BOOT__` / `__DSH_BOOT_READY__` / `__DSH_TRANSPORT__` /
  `__ModuleLoader__`；上游 DshWindow/ClientTransportHooks 结构同型镜像）。

fix-25：视图态机（view-state/use-shell-view）退役——中区互换 = 官方 layout 面板径
（main keyed roster + selectPanel），产品视图镜像锚归工作台壳宿主（workbench/ShellHost）。
