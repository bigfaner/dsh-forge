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
