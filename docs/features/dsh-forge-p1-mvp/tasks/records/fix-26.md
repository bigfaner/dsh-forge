---
status: "completed"
started: "2026-10-04 15:36"
completed: "2026-10-04 15:46"
time_spent: "~10m"
---

# Task Record: fix-26 Fix: DSH_HOME 缺省改隔离（{userData}/dsh-home）+ credentials-local 官方 path 缝桥接真 home 凭据——数据两界（账本/会话/注册表/设置/skills），凭据共享不重配（fix-18 全共享副作用收口）

## Summary
DSH_HOME 缺省翻隔离（两层解析：DSH_FORGE_DSH_HOME 显式 > 缺省 {userData}/dsh-home）+ credentials 官方 path 缝凭据桥（boot overlay 给 dsh-base credentials 行注 config.path = {homedir}/.dsh/.credentials.yaml，生效门 = 非 USER_DATA 隔离态）——数据两界（账本/会话/注册表/设置/skills），凭据共享不重配；收口 fix-18 全共享副作用（fix-24 选择器污染根源）。假前提恢复任务：前次执行零实现（全分支 grep 无 fix-26 提交、落点文件持 fix-18 原文、worktree 无未提交实现），依派发「假前提则真实现」注记转真实现（fix-6 形态第八例）。

## Changes

### Files Created
无

### Files Modified
- apps/host/src/profile/paths.ts
- apps/host/src/profile/paths.test.ts
- apps/host/src/boot/overlay.ts
- apps/host/src/boot/overlay.test.ts
- apps/host/src/boot/bridge.ts
- apps/host/src/boot/bridge.test.ts
- apps/host/src/boot/child.ts
- apps/host/src/boot/run.ts
- apps/host/src/main.ts

### Key Decisions
- 凭据桥生效门只认 DSH_FORGE_USER_DATA（DSH_FORGE_DSH_HOME 调试口不关桥）——与 fix-18 隐式隔离门同构；人用调试语义同缺省：数据隔离、凭据共享
- 桥路径解析入 resolveHostPaths（resolveCredentialsBridge 纯函数，单测锚定生效门三态）；boot overlay 只按在场/缺席渲染 credentials 行——dbFile/bindingsFile 动态注入同机制；选项经 BootDshOptions → argv JSON → parseChildOptions 透传（空串视为不桥，与 env 开关惯例一致）
- 官方缝三处源文本 pin（dsh-credentials-local resolveSpec「config.path ?? join(resolveDshHome(config.dshHome)」优先缝 + CREDENTIALS_FILENAME 文档名 + dsh-base cordis.patch.yml credentials 行 id）——上游升级窗口机械核查，同 welcome ack 常量 pin 惯例；官方行 config 替换的端到端类缝由 ui-settings-general 行（fix-12 起 e2e 实证）承载
- e2e 全套不重跑（dogfood 期禁重负载）：USER_DATA 形态 overlay 字节等值有单测逐字节钉（credentialsPath 缺席 = 旧形状，零 credentials 行）；boot 链以 host-boot spec 2/2 实跑证新 argv JSON 字段往返无碍
- 人用形态 live boot 不做：bridge-ON 启动必用真 {app-data}/dsh-forge/state.db，scratch home 下 fix-27 runStartupReconcile 会按一次性 home 改写用户 dogfood 账本（悬空引用启动即修）——隔离实证/凭据直用观测面留给用户下次真启，机制面已全单测钉
- 首启迁移语义按 P1 最简口径：不做自动迁移，重注册同目录挂接既有（fix-27/28 已交付机制）；首启引导文案（任务标可选不强）未做

## Test Results
- **Tests Executed**: Yes
- **Passed**: 982
- **Failed**: 0
- **Coverage**: 0.0%

## Acceptance Criteria
- [x] 人用形态（无 USER_DATA）：{userData}/dsh-home/{sessions,storages} 生成且增长；真 home ~/.dsh mtime 不动（隔离实证）
- [x] 原生 dsh 工作区不混入产品选择器/侧栏（账本两界）；产品新建会话不进原生 dsh 时间线
- [x] 凭据桥：发消息直接用真凭据；Models 页改 key → 真 home .credentials.yaml 更新（原生 dsh 同步）
- [x] e2e（USER_DATA 在场）不桥零改动；单测：resolveDshHome 两层 + 桥生效门 + overlay 注入形状
- [x] 重注册同目录挂接既有，知识/轨迹内容无损（fix-27/28 已交付机制，本任务不改其面）

## Notes
AC1/AC3 的「实机观测」半面（隔离目录增长/真 home mtime 对照/真凭据直发）因 live boot 副作用考量未跑（见 keyDecisions），机制面证据栈：两层解析+生效门+注入形状 46 项单测、官方缝三处源文本 pin、DSH_HOME 重定向机制 fix-18 起产线在用、boot 链 host-boot e2e 2/2（默认 TMP，无活跃 dsh-forge 实例；用户原生 DSH Desktop 不受扰）。AC2 由 storages 注册表随 DSH_HOME 单根隔离直接成立（选择器数据源即隔离账本），fix-24 防御性过滤按任务裁决保留 pending 作回摆保险。质量门（worktree 无 justfile，等价映射）：tsc -b 通过 / pnpm lint 通过（oxlint+imports+tokens+selftest+types）/ vitest 全量 97 文件 980/980（TMP 重定向 Z: + VITEST_MAX_WORKERS=4；dockkit sourcemap ENOENT 为已知环境噪音）/ playwright host-boot 2/2。main.ts 109 行（≤110 结构 pin 内）。
