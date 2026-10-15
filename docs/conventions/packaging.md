---
title: "打包与安装资源"
domains: [packaging, installer, staging, product-packages, runtime-tree]
---

# 打包与安装资源

> 安装包 staging 管线约定：产品插件物化清单、关键文件口径、原生依赖 prebuild 随包。

## 产品插件 staging 闭包

### TECH-packaging-001: 产品包 @dsh-forge/* 运行时依赖随包物化

**Requirement**: 产品插件的打包面 = 配置意图开关 + 自动推导。配置单一源 `packages/contracts/src/product-plugins.ts`（`PRODUCT_PLUGINS`——只承载意图：`userLayerRow` = 打包 profile 模板用户层 insert 行；可选 `staged` 覆写 = kill-switch / 强制发货）。staging 集合由 `scripts/assemble-installer-resources.mjs` 自动推导：种子（行插件 ∪ 预设底稿携带插件（`presets/*.patch.yml` 扫描）∪ `staged:true`）→ `@dsh-forge/*` 依赖闭包 BFS → 剔除 `staged:false`——新增产品包零配置，闭包成员（contracts/path-key 类）自动随包，「忘列」类缺陷（e791a46）结构性消除。带技能面的插件在 `STAGING_EXTRAS` 补 skills 物化与关键文件口径。守护测试 `tests/structure/installer-pipeline.test.ts`（推导集合 pin + 闭包自洽段——kill-switch 误伤即红；漏列即打包形态 boot child ESM 解析断裂，双服务灭，forge:* 通道全未注册，症状 = 「No handler registered」）。dev 形态（`apps/host/profile.dev/cordis.patch.yml` 手维文件）不受配置约束——开发时全量可用。
**Scope**: [CROSS]
**Source**: /learn entry 2026-10-06（2026-10 配置化收口 → 意图开关 + 闭包自动推导）
