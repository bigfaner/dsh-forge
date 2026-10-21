# 评审报告：app-observability（应用错误证据链可观测性）
- 评审日期：2026-10-19（独立 subagent，仅依据提案文本与仓库/官方包源码）
- 评审对象：`proposals/app-observability/proposal.md`（Draft，2026-10-19）
- 证据基线：`apps/host/src`、`packages/contracts`、官方包 `node_modules/@deepseek-ai/*`（host 锚树 0.2.0-rc.2）与 `apps/host/profile.dev/node_modules/@deepseek-ai/*`（运行时全量闭包）

---

## 一、需求满足吗

需求段五个缺口逐一对照：

| 缺口 | 方案覆盖 | 核销结论 |
|---|---|---|
| ① 折叠吞栈 | 方案 1 折叠点落栈 | ✅ 折叠点真实存在：`@deepseek-ai/dsh-api-gateway/lib/types/index.js` `rpcFailure()`（L1046-1063）——非 RemoteError 折为 `gateway/internal`，只保 message、**丢栈**；unary 路径 `invokeRpc` catch 直调 `rpcFailure`（L484-487），stream 路径经 `wireStream.failure`（L63）。与提案「gateway/internal 类非 RemoteError」的口径逐字吻合 |
| ② 捕获静默 | 方案 1 + 2 | ⚠️ 部分覆盖，见 Blocker-1 |
| ③ 多进程无日志汇 | 方案 2/3 | ✅ 三进程源真实：main（Electron 进程本体）、child（`run.ts:271-273` spawn）、renderer（`window/create.ts` webContents 面已有类型化消费先例）；`console-message` 是 Electron webContents 既有事件，转发可行 |
| ④ 无关联 ID | 方案 5 | ⚠️ 官方线上已有 `rpcId` 关联 id（`dsh-client-connection/lib/index.js` `clientRequestSchema.rpcId` + `RpcId()` 品牌化，L1160 附近）——见 Question-1 |
| ⑤ fail-open 掩蔽 | 方案 6 | ✅ 现状属实：`worktree-rpc.ts:772/816` 两处 fail-open warn（当前仅经 diag→harness.log）——方案是增量计数行，非新建机制 |

假设的既有能力核销（全部读源码验证）：

- **diag 既有通道** ✅：`bridge.ts:214-218/663-670`（diag 桥消息）→ `run.ts:193-201/248`（onDiag 扇出）→ `main.ts:113-120`（noteHarnessLog 落 harness.log）。「归入 appender 单源」有真实迁入对象。
- **DSH_FORGE_DEV_PROFILE** ✅：`profile/paths.ts:79-84` dev 形态单一判定源，真实存在。
- **dev:debug CDP 既有** ✅：根 `package.json:13` `dev:debug = dev.mjs --remote-debugging-port=9222`。
- **打包版无终端** ✅：child stdio `['ignore','inherit','inherit','ipc']`（`run.ts:273`）在打包形态回流无处落地——需求陈述与代码一致。
- **折叠点官方留缝** ✅：`TypertGatewayService` 是 cordis Service（`static inject=['typert']`，同文件 L14-17），可经 ctx 具名取法取得实例；`invokeRpc` 为实例方法——方法 wrap 属 AGENTS 合法缝清单（槽位影子/wrap）；零改制可行。但提案未点名具体缝，见 Note-1。

## 二、方案周密吗

- 根因判断正确：折叠丢栈的根因是折叠函数只保 message（`rpcFailure` L1050-1062 `details: {}`）且折点零日志——「栈在抛出点留存」直击根因，不是在 toast 面贴补丁。
- 单写者设计正确：三进程汇入 main 持有的单一 appender，天然规避多写者竞争；且宿主已启用单实例锁（`window/lifecycle.ts:9-12` `requestSingleInstanceLock`），多实例并发写同一日志的风险被既有机制消解。
- 已覆盖的边界：打包无终端、dev/生产分流（零税生产）、CDP 安全面裁决（不向打包版开放，有风险论证）。
- 未覆盖/表述错位的边界：见 Blocker-2（child stderr 继承链不可转写）与 Note-3（滚动清理的 Windows 句柄占用、50MB 截断语义）。

