---
title: "质量门约定"
domains: [quality-gate, lint, pin-test, e2e, coverage, dependency-pin]
---

# 质量门约定

> G0–G2 三道门、上游依赖精确 pin、契约面 pin 池、e2e 断言台账纪律；全绿为里程碑门。

## 门定义

### TECH-quality-001: G0–G2 门定义

**Requirement**: G0 = 静态门（`pnpm lint`：oxlint 三铁律 + import 扫描器（RPC 边界 + SC2 watch 禁令）+ 令牌 lint + 规则自证 lint-selftest（负样例种植→拦截断言→清理）+ `tsc -b`）；G1 = 契约面 pin 回归（boot manifest 形状、slot 洞名、registry API 语义、`ctx.systemPrompt.section` 注册、`forgeKnowledge` 服务注入、官方 ui-* props、profile 目录形状）；G2 = e2e 池（Playwright `_electron`）；全绿为里程碑门。
**Source**: feature/dsh-forge-p1-mvp TECH-013（tech-design §Testing Strategy / package.json scripts / oxlint.config.ts）

## 依赖与契约 pin

### TECH-quality-002: 上游依赖精确 pin 与契约面 pin 池

**Requirement**: 上游 dsh npm 包全部精确 pin + lockfile 入库，锁定期不开升级窗口（升级走窗口纪律）；Electron 精确 `44.0.0`（`node-addon-require-builtin` 指纹门仅接受 43.0.0/44.0.0/45.0.0-alpha.6）；契约面清单逐项 pin 测试（G1 池，新契约面随任务入池）。
**Source**: feature/dsh-forge-p1-mvp TECH-014（tech-design §Dependencies / §契约面清单）

## 测试纪律

### TECH-quality-003: e2e 断言零删改台账与覆盖率目标

**Requirement**: e2e 断言零删改台账（断言只增不删不改，继承旧线纪律）；core（双域）单测覆盖率 80%；会话链路走真实 dogfood 冒烟（低成本模型，每门必跑），UI 断言走 smoke 迁移可控 seam。
**Source**: feature/dsh-forge-p1-mvp TECH-015（tech-design §Overall Coverage Target / §Per-Layer Test Plan）
