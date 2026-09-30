---
title: "e2e 工程纪律(干净环境 · 真内核语料 · 实例锁 · 实况断言)"
domains: [e2e, playwright, clean-environment, single-instance, hash-oracle, fault-injection, live-assertion]
---

# e2e 工程纪律(干净环境 · 真内核语料 · 实例锁)

## Testing

### TECH-testing-001: 工作台 e2e 纪律(干净环境 + 真内核语料 + 实例锁 fail-fast + oracle)

**Requirement**: 工作台 e2e(Playwright `_electron`)统一纪律——①**干净环境 fixture**:system-only 净化 PATH + forge CLI 不可达进程探针 + 假 shim 负对照(零 CLI 断言的可信前提);②**语料经真链路产出**:已迁移项目语料必须经真内核迁移管线(openDatabase → registerProject → scanForgeFiles → startMigration)生成,**禁止手搓 SQLite**;③stub 通道:subagent/approval 用 stub 目录环境变量驱动(DSH_FORGE_SESSION_STUB_DIR / DSH_FORGE_APPROVAL_STUB_DIR,inject.jsonl 驱动真 approval-bridge 核心,统一 journal 留痕);④注入断言 = prompt_hash oracle 四检(内核 3 检 + requestId 确定性),逐字符对拍 journal;⑤**实例锁 fail-fast**:跑前查本机活跃 dsh-forge 实例(含 host-child 固定端口标记),持锁即快速失败——多 e2e lane 共享单实例锁须 `workers:1` 串行;⑥每腿强制隔离 userData;⑦lane 分离:vitest 排除 e2e specs,e2e 走独立 Playwright project。
**Context**: M3 6.2 基座裁决;实例锁为 M1 既有坑(M1 specs 用真实 userData,外部持锁即整片 ERR_SINGLE_INSTANCE)在 M3 的强化(live 事故后补 host-child 标记);干净环境断言依赖 PATH 净化成立。
**Scope**: [CROSS]
**Source**: feature/dsh-forge-m3 TECH-008(tasks/records/6.2、6.3;tests/e2e/README.md;design/tech-design.md §Testing)

**M4 扩面(2026-10-01,M4 交付生效)**:⑧**实况断言 = 原生 durable 面直读**——断宿主侧实况取其持久化 durable 文件(如 `$DSH_HOME/storages/workspace.json`,宿主单写者原子重写,与 follow 流同源),零应用侧状态行断言;比对基线**收窄到该投影面**(上游动词全部写径),宿主自留位(churn 字段)不入比对防误报;⑨**故障注入 = env + 控制文件缝**(如 DSH_FORGE_PROJECTION_FAULTS,随探测重读;未设置 = 生产行为不变;不为测试改产品控制流——渲染侧不可达即以直驱回填动词替代);⑩**语料预启动经 REAL persistence 种盘**(runtime 注入会错过一次性 bootstrap;zstd 等编码与 host 口径一致;journal↔artifact↔UI 三方对拍);⑪**多窗口 helper**:主窗定位 = renderer 标签排除法(getAllWindows()[0] 序非稳定);窗口计数 = 主进程 BrowserWindow.getAllWindows() 权威面(隐藏 ≠ 关闭);退出漏斗收尾 = 窗口计数归零 + 主 pid 退出 + Playwright 句柄面归零(错误路径 finally 亦兜);⑫**构建新鲜度**:座位缺席 + 既有腿连锁失败先查 dist/lib mtime vs 提交时间线,e2e 前重建三件套(apps/desktop build + build:plugins + stage:plugin-tarballs);⑬**断言零删改 + test.fixme 台账**(挂起 ≠ 删除:断言逐字保留 + 迁移指针 + 复核注释;恢复以台账记账为凭;交互失稳升级 fix task 承接根因,不作断言收缩换绿);⑭**flake 双证**(隔离重跑 + 串行小批复证后才计入 flake-documented);⑮测量卫生(测量靴间清布局记忆行防 replay 毒化;预种闭 turn 对语料过会话 chrome 门);⑯时序纪律(故障在场静置让重试定时腿确定性收口;漂移注入前置静默门——活动行数稳定 + 全 healthy,healthy 本身不证明静默)。
**Source**: features/dsh-forge-m4 tasks/records/3.6、3.7、4.6、4.7、fix-1;run-test
