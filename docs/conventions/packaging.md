---
title: "打包与安装资源"
domains: [packaging, installer, staging, product-packages, runtime-tree]
---

# 打包与安装资源

> 安装包 staging 管线约定：产品插件物化清单、关键文件口径、原生依赖 prebuild 随包。

## 产品插件 staging 闭包

### TECH-packaging-001: 产品包 @dsh-forge/* 运行时依赖随包物化

**Requirement**: 新增 `packages/<name>` 产品包、或既有产品包新增 `@dsh-forge/*` 运行时依赖时，`scripts/assemble-installer-resources.mjs` 三处必须同步：`PRODUCT_PACKAGES`（物化 + 合成 anchor 清单）、`REQUIRED_KEY_FILES`（`--check` 安装后冒烟口径）、`assertPreconditions`（构建产物前置）；闭包守护测试在 `tests/structure/installer-pipeline.test.ts`（staging 闭包段）——漏列即打包形态 boot child ESM 解析断裂，双服务灭，forge:* 通道全未注册（症状 = 「No handler registered」）。
**Scope**: [CROSS]
**Source**: /learn entry 2026-10-06