## 三、改动收敛吗

- 改动面与代码库实际相符：`apps/host/src`（appender/boot/window/ipc 均真实存在）、`packages/contracts`（真实存在）；列出的 worktree-rpc 拦截层（`ipc/worktree-rpc.ts`）与 fail-open 埋点落点（L772/816）真实。
- 官方包零改制可行：折叠点挂接可落在 `TypertGatewayService.invokeRpc` 方法 wrap + `wireStream.failure` 属性替换（实例自有可写面），无需改官方源码——本报告已核销落点（见 Note-1）。
- 新增件各有不可替代理由：appender（无既有统一汇，harness.log 只覆盖 child diag 单链）、causeStack（官方 rpcFailure 硬性 `details: {}`，不改官方只能 dev 侧自带）、fail-open 计数（现状 warn 无计数语义）。
- 无想象未来的抽象：未引入日志框架依赖/远端上报，收敛。

## 四、表述清晰吗

- 图文一致，mermaid 图与方案要点 1-6 一一对应；一致性检查表双向核对成立。
- 验收可测：1/3/5/6 可由 vitest + e2e playwright（`e2e/playwright.config.ts` 真实存在）承载；验收 1（打包形态）属真机取证，与 AGENTS 外部依赖结算门口径一致。验收 4 依赖 dev/prod 双生境，`DSH_FORGE_DEV_PROFILE` 判定可测。
- 术语「gateway/internal 类」有官方代码佐证，可唯一理解。

---

## 问题清单

### Blocker（返工项）

1. **「任何被捕获的错误自动留存」覆盖有洞——host 自有 IPC 面的捕获错误无落日志路径。**
   需求（提案 L12）：「任何错误（含被 UI/拦截层捕获的）自动留存到统一日志」。方案只埋三类源：网关折叠（官方面）、fail-open（仅 worktree-rpc 拦截层 `worktree-rpc.ts:772/816`）、renderer console 转发。但宿主自有 RPC 面的捕获错误（`ipc/*.ts` 各 handler catch → error envelope，如 `fs-rpc.ts`、`remote-http-rpc.ts:128`「永不 reject」等）既不进 console、也不是 fail-open 路径，方案下仍静默。且 toast 面捕获若渲染侧未打 console，console 转发同样接不住。
   **修法建议**：在 `ipc/rpc-envelope.ts`（信封单点）统一埋点——错误信封生成即落 appender 一行（含栈），一处改动覆盖全部自有 RPC 面；或收窄需求表述为「网关面 + 拦截层 + console 可见错误」并说明剩余豁免面。
2. **「child stderr 继承链 → main 转写」与现状机制错位。**
   child 现为 `stdio: ['ignore','inherit','inherit','ipc']`（`run.ts:273`，注释明示「S1 run3 母本同款（官方 Desktop 同款）」）——`inherit` 直通父进程 stdio，**main 无法拦截转写**；打包版父进程无终端即彻底丢失。转写必须把 stdout/stderr 改为 `'pipe'` + main 转发——这是一处未列入改动面的 spawn 行为变更，且 pipe 后 dev 终端将失去直通回显，需 main 回写 stdout 补偿，否则 dev 生境控制台日志回归即破。
   **修法建议**：提案显式列出 `run.ts` stdio 变更 + dev 回显策略（main 收到 pipe 行 → appender + `process.stdout` 直写），并记录对「官方 Desktop 同款」spawn 模式的偏离理由。

### Question（呈用户裁决）

1. **requestId 自造 vs 复用官方 rpcId**（方案 5 / L53）。官方请求信封已带 `rpcId`（`dsh-client-connection/lib/index.js` `clientRequestSchema.rpcId` + `RpcId()`），错误回包同信封往返。自造新 id 与复用优先纪律相抵；但 rpcId 只覆盖 RPC 面，渲染/兜底钩错误无 rpcId。建议：RPC 面日志行直接携带官方 rpcId，非 RPC 面另生成——请裁决口径。
2. **50MB 截断 + 7 天清理的失败路径未提**（方案 3 / 验收 3）。Windows 下目标文件被并发打开（如用户正开日志文件、harness.log 归并过渡期双消费）时 rename/unlink 报 EBUSY/EPERM。单实例锁（`lifecycle.ts:12`）消解了实例间竞争，但外部读者仍在。建议补一句降级策略（清理失败跳过次日重试 / 截断采用「超限后 reopen 追加写入」语义需明确）。

