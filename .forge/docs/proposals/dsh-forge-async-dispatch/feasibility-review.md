# 可行性评估：dsh-forge-async-dispatch（dispatch-and-watch）

> 评估对象：本目录 `proposal.md`（2026-10-08 初版，外部拟稿后纳入本仓）。
> 方法：对本仓 HEAD（plugin-forge / contracts / core / apps/web / e2e / G1 pin 池）与上游
> 0.2.0-rc.2 包源码（`@deepseek-ai/dsh-jobs` / `dsh-jobs-local` / `dsh-tool-jobs` /
> `dsh-tools` / `dsh-tool-subagent`，node_modules\.pnpm 实物）逐项核对提案 F1–F13 事实基础
> 与改动清单。全部只读核查，未改任何文件。
>
> **结论：可行（有条件）。** 架构成立：13 项事实主张 12 项属实（含 1 项措辞偏差）、1 项
> 部分属实；方案 B 精修版的装配路径经源码核实**比提案表述更直接**。发现 5 项须在 PRD 阶段
> 吸收的修正（C1–C5，无一是方案级障碍）与 1 处范围增量（SC-E 的 UI 部分缺现成通道）。

---

## 1. 事实核实表（F1–F13）

| # | 提案主张 | 核实 | 证据（本仓 / 上游包） |
|---|---|---|---|
| F1 | `SpawnWorkerHandle` 两段式（start 发布即回 / result / dispose） | ✅ 属实 | `dispatch-task.ts:156-164`（类型）+ `in-process-driver.ts:39-65`（真绑定：`run.id` / `run.result.then` / `run.dispose`） |
| F2 | 工具契约无执行中输出通道，`deferContext` 随终值交付 | ✅ 属实 | dsh-tools `lib/types/index.d.ts:305-322`（ToolRunContext 仅 + deferContext/concludeTurn）；`index.js:975-989` 工具体返回后才并入 `additionalContexts` |
| F3 | `JobSpec{kind,label,owner,run}` / `JobHandle{append,updateProgress}` / `JobHooks{cancel,done}` | ✅ 属实 | dsh-jobs `types.d.ts:117-149 / 79-95 / 97-110`（比提案多 `outputLimitBytes`/`output` 两个可选字段，主签名一致） |
| F4 | 泄露路径①：`append` → 输出环 → `job_output` 增量读 = 模型上下文 | ✅ 属实 | dsh-jobs-local `index.js:430-431`（append→ring）→ `:598-609`（readJob）→ dsh-tool-jobs `index.js:339-344`（job_output.execute）→ `:216-221`（chunks 渲染模型文本）。**nuance**：`channel:'log'` 的 append 被过滤、仅观察者可见（`index.js:61-63` + view.d.ts:33-38） |
| F5 | 泄露路径②：`updateProgress` → `JobView.progress` → `job_list` 模型可读 | ⚠️ 部分属实 | `JobView.progress` 存在（view.d.ts:72-73）且 updateProgress 更新它（dsh-jobs-local `index.js:717-728`）；**但 job_list 返回 `publicJob` 投影**（dsh-tool-jobs `index.js:20-39,361-363`），`progress ?? detail` 折叠为单一 `detail` 字段，PUBLIC_JOB_SCHEMA 无 progress 字段名。泄露**方向**成立（进度值仍进模型读），字面机制描述需修正 |
| F6 | 上游后台配方：`jobs.start` + run() 内新建 AbortController + owner=父会话 + settleStart 分类 | ✅ 属实 | dsh-tool-subagent `lib/index.js:276-285`（settleStart：aborted→killed / 其他→failed；**细枝**：AggregateError 即使 aborted 也归 failed）+ `:534-555`（`runtimeCtx.get("jobs")` → start{kind:"subagent", owner: parent.id, run(){ new AbortController() }}）。5 个包变体 SHA256 一致 |
| F7 | `maxConcurrentJobsPerOwner` 默认 10（running+stopping）；owner Agent 销毁自动取消 | ✅ 属实 | dsh-jobs-local `index.js:339/:357`（默认 10）、`:548-551`（running+stopping 口径）、`:523-533/:762-776`（live Agent 挂 `owner.ctx.effect`，disposeOwned 取消+await settled+drop） |
| F8 | worker = 真实子会话（裸 UUID、Agent 注册表在场） | ✅ 属实 | `in-process-driver.ts:45-64`（startInProcessRun 返回真 run，`run.id` 为 worker 会话 id） |
| F9 | forge 事件总线实时广播 task-claimed/spawned/worker-done | ✅ 属实（行号漂移） | `dispatch-task.ts:481/:513/:555`（+ no-ready-task `:472`）；提案引 :350-355 为旧行号。**注意**：总线消费面见 C4——apps/web 不消费 ForgePluginEvent |
| F10 | 结算 happens-before 链闭合（submit 落账 → 回合结束 → result settle → queryTask 读） | ✅ 属实 | 现行阻塞路径 `dispatch-task.ts:520-536` 已依赖同一顺序（result 之后才 queryTask）；结构保证随 job continuation 平移不变 |
| F11 | 无结算防线 / halt 3 连败粘住 / 幂等重入径 | ✅ 属实 | `dispatch-task.ts:168-181`（阈值+Map）、`:429-445`（spawnFailed 计数）、`:455-458`（入口粘住检查）、`:538-547`（无结算→spawnFailed 径）；提案引 :507-516 为旧行号 |
| F12 | per-spawn `toolFilter` 模型面调用参数不可达（负结论） | ✅ 属实（源码级） | dsh-tool-subagent `index.js:252-268`（toolFilter=插件行级 config）vs `:401-429`（模型面 parameters 仅 description/prompt/provider/model/reasoning_effort/run_in_background）；本仓旁证 m3.5 proposal:117/:195。提案标注出处「tech-research §1.1」原文记的是另两条负结论，明确表述在 M3 源码结论引用里——标注略偏、结论无误 |
| F13 | 子代理目录 = worker live transcript 官方 UI | ✅ 属实 | M3.1 已交付（`e2e/specs/m3` + web 子会话树；m3.1 proposal 原型shots 实证） |

