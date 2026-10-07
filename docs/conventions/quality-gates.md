---
title: "质量门约定"
domains: [quality-gate, lint, pin-test, e2e, coverage, dependency-pin, query-plan]
---

# 质量门约定

> G0–G2 三道门、上游依赖精确 pin、契约面 pin 池、e2e 断言台账纪律；全绿为里程碑门。

## 门定义

### TECH-quality-001: G0–G2 门定义

**Requirement**: G0 = 静态门（`pnpm lint`：oxlint 三铁律 + import 扫描器（RPC 边界 + SC2 watch 禁令）+ 令牌 lint + 规则自证 lint-selftest（负样例种植→拦截断言→清理）+ `tsc -b`）；G1 = 契约面 pin 回归（P1 八项：boot manifest 形状、slot 洞名、registry API 语义、`ctx.systemPrompt.section` 注册、`forgeKnowledge` 服务注入、官方 ui-* props、profile 目录形状 + M2 扩池 9–16：桥事件信封、四新服务白名单 AssertNever、plugin-forge tool 注册面六在场两缺席、每工作区 DB 布局（schema.sql ↔ MIGRATIONS 逐条）、RPC 通道族 allowlist 五族、XML 标签集四枚封闭、TaskType 20 值词汇 + 中英状态标签常量、sidebarRightTabs 两段注册 + conversation.session.header.actions 槽面）；G2 = e2e 池（Playwright `_electron`）；全绿为里程碑门。
**Source**: feature/dsh-forge-p1-mvp TECH-013（tech-design §Testing Strategy / package.json scripts / oxlint.config.ts）+ feature/dsh-forge-m2-pipeline（tech-design §契约面 pin 扩池，drift 修订：G1 池 P1 八项 + M2 9–16）

## 依赖与契约 pin

### TECH-quality-002: 上游依赖精确 pin 与契约面 pin 池

**Requirement**: 上游 dsh npm 包全部精确 pin + lockfile 入库，锁定期不开升级窗口（升级走窗口纪律）；Electron 精确 `44.0.0`（`node-addon-require-builtin` 指纹门仅接受 43.0.0/44.0.0/45.0.0-alpha.6）；契约面清单逐项 pin 测试（G1 池，新契约面随任务入池）。
**Source**: feature/dsh-forge-p1-mvp TECH-014（tech-design §Dependencies / §契约面清单）

## 测试纪律

### TECH-quality-003: e2e 断言零删改台账与覆盖率目标

**Requirement**: e2e 断言零删改台账（断言只增不删不改，继承旧线纪律）；core（双域）单测覆盖率 80%；会话链路走真实 dogfood 冒烟（低成本模型，每门必跑），UI 断言走 smoke 迁移可控 seam。
**Source**: feature/dsh-forge-p1-mvp TECH-015（tech-design §Overall Coverage Target / §Per-Layer Test Plan）

### TECH-quality-004: UI 功能测试录制-回放主径

**Requirement**: UI 功能测试以**录制-回放**为主径——dogfood 真实模型的动词调用序列（dispatchPrompt 全文 / submit 载荷 / fix 链事件流）录成 JSONL 夹具，e2e 按序列经 RPC/桥重放并断言 UI 全程呈现（零在场模型依赖）；真实模型仅 dogfood 门与录制源；flake 复现走同一夹具。升级 TECH-quality-003「录制回放不预建」口径（M2 起 UI 面预建）。
**Source**: feature/dsh-forge-m2-pipeline tech-design §Testing Strategy（2026-10-06 用户裁决）

### TECH-quality-005: 查询计划断言纪律（EQP）

**Requirement**: 热查询（就绪集 / 前置守卫 / 恢复钩子反查）必须索引命中——查询计划由断言锁死（EXPLAIN QUERY PLAN，防全表扫描回归）；性能预算形态 = 概览任务列表首屏 ≤2s @500 任务（机械判据，压力上界；数据全部直读无文件扫描型加载）；tool 写入与 UI 读取无锁竞争（派发循环与页签浏览互不阻塞）。
**Source**: feature/dsh-forge-m2-pipeline TECH-012（prd-spec §Performance Requirements / tech-design §Testing Strategy）
