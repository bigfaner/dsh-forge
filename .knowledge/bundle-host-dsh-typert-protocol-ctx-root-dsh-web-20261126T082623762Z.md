---
title: 打包不内联官方包：同版本可能异码，以目标宿主模块解析到宿主那份为准
summary: >-
  官方包与宿主自带件可能同版本异码：npm 发布件用 ctx.root，dsh web 宿主自带件用 ctx[Context.root]，CLI 宿主
  cordis 不认字符串写法。打包内联官方包会让 Typert 控制器在 dsh web
  上构造即失败。官方包一律外置；判断修好以目标宿主运行期模块解析到宿主那份为准，并核销取证安装没有补装 npm 副本。
keywords:
  - bundle-host
  - 内联
  - 官方包
  - dsh-typert-protocol
  - ctx.root
  - 模块解析
  - dsh-web
  - 同版本异码
id: bundle-host-dsh-typert-protocol-ctx-root-dsh-web
status: confirmed
version_ts: '2026-11-26T08:26:23.762Z'
updated: '2026-11-26T08:26:23.762Z'
type: pitfalls
confirmed_at: '2026-11-27T16:09:03.019Z'
---
## 结论

**打包脚本不要内联官方包。** 同一个版本号的官方包可能有两份不同的代码：npm 发布件与宿主自带的构建。内联进产物等于带着一份可能与宿主不一致的副本。

## 本项目的实例

`@deepseek-ai/dsh-typert-protocol` 0.2.2-rc.5：

- npm 发布件读根上下文用字符串 `ctx.root`。
- `dsh --profile web` 宿主自带的用符号 `ctx[Context.root]`。

CLI 宿主的 cordis 没有字符串 `root`，任何插件读 `ctx.root` 都抛 `cannot get property "root" without inject`。project 与 task-loop 内联了 npm 那份，Typert 远程控制器构造即失败，界面上表现为项目列表加载失败；spec 一直外置，取宿主那份，所以正常。桌面应用通道恰好正常，因为它的协议包与 cordis 都支持字符串写法。

## 判断「修好了」的标准

1. 目标宿主上，**运行期模块解析**到的是宿主自带的那份，不是 bundle 内的副本、也不是仓内依赖目录的。
2. 先核销取证环境的安装步骤**没有补装 npm 副本**——外置后若 bundle 里留了一份 npm 拷贝，外部导入会落回它，修了等于没修（本容器第一次修复就是这样无效的）。
3. 取证环境需要让成员的裸引用可解析时，用**链接到宿主自身的包**，不要拷 npm 版。

## 排查线索

- 症状：`active Service "<某控制器>" is unavailable`，且该服务在启动日志里显示已注册。
- 看失败堆栈里出问题的文件路径：在 bundle 的 `node_modules` 下就是副本；对比它与宿主那份的源码写法。
- 旧构建在同通道同样失败则不是回归——先拿基线再下结论。

## 溯源

- 来源容器：forge-dirs-unification
- 来源任务：4.5；bug d19122cc
- 证据：提交 42faff82、961de275；`.forge/probes/forge-dirs-unification/4.5-evidence.md`；诊断证据 `D:\dev-temp\dsh-probe-ro\evidence\`（W1、zz-diag）
