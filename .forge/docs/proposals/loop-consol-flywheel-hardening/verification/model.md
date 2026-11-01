# 派发任务循环状态机 · 形式化模型

> **锚定时点声明**：本文全部源码行号锚定验证时点（2026-10-29），行号不保证现行；论证对验证时点成立。

对象：forge dispatch loop（`packages/plugin-forge/src/loop/driver.ts`）+ 独占/守卫核心（`dispatch-core/`）+ 渲染组卡（`apps/web/src/client-plugin/forge-event-node.ts`）。
形态：**精化伪代码状态机（迁移关系显式列举）**——TLA+ 收益有限（核心难点是单线程 JS 事件循环内的 await 交错点与模块级易失表生命周期，伪代码状态机 + 交错点标注可精确覆盖）。

## 1. 状态变量

| 变量 | 类型/域 | 源码锚 |
|---|---|---|
| `Registry` | `Map<LoopInstanceId, LoopRecord>` 进程内活循环表 | registry.ts:83-111 |
| `EXCLUSIVE_SOURCES` | `Map<"kind::slug", {source, loopId}>` 模块级易失独占表 | exclusivity.ts:34 |
| `SPAWN_FAILURES` | `Map<guardKey, count>` 模块级易失防线计数 | guard.ts:14 |
| `record.inFlight` | `LoopInFlight?`（v1 恒 ≤1，串行结构） | registry.ts:61, driver.ts:11 |
| `record.suspended` | `SuspendedPayload?`（在场即挂起态） | registry.ts:63 |
| `loop.spawnFailures / workerAborts / waitRounds / rounds` | 循环实例运行时计数 | driver.ts:818-833 |
| `loop.dispositions` | `Map<taskKey, {attempts, history, decision?}>` 处置簿 | driver.ts:825, 866-877 |
| `loop.wakeupKeys` | `Set<"minor:taskKey:reason">` 唤醒去重已发集 | driver.ts:863, 1057 |
| `loop.pause / loop.controller` | 双 AbortController（stop 杀循环体 / pause 只中断在飞） | driver.ts:802-808, 2428-2442 |
| `Pool` | `taskStats` 四键投影 + unmetPending（外部持久域） | pool.ts:6-22 |
| `Stream.groups / closed / turnEndSeqs` | 渲染 fold 累积态（纯函数） | forge-event-node.ts:92-99 |

## 2. 迁移关系（关键迁移 + await 交错点标注）

并发假设：JS 单线程事件循环；迁移原子性边界 = 相邻 `await` 之间（下称「同步段」）。多循环之间经 Registry/EXCLUSIVE_SOURCES/SPAWN_FAILURES 三张共享表交互。

### M1 start(owner, source)
```
同步段 A：ownerRejection ← byOwner(owner) 非空 → 拒 owner-active      driver.ts:1256
          active ← bySource(source) 非空 → 拒 loop-active            driver.ts:1270
同步段 B（无 await，直到注册完成）：
          id ← uuid(); Registry[source] := record
          EXCLUSIVE_SOURCES[source] := id                            driver.ts:1340-1343
await announceStartup    ← 交错点 W1（失败/被叫停 → 回滚注销）       driver.ts:1345-1359
异步：runLoop(loop) fire-and-forget                                  driver.ts:1380
```

### M2 runRound（每轮，串行）
```
r0 signal ← stop ∪ pause 合成；aborted → unwind（stop→terminal / pause→suspend）  driver.ts:1709-1710, 2449
r1 adopt：interrupted 最早项 → adopt 定向领                        driver.ts:1716-1723
r2 claim（含 halted 入口粘住检查 → 先于 claimTask）                 core.ts:317-319, driver.ts:1732
r3 claim 后 bail 检查（stop 竞态：孤儿真化 interrupted）             driver.ts:1746, 2358-2366
r4 inFlight := task；recordTaskStart（不覆盖首记）                  driver.ts:1756-1765, 1088
r5 spawnClaimed（失败：inFlight := ∅；guard bump（halting→halted）；backoff base×N 后重入） driver.ts:1793-1836
r6 settleClaimed（await handle.result；成功清零 SPAWN_FAILURES）    core.ts:493-532, 513
r7 结算分流：success→continue / landing-rejected→suspend / killed→unwind
   / halted→haltLoop(terminal) / worker-abort→bounded 重入（>3 挂起）
   / blocked→活后继静默 | 无进展硬停挂起 | triage 阶梯（add-fix / split / wait-external / ask-user→挂起） driver.ts:1872-2226
r8 no-task：done→first-pass 收口+quiescence 窗→terminal / wait→bounded patience（3 轮超时 terminal）
   / deadlock-suspected→suspend                                    driver.ts:2232-2325, pool.ts:28-32
```

