# 派发循环状态流转（现状机制 + awaiting-verdict 增改）

## 状态全集

| 状态 | 载体 | 含义 |
|---|---|---|
| **无实例** | registry 无登记 | 初始/结束后；新 start = 新实例新 guard 计数 |
| **running** | registry 活登记 | runRound 轮转：恢复→领取→spawn→结算→判定 |
| **waiting**（running 子态） | `waitRounds` 计数 | 池无任务可领但在飞/前置未满足——patience 停顿后续轮 |
| **awaiting-verdict**（本提案新增） | registry 活登记 + 挂起标记 | 遇裁决升级点：停止续派、留存升级载荷，处置后 re-entry 续接 |
| **终态**（登记即删，五径） | registry 删除 | settled / halted / stopped(killed) / timeout / 异常兜底 |

## 状态图

```mermaid
stateDiagram-v2
    [*] --> running : start（独占守卫放行）\n拒绝→ERR loop-active
    running --> running : claim→spawn 成功→结算 success\n（重试/耐心计数复位，续轮）
    running --> running : blocked+followUp\n（blocked-with-fix 留痕，续领 fix）
    running --> running : blocked 有进展→triage\n（add-fix / split / wait-external）
    running --> waiting : no-task 且 classifyPool=wait\n（在飞未结/前置未满足）
    waiting --> running : patience 停顿到期续轮
    waiting --> timeout : 连续 wait ≥ 封顶\n（结束消息+重派指引）
    timeout --> [*]
    running --> spawnBackoff : spawn 失败\n（计数+1，退避 base×N）
    spawnBackoff --> running : 退避到期幂等重入
    spawnBackoff --> halted : 连败 ×3（guard 粘住）
    running --> halted : claim 即 halted（guard 入口兑现）
    halted --> [*] : 结束叙述+escalate(halted)\n同实例不自动复活
    running --> workerAbortRetry : worker 异常终止\n（计数+1，立即重入）
    workerAbortRetry --> running : 重入
    workerAbortRetry --> [*] : 超限→escalate(worker-abort-over-limit) 结束
    running --> noProgress : blocked 无进展\n（零 commit hash 且零 files）
    noProgress --> [*] : 跳过阶梯直达 escalate 结束
    running --> triageOverLimit : triage 重试超限 /\nfix 链深 ≤6 到顶 / ask-user 决策
    triageOverLimit --> [*] : escalate 结束
    running --> deadlock : no-task 且 classifyPool=deadlock-suspected
    deadlock --> [*] : escalate(deadlock) 结束
    running --> stopped : stop（abort 信号）\n孤儿 in-flight 真化 interrupted
    stopped --> [*] : killed 终态（零 bump 零 tool-error）
    running --> awaitingVerdict : 〔提案 3b〕升级点不结束\n改挂起（留存载荷，登记不删）
    awaitingVerdict --> running : 处置回流→re-entry 续接\n（stopTaskLoop/stop 仍可结束）
```

## 事件 → 状态 → 处置明细

