# M3 SC e2e 基座(任务 6.2)

`tests/e2e/` 是 M3 SC 验收腿(SC1-SC9,任务 6.3-6.8)的公共基座 —— M2 6.1 装置工程(`apps/desktop/e2e/fixtures/`)的目录延续:凡 M2 已有的生成器/桩直接复用,本目录只补 M3 需要的四件 —— 干净环境、两类项目语料、派发通道统一 stub(含审批注入面)、实例锁纪律。全部装置只提交生成器/桩模块,**绝不提交生成产物**;每次运行写入 journey 私有临时目录,测试后清理。

## 目录

| 模块 | 作用 | 主要消费方 |
|---|---|---|
| `fixtures/clean-env.ts` | 干净环境:系统目录级 PATH 净化(大小写变体归一)+ forge CLI 不可达进程探针(裸名×PATHEXT 各形 + shell 形;含假桩反证对照) | SC1(6.3)零 CLI 链 |
| `fixtures/corpus.ts` | 两类项目语料:①未迁移(index.json + 任务 md,M2 writer 复用);②已迁移(真内核链 register→scan→migrate 产出的 `<userData>/workbench/workbench.db` + `.migrated` 归档,md 原样) | SC1/SC2(6.3/6.4)、SC9(6.8) |
| `stubs/dispatch.ts` | 派发通道统一 stub(test 半身):一个目录同时驱动两个 env 缝(`DSH_FORGE_SESSION_STUB_DIR` + `DSH_FORGE_APPROVAL_STUB_DIR`),一份 journal(create/prompt/session-ended/approval 四类) | SC3(6.5)及全部派发腿 |
| `stubs/oracle.ts` | prompt_hash 四件套 oracle(内核三查 + requestId 确定性;spike-3 §4 口径)+ 逐字符语料(CRLF/unicode/行尾空格/收尾换行) | SC3 注入内容断言 |
| `stubs/migration-faults.ts` | 迁移注错缝 stub(test 半身):控制文件写入 `migration-fault-control.json`,host 半身(`apps/desktop/.../migration/faults-stub.ts`)经 env 缝 `DSH_FORGE_MIGRATION_FAULTS` 逐次 startMigration 重读 —— 注错 → 回滚 → 清错 → 重试,全程文件驱动 | SC2(6.4)失败重试腿 |
| `helpers/instance-lock.ts` | 单实例锁纪律:进程表枚举 + dsh-forge 实例识别(repo main.cjs 形 + 打包 exe 形)+ fail-fast 断言 | 全部腿(Hard Rule:跑前必查) |
| `helpers/app.ts` | M3 腿启动器:`launchPluginShell` 预设(强制隔离 userData + 默认干净 PATH + stub env 随行) | 全部腿 |
| `specs/*.spec.ts` | Playwright 腿(project `forge-m3-e2e`;`just web-test-m3 <name>`) | 6.3-6.8 |
| `base-selfcheck.spec.ts` | 基座自检(vitest 快道:探针/语料/oracle/实例锁,含反证对照) | 本任务 AC 证据 |

## 三条纪律(Hard Rules)

1. **实例锁**:任何腿启动应用前必调 `assertNoActiveDshForgeInstances()` —— 本机已有活跃实例即 fail-fast 列出 pid(M1 教训:整片 ERR_SINGLE_INSTANCE)。识别三种形态:repo main.cjs 路径、打包 `dsh-forge*.exe`、以及**任意 checkout 的活跃 host 子进程**(`desktop-host-vendor\vendored\apps\desktop-host` 命令行形态 —— 宿主 webserver 端口 19387 是全机固定的,dev 实例(`electron .` 形态)持端口时,e2e 腿全部以「连接已中断/Desktop Host unavailable」暴毙,持端口者就是必查对象)。
2. **隔离 userData**:`launchWorkbenchShell` 的 `userDataDir` 必填 —— 工作台库/插件 overlay/单实例锁全部钉进 journey 临时目录(`DSH_FORGE_USER_DATA` 缝),绝不复用开发实例 userData。
3. **CI 型 e2e 不混真链路验收**:真链路验收仍走 `scripts/acceptance/live-ui-{probe,sweep}.mjs` 纪律(vendored 闭包教训);本目录全部为 CI 型腿。

## 派发通道统一 stub 协议

test 半身 `createDispatchStub(dir)` 与两个 host 半身(插件内,env 缝驱动,未设置即生产行为)共用一套文件协议:

```
<dir>/control.json   — 会话通道编排(M2 协议原样:create/prompt 三态 + mintSessionId)
<dir>/inject.jsonl   — 审批注入面(append-only,host 150ms 轮询):
                       { "kind": "approval"?, agentId, toolName, callId?, reason? }
                       { "kind": "tool-exec", callId, arguments? }        # pre-execute 捕获
<dir>/journal.jsonl  — 统一观测流(host 追加,test 读取):
                       create / prompt(text=组合首条用户消息逐字) / session-ended / approval
<dir>/inject.cursor  — host 私有消费游标(重启不重放)
```

