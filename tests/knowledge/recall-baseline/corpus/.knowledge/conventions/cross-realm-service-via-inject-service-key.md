---
title: 跨隔离 realm 消费插件服务走 inject 服务键声明，reflect.get 拿不到顶层实现
summary: >-
  preset 组内的插件实例（如 plugin-forge 子实例）与顶层插件（expert-squad）不在同一 isolate realm，装配期
  `ctx.reflect.get('experts')` 读不到顶层实现——服务静默缺席。正门 = 消费方装配声明 `inject:
  ['<service>']` 服务键 + `ctx.<service>` 具名属性读取，双通道 try/catch 且检测不 memoize。
keywords:
  - cordis
  - isolate realm
  - inject 服务键
  - 跨插件服务
  - reflect.get
  - 静默缺席
domainPath: docs/conventions/plugin-service-presence-detection.md
来源容器: expert-squad-default-routing
来源任务: disc-1/fix-3（AC4 真机取证修复）
bug id: 0b83e3aa-e827-4c94-896a-fe6fab919aa3
id: cross-realm-service-via-inject-service-key
status: unconfirmed
type: conventions
version_ts: '2026-11-05T00:00:00.000Z'
related_doc: docs/conventions/plugin-service-presence-detection.md
---

# 跨隔离 realm 消费插件服务走 inject 服务键声明

## 适用条件

- 消费方处于 preset 组内派生的插件实例（如 plugin-forge 在 HR preset 组内的实例），被消费服务由顶层插件提供（如 expert-squad 的 `experts`）。
- 两者在不同 isolate realm 中：键寻址隔离，`ctx.reflect.get(name)` 按本 realm 键查，顶层实现不可见。

## 做法

- 装配期声明服务键：`inject: ['experts']`。
- 消费点经 `ctx.experts` 具名属性读取（type-only import 保留全量类型），外层 try/catch 承担 fail-soft。
- 检测结果不 memoize——每次消费点现查（AGENTS 1.6 口径）。

## 反例边界

- 同 realm 内的消费不遇此问题；但 realm 归属随 preset 组装配变化，不应以「当前同 realm」为由省略 inject 声明。
- `ctx.reflect.get(name)` 兜底通道仅限既有先例，不作为新代码默认配方。

## 实证

bug 0b83e3aa：`resolveWorkerProfile` 经 reflect.get 读 experts 静默缺席，AC4 真机取证暴露；修复 commit `beb3a4d8`（expert-squad 消费面改 inject + 具名属性，plugin-forge 0.9.1）后 route 锚断言全过。
