# 逐不变量验证结论

> **锚定时点声明**：本文全部源码行号锚定验证时点（2026-10-29），此后产品码持续演进（如 CE-6 修复使 driver.ts 相关逻辑漂移），行号不保证现行；论证对验证时点成立。

对象模型见 [model.md](model.md)。结论分级：✅ 通过（含论证）/ ⚠️ 条件性偏差（给出确切迁移序列与源码定位）/ ❌ 反例。

| # | 不变量 | 结论 | 反例计数 |
|---|---|---|---|
| 1 | 会话单活 | ✅ | 0 |
| 2 | 源独占 | ✅ | 0 |
| 3 | 无死锁/无饿死 | ⚠️ 条件性偏差 1（有界滞留，有对账恢复径） | 0（未达反例门槛） |
| 4 | 幂等重入 | ✅ | 0 |
| 5 | 防线粘住语义 | ✅ | 0 |
| 6 | wakeupKeys 去重 | ❌ 反例 1（minor，pause 径）+ 语义注记 | 1 |
| 7 | 渲染不变量 | ✅ | 0 |
| 8 | 恢复链活性 | ✅（活性以人工裁决为外部前提——设计语义） | 0 |

**合计：确证反例 1（minor）；条件性偏差 1。**

---

## 1. 会话单活 — ✅ 通过

- start 入口先查 `byOwner`，命中活循环（含挂起，`suspended !== undefined` 计入）即拒 owner-active：exclusivity.ts:94-103、139-142；driver.ts:1253-1267。
- 关键竞态窗口核查：`byOwner` 检查（driver.ts:1256）到 `registry.register`（driver.ts:1340）之间逐行核对**无任何 await**——在假设 A2（同步段原子）下不可被并发 start 交错，单会话至多一登记。
- 挂起态占名额：resume 清 `record.suspended` 才回落 active（driver.ts:1497）；挂起期再 start 仍命中 byOwner。
- 前提：A1（进程内单例 registry）。若装配产生多个 driver 实例各持私有 registry，本不变量不成立——属装配约束，非驱动器缺陷。
- 异常径：announceStartup 抛出/启动期叫停 → 注册即回滚注销（driver.ts:1345-1359），不残留占位。

## 2. 源独占 — ✅ 通过

- 登记与循环出生同同步段：`setExclusiveLoopSource` 紧随 `registry.register`（driver.ts:1343），早于 runLoop 首轮 claim——独占先于任何领取生效。
- 外部两径全封：显式 source 径 claim 前即拒（core.ts:309-313，exclusivity.ts:165-168）；盲选径守卫随 claimTask 入核、命中抛错单事务回滚（core.ts:314/334，exclusivity.ts:175-180，假设 A6）。
- loopSourced 豁免不破独占：豁免只作用于**循环自身**的 claim（`args.identity.loopSourced !== true` 才装守卫，core.ts:309）——循环是独占的**持有者**而非绕过者；且循环串行（A3），自身 claim 之间无第二 dispatcher。
- 注销归属校验防迟到清除误删：`clearExclusiveLoopSource` 校验 loopId（exclusivity.ts:42-45）——旧实例 stop 竞态不误清新实例登记。
- 挂起期独占持续：suspend 不注销（仅终态 finally/stop/dispose 注销，driver.ts:1617-1618、1243、1518），外部 dispatchTask 触达挂起源被工具壳分流到 resume 径（dispatch-task.ts:279-297），不产生 claim。
- 域外注记：EXCLUSIVE_SOURCES 进程内易失（A1）——跨进程双 host 共享任务库的场景不受本机制保护，模型域外。

## 3. 无死锁 / 无饿死 — ⚠️ 条件性偏差 1

**通过部分（论证）**：
- 自动循环必有终局：轮数总量封顶 200（driver.ts:1582-1598）+ 连续 wait 封顶 3 轮（driver.ts:2303-2322）+ quiescence 窗满收口（driver.ts:984）——quiescence「窗内新任务即 continue」不会绕过轮数封顶（rounds 生命周期总量、resume 不清零，driver.ts:832-833、1600）。
- blocked→裁决→恢复→重领可终止：blocked 结算三分支均有界——活后继在场→续领后继（core.ts:250-270）；无活后继→挂起待人工（driver.ts:2001-2008）或 triage 阶梯（处置计数封顶 3，driver.ts:2032、2098-2097；fix 链深 ≤6 结构有界）；triage 决策缓存重放再败即清账升级（driver.ts:2140-2157）——无自动无限重试径。
- 无 blocked 原因的任务滞留核查：pending 可被 claim；本会话 in_progress 可幂等重入回领（claim.ts:385-393）；interrupted 被 adopt 定向恢复（driver.ts:1716-1723）；suspended 由 resume 批量恢复（driver.ts:2394-2421）。