### Note（留档）

1. **折叠点挂接的具体缝应点名**：`TypertGatewayService.invokeRpc` 方法 wrap（unary 折叠，`dsh-api-gateway/lib/types/index.js:484-487`）+ `wireStream.failure` 属性替换（stream 折叠，L63），实例经 cordis 具名服务取法获得。拆解任务时把此落点写死，避免派发时再猜。
2. **diag/harness.log → appender 的归并次序**：`main.ts:113-120` 的 harness.log 链与新区 appender 将有一段双轨；提案「归入单源」未写切换是否保留 harness.log 路径（Harness 菜单 showLog 依赖 `harnessLogPathOf`，`main.ts:118`）。建议任务拆解时明确：appender 单写、harness.log 面保留兼容或同文件改名。
3. **验收 6 的「多进程写入」单测**：真实形态是三进程——单测只能模拟并发 append 面，端到端三进程证据归验收 1（真机），建议在验收 6 注明单测边界，避免执行时越界造 fake 进程树。
4. **console-message 转发级别**：只转发 warn/error 合理，但 Electron `console-message` 事件含 devtools 来源行，转发时需裁剪（结构化行格式已在方案内，留档提醒即可）。

---

## 放行结论

**Blocker 2 项（均需求覆盖洞/机制错位类，修法明确、改动小），未清零 → 暂不放行。**

- Blocker-1（IPC 捕获错误覆盖洞）与 Blocker-2（child stderr 机制错位）均返工 brainstorm 修订后重评；两处修订都不动方案骨架（统一 appender + 折叠点挂接 + dev causeStack 的主干经源码核销全部成立）。
- Question 2 项随修订稿一并呈用户裁决；Note 4 项留档供任务拆解消费。

---

# 重评（第 2 轮，2026-10-19）

评审对象：`proposals/app-observability/proposal.md`（修订稿，仍 Draft）。本轮任务：核验上轮 Blocker-1 / Blocker-2 是否清零 + 四问全量复核。证据：`apps/host/src/ipc/rpc-envelope.ts`（全文 40 行）、`apps/host/src/boot/run.ts:273`、`apps/host/src/ipc/*.ts` 全量 grep。

## 一、Blocker 清零核验

### Blocker-1（host IPC 捕获错误静默）→ ✅ 清零

- 修订落点真实：方案 7（提案 L57）+ 改动面 L63「`ipc/rpc-envelope.ts` 单点埋点」+ 验收 6（L75）+ mermaid 图 IPC 源框（L26）四处一致。
- 机制与代码相符：`rpc-envelope.ts:28-40` `rpcEnvelope` 确为宿主全部自有 RPC 面的唯一信封单点——`bugs/docs/features/fs/knowledge/projects/proposals/remote/settings/tasks/worktree` 各 `*-rpc.ts` 的 `ipc.register` 全部经 `rpcEnvelope` 包装（grep 全量核销），catch→`serializeRpcError`→错误回包仅此一处。在此单点埋日志 = 一处改动覆盖全部自有 RPC 面，与修订声明吻合。
- 验收 6 可测：handler 抛 typed error → 回包正常 + 日志含栈条目，vitest 可直接驱动（`rpc-envelope.test.ts` 既有同型用例）。

### Blocker-2（child spawn 'inherit' 不可拦截）→ ✅ 清零