| # | 事件 | 状态迁移 | 处置（通知/问询/落库） |
|---|---|---|---|
| 1 | `start`（指令/工具） | 无实例→running | 独占守卫拒绝则 `loop-active`（报活循环归属）；启动对账（S3：有 in-flight 续叙述，否则 from-scratch） |
| 2 | claim 成功 | running 内轮转 | 领取 notice（S4）+ 进度事件；interrupted 任务走 adopt 定向恢复径 |
| 3 | claim 返回 no-task | →classifyPool 三态 | `done`→settled 结束（finished-all 叙述）；`deadlock-suspected`→escalate+结束（blocked-pool 叙述）；`wait`→waiting |
| 4 | spawn 失败 | running→spawnBackoff | spawn-failed-retry notice，退避 base×N；×3→haltLoop（结束叙述+escalate(halted)，同实例不复活） |
| 5 | 结算 success | 计数复位，续轮 | completed notice + 进度事件；处置簿清账 |
| 6 | 结算 blocked+followUp | 续轮（不升级） | blocked-with-fix 留痕——fix 就绪自然被领 |
| 7 | blocked 无 followUp·无进展 | →结束 | 无进展硬停门：跳过 triage 阶梯，直达 escalate(blocked-ask-user) |
| 8 | blocked 无 followUp·有进展 | →triage 阶梯 | add-fix（blockSource，链深≤6）/ split-remainder（disc-N）/ wait-external→续轮；ask-user 或重试超限→escalate 结束 |
| 9 | worker 异常终止 | →workerAbortRetry | 立即重入同任务（不退避）；超 LOOP_WORKER_ABORT_MAX_RETRIES→escalate 结束 |
| 10 | stop | →stopped | abort 信号；stop 面接管在飞真化 interrupted；killed 终态零 bump |
| 11 | 宿主重启 | 全部→无实例 | registry 进程内存——重启即空（S3 启动对账兜底） |
| 12 | 〔提案〕升级点 | running→awaitingVerdict | 不再 escalate+结束：载荷留存登记、工具响应带挂起返回；处置回流→re-entry 续跑；stopTaskLoop/stop 仍可结束 |

## 提案增改点（相对现状）

- **升级点语义反转**：现状 #7/#8-ask-user/#9-超限/#4-halted/#3-deadlock 一律「escalate→结束（登记删除）」；3b 起升级点改为 **awaiting-verdict 挂起**（登记保留、可 re-entry 续接）——死锁根源（工具内循环撞 ask-user）随之消除；
- `halted` 保持结束不变（guard 粘住语义，decisions #18 不动）；`settled`/`stopped`/`timeout` 结束不变；
- waiting 的 patience 封顶（timeout）与 3c 宽限窗（wait-for-quiescence）为两个不同机制：前者=池无任务可领的重试上限，后者=结束前等编排层新派任务的静默宽限。

## 全景路径图（提案落地后形态）

任务循环从发起到收口的全部路径——派发、blocked 处置、上报求助（挂起）、其它会话接管、停止、各类结束：