**条件性偏差 DEV-3（有界滞留，有恢复径）**：

- 迁移序列：`dispose()`（fiber 卸载，静默径，driver.ts:1512-1521）或 runLoop 异常终局（catch 后 finally 注销，driver.ts:1608-1621）时点 in-flight worker 未及真化 → 任务滞留 `in_progress` 且 loopSourced 标记在场，进程内**无任何活循环持有它**。
- 此后新循环：claim 幂等重入只回领**本会话 links** 命中的 in_progress（claim.ts:385-393）；adopt 径只定向 `interrupted`（driver.ts:1716-1723，statusFilter 无 in_progress）——**异会话 in_progress 无人认领**。
- 后果：池恒 `inProgress > 0` → classifyPool 恒 `wait` → 新循环 3 轮耐心耗尽 timeout 收口（driver.ts:2303-2322），任务在进程存活期内持续滞留 `in_progress`，无 blocked 原因。
- 缓解（为何未判反例）：下次装配 `reconcileInterrupted` 对账 loopSourced 标记的孤儿 in_progress → interrupted（reconcile.ts:14、driver.ts:787-791 注）——滞留是**有界的**（以装配重启为界），且 stop 正常径 `terminateRecord` 先摘牌再 abort+真化（driver.ts:1222-1226）不产生此窗口；仅静默 dispose/异常径可触发。
- 建议判读：非反例，但若「进程长存不重启装配」是运行常态，则升级为真实饿死窗口；可在 dispose 径补 in-flight 真化（当前注释明示为设计取舍，driver.ts:787-791）。

**定轨两案对比（2026-10-30 补，支撑裁决）**：

| | 方案甲：恢复径扩展（dispose 径补 in-flight 真化） | 方案乙：reconcile 对账扩展（判据按需触发） |
|---|---|---|
| 触及面 | dispose/异常终局径新增真化写入 | 对账触发面（如挂接新循环启动的在飞检查，driver.ts:1678-1679 已查 in_progress） |
| 需重验 | **不变量 4**（摘牌/真化配对唯一）——abort 竞态下须证明 dispose 径不与 stop/bail 径双真化，需形式化重验 | 不触碰已验证配对，零重验 |
| 语义一致性 | 与「dispose 静默为设计取舍」的现状注释相逆，需改注释与取舍记录 | 与 S3 裁配期对账同源（registry 进程内易失、重启即对账），只是把判据从装配期扩展到可触发时点 |
| 成本 | 高（重验 + 竞态收口序） | 低（触发点挂接 + 判据复用） |

**定轨结论（已裁决）**：采方案乙 reconcile 对账扩展。

## 4. 幂等重入 — ✅ 通过

- in-flight 登记/注销配对点穷举（每对均原子同同步段）：
  - 登记 driver.ts:1762 ↔ 摘牌：spawn 失败 1800 / 结算后 1872 / stop 面先摘 1223 / pause 面先摘 1433 / bailIfAborted 2362。
  - bailIfAborted 与 stop 面双径不双真化：stop 先摘 `inFlight` 再 abort（driver.ts:1221-1224），bailIfAborted 读到 `orphan === undefined` 即让渡（driver.ts:2360-2365）——配对唯一。
- 重复结算：每次 spawn 句柄只被 `settleClaimed` await 一次（driver.ts:1854）；spawn 失败径任务留 in_progress 走重领（不走 submit-blocked），重领是 `reclaimed=true` 无状态转移（claim.ts:313-315），简报重合成 digest 新值——零重复 spawn（同任务同时刻仅一个活 worker：旧 worker 已异常终止/被 kill 后才重入）。
- 重复 spawn 泄漏：worker-abort 重入径（driver.ts:1949）在 `record.inFlight := ∅`（1872）之后返回，重领前窗口内无 in-flight 双写。
- 记账幂等：`recordTaskStart` 不覆盖首记（driver.ts:1088-1090）；`recordTaskEnd` 删键防重入重复计时（1093-1095）。

## 5. 防线粘住语义 — ✅ 通过

- 恰在下次派发同步入口兑现：`spawnFailureStuck` 检查位于 claimForDispatch **先于 claimTask**（core.ts:316-319）与 dispatchCore 入口（core.ts:554）——第 3 次失败置 stuck 后，下一次派发领任务前即 halted，不会先领任务再弃置 in_progress。
- 「连续」= 结算序 streak：成功结算恒清零（core.ts:513 前台 / 644 后台 job 回灌径；guard.ts:31-34）；循环径 worker 异常终止 `guardOnFailure=false` 不进防线（core.ts:530，driver.ts:1860）——执行受阻与 spawn 机制故障分流清晰。
- 并发结算序核查：同一 guardKey 的结算在全序内（A3 循环串行；工具壳径同一会话的前台调用串行）；后台 job 的 bump 在 done continuation 内按结算序回灌（core.ts:668）——成功清零与失败 bump 不存在同一键上的乱序交错窗口。跨键互不污染（guardKey 参数化，guard.ts:2-4）。
- 粘住后循环终局：haltLoop 终局注销三表（driver.ts:2329-2354、1612-1621）；复活 = 新 LoopInstanceId = 新 guard 计数（decisions #18，registry.ts:3-6）——「同实例不自动复活」语义成立。