- 修订落入改动面：L63 显式列「run.ts child spawn `inherit`→`pipe` + 回显」；现状核销：`boot/run.ts:273` 确为 `stdio: ['ignore','inherit','inherit','ipc']`，注释明示「S1 run3 母本同款」——改动面陈述与代码实际逐字相符。
- 偏离记录到位：方案 2（L52）与图 CHILD 框（L24）均显式标注「`inherit` 不可拦截——对官方 Desktop 同款模式的显式偏离，评审 Blocker 2 修订」，偏离理由与裁决点已留档。
- dev 回显补偿已含：L52「`'pipe'` + main 回显转写」覆盖上轮「dev 终端失去直通回显」的补偿要求（回显 = appender 转写 + 控制台回显），表述自洽。

## 二、四问全量复核（重点：新引入条目）

1. **需求满足** ✅：五缺口 ↔ 方案 1/2+7/2+3/5/6 逐条对应无洞；上轮 Question-1（rpcId）已按「复用官方 rpcId、非 RPC 面时间戳对齐」收口（方案 5）；Question-2（清理失败路径）已补降级策略（方案 3：句柄占用跳过本轮 + 重试，验收 3 对应可测）。
2. **方案周密** ✅：新引入的折叠点挂接缝已点名到 `TypertGatewayService.invokeRpc` 方法 wrap + `wireStream.failure` 属性替换（L65，上轮 Note-1 收口）；一致性检查段（L78-80）双向核对成立、无互斥条目。
3. **改动收敛** ✅：新增面仅 rpc-envelope 单点一行级埋点与 run.ts stdio 参数变更，无新机制/新依赖；「评审已核销」声明与上轮报告核销结论一致。
4. **表述清晰** ✅：「四类错误源（三进程 + host IPC 面）」口径全文统一；验收 1-7 均可测。

## 三、问题清单（本轮）

### Blocker：0 项

### Question：0 项

（上轮 2 项 Question 均已由修订吸收，无新增待裁决项。）

### Note（留档）

1. **非 typed 错误的残余静默面**：`rpc-envelope.ts:36` 非 typed 错误原样上抛（fail-loud 设计），该路径不经错误回包、若不在方案 7 埋点范围内则仍不落日志。该面属编程错误、renderer 侧拒绝面可见（非静默捕获），影响小；建议拆解时顺带在 rethrow 点同落一行（同一文件 +1 行），彻底闭合「任何错误」表述。
2. **pipe 回显的显式 stdout 补偿**：`'pipe'` 后 child 的 stdout/stderr 均改管道，dev 控制台回显需 main 侧 `process.stdout` 直写；方案「回显转写」已覆盖语义，拆解时把「回显 = appender + process.stdout 直写」写死即可。
3. **图 CHILD 框只画了 stderr 管道**：改动实为 stdout+stderr 双管道，图示与文字略有出入，不影响可理解性。

## 四、放行结论

**Blocker 0 项（上轮 2 项均清零），Question 0 项，Note 3 项留档 → 放行，可提请用户裁决。**

---

# 重评（第 3 轮，2026-10-19）

评审对象：`proposals/app-observability/proposal.md`（第 2 轮放行后经用户裁决新增方案 7 定版 / 11 / 12 与验收 9）。本轮任务：核验四处新增面 + 四问全量复核。新增证据：`apps/host/profile.dev/node_modules/@deepseek-ai/cordis/lib/index.js:258-282`（emit 同步性）、`apps/host/src/ipc/worktree-rpc.ts:744-847`（拦截面）、`apps/host/src/main.ts`（装配序全文）、`apps/web/src/rpc/{client,transport}.ts`、`apps/web/src/client-plugin/plugin.ts`、`apps/web/src/views/remote/remote-transport.ts`（renderer invoke 面）。

## 一、新增面核验

### 方案 11 拓扑裁决（central 单文件单写者）→ 结构前提成立，一处崩溃路径例外（Blocker-1）

