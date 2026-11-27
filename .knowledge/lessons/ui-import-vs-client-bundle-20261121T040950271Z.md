---
title: 插件 ui 半装载通道二分：构建期 import 缝 vs 安装期 client bundle
summary: >-
  本仓插件 ui 半装载通道二分：构建期 import 缝仅存于 dsh-forge 自建壳，纯安装宿主须走 exports ./client
  client-bundle 通道（官方 clientBundle 契约）；双通道同场以 document 侧哨兵单例互斥恒单实例。
keywords:
  - 插件装载
  - client-bundle
  - 构建期import
  - 安装期装载
  - 双挂载
  - 哨兵互斥
id: ui-import-vs-client-bundle
status: confirmed
version_ts: '2026-11-21T04:09:50.271Z'
updated: '2026-11-21T04:09:50.271Z'
type: lessons
procedure: true
candidate_of: boot-profile-renderer
confirmed_at: '2026-11-22T15:34:52.583Z'
---
# 结构事实

本仓插件 ui 半有且只有两条装载通道：①**构建期 import 缝**——dsh-forge 自建 app shell（apps/web 壳）以 workspace 依赖 import `./web` 出口，apply 期挂载 enhancer；②**安装期 client bundle 通道**——`exports["./client"]` 自注册 CJS 束 + cordis.patch.yml 浏览器半场 modules 行扫描（官方 clientBundle 装载契约 `window.__ModuleLoader__.load`）。

判例（bug 147a1e84）：迁移提案按圆桌条件⑤只装 host 面（防双挂载），真机取证在**纯官方宿主**（无 dsh-forge 壳）下 mermaid fence 全部零出图——非回归，是构建期缝在官方宿主结构性不存在。host 工具面（cordis 全局行）则两形态通吃。

# 判据

- 「单独安装可用」的验收面必须按通道二分声明：host 工具面 vs ui 可视化面。
- ui 半要随装，必须走 client bundle 通道；双通道同场用全局哨兵互斥（`MD_MERMAID_MOUNT_SENTINEL` document 侧单例键，先到先得、后到 fail-soft）——恒单实例。
- 解法正本 = 派生提案 md-mermaid-client-bundle（def03837，已落地）。
