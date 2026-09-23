# e2e fixture 工程(任务 6.1)

Phase-6 e2e 腿(SC1-SC7)共用的数据地基。全部装置只提交生成器/桩模块,**绝不提交生成产物**(Hard Rule);每次运行写入 journey 私有临时目录,测试后清理。

## 模块

| 模块 | 作用 | 主要消费方 |
|---|---|---|
| `task-generator.ts` | 确定性任务集模型生成器(同种子同输出;500 任务/50 feature 预设) | 6.2(SC1)、6.4、6.5 |
| `forge-project.ts` | 模型 → 完整 forge 项目树(indexer 2.5 方言逐字对齐)+ 注册桥辅助 | 6.2/6.3/6.4/6.5 |
| `stubs/cli.ts` | stub forge CLI(`version` / `prompt get-by-task-id` / `task status`,退出码/超时/溢出可编排) | 6.3(SC2 probe + 逐字符注入)、6.5(SC7 终端形态) |
| `stubs/channel.ts` | stub 会话通道(test 侧半身:control 编排 + journal 观测) | 6.3(SC2/SC3) |

## 生成器旋钮(task-generator.ts)

`generateTaskSet({ seed, taskCount, featureCount, danglingRate?, recordRate?, tasksPerPhase?, gates?, statusWeights? })`

- `seed` — 确定性根;同 seed + 同 options ⇒ 同模型 ⇒ 同文件字节。
- 7 态分布:`statusWeights` 配置权重;无论权重,前 7 个任务轮转全词表保证 7 态齐备。
- 依赖:`<phase>.<seq>` 本地 ID,1-3 条近期前驱(链 + 菱形);`danglingRate` 比例改写为永不生成的 `99.1`(悬空引用原样保留)。
- 记录:`recordRate` 比例带执行记录;actor 混合 `session:*` / `terminal` / 无行(来源徽标 ground truth)。
- `sc1TaskSet()` — SC1 预设(500 任务/50 feature)。
- 方言纪律:branch 恒 null / worktree 恒 false(forge 文件不携带这些字段 —— 不虚构)。

`writeForgeProject(set, { codeRoot, docsRoot? })` — `docsRoot` 缺省 = 仓内形态;显式分离即 SC5 仓外 doc_location 形态。返回 `indexPaths`(权威文件,回流腿的改动入口)。

## stub CLI(stubs/cli.ts)

- **消费面**:`DSH_FORGE_CLI_PATH = stub.cliPath` 显式路径喂给 4.1 解析链;`version` 探针无 cwd(继承宿主子进程 cwd),`prompt`/`task status` 以注册项目根为 cwd。
- **win32 机制(T2:解析器只接受原生可执行)**:`forge.exe` = 内建独立 node.exe 的副本。node 以任何文件名运行仍是 node —— 主入口按 cwd 解析:`version.js` 在 **Electron launch cwd**(`stub.launchCwd`,启动时传 `cwd`),`prompt.js`/`task.js` 由 `stub.attachProject(projectRoot)` 写进各项目根,全部一行 `require(<home>/dispatch.cjs)`。POSIX 直接用 shebang 脚本,无需上述配合。
- **编排**:`stub.writeControl({ version?: {...}, prompt?: { mode: 'ok'|'fail'|'hang'|'overflow', text?, ... } })` —— control.json 每次调用重读,调用间改写即切换行为。
- **观测**:`stub.readJournal()` — 每次调用的 `{at, argv, cwd}`。
- **固定合法 prompt**:默认输出含 `TASK_ID:` / `TASK_FILE:`(cwd 索引查得绝对路径)/ `TASK_CATEGORY:` 与字节稳定哨兵行 `STUB-FORGE-PROMPT 5.21.0-stub`(SC2-2 哈希断言);索引无该 id 时按真方言 `task "x" not found in index` 退出 1。
- **`task status`**(SC7 对拍):扫 cwd 的 `docs/features/*/tasks/index.json`,每任务一行 `<featureSlug>/<localId>\t<status>`,排序输出。

## stub 会话通道(stubs/channel.ts + 插件侧 session-channel-stub)

- **为什么是 env 缝**:DF004 主通道按调用从 `ctx.sessionController` 解析,而 cordis `provide()` 对重名服务直接抛错 —— 进程内无法在真控制器旁注册替身;唯一注入口 = 插件 host 半身内 `DSH_FORGE_SESSION_STUB_DIR` 缝(未设置 = 真通道,生产字节不动)。
- **三态编排**(AC4):`channel.writeControl({ create: 'ok'|'fail'|'hang', prompt: 'ok'|'fail'|'hang', ... })`。
- **观测**:`channel.readJournal()` — `create` 行(sessionId/cwd)、`prompt` 行(**逐字完整首条用户消息**,prompt + FORGE_ACTOR 行,SC2-2 逐字符哈希 oracle)。
- **结束事件**:`channel.markSessionEnded(sessionId)` 追加 `{kind:'session-ended'}` —— 会话无终态信号(spike-1 §5),「结束」是桩侧事实,journey 据此驱动 endSessionLink。

## env 缝清单(本任务落地)

| 缝 | 侧 | 语义 |
|---|---|---|
| `DSH_FORGE_USER_DATA` | 壳(main) | userData 显式覆盖(workbench DB / plugin-runtime overlay / 单实例锁全随之隔离)。6.x 腿一律传 journey 临时目录 —— **结构化消除 ERR_SINGLE_INSTANCE 跨 run 毒化**(每 journey 独立锁),也消除 5.14 的注册表跨 run 累积 |
| `DSH_FORGE_PROJECT_ROOTS` | 壳 → host spawn | 生产投喂(6.1 落地):每次 host spawn 前从 projects 表刷新;**显式设置(非空)优先** —— 测试档案覆盖通道(5.11 leg B 先例) |
| `DSH_FORGE_CLI_PATH` | env 直通 | 无持久化设置源;外部显式设置即生效(不覆写)。stub CLI 经此注入 |
| `DSH_FORGE_SESSION_STUB_DIR` | 插件 host 半身 | TEST-ONLY:设置即换文件编排桩通道(见上) |

## 隔离与卫生

- 一切装置文件只落 journey 临时根(`mkdtemp`);`removeForgeProject(root)` / 删临时根即清理。
- 自检腿:`e2e/forge-fixture-selfcheck/selfcheck.spec.ts`(生成 → 注册扫描 → 对拍 → 清理一条冒烟)。
- 运行前置:`pnpm build:desktop && pnpm build:plugins`(装置驱动真实 main.cjs 与插件 tarball);全量 e2e 前仍按惯例确认本机无开发实例在跑(隔离 userData 已使跨实例锁毒化不可能,但资源占用仍是噪音)。