- **单写者前提** ✅：单实例锁（`window/lifecycle.ts:9-14`）消解多实例并发写；renderer 无 fs 权限（`window/create.ts:64-66` contextIsolation + nodeIntegration:false 佐证）本就须经 main——「各进程自写不成立」的裁决与代码一致。
- **生命周期覆盖** ✅（带早窗豁免，见 Note-3）：child 由 main spawn（`main.ts:80`）、window 创建在其后（`main.ts:129`）——appender 先于两者初始化即全覆盖；child 关停走 `before-quit` → `host.shutdown()`（`main.ts:132-139`），正常生命周期内写者存活窗覆盖全部日志窗口。
- **截断与单写者交互** ✅：滚动/清理/50MB 截断均由唯一写者对自身持有的句柄 reopen/truncate 完成，无第二写者，单写者语义自洽；外部读者占用已有方案 5 降级（跳过 + 重试）。
- **例外**：兜底钩行的落盘在崩溃路径上有竞态，见 Blocker-1。

### 方案 12 性能红线 → 三条均可测，一处红线①与崩溃路径相抵（并入 Blocker-1），一处内存上界未定（Question-2）

- ① fire-and-forget：可测（注入写失败句柄断言丢弃计数行，见验收 9 核验）；② 管道背压：拦截层落点真实（`run.ts:273` `inherit`→`pipe` 后 main 消费 child stdout），背压判定可抽象为流面纯函数单测；③ 折叠：同文重复行折叠为纯函数，`changes.summary` 404 轮询噪音源声明与 `apps/web/src/client-plugin/plugin.ts` 轮询面存在性相符。
- 未考虑性能面：JSONL 序列化开销可忽略（每行一次 stringify）；但 **appender 自身的 fs 写队列在洪泛下无界**——红线②只护了 child stdout 管道这一跳，main 侧 emit 洪泛（错误风暴）时 fire-and-forget appendFile 在 fs 线程池积压无上界，与 Windows commit 内存纪律正面相关 → Question-2。

### 方案 7 trace_id 分链传播 → 与方案 1 组合自洽，一处落位歧义（Question-1）

- **ALS × cordis emit 交互已核销自洽**：`ctx.emit` 为同步分发（官方源码 `cordis/lib/index.js:275-282`「Run listeners synchronously without waiting for returned promises」）——emit 点处于 ALS 上下文内时，appender 订阅回调在同一同步栈执行、可同步读 ALS 取 trace_id。前提约束见 Note-1（序列化须在订阅回调内同步完成 + 订阅回调绝不抛）。
- **链 B 挂点真实**：拦截层确为 prompt 链天然挂点——`interceptRequiredBinding`（`worktree-rpc.ts:795-822`）wrap `controller.prompt`，judge/reroute 派生调用（L808-811）均在包裹内；fail-open 两处（L772/816）即方案 9 埋点。注意拦截层在 **child 侧**（L744/790），trace_id 须在 child emit 时同步入诊断行、经 stderr 管道到 main 转码保留——管道断点未被「bridge 方法调用显式携带」字面覆盖，见 Note-2。
- **链 A**：renderer 生成点的落位存在歧义 → Question-1。

### 验收 9 可测性 → 成立（附拆解前提，Note-4）

- 写失败句柄：appender 以可注入写函数构造（vitest 直接驱动，无需真盘故障）；慢背压：以受控流替身（不消费的 pipe / 手动 pause 的 fake duplex）驱动背压判定单元；现有 vitest 设施均可构造。前提是三条红线逻辑以 DI 缝从 boot 装配抽出为可单测单元——拆解时保留注入缝即可，无需真机或 fake 进程树。

## 二、四问全量复核

1. **需求满足** ✅：五缺口 ↔ 方案逐条对应仍无洞；新增 11/12 是需求锚点（单文件排查、不卡业务）的结构与红线化，非范围扩张。
2. **方案周密** ⚠️：主链周密；崩溃路径落盘语义（Blocker-1）与洪泛内存上界（Question-2）两处边界未闭合。
3. **改动收敛** ⚠️：改动面陈述与方案 7 新定版之间有落位歧义（Question-1：若链 A 生成落 apps/web 侧则改动影响范围漏列该包）；其余新增面（rpc-envelope、run.ts、拦截层、appender）均与代码库实际相符。
4. **表述清晰** ✅：一致性检查表更新后双向核对成立；验收 9 与方案 12 三条红线一一对应、判据明确。

## 三、问题清单（本轮）

### Blocker（返工项）

