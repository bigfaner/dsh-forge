---
name: run-tasks
description: Forge 派发循环——后台派发直到 no-task，经 job_output 抽干各在途任务的结算，再继续派发；携带模式错配守卫行与 fix-chain 协议正本。
---

# Run Tasks（派发器）

驱动 forge 任务池：每轮一次 `dispatchTask` 调用，`run_in_background: true`。
该工具认领下一个就绪任务，携带派发简报生成 worker，并立即返回派发回执
（taskRef / workerSessionId / jobId / 池快照）——结算不在返回值里，简报也
不进入本会话上下文。持续派发直到 `no-task`；等待裁决（仍有工作在途）即
抽干点——用 `job_output` 读取每个在途任务的结算，然后继续派发结算新解锁
的工作。worker 落定时会结构化推送完成通知——优先在推送时收取，抽干点为
第二道防线；因此轮中读取 job 从无必要。状态只经管线动词变更，绝不经文件、数据库或平行状态。

两种容器模式下行为一致：容器可以是 feature（远征链）或直接挂任务的
proposal（突击链）。选择依据是 DAG 就绪度——`/run-tasks <slug>` 把循环
绑定到该单一容器（见下）；容器内部仍无指定具体任务的途径，这是有意设计。

## 容器绑定（source_kind + source_slug）

以 `/run-tasks <container-slug>` 调用时（派发入口恰好传入这个），slug 把
整个循环绑定到该单一容器：

1. 先一次性解析容器类别并在每次调用时携带：slug 是 feature 目录则为
   `feature`，是 proposal slug 则为 `proposal`（对容器任一任务 queryTask
   会报告容器类别）。类别解析不出就问用户——绝不猜。
2. 循环的每一次 dispatchTask 调用都传 `source_kind` + `source_slug`
   （两者同传或同缺）。范围化认领：只选该容器就绪任务；会话重入也只恢复
   同容器的 in_progress 任务——本会话此前全池认领的外容器任务不会被
   范围化循环恢复。
3. 没有独立的归因参数：无任务就绪时，no-task 事件自动归因到
   `source_slug`（`logs/<slug>.jsonl`）；缺 source 对则回退
   `logs/_pool.jsonl`。

不携带 source 对时，dispatchTask 全池认领（程序/RPC 调用方，以及确实未
绑定容器的循环），池快照也是全池口径。携带 source 对时，快照四项计数只
覆盖该容器——上述裁决只针对该容器，外来工作不出现在数字里。范围化循环
拿到 `no-task` 且容器快照全部落定，即该容器完成，即使池内他处仍有待办；
报告为该容器已收尾，而非全池完成。

## 派发器铁律

<EXTREMELY-IMPORTANT>
1. 每轮一次 `dispatchTask` 调用；派发到 `no-task`，经 `job_output` 抽干
   在途任务，再派发。只依据回执、已抽干的结算和池快照决策——绝不依据
   轮中 job 读取。此外无任何东西驱动任务池。
2. 一任务一 worker：回执标记 `re-entered` 意味着该任务在本会话已有一笔
   未落定的派发——绝不再为它调用 `dispatchTask`；等该 job 的结算（完成
   通知，或抽干点的 `job_output`），然后才继续循环。
3. 派发器自身零代码读写——worker 执行；本会话只做编排。
4. 零直接跑测试——质量门属于 worker 和 run-tests 技能。
5. 不造工作：无任务就绪时按下方池裁决行事——绝不为了喂饱循环而虚构任务。
</EXTREMELY-IMPORTANT>

## 循环——dispatchTask 的四种退出

### 1. `dispatched` · 后台回执

调用立即返回——其中没有结算：回执行（`▸ dispatched
<slug>/<localId> — job <id>`）、常驻收取行（`collect the settlement when
the worker settles: job_output <id>`）与池快照。记下 jobId 并再次调用
`dispatchTask`。结算本体（自然键、类型、mode 血统、摘要、如有提交哈希）
稍后送达——完成通知告诉你 worker 已落定，抽干的 `job_output <id>` 读取
携带该块。

回执以 `▸ re-entered dispatched <slug>/<localId> — job <id>` 开头即重复
生成绊线：被认领任务对本会话已是 `in_progress`，本轮触发时上一笔派发
仍未落定——一个任务上并行两个 worker 正是此警示针对的失败形态。按铁律 2，
不要再为该任务调用 `dispatchTask`——等在途 job 的结算（完成通知 /
`job_output`）并从那里恢复派发；回执自带的指引行说的也是同一件事。
节奏良好的循环不会见到此回执：它只在上轮同任务 job 仍存活时又派发了一轮
才出现。

### 2. `spawned` · 受阻

worker 以某原因落定为 blocked；若生成了后续 fix 任务会一并列出（它可
派发——直接继续循环）。若结算显示无后续、且失败值得走 fix 链，按下方
fix-chain 协议自行生成，然后继续。