审批注入走**真桥核**(approval-bridge `handle`:认领过滤 → T2 内核 `approval_receive` → `approval_received` 事件 → UI dock → `settle` 回注)—— 注入面只铸造事件孪生,不绕过路由。

## 跑法

```sh
just web-test-m3 base-smoke        # 单腿(Playwright project forge-m3-e2e)
pnpm exec vitest run tests/e2e     # 基座自检(快道)
pnpm test:e2e                      # 全量(desktop-e2e + forge-m3-e2e,worker=1 串行)
```

前置:`pnpm build:plugins`(桩/插件 host 半身改动后)+ `apps/desktop/dist/main.cjs` 已构建。

## 契约派生腿(T-test-gen-scripts,tests/e2e/specs/&lt;journey&gt;/)

`tests/e2e/specs/<journey>/`(8 旅程,gen-journeys → gen-contracts → **gen-test-scripts**
产物):每旅程 = `harness.ts`(旅程语料世界)+ `step-*.spec.ts`(每 Contract 步一
文件,每 Outcome 一测试,`test.describe.serial`)+ `smoke.spec.ts`(全 happy path
单测试)。公共装置在 `specs/_lib/journey-world.ts`(内核语料链 / app 世界 /
WorldManager 单实例纪律 / oracle 与零 spawn 面)。与 SC 腿同跑同纪律:

```sh
just web-test-m3 task-dispatch-execution-loop/step-1-board-browse-multiselect  # 单步文件
just web-test-m3 dual-form-transition/                                        # 单旅程
```

注:① 契约指定 7 个 Outcome 的注入缝在 6.2 基座缺席(内核不可用 / watcher 故
障 / 桥传输故障 / 迁移中外写等),已在各文件头注明 DEFERRED —— 质量门禁止无条
件 skip 空测试,故不生成占位;② dual-form 腿需本机可解析的真实 forge CLI
(`where.exe forge`,SC7 同前提);③ 全量契约派生腿运行时长为小时级(每文件独
立世界,单实例串行),按旅程增量跑。

## 契约派生腿 · M4(T-test-gen-scripts,tests/e2e/specs/&lt;journey&gt;/)

`tests/e2e/specs/<m4-journey>/`(6 旅程,dsh-forge-m4 gen-journeys → gen-contracts
→ **gen-test-scripts** 产物;35 契约 / 87 Outcome):与 M3 派生腿同构 —— 每旅程 =
`harness.ts`(旅程语料世界 + 面向方言)+ `step-*.spec.ts`(每 Contract 步一文件,
每 Outcome 一测试,`test.describe.serial`)+ `smoke.spec.ts`(全 happy path 单测
试)。公共装置在 `specs/_lib/m4-world.ts`(M4 SC 腿技术基座:隔离 DSH_HOME 的
app 世界 + REAL session-persistence 预种通道、实况 workspace.json 读卡、
getProjectionStatus 内核面、project_ui_state 布局面、树/C8/C7/C5/C9/C10 面向
方言)。旅程与 SC 腿同跑同纪律(workers:1 单实例 + 实例锁探针 + 隔离 userData):

| 旅程 | 契约步 | 承载面 |
|---|---|---|
| `project-workbench-home/` | 6 步 10 Outcome | 首屏/树枚举/切换/三区/收纳巡检/重启恢复(500 任务 ≤2s 计测) |
| `project-registration-projection/` | 5 步 13 Outcome | C7 卡六态侦测/三档门控/注册投影同名同序/通道注错重试/DF002 归组 |
| `project-lifecycle-projection/` | 5 步 16 Outcome | healthy/degraded/deviation 状态面/改名/归档≠删除/恢复/删除级联 |
| `split-pane-layout-memory/` | 6 步 13 Outcome | C9 分屏用户径/钳制 30–70/blob 记忆/重进重放/跨项目隔离 |
| `multi-window-tearout/` | 6 步 18 Outcome | C10 拆出/并行互不干扰/收回/驻留+退出漏斗/重进恢复拆出态 |
| `task-session-roundtrip/` | 7 步 17 Outcome | C5 挂接历史/血缘标识/双通道打开/C6 三态/树归拢互证 |

注:① 6 个 Outcome 的注入缝缺席或真链不可达(工作台数据通道故障 / 窗口开窗
故障 / detached 会话通道 / 失效 windowId 收回 / 血缘推断超时 / 拆出侧失效目
标),已在各文件头注明 DEFERRED + 权威承载(cross-ref 单测矩阵或同通道族腿),
质量门禁止无条件 skip 占位;② 若干 Outcome 以可达核承载(路径降级角标 =
sync-error 通道、可写性复检提示面、改名空名提示面、删除投影重试、三 pane 字
面 = vendored 双 pane 预算、树面 20 上限 = dock 权威面、已归档会话解除归档 =
上游原生设置面 N/A 裁决),文件头 VERIFY 注记逐条落依据;③ 全量 M4 派生腿运
行时长为小时级(每文件独立世界),按旅程增量跑。
