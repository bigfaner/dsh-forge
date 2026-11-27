---
title: tools.restrict 是 global 工具掩码——scope 层名传入即抛，preset 行内须与全局视图求交
summary: >-
  官方 tools.restrict 是 global 工具掩码：scope 层注册名传入即 UNKNOWN_TOOL 硬抛（preset 行
  activation 失败→整 preset broken），空 filter 硬抛，scope 层注册豁免掩码。preset 行内 restrict
  须先与全局视图（tools.schemas()）求交，交集空 = fail-soft 跳过诚实降级——expert-restrict /
  tools-exclude 双判例同族配方。
keywords:
  - tools.restrict
  - whitelist
  - global-tools
  - preset-row
  - unknown-tool
  - expert-squad
id: tools-restrict-global-scope-preset
status: unconfirmed
version_ts: '2026-11-24T09:23:51.070Z'
updated: '2026-11-24T09:23:51.070Z'
type: pitfalls
procedure: true
candidate_of: quote-plugins-flows
slug_hint: tools-restrict-global-mask-unknown-name-throws
---
# tools.restrict = global 工具掩码（scope 层注册名传入即抛；scope 注册豁免掩码）

# 官方契约（dsh-tools lib/types/index.js `restrict` 实现 + doc 原文，2026-11-24 核销）

- `restrict({allow,deny})` **只掩 global 层工具**："Restrict global tools for the calling agent scope... scoped registrations remain visible" ——scope 层注册的工具可见且豁免掩码；
- **未知名硬抛**：`tools.restrict() names unknown global tool "x"; known global tools: ...`；
- **空 filter 硬抛**："tools.restrict({}) is a no-op ... empty filter is almost always a materialized-empty-config bug"——空白 allow = 全掩码语义，官方刻意拒绝；
- 保留名（run_code 等 PTC 传输名）硬抛；context 非 scoped（agent.ctx）硬抛。

# 错误路径与规避（双判例同族配方）

**错误假设**：专家/预设的「工具白名单」可对模型工具名（read/write/edit/grep/pwsh 等）用 restrict 落地——这些名注册在 **preset scope 层**，传入即 `UNKNOWN_TOOL` 抛错；该行在 preset 挂载激活期 apply → activation 失败 → **整 preset broken**（设置页「加载失败」+ presetProbe 剔除 + delegate 诚实降级）。

**规避配方**（apply 期与全局视图求交，交集 ⊆ 实注册名 ⇒ 零 throw 面）：

```
known = new Set(ctx.tools.schemas().map(d => d.name))   // 无 scope = global 视图
effectiveAllow = allow.filter(n => known.has(n))
// 交集空 = 白名单平台不可表达 → fail-soft 跳过 restrict（不落空白 allow 的全掩码语义）
// 交集非空 → restrict({allow: effectiveAllow, ...})，disposer 经 ctx.effect 挂行生命周期
```

判例：`plugins/expert-squad/host/tools-exclude.ts`（office 族 deny，forge bundle preset 子树）与 `plugins/expert-squad/host/expert-restrict.ts`（专家 allow，0.32.7 修口）同径。语义注记：求交后 allow 全为 scope 层名时白名单**诚实降级不落地**——官方平台本就不支持对 scope 层工具做掩码白名单，非回归。

# 引用前核对

官方 dsh-tools 升级可能改变校验面——引用前核销当版 `restrict` 实现。
