---
title: "dsh 宿主与外部进程集成约定"
domains: [dsh-host, session-channel, cordis, cli-spawn, external-channel, path-authorization]
---

# dsh 宿主与外部进程集成约定

## Host Integration

### TECH-host-001: 会话操作走宿主内 cordis 服务通道,禁外部通道

**Requirement**: 应用发起/定位 dsh 会话一律走宿主进程内 cordis 服务通道:插件 host 半身直注 `sessionController` —— `create({sessionId?, cwd})`(caller-minted id = 幂等收养)+ `prompt({mode:'queue'})` 注入首条用户消息(即持久化用户消息);会话定位经 client 半身 `ctx.uiWorkspace.openSession(sessionId)`。降级链 = client 半身 remote session 同语义备选 → 剪贴板 + toast fallback(前置主窗 + 恢复引导),主通道不可用自动落 fallback、不打断。禁止外部通道:URL hash / postMessage / deep-link(M1 spike-3 已证三通道均不可用,不再重复侦察)。
**Context**: dsh 宿主无逐会话环境注入面(shell env 为进程级),宿主内服务通道是唯一零外部依赖路径;M2 spike-1 定形,M3 会话操作沿用。
**Scope**: [CROSS]
**Source**: feature/dsh-forge-m2 TECH-004(design/tech-design.md §Interface 5/§Open Questions;design/spike-1-findings.md;packages/plugins/forge-workbench/src/host/session-launch.ts)

### TECH-host-002: 外部 CLI spawn 纪律(参数数组 · 已注册路径集合)

**Requirement**: spawn 外部 CLI 一律参数数组,禁止 shell 字符串拼接;cwd 与路径参数限定已注册项目路径集合(仓外路径须注册时显式授权);CLI 解析序 = 应用设置显式路径 → PATH → 显式错误码(ERR_FORGE_CLI_UNAVAILABLE,错误引导);退出码/输出尺寸上限防护;CLI 按需 spawn、执行完退出(不常驻)。
**Context**: 参数注入与未授权路径执行缓解(威胁模型 T2/T4);进程足迹纪律的执行面。
**Scope**: [CROSS]
**Source**: feature/dsh-forge-m2 TECH-005(design/tech-design.md §Dependencies/§Security;packages/plugins/forge-workbench/src/host/cli-resolve.ts)