## 6. wakeupKeys 去重 — ❌ 反例 1（minor）+ 语义注记

**通过部分**：suspendWithWakeup 径键 = `minor:taskKey:reason` 全文（driver.ts:1057），同因复发（reason 全文一致）不再 send（1058-1060），异因新发必出卡；键生命周期 = ActiveLoop 实例域（863）——与 2055da00 修复语义（键收敛到单次成因事件、实例域终身）一致。

**反例 CE-6（minor）：pause 径唤醒绕过去重集。**

> **修复现状（收敛后记，2026-10-30 补注）**：CE-6 已按 bug 5a245dd1 @ `cf543388` 收敛（pause 径接入 wakeupKeys 同键判重，现行位置 driver.ts:1590-1598）；其后去重键两轮演进——2055da00 @ `296ab202`（键收敛到成因事件）、40e3201b @ `cf543388`（pause 径复发收口），台账均 fixed。本节反例陈述为验证时点快照（当时锚 driver.ts:1470-1475），原文不改。

- 迁移序列：owner 对同一任务 `pause(reason=R)` → followup 出卡（driver.ts:1470-1475，**不查不写 wakeupKeys**）→ `resume` → 再 `pause(reason=R)` → **第二张同因同任务卡**。
- 源码定位：driver.ts:1470-1475（pause 径直接 `narrator.followup`，无 wakeupKey 判定）；对照 suspendWithWakeup 的 1057-1060。
- 影响：消息面重复（同因复发 >1 卡），零正确性影响（挂起投影/任务真化幂等）；与 suspend 径的去重纪律不一致。
- 语义注记（非缺陷）：「同因」判别 = reason 全文**字符串相等**——worker 输出内嵌可变内容（尝试次数/时长）时，语义同因将按异因出新卡。这是 2055da00 修复的既定取舍（键含成因全文，driver.ts:1054-1056 注），去重不变量在句法相等语义下成立。

## 7. 渲染不变量 — ✅ 通过

- 永不回 null：buildViewNode 所有分支恒返回节点对象——state 在场走正常路径；`state === undefined`（官方 replayContexts 淘汰 start match 后置 void 0，假设 A7）与畸形 state（streamStateOk 判假）均回**同 key 同 id + visibility:'hidden'** 保底节点，锚 seq 以 start/matches 携带事件 seq 兜底（forge-event-node.ts:405-437）——覆盖 withdrew 断言的全部可达分支。
- 组卡计数 ≡ 渲染行数：`visible ⇔ state.emit ∧ (entries>0 ∨ progress>0)`（419）；卡内 data.entries/data.progress 即组全量（428-435）；emit 判定 `group.lastSeq === seq`（396）——组内恰一成员（seq 全序）为末成员，其余成员同 key hidden，一组恒恰一块；fold 从不删条目（222-301），无计数漂移源。
- 组卡锚：`forgeEventGroupAnchorSeq` 取消息/progress 双轨组尾（350-360），turn 已结束重锚 turn/end seq——位置不落入过程折叠体。

## 8. 恢复链活性 — ✅ 通过（人工裁决为外部前提，设计语义）

- 链路完整性：挂起（suspendForVerdict / pause 写 `record.suspended`，driver.ts:997-1001、1434）→ 处置（fix 链 addTask blockSource:true 完成自动恢复源任务；挂起卡经人工/处置改态）→ re-entry `dispatchTask` → `resume`：清 suspended + pause 信号换新 + restorePausedCards 批量 suspended→pending（driver.ts:1490-1510、2394-2421）→ runLoop 从留存点续跑（运行时状态保留，1505）→ claim 正常领取。
- 无永久自动 blocked：blocked 任务必有出口——活后继续领（core.ts:266）、triage 三动作建 fix/继任/wait（有界）、或挂起交人工；挂起可被任意会话 re-entry/stop（接管集，dispatch-task.ts:283-284）。resume 拒绝码三态（no-active-loop/not-suspended/aborted）封住竞态双写（driver.ts:1490-1496）。
- 有界性：fix 链深 ≤6（driver.ts:904）、处置计数 ≤3（driver.ts:2032）、轮数 ≤200——活性链不会空转。
- 前提声明：deadlock/blocked-ask-user 类挂起的最终解除依赖人工裁决——这是 3b 的显式设计（「处置是 owner 职责」，exclusivity.ts:75），不属于自动活性反例。