1. **红线①「写盘全部 fire-and-forget」未给崩溃路径落盘语义——「哪里崩的」核心证据存在丢失竞态，验收 1 的 main 兜底钩路非确定可测。**
   兜底钩（uncaughtException/unhandledRejection）触发的时刻常伴随进程退出决策：现有 boot catch 即 `console.error` 后 `app.exit(1)`（`main.ts:141-143`）；若兜底钩自身选择记录后退出（或用户强制关闭），fire-and-forget 的异步 `appendFile` 可能未落盘即被杀——恰是需求第一问「哪里崩的」的证据行。红线①防的是业务路径反压，与崩溃路径同步落盘不冲突。
   **修法建议**：方案 12 增补一句——崩溃路径（兜底钩行）以 `fs.writeFileSync` 同步落盘（或退出前 flush），业务路径维持 fire-and-forget；验收 1 同步注明崩溃路径行可断言。改动一句话级，不动方案骨架。

### Question（呈用户裁决）

1. **链 A trace_id 生成点落位（preload vs apps/web）**。方案 7 写「renderer 侧 `dshForge.invoke` 批次生成」；renderer 侧 invoke 有三处镜像消费面（`apps/web/src/rpc/client.ts` `invokeRpc`、`apps/web/src/client-plugin/plugin.ts` 镜像、`apps/web/src/views/remote/remote-transport.ts`），逐处改造则**改动影响范围（提案 L77-82 只列 apps/host/src + packages/contracts）漏列 apps/web**；若落 preload（`apps/host/src/ipc/preload-*`，renderer 暴露面单点）则改动面自洽且天然单点。请裁决生成点：preload 单点（收敛，建议）或 apps/web 改造（补列改动面）。
2. **日志洪泛的 appender 内存上界未定**。红线②只护 child stdout 一跳；main 侧错误风暴时 fire-and-forget 写队列在 fs 线程池无界积压（与 AGENTS Windows commit 纪律正面相关）。建议补一条红线④：待写队列超上界（如 1000 行 / 8MB）即丢弃 + 计数（与红线①丢弃语义同构）。

### Note（留档）

1. **appender 订阅回调的同步性约束（方案 7 × 方案 1 组合的实现前提）**：`ctx.emit` 同步分发已核销（cordis `lib/index.js:280-282`），但 ALS 上下文只在同步栈内可见——trace_id/上下文字段读取与 JSONL 序列化必须在订阅回调内同步完成，fire-and-forget 只许覆盖磁盘写；且订阅回调自身绝不抛（emit 同步把 listener 异常落回业务 emit 点，将破红线①）——appender 须整体 try/catch 包裹。
2. **链 B 的 stderr 管道断点**：拦截层在 child（`worktree-rpc.ts:744/790`），其诊断行经 stderr 管道回 main——方案 7「bridge 方法调用显式携带」未点名这条管道断点；拆解时明确：child 侧 emit 时同步把 trace_id 写入行负载，main 转码保留该字段。
3. **appender 初始化前早窗**：`main.ts:60-79`（单实例锁 → profile 物化/安全模式）的错误发生在 appender 可初始化之前，属「任何错误」的豁免窗；拆解时尽早初始化 appender（`resolveHostPaths` 之后即可），并在需求/方案声明早窗边界，避免验收时对不上。
4. **验收 9 的注入缝为拆解前提**：写失败句柄/慢背压/折叠三条均要求红线逻辑从 boot 装配抽出为依赖注入单元（现有 vitest 可承载）；拆解任务时把 DI 缝写死，防止实现时把逻辑焊死在 main 装配里导致验收 9 不可单测。
5. **main 崩溃后 child 孤儿窗（可接受）**：main 硬崩后 child 对端消失，stdout pipe 背压触发 child 侧丢弃 + 内存计数随 child 退出丢失——该窗口证据本就属崩溃后残留，可接受，留档不处理。

## 四、放行结论

**Blocker 1 项（崩溃路径落盘语义，一句话级修法），Question 2 项，Note 5 项留档 → 暂不放行，修订后重评清零即放行。**

