---
title: "e2e 工程纪律(干净环境 · 真内核语料 · 实例锁)"
domains: [e2e, playwright, electron-testing, clean-environment, single-instance, hash-oracle]
---

# e2e 工程纪律(干净环境 · 真内核语料 · 实例锁)

## Testing

### TECH-testing-001: 工作台 e2e 纪律(干净环境 + 真内核语料 + 实例锁 fail-fast + oracle)

**Requirement**: 工作台 e2e(Playwright `_electron`)统一纪律——①**干净环境 fixture**:system-only 净化 PATH + forge CLI 不可达进程探针 + 假 shim 负对照(零 CLI 断言的可信前提);②**语料经真链路产出**:已迁移项目语料必须经真内核迁移管线(openDatabase → registerProject → scanForgeFiles → startMigration)生成,**禁止手搓 SQLite**;③stub 通道:subagent/approval 用 stub 目录环境变量驱动(DSH_FORGE_SESSION_STUB_DIR / DSH_FORGE_APPROVAL_STUB_DIR,inject.jsonl 驱动真 approval-bridge 核心,统一 journal 留痕);④注入断言 = prompt_hash oracle 四检(内核 3 检 + requestId 确定性),逐字符对拍 journal;⑤**实例锁 fail-fast**:跑前查本机活跃 dsh-forge 实例(含 host-child 固定端口标记),持锁即快速失败——多 e2e lane 共享单实例锁须 `workers:1` 串行;⑥每腿强制隔离 userData;⑦lane 分离:vitest 排除 e2e specs,e2e 走独立 Playwright project。
**Context**: M3 6.2 基座裁决;实例锁为 M1 既有坑(M1 specs 用真实 userData,外部持锁即整片 ERR_SINGLE_INSTANCE)在 M3 的强化(live 事故后补 host-child 标记);干净环境断言依赖 PATH 净化成立。
**Scope**: [CROSS]
**Source**: feature/dsh-forge-m3 TECH-008(tasks/records/6.2、6.3;tests/e2e/README.md;design/tech-design.md §Testing)