### M3 挂起/回流
```
suspendForVerdict：record.suspended := payload；runLoop 保留登记退出（finally 不注销） driver.ts:997-1001, 1613
suspendWithWakeup：incident+progress+wakeupKey 去重 send；收尾同上       driver.ts:1016-1075
pause：摘 inFlight → 写 suspended → pause.abort → 任务真化 suspended    driver.ts:1425-1479
resume：suspended非空 ∧ controller 未 abort → 清 suspended → pause 换新
        → restorePausedCards（suspended 卡批量 → pending）→ runLoop 续跑 driver.ts:1490-1510
terminateRecord：先摘 inFlight 再 abort → 孤儿真化 interrupted → 注销三表 driver.ts:1219-1246
dispose：遍历 live：abort + 注销（静默，遗留 in_progress 归 reconcile）  driver.ts:1512-1521
```

### M4 claim 核心（外部 vs 循环）
```
external = ¬loopSourced：
  显式 source 径：EXCLUSIVE_SOURCES 命中即抛（claim 前拒）             core.ts:309-313, exclusivity.ts:165
  盲选径：守卫回调随 claimTask 入核，命中即抛 → 事务整体回滚           core.ts:314, 334
halted 粘住：SPAWN_FAILURES[guardKey] ≥ 3 → 直接 halted（不 claim）    guard.ts:17-19, core.ts:317, 554
claimTask：pending→in_progress 转移；in_progress 本会话 links 命中 →
  幂等重入 reclaimed=true（无状态转移）；adopt 忽略 links 接管目标      claim.ts:313-315, 385-393, 620-633
```

### M5 渲染 fold/发射
```
fold：forge 事件/progress/人类插话 → 组模型（人类插话 closed=true 收口前组） forge-event-node.ts:222-301
buildViewNode：state 缺失/畸形 → 同 key hidden 保底节点（恒非 null）    forge-event-node.ts:405-437
visible ⇔ emit ∧ (entries>0 ∨ progress>0)；emit ⇔ seq = group.lastSeq  forge-event-node.ts:396, 419
```

## 3. 建模假设（每条附锚）

- **A1 单进程单装配单例**：Registry / EXCLUSIVE_SOURCES / SPAWN_FAILURES 均为进程内易失表，装配面注入单例（driver.ts:1215-1216；exclusivity.ts:15、33-34；guard.ts:3-4）。跨进程/多 host 实例共享同一任务库不在模型域内。
- **A2 JS 单线程 + 同步段原子**：M1 同步段 A→B 之间无 await（逐行核对 driver.ts:1256-1343），故「查 byOwner → 注册」不可被其它 start 交错。
- **A3 循环串行**：v1 恒 ≤1 in-flight，结算返回后才续领（driver.ts:11、1600-1601）；同一 guardKey 的结算序即全序，无并发结算。
- **A4 claim 幂等重入语义**：本会话 links 命中的 in_progress 盲选必回领（reclaimed=true，claim.ts:385-393、605-612）；adopt 忽略 links 精确接管（claim.ts:620-633）。
- **A5 fix 链自动恢复**：addTask(blockSource:true) 单事务置源 blocked + fix 完成自动恢复 pending（driver.ts:2110）；链深上限 FIX_CHAIN_DEPTH_LIMIT 有界（driver.ts:904）。
- **A6 独占守卫事务性**：盲选径守卫抛错 → claimTask 单事务回滚零残留（exclusivity.ts:8-11）。
- **A7 渲染宿主契约**：官方 replayContexts 淘汰 start match 后置 `context.state = void 0` 但 Context 留在 contextsByTarget——已物化 target 的 buildViewNode 回 null 即抛 withdrew（forge-event-node.ts:406-412）。
- **A8 池域外部性**：Pool 由持久任务库决定；状态迁移合法性与 reconcileInterrupted（进程重启对账 loopSourced in_progress，`packages/core/src/forge/tasks/reconcile.ts:58-75`）视为环境机械，模型只标注其存在。

## 3.1 未覆盖面汇总

以下各域**未在模型/论证范围内**（散见各假设与不变量条目，此处集中声明，不视为已验证通过）：

- **跨进程双 host**：共享同一任务库的多进程/多实例部署不受 Registry/EXCLUSIVE_SOURCES/SPAWN_FAILURES 进程内易失表保护（A1、不变量 1/2 域外注记）。
- **reconcile 环境机械内部**：reconcileInterrupted 自身的收敛判据与事务性视为环境机械，仅标注存在（A8），未展开验证。
- **官方渲染宿主 replay 语义**：A7 依据官方包源码阅读，未对官方 replayContexts 行为做独立运行期验证。
- **Pool 外部域**：任务库持久层的事务行为按 A6/A8 假设成立，模型不覆盖持久层内部。

## 4. 终止性论证骨架

轮数封顶 `rounds ≥ maxRounds(200)`（driver.ts:1582-1598，生命周期总量、resume 不清零）+ 连续 wait 封顶 3（driver.ts:2303-2322）+ quiescence 窗满收口（driver.ts:976-989）+ sleepOrAbort 全部等待点可被 stop/pause 打断（driver.ts:1194-1211）⇒ runLoop 无无限自动循环；每个非 terminal 出口必为 suspend（保留登记、可 resume）或经 finally 三表注销（driver.ts:1612-1621）。