- 方案 11 拓扑前提、方案 7 分链机制与方案 1 的组合（emit 同步性）、方案 12 三红线可测性、验收 9 注入缝均经源码核销成立；唯一 Blocker 是方案 12① 的字面表述未豁免崩溃路径，修订成本一句话。
- Question 两项（链 A 生成点落位、洪泛内存上界）可随修订稿一并呈用户裁决。

---

# 重评（第 4 轮，2026-10-19）

评审对象：`proposals/app-observability/proposal.md`（第 3 轮后修订稿）。本轮只做**清零核验**（不重复全量四问），加快速扫新引入问题。新增证据：`apps/host/src/ipc/preload-api.ts`（invoke 单点面核销）。

## 一、修订点逐项核验

### Blocker B-1（崩溃路径落盘语义）→ ✅ 清零

- 方案 12①（提案 L69）：「**崩溃路径豁免**——兜底钩（uncaughtException/unhandledRejection）行伴随退出，须同步写或退出前 flush（核心证据行不许丢，评审 B-1）」——与第 3 轮修法建议逐字对应（同步写 or 退出前 flush 二选一，语义闭合）。
- 业务路径表述未被误伤：同条仍保留「appender 写盘 fire-and-forget，业务路径永不 await」——豁免与红线①防反压目的不冲突，语义自洽。
- 验收锚点已补：验收 9（L95）「崩溃路径（兜底钩行）行经同步写/flush 确定落盘」——第 3 轮「验收 1 的 main 兜底钩路非确定可测」的疑虑消除，验收 9 承载该断言可测。

### Question Q-2（洪泛内存上界）→ ✅ 清零

- 方案 12④（L69）新增：「main 侧待写队列上界——超界丢弃 + 计数（防 fs 线程池无界积压，评审 Q-2）」——红线④补齐，丢弃 + 计数语义与红线①同构，AGENTS Windows commit 纪律的关切面闭合。
- 验收 9 同步扩：「待写队列超上界 → 业务路径不受阻照常完成，丢弃与计数按红线语义落日志」——可测（受控注入超界，vitest 可驱动）。

### Question Q-1（链 A 生成点落位）→ ✅ 清零（按建议取 preload 单点）

- 方案 13 新增（L70）：「链 A 的 renderer 侧生成收敛于 **preload 单点**（`preload-api.ts` invoke 面统一生成/携带——三处镜像消费面零改动）」——采纳第 3 轮建议项，改动面自洽（不涉 apps/web，改动影响范围 L80 无需补列）。
- 落点真实：`preload-api.ts:98-104` `invoke(channel, payload)` 确为 renderer 侧全部 forge invoke 的唯一暴露单点（allowlist 守门 + 单一转发），「单点生成/携带、三镜像零改动」与代码实际相符。
- 一致性检查（L99）已同步更新：「7↔方案 7/13（trace_id 贯穿 + preload 单点生成）」——全文口径统一，无残留旧表述。

### 验收 9 扩充 → ✅ 与方案 12 对应完整

- L95 现覆盖：写失败句柄 / 慢背压 / 队列超上界三路丢弃 + 计数 + 业务不受阻，另加崩溃路径确定落盘——方案 12①②③④ 四条红线全部有对应判据，可测。

## 二、新引入问题扫描

- **Blocker：0 项。**
- **Question：0 项。**
- **Note：0 项新增**（第 3 轮 Note 1-5 不受本轮修订影响，继续留档供任务拆解消费；其中 Note-1 的订阅回调同步序列化约束在 preload 单点定版后依旧成立——trace_id 由 preload 生成随 payload 入 ALS，appender 订阅回调内同步读取的前提不变）。

## 三、放行结论

**Blocker 0 项（第 3 轮 B-1 清零），Question 0 项（Q-1/Q-2 均由修订吸收），Note 0 项新增 → 放行，可提请用户裁决。**

- 四处修订均一句话级落稿、落点与代码库实际相符（preload-api.ts invoke 单点经源码核销），方案骨架未动；第 1-3 轮累计 3 项 Blocker、4 项 Question 全部清零。
