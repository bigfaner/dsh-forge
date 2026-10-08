---
title: "事件总线与业务日志约定"
domains: [event, bus, log, jsonl, dispatch-digest]
---

# 事件总线与业务日志约定

> M3 起的 agent 面执行运营日志机制：产品自建事件总线、容器维度日志文件、归属三分支、dispatchPrompt 三层存放。

## 总线与日志组织

### TECH-event-001: 事件总线与业务日志（产品自建）

**Requirement**: 产品自建进程内 emit/subscribe 总线（形制参考 dsh/Cordis 事件机制但零上游复用，不受上游升级耦合）；事件信封恒 {ts, sessionId, slug, type, payload}，载荷 = 两层抽象判别联合（ForgePluginEvent——完备性 G1-21 pin）；工具执行只发事件零日志代码，监听器 = 唯一写者（标准化 → 落盘）；日志组织 = `{tasksHome}/{flatten}@{hash8}/logs/{slug}.jsonl` 容器维度（proposal 或 feature 全程 agent 面业务日志同文件）；归属三分支 = 事件带任务 → 任务容器 slug / 无任务 → contextSlug（dispatchTask 入参）/ 皆无 → logs/_pool.jsonl 兜底；dispatchPrompt 三层存放 = 全文（worker 会话日志首条）+ 指纹（dispatch_digest：task_records.claim 行 + task-claimed 事件双记）+ 对账锚（workerSessionId）——追溯三键闭环 taskKey → digest → workerSessionId → 会话日志全文；分工边界 = logs/*.jsonl 为 agent 面执行运营日志、UI 面状态变更审计归 DB 表（feature_records/task_records），两纪律不混不重复；事件日志不含凭据、不含 dispatchPrompt 全文（只记 digest）。
**Source**: feature/dsh-forge-m3-bootstrap-presets TECH-005（tech-design §Interface 3·图 5·§Security ③ / packages/plugin-forge/src/events/{bus,log-listener,sink}.ts）
