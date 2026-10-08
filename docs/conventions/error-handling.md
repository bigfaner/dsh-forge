---
title: "错误处理约定"
domains: [error, error-code, serialization, degradation, key-log, external-command, tool-format]
---

# 错误处理约定

> typed error 契约 → RPC 序列化 → UI 映射；关键异常降级记账、永不抛断用户流程。

## 错误契约与传播

### TECH-error-001: typed error 契约与传播策略

**Requirement**: 能力面/服务层抛 typed error（错误码定义于 `contracts/errors.ts`，现值 24 码 = P1 六码：`ERR_WORKSPACE_CREATE` / `ERR_PROJECT_WRITE` / `ERR_COMPENSATION` / `ERR_ENTRY_NOT_FOUND` / `ERR_INDEX_STALE` / `ERR_INVALID_KNOWLEDGE_DIR` + M2 十五码：`ERR_TASK_NOT_FOUND` / `ERR_INVALID_TRANSITION` / `ERR_DEPENDENCIES_UNMET` / `ERR_CYCLE_DETECTED` / `ERR_CHAIN_DEPTH_EXCEEDED` / `ERR_REASON_REQUIRED` / `ERR_SUMMARY_REQUIRED` / `ERR_TASK_EXISTS` / `ERR_FEATURE_NOT_FOUND` / `ERR_FEATURE_EXISTS` / `ERR_PROPOSAL_NOT_FOUND` / `ERR_WORKSPACE_NOT_REGISTERED` / `ERR_WORKSPACE_DB_UNAVAILABLE` / `ERR_SUSPECTED_MOVE` / `ERR_DOC_PATH_INVALID` + M3 三码：`ERR_TEST_EVIDENCE_REQUIRED`（AC 证据缺席·data 含清单）/ `ERR_GATE_SUMMARY_REQUIRED`（gate 任务缺数字摘要）/ `ERR_SPAWN_FAILED`（driver spawn 异常）；新增错误码 = contracts 唯一源同步，桥过桥保真自动覆盖）→ RPC 边界序列化为 RpcErrorPayload（`{ code, message, data }` 带内信封）→ UI 按 code 映射状态（空态/错误条/横幅；疑似移动 → 错误条 + 手工指引留场，库不可用 → 工作区隔离态；**未映射码 → 通用错误条兜底——永无裸 code 泄漏**）；补偿、对账与召回的关键异常永不抛断用户流程——降级为 app_key_logs 关键日志 + 对账提示；feature/proposal 非法转移复用 `ERR_INVALID_TRANSITION`（from≠to 校验同源）；开库/迁移失败永不抛断用户流程（工作区隔离态）；dsh 面异常原样透传（dsh 域归 dsh）；tool 返回面双友好文本见 TECH-error-004（双面分治不破）。
**Source**: feature/dsh-forge-p1-mvp TECH-009（tech-design §Error Handling / packages/contracts/src/errors.ts）+ feature/dsh-forge-m2-pipeline（tech-design §Error Handling，drift 修订：六码 → 21 码 + 未映射码兜底）+ feature/dsh-forge-m3-bootstrap-presets（tech-design §Interface 6，drift 修订：21 码 → 24 码）

## 关键日志纪律

### TECH-error-002: app_key_logs 关键日志纪律

**Requirement**: 仅记关键一致性事件（异常/失败/自动修复/孤儿发现），成功路径一律不记；level 仅 warn/error（无 info 流水）；scope 取记账域——中央库四值（compensation / reconcile / index / recall）+ 工作区库两值（tasks / workspace——随库自带，中央 CHECK 四值不含，写中央必炸，故分库落位）；单事件单条——处置结果并入同条 `data_json`，不记过程流水；写仅经 db/ 句柄 prepared statement。
**Source**: feature/dsh-forge-p1-mvp TECH-010（tech-design §Data Models / packages/core/src/forge/key-logs.ts）+ feature/dsh-forge-m2-pipeline（tech-design §forge/workspace 子模块，drift 修订：中央单面 → 中央 + 工作区双面 / packages/core/src/forge/workspace/app-key-logs.ts）

## 外部命令降级

### TECH-error-003: git 可选依赖与只读查询纪律

**Requirement**: git = 可选环境依赖（ENOENT 与失败同路静默回退记录语；submit 质量门不含 git；executor 遇 git 缺席走 submitTask result=blocked，fix 链承接）；git 只读查询 = execFile('git', [白名单子命令]) 恒数组参、禁 shell 字符串拼接、timeout 2s（白名单子命令 = show / diff-tree）；失败 / ENOENT 回退记录语。
**Source**: feature/dsh-forge-m2-pipeline TECH-009（tech-design §Dependencies·§Interface 1·§Security Mitigations ③ / packages/core/src/forge/tasks/git-lookup.ts）

## tool 返回面（M3 起）

### TECH-error-004: tool 返回面 formatOk/formatErr 双友好文本

**Requirement**: 所有 forge tool 返回双友好格式化文本——成功首行 `✓ <动词结果>` + 键值行；失败首行 `✗ <code>` + 人话 + 违规清单逐行；判别口径 = code ∈ contracts ERROR_CODES（跨 IPC/序列化附载后仍可识别）；无 code 的意外错误（装配 bug/参数形状防御收窄抛出的普通 Error）不吞——原样重抛保持 fail-loud；RPC/桥 typed error 信封照旧（RpcErrorPayload 序列化——双面分治不破）。
**Source**: feature/dsh-forge-m3-bootstrap-presets TECH-006（tech-design §Interfaces 头注·裁决⑨ / packages/plugin-forge/src/tools/format.ts）