```mermaid
flowchart TD
    subgraph START["① 发起与门控"]
        CALL["dispatchTask(slug)——必带容器参数"] --> G1{"本会话已有活循环？\n（含挂起中——会话级单活）"}
        G1 -->|"是"| REJ1["拒绝：先结束/停止/处置当前循环\n或换会话发起"]
        G1 -->|"否"| G2{"该容器已有活循环？"}
        G2 -->|"是 · 他人循环"| P2["P2 守卫响应（归属+入口）\n挂起中附挂起摘要——其它会话接管入口"]
        G2 -->|"是 · owner 重调"| STAT["循环运行中状态摘要（非拒绝）"]
        G2 -->|"否"| REG["registry 登记，P1 注入 owner"]
    end

    subgraph ROUND["② 执行轮（循环后台自动推进）"]
        REG --> CLAIM["领取就绪任务\n（后继任务优先 > 分支延续 > priority > 创建序；\ninterrupted 最早者优先恢复）"]
        CLAIM --> SPAWN["派发 worker 执行"]
        SPAWN --> SETTLE["结算"]
    end

    SETTLE -->|"success"| NEXT["计数复位，续轮"]
    NEXT --> CLAIM

    subgraph BLOCKED["③ blocked 处置"]
        SETTLE -->|"blocked + 活的后继任务\n(pending/in_progress)"| SILENT["静默：notify 通知 + 留痕\n续领后继任务"]
        SETTLE -->|"blocked + 无进展\n(零 commit 且零 files)"| HARD["无进展硬停门"]
        SETTLE -->|"blocked + 有进展"| TRIAGE["triage 处置阶梯\n（循环内 LLM 代理，封闭四动作）"]
        SILENT --> CLAIM
        TRIAGE -->|"add-fix / split-remainder"| ADDSUCC["后继任务落库 → 续轮（fix 优先被领）"]
        TRIAGE -->|"wait-external"| WAITX["记录外部依赖 → 续领其它"]
        TRIAGE -->|"ask-user / 重试超限 / 链深到顶"| HARD
        ADDSUCC --> CLAIM
        WAITX --> CLAIM
        SILENT -.->|"后继任务死了\n(自身 blocked 无下级 / 被放弃)"| HARD
    end

    subgraph SUSPEND["④ 上报求助：挂起（awaiting-verdict）"]
        HARD --> SUSP["循环挂起：载荷留存 record.suspended\n停止续派，登记保留"]
        SUSP --> P3["P3 挂起消息 → owner\n（工具响应 / user message 双径）\n+ P3 驻留 owner 系统提示词"]
        P3 --> VERIFY["主会话复核（汇报是输入不是指令）\n读代码 / queryTask 验证"]
        VERIFY -->|"1. 派修复"| FIX["addTask(source_task+blockSource)\ntaskDesc=复核结论+复现路径+验收标准"]
        VERIFY -->|"2. 改任务"| UPD["updateTask 调整范围/验收标准"]
        VERIFY -->|"3. 转交用户"| USER["用户终裁 → 回到 1 或 2"]
        FIX --> REENTRY
        UPD --> REENTRY
        USER --> REENTRY
        REENTRY["dispatchTask(slug) re-entry\n（不占会话名额）"]
        REENTRY -->|"清 suspended 回落 active"| CLAIM
    end

    subgraph TAKEOVER["⑤ 其它会话接管（owner 失活时）"]
        OTHER["其它会话调 dispatchTask(slug)"] -->|"守卫响应附挂起摘要"| TVERIFY["接管会话复核处置（同 ④）"]
        TVERIFY --> REENTRY2["处置后 re-entry（owner 不变）"]
        TVERIFY --> STOPX["或 stopTaskLoop 清场\n（挂起态任意会话可停）"]
        REENTRY2 --> CLAIM
    end

    subgraph ENDG["⑥ 结束族（终态即删登记，注入投影消失）"]
        CLAIM -->|"无可领 · 全部完成"| P4["P4 全部完成 + P8 评审指示\n（多 subagent 交叉评审 → 复核 → 回灌）"]
        CLAIM -->|"无可领 · 有 blocked 残留"| P5["P5 残留阻塞任务 → 处置后重开"]
        CLAIM -->|"无可领 · 等待中"| PATIENCE["patience 停顿续轮\n连续超封顶"]
        PATIENCE --> P7["P7 等待超时"]
        SPAWN -->|"失败退避 · 连败×3"| P6["P6 派发失败（环境排查后重开）"]
    end

    subgraph STOPF["⑦ 停止（终态之一）"]
        ST["stopTaskLoop / stop-dag-tasks"] --> PERM{"权限矩阵\n运行中=仅 owner / 挂起=任意会话"}
        PERM -->|"放行"| KILL["在途 worker 取消\n孤儿任务真化 interrupted\n统一结束处理 + 结束通知"]
        PERM -->|"越权"| DENY["拒绝并自解释"]
    end

    P4 --> FINAL["registry.remove——会话名额释放"]
    P5 --> FINAL
    P6 --> FINAL
    P7 --> FINAL
    KILL --> FINAL
    FINAL --> REVIEW["P8 评审结论回灌：\n发现问题=recordBug+addTask 修复任务→重开循环\n无问题=收口"]
```

路径要点：

- **上报求助的唯一形态是挂起**（④）——现状的「问询+终局」在 3b 后统一为挂起等待处置，处置入口（主会话复核三选一）与续接（re-entry 不占名额）闭环；
- **静默与挂起的分界**（③）：活的后继任务在场 = 循环自愈（静默）；后继死了或根本没有 = 升级挂起找人；
- **所有终态同汇 registry.remove**（⑥⑦）——名额释放、注入投影消失、guard 计数复位一次完成。
