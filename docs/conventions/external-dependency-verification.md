# External Dependency Verification（外部依赖真机验收规范）

> 用户裁决 2026-10-15（源自 mobile-remote-approval 隧道链三层根因复盘：be04ce95 / a98a4cda / 3c98e297）。

## Requirement

**外部依赖装配面的结算门必须含真机端到端取证——fake 契约测试全绿不算交付。**

「外部依赖装配面」= 与进程外世界交互的任何装配代码：

| 类别 | 例 |
|---|---|
| 子进程 | cloudflared / ssh / tar / git 等外部二进制 spawn 与 stdout/stderr 消费 |
| 网络 | 二进制/资源下载、公网隧道、WebSocket、第三方 API |
| 文件系统外部事实 | 父目录存在性、盘上缓存、路径约定（官方 app 的 userData 布局） |
| 上游闭源形态 | 官方桌面壳 bundle 内机械（无 npm 件可 import，只能语义对齐） |

## Why（三层根因链实证）

同一隧道功能连爆三个 bug，全部被 fake 契约测试掩盖：

1. **be04ce95**：sha256 清单占位全零——fake `sha256` 回读清单值，自洽恒「校验通过」；
2. **a98a4cda**：缓存父目录从不 mkdir——fake `fs` 是内存 map，永远不 ENOENT；
3. **3c98e297**：URL 行在 stderr 而监听只挂 stdout——fake 进程把数据喂进 stdout，永远能捕获；官方 `main.js:716-717` 双流监听，交付时只抄了常量没对照流装配。

共性：**fake 替身把外部世界的全部事实都替成了「恰好如实现所愿」**——测试越绿越掩盖。

## Verification（怎么取证）

- **同成因真环境**：跑在真实宿主/真实网络/真实二进制上（探针脚本模式：`spakes/tunnel-*-probe.mjs` 先例——临时脚本不入 git，输出作执行记录证据）；
- **全链而非单元**：从装配入口走到可观察结果（如「真起 cloudflared 捕获 trycloudflare URL + kill 收口」），不是只验纯函数；
- **失败必须可收敛**：真机失败路径要落到显式空态/报错（禁无限进行态）；
- **官方对照**：对齐官方逻辑时逐行核对**装配与流接线**，不止常量（正则/TTL/端口/版本）——「抄常量不抄接线」是 3c98e297 的直接教训。

## Boundary

- fake 契约测试仍然需要——覆盖分支逻辑与守卫（撤面/换线/限速/超时），与真机取证互补不互替；
- 纯内部逻辑（无外部 I/O）不适用本规范；
- 真机取证产物（日志/截图）归档 `logs/<slug>/` 或 `walkthrough/`，不进 git 提交（AGENTS.md 提交规范）。
