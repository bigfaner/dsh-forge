---
title: "上游 Vendor 源码投影约定"
domains: [vendor, upstream, pinned-sha, sync, desktop-host, integrity]
---

# 上游 Vendor 源码投影约定

## Upstream Vendoring

### TECH-upstream-vendor-001: 上游 vendor = pinned SHA 源码投影,零修改上游

**Requirement**: 上游 dsh 仓库以锁定 commit SHA 的源码投影方式 vendor 进本仓(packages/desktop-host-vendor);升级 = 显式 diff 对照任务;永不修改上游源码或 vendored 文件;vendored 清单带 sha256 完整性校验(UpstreamLock)。
**Context**: 上游无 git tag,版本锁定只能按 commit SHA;源码投影保证升级可 diff、体积可裁剪(弃整树产物拷贝)。
**Scope**: [CROSS]
**Source**: feature/dsh-forge-m1 TECH-001(tech-design §Overview/§Spike 2;任务 2.1/2.2)

- 依赖闭包经 scripts/sync-upstream.mjs 解析投影。
- 宿主子进程用内置上游 Node 运行时执行(Electron 内置 Node 不得进入宿主执行路径)。
