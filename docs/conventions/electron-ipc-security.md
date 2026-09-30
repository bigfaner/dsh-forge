---
title: "Electron IPC 安全模式"
domains: [electron, ipc, preload, sender-validation, open-external, allowlist]
---

# Electron IPC 安全模式

## Electron IPC Security

### TECH-electron-ipc-001: preload 语义动词白名单 + sender 校验 + URL 主进程解析

**Requirement**: renderer 仅经 preload contextBridge 语义动词白名单(`dshForge.*`)访问主进程能力;每个 IPC handler 校验 sender frame;renderer 永不直接供给 URL —— openExternal 目标由主进程从上次更新检测结果解析,且须匹配构建期常量白名单(RELEASE_HOST/RELEASE_PATH_PREFIX),不匹配即拒绝并 log。
**Context**: IPC 越权与更新 feed 篡改缓解;M1 实现锚点:ERR_IPC_SENDER_REJECTED / ERR_UPDATE_URL_REJECTED。
**Scope**: [CROSS]
**Source**: feature/dsh-forge-m1 TECH-002(tech-design §Interface 6/§Security;任务 4.7)

- contextIsolation: true,sandbox 对齐上游 desktop 配置。
- 注入内容(shell-ui bundle)不内联任何 feed/会话动态数据(防 DOM 注入)。

### TECH-electron-ipc-002: workbench 动词面模式(单命名空间 · 一动词一通道 · 错误信封)

**Requirement**: 数据内核/工作台能力经 preload 单一命名空间(`dshForge.workbench`)暴露;每个语义动词映射唯一白名单通道 `dsh-forge:workbench-<name>`(禁止复用、禁止通配透传动词;通道表 = main 与 preload 共用的同一常量模块,禁止两侧手写漂移);每 handler 校验 sender frame;动词 reject 信封 = JSON 序列化 `{code, message, detail?}`,携带合法 `ERR_*` code 的域错误原码透传,未知异常 → 兜底码 + log;主→渲染事件推送走独立非 invoke 通道,事件批量合并 ≤500ms,渲染层销毁自动退订;onEvents 呈现为单订阅者语义动词(订阅/退订动词对)。
**Context**: TECH-electron-ipc-001 的数据内核扩展面;M2 落地 16 白名单通道(13 数据动词 + subscribe/unsubscribe 对 + 仓外授权动词);M3 v2 扩至 **51** invoke 通道(+35:任务写集/读、迁移、知识系、偏好、阶段、提案、派发审批 + 3 host 回调动词),事件推送复用既有批量通道,后续数据内核扩面(M4+)沿用本模式。
**Scope**: [CROSS]
**Source**: feature/dsh-forge-m2 TECH-001(design/tech-design.md §Interface 1;apps/desktop/src/main/workbench/ipc/channel-allowlist.ts)

**M4 修订(2026-10-01,M4 交付生效)**:v3 扩至 **62** invoke 通道(1.3 +5:probeProjectPath/rename/archive/restore/list;3.2 +4:retryProjection/getProjectionStatus/submitWorkspaceSnapshot/reportProjectionOutcome;4.1 +2:getProjectUiState/setProjectUiState);新增**非 workbench 前缀壳层动词组** `dsh-forge:window-*`(open-detached/get-role/recall 恰三 invoke 通道 + window-changed push 通道不可 invoke;preload `dshForge.window` 面,同一常量模块 + deep-equal drift 锁纪律);事件 v3(projection_push_required/projection_updated/project_list_changed)走既有批量通道;bridge presence check = 全员可调才算在场(跨宿 additive:旧 preload 配新 client 判缺席降级)。
**Source**: features/dsh-forge-m4 tasks/records/1.3、3.2、4.1、4.2;apps/desktop/src/main/windows/channels.ts
