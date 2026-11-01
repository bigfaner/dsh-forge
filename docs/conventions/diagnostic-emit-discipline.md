---
title: "诊断发射口径统一"
domains: [conventions, observability]
---

# 诊断发射口径统一（禁直落 console）

> 宿主侧包（core / plugin-forge / plugins 主进程 / git-worktree 等）的一切诊断输出——失败降级、fail-soft 吞没告警、成功里程碑——必须经官方 cordis `diag/log` 事件域发射（订阅侧零改动、JSONL 落盘可查）；禁止新增直落 `console.warn` / `console.error` 的诊断站点。复发背景：存量 ~72 处 console 直落站点不进统一订阅面，评审后整批迁移（proposal diag-face-consolidation）。

## 规则

| 面 | 要求 |
|---|---|
| 发射 | 装配期注入诊断发射面，`ctx.emit(DIAG_EVENT, payload)` 类型化发射；`DIAG_EVENT` / `DiagEventPayload` 自 `packages/core` 类型单源 import，禁止裸字符串 `'diag/log'` 与 `as unknown as {emit}` 强转 |
| process | 每站点按宿主进程位填 `process`（core / plugin-forge / git-worktree = `child`，expert-squad 主进程 = `main`）——漏填则跨进程 trace 链归属错 |
| 兜底 | 发射面缺席统一按级分流：error→`console.error`、其余→`console.warn`（expert-squad index.ts 口径）；不采用「缺席 = 零 emit」 |
| 分级 | 失败路径 / 降级 = `warn`，关键降级（防线失能等）= `error`，成功里程碑 = `info`；新错误源 = 新增 emit 点，订阅侧零改动 |
| event | 功能域前缀命名（如 `job-tree`、`worktree-create`、`loop-finish`）；payload 就地携带可得字段（projectId / slug / taskKey / traceId） |
| 静默 | 禁以「fail-soft 吞掉」为由静默失败——吞没处必须有对应诊断站点或注释化豁免理由 |

## 豁免面（不适用）

- client 束（`*/src-client`、`*/src/client`、`*/web`）：无宿主事件总线，保留 console。
- apps/host main 早窗（telemetry 装配前的接线/缺省）：装配前 emit 无落点。

## 判据（正反例）

- ✅ 插件装配期注入 `diag: (payload) => ctx.emit(DIAG_EVENT, {...payload, process: 'child'})`，消费点 fail-soft catch 内走该面。
- ✅ face 缺席兜底 `typeof emit === 'function' ? emit(...) : console.warn(...)`（按级分流）。
- ❌ 新增 `console.warn('forge xxx failed: ...')` 直落站点。
- ❌ `ctx.emit('diag/log', …)` 裸字符串或类型强转。
- ❌ catch 块空吞且无诊断站点、无豁免注释。

## 交付要求

- 改动触及诊断输出时，`console.warn|error` grep 审计宿主侧无新增站点（client 束与 main 早窗豁免面除外）。
- 成功里程碑与失败路径成对考量：只补失败不补成功 = 回放不了完成态。
