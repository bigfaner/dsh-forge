---
title: "错误处理约定"
domains: [error, error-code, serialization, degradation, key-log]
---

# 错误处理约定

> typed error 契约 → RPC 序列化 → UI 映射；关键异常降级记账、永不抛断用户流程。

## 错误契约与传播

### TECH-error-001: typed error 契约与传播策略

**Requirement**: 能力面/服务层抛 typed error（错误码定义于 `contracts/errors.ts`，现值六码：`ERR_WORKSPACE_CREATE` / `ERR_PROJECT_WRITE` / `ERR_COMPENSATION` / `ERR_ENTRY_NOT_FOUND` / `ERR_INDEX_STALE` / `ERR_INVALID_KNOWLEDGE_DIR`；新增错误码 = contracts 唯一源同步）→ RPC 边界序列化为 `{ code, message, data }` → UI 按 code 映射状态（空态/错误条/横幅）；补偿、对账与召回的关键异常永不抛断用户流程——降级为 app_key_logs 关键日志 + 对账提示；dsh 面异常原样透传（dsh 域归 dsh）。
**Source**: feature/dsh-forge-p1-mvp TECH-009（tech-design §Error Handling / packages/contracts/src/errors.ts）

## 关键日志纪律

### TECH-error-002: app_key_logs 关键日志纪律

**Requirement**: 仅记关键一致性事件（异常/失败/自动修复/孤儿发现），成功路径一律不记；level 仅 warn/error（无 info 流水）；scope 取记账域（现值：compensation / reconcile / index / recall）；单事件单条——处置结果并入同条 `data_json`，不记过程流水；写仅经 db/ 句柄 prepared statement。
**Source**: feature/dsh-forge-p1-mvp TECH-010（tech-design §Data Models / packages/core/src/forge/key-logs.ts）
