---
title: typert strict 迁移配方要点（插件包接入官方 generator 生成链）
summary: '插件包以 @deepseek-ai/dsh-typert-generator 双半生成替代手写 descriptor 表的配方：host 半改 @Remote 装饰器源码形态、双 face tsconfig 聚合、bundle-free writePackageArtifacts 生成步、client 半消费 ./remote 投影、生成物完整性钉替双表 pin、传输 client 镜像族收敛单源。'
keywords:
  - typert
  - strict
  - generator
  - 迁移配方
  - descriptor
  - 生成链
domainPath: docs/conventions/
来源容器: typert-strict-migration
来源任务: 1.3/1.4/1.5/1.6（收口核验 1.7 沉淀）
bug id: 无
id: typert-strict-migration-recipe-plugin-package
status: unconfirmed
type: conventions
version_ts: '2026-11-16T00:00:00.000Z'
related_doc: .forge/docs/proposals/typert-strict-migration/proposal.md
---

# typert strict 迁移配方要点（插件包接入官方 generator 生成链）

## 惯例（迁移配方六要点）

- **host 半源码形态**：generator `WorkspaceAnalyzer.collectInvocations` 只认类成员 `@Remote(...)` 装饰器（remoteMarker），且类须 `TypertRemoteService` 基类或 `readonly typertGateway = bindTypertRemote(this, serviceKey)` 绑定——程序化 proto 遍历标记（remoteMarks 族）对分析器零可见，strict 迁移必须改回装饰器源码形态；构建期装饰器降级用 generator `./tsdown` 子导出的 `decoratorPlugin()`，vitest/esbuild 各自补装饰器降级缝。
- **face 聚合**：工作区根规则 = 同时含 `tsconfig.host.json` + `packages/` 的最近祖先；单包插件仓照官方判例对齐根聚合 `tsconfig.host/client.json` + 包叶双 face 配置，导出形态照官方三件套（`./typert` + `./remote` + `dsh.client.external` 声明）。
- **生成步接线**：不必换 tsdown——generator bundle-free API（`writePackageArtifacts`，与 tsdown workspace 模式逐字节同产物）前置为生成步（官方先例 scripts/generate-typert.ts），现有 esbuild bundle 链与离手门原样保留，生成工件作内联输入；协议包须以工作区包在场（pnpm 多物理副本会双载 d.ts 增强块 → TypertLookupMap key duplicate，paths 统一指包本地链接收敛）。
- **client 半不产 typert.client.\***：rc.2 analyzer 的 client face invocations 恒 host-only，纯消费半 UI 不产 `typert.client.js` 工件——照官方生态先例（全部在装官方包均无此工件）不挂悬空导出，client 消费件 = `./remote` 投影（TYPERT_REMOTE）。
- **双表 pin → 生成物钉**：手写 client descriptor 表退役后，成对 pin 测试替换为生成物完整性钉（dist 工件 descriptor 数/端点名单 pin + 壳 ↔ npm 协议包形状 pin）——pin 只防命名漂移不防形状漂移，形状锁定归生成链本体。
- **传输 client 镜像族同批收敛**：RpcClientError / createForgeRpcClient / preloadRpcClientFactory 三重镜像族随迁移收敛单源（正本一处、其余纯再导出）；传输极性按页面裁定单通路（装配期注入处显式定工厂，缺省值与装配真值不分叉），preload 桥保留为集成态加速位语义不变。

## 实证

typert-strict-migration 1.3-1.6 全链落地：`@dsh-forge/project` 0.19.30 经官方 plugin 通道正式安装进 dsh web 与 DSH Desktop 双舞台，strict face 六族 23 端点解析 + 调用达 host 全 200，combo 字节 byteIdentical；单测 2340+ 基线全绿（唯一失败为在案既有失败）。证据卷 `.forge/docs/proposals/typert-strict-migration/issues/` 与 forge 任务日志 1.4-1.6。
