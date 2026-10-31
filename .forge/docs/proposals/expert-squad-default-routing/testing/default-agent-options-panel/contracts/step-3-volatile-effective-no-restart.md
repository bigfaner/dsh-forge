---
journey: "default-agent-options-panel"
step: 3
action: "volatile-effective-no-restart"
title: "volatile 无重启生效（同实例回读 + 消费面折叠）"
risk_level: "High"
surface: { type: "web", key: "expert-squad" }
anchors:
  volatile_ui: "面板快照换代回填（syncedRevision ≠ snapshot.revision → 草稿重同步）"
  consumer: "GET /api/expert-squad/get 应答 provider/model/reasoning 位折叠 defaultAgentOptions"
anchors_source: "src/registry.ts（readConfig 现读 + buildEntry defaults 折叠）+ src-client/settings/index.tsx（快照换代重同步）+ proposal §数据面 volatile 变更通知"
last_anchor_sync: "2026-10-31T12:00:00+08:00"
sources:
  - "testing/default-agent-options-panel/journey.md 步骤3"
---

# Contract · step-3-volatile-effective-no-restart

## Outcome: success（同实例热刷新）

### Preconditions
- fixture_spec：Step 2 写入完成；boot 期窗口标记（`__DAO_MARK__`）在手；夹具工作区注册在案，含一个无路由专家（provider/model/reasoning 全缺省）。

### Input
写后不重启：读面板草稿 + `GET /api/expert-squad/get?key=<无路由专家>&workspace=<夹具>`。

### Output
- 同一 renderer 实例内：窗口标记不变（零 reload）、面板输入保持写入值（快照换代回填）。
- get 应答：原「继承父Agent」专家的 provider = P、model = M、reasoning = "high"（③ defaultAgentOptions 基座在消费面折叠生效）。

### State
registry Config 值现读（readConfig 每次 `.get()` 现取）——零缓存、零额外接线。

### Side-effect
none（读路径）。

### Invariants
- volatile 生效判据 = 同进程实例内可观测；重启后才可见不构成热刷新证据。
- 优先级链消费面语义：experts 条目 > 档案成对 > defaultAgentOptions > 父继承（本步只证③基座，①②由单元穷举）。

## Outcome: cleared-fallback（清空后消费面即时回落）`source: inferred`

### Preconditions
- fixture_spec：Step 2b unset 完成后立即取用。

### Input
同 success 的 get 读口。

### Output
provider/model/reasoning 位回缺省（undefined = 父继承/不下发）——回落与写入同一时延级（无重启）。

### State
registry 现读快照为未配置形态。

### Side-effect
none

### Invariants
- 缺省 = 该层不生效：消费面回缺省而非残留旧值（读径无缓存残留）。

## Journey Invariants
- registry 不缓存 Config 值——get/list 每次现读 `ctx.config`，volatile 变更零接线生效。
- settings 服务缺席 = ctx.config 直读照常（AC5 降级两态，单元承载）。
