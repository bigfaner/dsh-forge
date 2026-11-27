---
title: client bundle 禁入 lib 混合入口——纯函数共享走「正本+内联副本+镜像 pin」三件套
summary: >-
  client bundle（esbuild bundle:true, platform:browser）从 lib 主入口展开整张依赖图——混合 lib
  包（node util + 纯函数混装）整体不可进。client 半需共享纯函数时走三件套：lib 正本（host 单源）+ ui 逐字内联副本 + 镜像
  pin 测试锁逐字等价；判据是入口图零 node 依赖（contracts 可内联，lib-util 不可）。
keywords:
  - client-bundle
  - esbuild
  - node-dependency
  - mirror-pin
  - lib-util
  - self-contained
id: client-bundle-lib-pin
status: unconfirmed
version_ts: '2026-11-24T09:24:14.365Z'
updated: '2026-11-24T09:24:14.365Z'
type: pitfalls
procedure: true
candidate_of: packaging-pipeline
slug_hint: client-bundle-no-node-deps-mirror-triplet
---
# client bundle 禁入 lib 混合入口——纯函数件走「lib 正本 + ui 逐字内联副本 + 镜像 pin」三件套

# 翻车因

错误假设：「client 半只 import lib 包里的一个纯函数，esbuild 会按需内联、node 依赖无害」。实际 esbuild `bundle: true` 从**主入口展开整张依赖图**——`@dsh-forge/lib-util` index re-export `err-message` / `atomic-write-json` / `fs-ensure` / `cordis-root`（引 `node:fs` / `node:crypto` / `node:module`），browser platform 构建不可达。判例：expert-squad 0.32.6（client 半 import lib-util）→ 0.32.8 由另一会话改口本地副本救回。

# 规避配方（三件套）

client 半需要共享纯函数时：

1. **lib 正本**：纯函数件落 lib（如 `lib/util/src/remote-envelope.ts`），出口在 lib index——host 半消费单源；
2. **ui 逐字内联副本**：client 消费点取本地副本（如 `plugins/expert-squad/ui/panel/remote-envelope.ts`），头注写明「与单源正本逐字等价仅落位迁移——禁改行为」；
3. **镜像 pin 测试**：锁正本体逐字等价（头注区各侧自述不参与判定），单侧漂移即红——判例 `plugins/expert-squad/tests/remote-envelope-mirror-pin.test.ts`。

# 边界

- 既有可内联先例 = `@dsh-forge/contracts`（运行期值 TASK_STATUS_LABELS 等）——contracts 是纯浏览器安全包，不在本禁令域；判据 = **包入口图是否零 node 依赖**，不是「lib 一律禁入」。
- lib-util 若未来拆出纯浏览器子出口（`exports["./browser"]`），client 半可升级回真单源消费（三件套降级为单源）。

# 引用前核对

esbuild 配置与 lib-util 出口面升级后复校。