## 2. 设计支柱核实（方案为什么成立）

1. **阻塞点单一且结构可移**：整条 execute 中唯一等待 worker 终态的点在
   `dispatch-task.ts:520-527`（`await handle.result`）+ `:532-536`（结算读）；spawn 通道
   本身已两段式（F1）——后台化 = 把这两段搬进 job 的 done continuation，claim/spawn/
   事件/防线全部不动。提案 §4.2 的搬迁清单与源码逐段对得上。
2. **jobs 契约精确支撑容器假设**：`JobHooks.done: Promise<JobOutcome>` + `JobRead.result`
   「结算后首次 read 独家交付」（types.d.ts:150-160）= 干净的「结果等待 + 结算 continuation
   容器」；`JobKind` 为显式开放字符串（view.d.ts:60-61，declaration-merge 扩展），自定义
   `forge-dispatch` kind 零阻碍。
3. **无处可读保证成立，但前提是三件套**：不调 `append`（默认 channel）+ 不调
   `updateProgress` + **不声明 `JobSpec.output` 拉取源**（output 源同样灌 ring——提案未提，
   见 C3）。三件齐备则 ring 空、progress 缺席、job_list 的 detail 无进度内容。
4. **owner = 派发会话 id 精确匹配**：`JobSpec.owner?: SessionId`（会话 id 字符串，非 Agent
   对象）；F7 的销毁取消挂在该会话 live Agent 上——与 F6 配方 `owner: parent.id` 完全同构。
5. **装配路径比提案更直接**：宿主进程内 LocalJobRegistry 已存在（dsh-base
   `cordis.patch.yml:88-89`，服务名 `jobs`；tool-jobs `:275`），与 plugin-forge 同 cordis
   运行时；plugin-forge 已有 `ctx.reflect?.get()` 可选消费双先例（`index.ts:56-93`
   forgeSettings/llm）——注入走 reflect 或 `createForgeTools` deps 均零阻碍，apps/host 侧
   改动可能为零。`job_output/job_list/job_kill` 已对模型可用（本会话工具面即有）。
6. **契约扩展面干净**：`ForgeToolDeps` 已有 `events?`/`settings?` 可选降级先例（`tools/index.ts:26-36`），`jobs?` 同构；`DISPATCH_TASK_OUTPUT_SCHEMA` oneOf 加支即得；事件联合无
   zod，唯一守卫 `bus.ts:25-35` 只查 `type ∈ FORGE_PLUGIN_EVENT_TYPES` 数组——加 `task-progress`
   = 联合成员 + 数组一行 + payload 接口；`run_in_background` 参数措辞有上游同款先例
   （dsh-tool-subagent `index.js:426-429`）可直接照抄。
