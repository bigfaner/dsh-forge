---
title: client 插件装载契约用镜像测试守卫
summary: client 半插件的四条装载契约（apply 插件面 / slots.inject 挂载缝 / apply 返回 undefined / exports["./client"] 装载形态）由 bundle-structure + client-bundle-dom 镜像测试锚定，防回归与官方门静默拒绝。
keywords: [client bundle, 装载契约, slots.inject, apply, 镜像测试]
domainPath: docs/conventions/reuse-official-mechanisms.md
来源容器: expert-squad
来源任务: 1.16（phase-3-summary.md）
bug id: 无
---

# client 插件装载契约用镜像测试守卫

## 四守卫

1. client 半必须是 cordis apply 插件面——否则真机报 `invalid plugin`（annotator gotcha-web-boot 判例）。
2. UI 洞位经官方 `slots.inject('main')` 声明；slots 面缺席 fail-soft（UI 静默缺失优于 boot 崩溃）。
3. apply 返回值必须为 `undefined`——返回非空对象 = Invalid effect。
4. 构建走官方 clientBundle 配方：`exports["./client"]` + `platform:web` + classic script 装载，react 永不内联。

每条守卫配一条测试断言，构建配方漂移在 CI 期暴露而非真机期。
