---
feature: "dsh-forge-m1"
generated: "2026-09-20"
status: draft
---

# Technical Specifications: dsh-forge M1 桌面纯壳

## Upstream Vendoring

### TECH-001: 上游 vendor = pinned SHA 源码投影,零修改上游

**Requirement**: 上游 dsh 仓库以锁定 commit SHA 的源码投影方式 vendor 进本仓(packages/desktop-host-vendor);升级 = 显式 diff 对照任务;永不修改上游源码或 vendored 文件;vendored 清单带 sha256 完整性校验(UpstreamLock)。
**Context**: 上游无 git tag,版本锁定只能按 commit SHA;源码投影保证升级可 diff、体积可裁剪(弃整树产物拷贝)。
**Scope**: [CROSS]
**Source**: tech-design §Overview · §Open Questions Spike 2;任务 2.1/2.2 records

- 依赖闭包经 scripts/sync-upstream.mjs 解析投影;宿主子进程用内置上游 Node 运行时执行(Electron 内置 Node 不得进入)。

## Electron IPC Security

### TECH-002: preload 语义动词白名单 + sender 校验 + URL 主进程解析

**Requirement**: renderer 仅经 preload contextBridge 语义动词白名单(`dshForge.*`)访问主进程能力;每个 IPC handler 校验 sender frame;renderer 永不直接供给 URL —— openExternal 目标由主进程从上次更新检测结果解析,且须匹配构建期常量白名单(RELEASE_HOST/RELEASE_PATH_PREFIX),不匹配即拒绝并 log。
**Context**: IPC 越权与更新 feed 篡改缓解(tech-design §Security Considerations);M1 已实现(ERR_IPC_SENDER_REJECTED / ERR_UPDATE_URL_REJECTED)。
**Scope**: [CROSS]
**Source**: tech-design §Interface 6 · §Security Considerations;任务 4.7 record

- contextIsolation: true,sandbox 对齐上游 desktop 配置;注入内容不内联 feed/会话动态数据(防 DOM 注入)。

## Crash Recovery State Machine

### TECH-003: crash-recovery 表驱动状态机与退避

**Requirement**: RecoveryState 五态显式状态机,7 条合法迁移表驱动实现,非法迁移抛错;重试最多 3 次,指数退避 2s/4s/8s;failed 不回退。
**Context**: SC9;Interface 2 精确签名,M1 按 100% 覆盖实现。
**Scope**: [LOCAL]
**Source**: tech-design §Interface 2;任务 4.4 record

## Notification Dedup

### TECH-004: 通知 10s 去重合并与 SessionTable LRU

**Requirement**: 同会话同事件 10s 窗口内合并为一条通知(setBody 原地更新);SessionTable 上限 200 条 LRU 驱逐;host-exit 整表清空并清零去重窗口。
**Context**: 防通知风暴与长驻无界增长(SC5)。
**Scope**: [LOCAL]
**Source**: tech-design §Data Models;任务 4.6 record