7. **SC-C 有现成护栏**：`dispatch-task.test.ts` 全场景表、`plugin.test.ts` 工具名 pin、
   `log-listener.test.ts` 事件序列 pin、G1 pin 池（`tests/contract/pin-01…15`，pin-13 事件
   穷举 / pin-10 工具注册面）——前台逐字节等价可被既有测试直接守护；全仓无
   `run_in_background`/`dispatched` 先迹，净新增无冲突。

## 3. 必须修正清单（PRD 阶段吸收，均非方案级障碍）

| # | 修正 | 依据 |
|---|---|---|
| C1 | **SC-D「每任务恰两条 transcript 记录」不成立，须改写**：tool-jobs 对 settled job 的完成通知是**结构性注入**——`quiet` 档也只是不唤醒空闲回合，`owner.inject` 照发（dsh-tool-jobs `index.js:283-296`）；forge job 必须落在模型 `job_output` 可读的同一注册表，通知不可避免。改为「两条工具记录 + 一条有界完成通知（kind/label/status/detail 摘要，无 ring 内容、无进度字节）」。**附带收益**：默认 `wakeup` 档会把空闲 dispatcher 唤醒去收集结算——§10 风险行 1「忘记收集」由机制兜底而非仅靠技能文本；`maxConsecutiveWakes` 预算可防唤醒风暴 | dsh-tool-jobs `index.js:91/:226-296` |
| C2 | **F5 措辞与负向 pin 断言对象修正**：job_list 泄露路径实际经 `publicJob` 的 `progress ?? detail` 折叠；负向 pin 应断言 PUBLIC_JOB 输出面（无 progress 字段名、detail 不含进度内容）+ `job_output` readBody 的 channel 过滤行为 | dsh-tool-jobs `index.js:20-39/:61-63/:95-129` |
| C3 | **显式禁声明 `JobSpec.output` 拉取源**：output 源同样灌输出环——「不调 append」不等于「流为空」。forge-dispatch 的 JobSpec 必须三无：无 append、无 updateProgress、无 output 源 | dsh-jobs `types.d.ts:50-59` |
| C4 | **SC-E 的 UI 部分缺现成通道（唯一范围增量）**：apps/web 对 ForgePluginEvent **零消费**；UI 刷新链是另一条总线（core 写动词 `emitTasksChanged({projectId})` → IPC `forge:events/tasks-changed` → 50ms 合并重取，载荷 Hard Rule 只读 {projectId}）。`task-progress` 事件的现成落点只有 `logs/<slug>.jsonl` + worker transcript + 子代理目录。SC-E 若保留「UI 任务列表进度标签」，须新增 web 通道（core 侧扩展或 web 订阅 jobs/forge 事件）——建议移 Phase 3 或明确为独立接线任务，Phase 1 的 SC-E 改为 jsonl+transcript+子代理目录三件 | core `claim.ts:305`/`submit.ts:140` 等 + `apps/host/src/ipc/m2-wiring.ts` + `apps/web/src/rpc/events.ts` |
| C5 | **行号漂移重锚**：阻塞点 :489-496 → :520-547；事件发射 :350-355 → :472-555；防线 :507-516 → :429-445/:455-458/:538-547。内容全部属实，PRD 按 HEAD 重锚即可 | 本仓 HEAD 实测 |

## 4. 连带改动修正（提案低估的三处）

1. **技能改写面大于「循环一段」**：`packages/plugin-forge/skills/run-tasks/SKILL.md` 的
   description（:3）、总述（:8-12）、Iron Laws（:44）、出口①（:55-58，同步等待语义）、
   出口④ halted/spawn-failure（:84-97，隐含同步返回）、Dispatch Summary（:136-149）全部
   隐含同步结算，需一并改写。
2. **防线回灌**：SPAWN_FAILURES 计数与 halted 出口建立在同步 await 上；后台化后 spawn
   失败/无结算要从 job done continuation 回灌计数，且「连续」语义（结算序 streak）在技能
   文本中明示。
3. **kill taxonomy 细枝**：F6 settleStart 对 AggregateError 即使 aborted 也归 failed
   （非 killed）——§5 kill 行为表补此例外，负向 pin 与 SC-F 断言措辞对齐。

## 5. 新发现的可用机制（提案未用，列为可选增强）

- **`append(channel:'log')` = 现成的「只给观察者看」通道**（不进模型读）：→ **已裁决采用为进度
  承载主通道，见 §8**。
