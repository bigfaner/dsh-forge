# shell/

定位：**基础** —— 壳接入：boot 消费、`__DSH_TRANSPORT__` carrier、视图态机（1.5 填充）。
边界：禁 import `views/`、`flows/`（依赖铁律① 基础↛业务）；域内容归 views/flows，经 zones 槽位渲染。

- `bridge.ts` —— preload 桥：`window.dshForge.getBootManifest()` 读取面 + manifest 形状校验（G1 第 1 项）。
- `carrier.ts` —— `__DSH_TRANSPORT__` carrier：`{ownsHost, streamBaseUrl}`（G1 第 2 项；dsh 面 RPC 通路声明）。
- `boot.ts` —— boot manifest 消费主流程：carrier → `applyIndexInjections`（官方 ui-\* 入页）→ 掌舵
  （产品 client 插件行追加 `__DSH_BOOT__` 图）→ `__DSH_BOOT_READY__` 门放行。
- `view-state.ts` —— 视图态机骨架（SC1 互换 / SC8 右栏隐藏恢复、页签跟随；纯态机，zones/ 2.5 消费）。
- `dsh-globals.d.ts` —— dsh 页面全局形状（`__DSH_BOOT__` / `__DSH_BOOT_READY__` / `__DSH_TRANSPORT__` /
  `__ModuleLoader__`；上游 DshWindow/ClientTransportHooks 结构同型镜像）。