一种受阻形态不属于 fix 链材料：等待其他容器任务的原因（"同批文件，
尚未落地"）。fix 任务无法让别人的工作落地——把受阻键加外部容器键呈报
用户做合并或排序决策，且当本容器无其他就绪工作时按"等待外部容器"收尾。

### 3. `no-task` — 读池裁决

返回携带池快照（`pending` / `in_progress` / `blocked` /
`unmetPending`）——携带 source 对时范围限于所绑容器（仅未范围化调用才是
全池）——以及基于同一口径的裁决：

| 裁决 | 含义 | 动作 |
|---|---|---|
| 池全部落定——收尾 | 一切已终态 | 结束循环，打印派发汇总 |
| 有工作在途或前置未满足 | 任务可能稍后就绪 | 有界耐心：暂停后重试；连续多轮无动静则收尾，建议稍后重派 |
| 疑似死锁（blocked 且无 pending 路径） | 存在受阻任务，无任何任务可就绪 | 连同受阻键呈报用户——需要人工或诊断介入；不要继续空转 |

### 4. `halted` — 会话粘滞的生成守卫

连续三次 worker 生成失败即粘住本会话：下一次 `dispatchTask` 入口立即返回
`halted`。失败在 worker 的 job 内部落定，守卫按结算顺序计数——一笔抽干
的成功即清零连败，job 杀除永不计数。守卫无自解锁——重置方式是**新派发
会话**（冷启动清零计数器）。把原因报告用户并停止；建议经派发入口重入，
它会在容器的模式下开启新会话。不要试图从本会话绕过。

### 生成失败（`✗ ERR_SPAWN_FAILED`）

一次生成失败——或一个没有结算就结束的 job——会让被认领任务停留在
`in_progress`；重调 `dispatchTask` 会幂等重入（简报重新合成）。被杀的
运行（`job_kill`）是同一形态：任务 `in_progress`，且杀除本身永不计入
守卫。重试同一调用；反复失败会在下一次派发入口触发 `halted` 守卫。若
环境本身已坏，呈报人工流转而不是继续循环。

## 模式错配守卫（可见，绝不阻断）

结算携带容器的 mode 血统（`expedition` / `blitz`）。若被派发容器的 mode
与本会话 preset 不符（如远征会话派发突击 proposal 的任务），该轮打印一行
可见提示——例如：

> 模式错配：容器 `<slug>` 是 `blitz`，本会话运行 `expedition` preset——
> 继续执行、不予阻断。平台在首轮后锁定 preset，开启与容器模式对齐的会话
> 由用户决定。

然后照常继续。错配只影响*新*会话继承哪份技能目录，不影响执行；绝不因
它暂停、跳过或重排工作。

## Fix-Chain 协议（单一入口——正本在此，语义逐字冻结，见对照表留档）

当任务落定 blocked 且无 worker 生成的 fix 时，用一个 fix 任务隔离它：
该 fix 任务携带受阻任务为 source 并阻断它：

```
addTask { source_kind: "<feature|proposal>", source_slug: "<container slug>",
          title: "Fix: <reason>", type: "<coding-fix|doc>",
          source_task_slug: "<blocked task slug>", source_task_local_id: "<blocked task local id>",
          block_source: true, task_desc: "<cause>",
          vars: ["SOURCE_FILES=<paths>", "TEST_SCRIPT=<test>", "TEST_RESULTS=<output>"] }
```

- 按来源类别定 fix 类型：`coding` / `test` / `validation` / `gate` →
  `coding-fix`；`doc` / `eval` → `doc`。
- 你附上的 `vars` 会以派发简报 `VARS:` 行的形式送达 fix worker——把
  fixer 需要的一切（`SOURCE_FILES`、`TEST_SCRIPT`、`TEST_RESULTS`）放进
  去；不搭 var 的上下文永远到不了。
- 机械部分由工具承载、无需监督：`fix-N` 本地 id、同事务阻断 source、fix
  完成时自动恢复（`submitTask` 结果会列出被恢复的任务），以及深度上限
  （≤6——更深的生成会被拒绝；到顶时呈报用户而非硬造）。
- 缺 `block_source: true` 的 source 引用会生成不阻断 source 的 `disc-N`
  差异跟进——保留给范围外发现，不用于受阻工作。

## Dispatch Summary

循环结束（池落定、有界耐心耗尽、死锁呈报或 halted）时，先抽干——读取
每个仍在途 job 的结算；带着未抽干 job 收尾会报出尚不存在的计数。然后
报告：

```
## Dispatch Summary

- Rounds: <N> — dispatched <N>; drained settlements: completed <N>, blocked <N>
- Pool at stop: <pending / in_progress / blocked / unmetPending from the last snapshot>

<one line per non-completed task: `<slug>/<localId> — <status> — <short reason>`>
<one line for surfaced deadlocks / halt reason / mismatch notes>
```

派发器永不编辑文件、永不提交；那些属于 worker。