- **`maxConsecutiveWakes` 预算**：防结算唤醒风暴的现成旋钮。
- **`JobSpec.outputLimitBytes`**：提案 §4.4 的终读封顶在 JobSpec 层有原生字段，不必自造。

## 6. 分期与量级判断

- 核心代码量级 ~百行的判断**成立**（dispatch-task.ts 加参数/分支/包装 ≈ 100-150 行）。
- Phase 1 出口若含 C4 的 UI 进度标签，范围 ≈ 提案隐含量的 1.5-2×；剥离 UI（移 Phase 3）
  则与提案量级相符。**建议 Phase 1 = dispatched 分支 + job 包装 + task-progress 事件落
  jsonl + 负向 pin + run-tasks 技能改写**，UI 接线独立成任务。
- 边界窗口须明写：dispatcher 会话结束 → owner Agent dispose → 结算 job 被杀 → 结算读不
  发生 → 任务留 in_progress 走幂等重入（§5 行 1 已有此径，补「结算读可能不发生」的明示）。

## 7. 接受建议（供人裁决）

- **可行**：方案 B 精修版的机制链（F1/F6/F7/F10/F11）经本仓 + 上游源码逐项核实成立，
  装配路径存在且比提案表述更省（宿主 jobs 注册表已在进程内、plugin-forge 有 reflect 消费
  先例）。
- **接受前置条件**：C1–C3 写进 PRD（无处可读保证的三件套 + SC-D 措辞 + pin 断言对象）；
  C4 在分期裁决时明确归属（Phase 1 剥离 UI 或补接线任务）。
- 无方案级障碍；不需要回到方案筛选（A/C/D 的放弃理由经核实仍然成立，F12 有源码级证据）。

## 8. 裁决落位（2026-10-10）：进度承载改用 `append(channel:'log')`

用户裁决：**任务进度利用 `append(channel:'log')`**。本节为核实链与设计后果，已同步回写
proposal.md（§3.3/§4.2/§4.3/§4.4/§6/§7/§8/§9/§12）。

**机制链核实（全部上游 0.2.0-rc.2 实物）**：

- `JobChannel = 'stdout' | 'stderr' | 'log'`，上游注释明示 log = "producer narration
  (**a workflow's phase lines**) that only observers see"（dsh-jobs view.d.ts:33-38）——
  该通道就是为本用途原生设计的；
- 模型消费读过滤：renderModelDelta 过滤 `channel !== 'log'` 之外还分 stdout/stderr 两栏
  （dsh-tool-jobs `index.js:61-64`）；全 log 环的中途读 = `(no new output)` + 状态行（:246）；
- 观察者读不受截留：`outputLimitBytes` "bounds the consuming model surface, **never
  observers**"（types.d.ts:132）；观察流 = `JobRegistry.readAt`（非消费、绝对偏移）+
  `output` 事件通知拉取（types.d.ts:181-210——注册表不推载荷）；
- **人面现成消费者**：web app 已挂载 `dsh-client-ui-jobs`（dsh-web-app cordis.patch.yml:369-372
  "session-header roster with **on-demand streaming**"）——job 行展开即 live 输出面板
  （`ctx.jobs.observe` 流，client.js:303-304/:366/:618），**零新接线**。

**设计后果**：

1. **C4 的 Phase 1 UI 缺口由 jobs 面板补位**——log 通道直通已挂载的 ui-jobs 面板，任务列表
   进度标签移 Phase 3（proposal §8/§9 已改）。
2. **无处可读保证措辞升级**：从「ring 为空」改为「进度仅存于 log 通道块，模型消费面结构性
   过滤」——仍是架构保证（非提示词约定）；负向 pin 改为断言**块级 channel 值域 ⊆ {'log'}** +
   渲染体无进度字节（守护对象 = 上游 renderModelDelta 过滤器的持续在场）。
3. **DispatchJobsFace 收窄**：最小面从「不含 append」改为 `appendLog(line)` 单方法——默认通道
   append 在插件类型面上结构性不可达，比运行时纪律更强。
4. **task-progress 事件职责收缩**：保留为持久化记录（`logs/<slug>.jsonl`——输出环是进程内存态，
   冷重启即失）；Phase 2 会话事件投影亦可双写 log 通道。
5. **原「三件套」修正**：无默认通道 append（log 通道放开）、无 updateProgress、无 `output` 源
   ——C3 的 output 源禁令不变。
