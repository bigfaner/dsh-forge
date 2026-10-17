---
created: 2026-10-16
revised: 2026-10-17
author: faner
status: under-review
intent: enhancement
review: 2026-10-16/17 五轮评审（三方初审/逻辑+代码复审/协作闭环/红队对抗/简化度），结论均已并入
companion:
  - loop-state-machine.md（循环状态流转：事件→状态→处置 + 全景路径图）
  - injection-spec.md（动态注入规格：registry 投影/生命周期/时序/伪代码/改动点/前置核销清单）
  - injection-templates.md（注入模板正文：P1–P8 + 结束族 + 效果示例）
  - todo.md（待研：模式 B worktree 隔离 / 具名 subagent）
---
---

# dispatch-loop-hardening：任务派发循环处置优化

## 背景

宿主循环机制已由 `run-tasks-host-command` 提案落地（`plugin-forge/src/loop/{driver,registry,escalation}.ts`：runRound 状态机、classifyPool 三分裁决、独占守卫、blocked+followUp 续领留痕、escalation 走 userQuestions）。本提案收敛**残余缺口**并统一入口与协作面。

## 问题（残余缺口）

1. **blocked 静默边界缺失**：静默仅以「结算带 followUp」为条件——后继任务自身 blocked（无再下级后继）会连环吞问询成死锁链；后继任务被 rejected/skipped 后问询是否恢复未定义；静默仅日志，用户无知情。
2. **就绪选择无 fix 优先键（fix 不被及时执行）**：`core/forge/tasks/claim.ts` 排序（分支延续→priority→创建序）无 block_source 键——fix 与旁支叶子同轮就绪可能被抢先，fix 滞留则整条下游链全堵。
3. **派发入口未归一**：`run-tasks` skill 仍在技能目录（协议漂移面）；`dispatchTask` 是带 job 模式的单次派发原语（无循环语义），与 `/run-dag-tasks` 指令不同源；GUI DispatchButton 仍发 `/run-tasks`。工具内跑循环撞升级问询即死锁（escalation 在工具调用的 turn 内无法问人），且升级点现状一律「escalate→结束（登记删除）」，问询后无法续接。
4. **worker 子进程无整树回收**：in-process worker 的孙进程（pwsh/node/git）无 Job Object 归属——孤儿 `--watch` 曾耗尽 commit charge 引发连环误诊（判例 `docs/conventions/windows-commit-exhaustion.md`）。

## 方案

- **改进 1 · blocked 静默边界补全**（小）：静默条件收窄为「存在**活的后继任务**（后继任务 = 为接手 blocked 任务而派生的 fix/继任，blockSource 挂接源任务；活 = 状态 pending/in_progress）」；后继任务自身 blocked 且无再下级后继、或被 rejected/skipped → 视为无活后继，source 仍待处置则恢复问询；静默发非阻塞 notify；结算内同事务查询，漏判退化为现状问询。
- **改进 2 · fix-chain 优先调度**（小）：claim.ts 加稳定排序键——block_source 优先，仅同轮就绪集内比较（不跨轮饿死），创建序兜底。
- **改进 3 · 入口归一 + skill 退役**（中偏大，拆 a/b/c 逐期）：
  - **3a skill 退役**：run-tasks 移出技能目录，协议正本入派发核心文档与注入模板；GUI DispatchButton 改发 `/run-dag-tasks <slug>`。
  - **3b 工具归一**（用户裁决）：dispatchTask **弃用 job 模式**（去 `run_in_background`/`job_output`/`job_kill` 结算通道），对齐指令同源同一循环核心，结算随工具调用**内联返回**。配套四件：
    - **自描述与参数约束（用户裁决：dispatchTask 每次必须携带容器参数；单次模式退役）**：source_kind + source_slug 成对必填（schema 强制，缺失即拒绝）——无池级盲选形态，工具只承载循环语义（启动/续接/并入容器循环；「只跑一个」由循环自然收敛，不设单次模式）；tool description 完整承载调用协议（参数/循环行为/入口选择），响应自解释（守卫拒绝=活循环归属+正确入口；no-task=结束）；
    - **内联结算语义**：超时预算→循环留存 registry、挂起态返回、**幂等 re-entry 续接**；升级点进入 **awaiting-verdict 挂起态**（定义见下节），处置后 re-entry——工具内死锁消除；
    - **协议动态注入**（参照 plan 形态）：协作面协议运行期注入、跟随协作生命周期（进入置位/结束清零），**只注协作面、机制零注入**；模板面向新形态重写，与 description 一致性由契约 pin 锁定；细案见 `injection-spec.md`（时序图/伪代码/函数级改动点）；
    - **停止入口**（用户裁决：指令 + 独立新工具；**作用域裁决 2026-10-17：运行中仅 owner 可停、挂起态任意会话可停**——维持 decisions #20 隔离纪律的同时支撑其它会话接管，非 owner 会话停运行中循环被拒并自解释）：`stop-dag-tasks` 扩参 + **新增独立工具 `stopTaskLoop`**（入参=容器 slug 或循环实例；语义=请求停止该循环——在途 worker 取消、孤儿任务真化 interrupted、走统一结束处理并产出结束通知；被拒场景=无活循环/无权限）。守卫 guardKey 用「会话 id+工具循环实例号」，双入口同 registry 判活。
    - **会话级单活门控（用户裁决 2026-10-17：一个会话同一时间段只允许一个任务循环，循环间串行）**：start 前查 `byOwner(caller)`——已有活循环（含挂起中）即拒绝并指引「先结束/停止/处置当前循环」；现状 driver 允许同 owner 多容器并行（红队实证），本门控收窄为串行。注入投影随之简化为**每会话至多一段**，多段拼接场景消失。
    - **挂起态其它会话可达性（协作闭环评审断点 A/B）**：registry 记 owner 存活位——owner 会话失活时，挂起/结束投递不再 inject 进死会话（发出无人接），降级为「任意会话凭 slug 可认领处置」并在守卫/初次调用响应中返回挂起摘要（活循环处于挂起态时，任意编排层均可接管处置，不依赖发起会话存活）。
  - **3c 续派静默窗**：结束前 wait-for-quiescence，编排层新派任务窗内自动续派；终止条件全集（no-task/用户终止/死锁/超时/最大轮次）。循环生命周期归属为现状事实（host registry 独立于会话，`ownerSessionId` 仅路由键），不变更。
  - **结束通知对齐 subagent 结算机制**（用户裁决）：持久 user message + `{kind:'dispatch-loop-settled'}` source + idle→followup/busy→steer/关闭→inject 投递 + 必达告警；GUI 对该 source 补投影渲染（协作闭环评审断点 C——回程对 GUI 用户可见，不止会话流）。
- **改进 4 · worker 终态资源清理全集（进程树 Job Object 回收 + 清理面盘点）**（中）：worker 任意终态（success/blocked/interrupted/异常）后不留任何资源泄漏。清理面盘点（2026-10-17 核实）：

  | 资源 | 现状 | 清理点 |
  |---|---|---|
  | worker 会话句柄（SpawnWorkerHandle） | ✅ 已有 | `settle.ts disposeQuietly`（:80/:85 成败双径） |
  | in-flight 登记 | ✅ 已有 | `record.inFlight` 清位（driver :674/:709）；stop 竞态孤儿真化 interrupted（bailIfAborted） |
  | guard 防线计数 | ✅ 已有 | registry.remove = guardKey 复位（终局同径） |
  | **OS 进程树（孙进程 pwsh/node/git）** | ❌ **缺口** | 本项：按 worker 会话建 Job Object，孙进程逐个 assign（Node 无原生 API，需 native 绑定/host 扩展点），worker 任意终态 `TerminateJobObject` 整树回收——「忘了杀也活不成」 |

  约束：嵌套 Job 语义须真机验证；assign 失败 fail-soft；**交付门=真机端到端取证**（AGENTS.md 2026-10-15）；补充断言——清理路径在**全部终态**（含 killed/interrupted/异常终止）可达，与禁 watch 纪律互补。
- **改进 5 · 调度权收敛（用户裁决 2026-10-17）**：worker 只管执行与如实结算，任务派生全归主会话/循环 triage——
  - `addTask` 工具按 caller 身份分流：loopSourced spawn 的 worker 会话拒收 addTask，主会话与 triage 代理放行；**拒收响应自解释**——文案告知 worker「任务创建权限在主会话与循环处置层；请以 submitTask result=blocked 如实结算（原因+证据），修复任务由处置方派生」，防止 worker 困惑绕行；
  - worker blocked 结算只如实提交（原因+证据），不自派 fix；fix 派生全走 triage 阶梯（add-fix 带 blockSource，时延为零——同一结算序列内）与主会话规划；
  - 与改进 1 咬合：收敛后「活的后继任务」只可能来自 triage/主会话，静默判定更纯粹，worker 乱派导致的假后继死锁链消失；
  - fix-bug 流程的 bug 台账（recordBug/resolveBug）留 worker 不变；修复需派任务时交 triage/主会话；
  - 牵连面：submit-task/fix-bug skill 改写（blocked 路径删「派 fix」步）、addTask 工具身份分流、triage 覆盖度确认。
- **改进 6 · triage 错误处理信息闭环**（小）：现状「计失败→重试→封顶升级」骨架保留，补六项——
  1. **失败原因回灌重试**：重试轮 prompt 附上次失败摘要（`TriageDecisionInvalidError.rawSummary` 现成）+ 封闭枚举重申，消除无信息重试；
  2. **错误类别分流**：模型输出无效→立即重试（带回灌）；triage 基建故障（spawn/读面）→按 spawn 同款 backoff 退避，不再同计数同节奏；
  3. **决策与执行分离**：决策通过校验即缓存——落库失败重放**执行**，不重跑**分析**（省一次模型往返）；
  4. **链深余量入参**：triage 输入四件套补该任务 fix 链深/余量——余量不足时代理直接选 split/ask-user，省无效往返与链深到顶结束；
  5. **externalSlug 存在性校验**：宿主校验 `wait-external.externalSlug` ∈ 已知容器集，无效计处置失败并回灌（防代理编造键、下游空等）；
  6. **升级载荷补失败现场**：history 行携带 `rawSummary`（driver catch 段一行级改动），用户终裁可见模型原始输出摘要。
- **改进 7 · 真机 e2e 取证债收敛**（用户裁决 2026-10-17，现实痛点立案）：worktree-branch-management 连续三卡（1.26/1.29/1.30）同模式 blocked——**代码修复完成、单测/门禁全绿，唯一未达 AC = 真机 e2e 专项取证**，且取证被两类基建债压死：① e2e harness 存在与本修复无关的既有红灯 spec（基线同点红灯，worker 无法归因也不应顺手修）；② 专项 spec 缺位（竞速窗/树工作区 blank 等）。worker 按如实结算纪律只能 blocked，循环反复结束重启，取证欠账滚动后移。改进方向：
  - **红灯基线门**：e2e 套件入场前跑基线，红灯清单随任务简报递达 worker——「基线红灯 ≠ 本任务回归」可机械判定，避免误归因与顺手修；
  - **取证债显式化**：实现与取证分离结算——代码+单测绿即可部分结算（实现态），真机 e2e 断言欠账生成独立 test-run 任务（依赖实现卡），不让实现卡无限期 blocked 挂着（本仓 1.33 即此形态的手工先例，机制化后无需再手工立卡）；
  - **红灯归因任务化**：基线红灯自动生成归因卡（环境/陈旧断言/真回归三分流），修复或钉基线后新取证才可信；
  - 与 AGENTS.md「外部依赖装配面结算门 = 真机端到端取证」咬合：结算门不降，只把「门未过」从单卡 blocked 变为可追踪、可并行的取证队列。
- **暂不做**（记录裁决）：关键路径优先（改进 2 后边际小）；「从头执行」文案出入。留观察。
- **待研 · 具名 subagent**（todo）：结束评审/处置代理等场景，未来使用用户自定义的具名 agent——主会话按任务语义挑选合适的具名 agent 派发（如评审选 reviewer 型、triage 选分析型），替代当前匿名 subagent；依赖 agent 预设/目录机制，另行立项。

## awaiting-verdict 状态定义

循环实例在 host registry 的中间态：遇升级点（blocked 裁决/死锁/spawn×3 halted）时升级载荷全文留存、停止续派、工具调用带挂起返回；处置回流后 re-entry 从留存点续跑，不重开。完整状态流转见 `loop-state-machine.md`。

**不复用任务态 `suspended`**：主体（循环 vs 卡）、写入者（机制面 vs 仅 human——`AGENT_TRANSITION_MATRIX.suspended=[]` agent 零出边）、语义（等裁决续跑 vs 人搁置）均不同轴；复用需破坏状态机「agent 面不可达」设计。

**边界**：登记仍在 registry（≠halted 结束）；不领取任务（≠活循环）；载荷留存可续（≠现状问询即跑）；退出唯一=处置回流 re-entry 或取消/stop；不落 task_status；非终态。

## 改动范围

- 改进 1：loop driver blocked 结算路径（静默条件收窄 + notify）+ 状态层后继任务活性查询。
- 改进 2：`packages/core/src/forge/tasks/claim.ts` 排序键（单点）。
- 改进 3a：skills 目录（run-tasks 移除 + README 词条）、`submit-task/SKILL.md` :54 与 `run-tests/SKILL.md` :42 的「fix 链协议正本在 run-tasks」指路改写（→ 派发核心文档/注入模板）、`plugin-forge` 指令装配、GUI `apps/web/.../DispatchButton.tsx`。其余 skill（brainstorm/quick-tasks/fix-bug/plugin-forge-spec 全系）零引用不受影响（2026-10-17 实查）。
- 改进 3b：`dispatch-task.ts` 契约面（去 job、循环入口、自描述、超时/挂起/幂等 re-entry）+ `loop/injection.ts`（新，模板正本）+ `index.ts` section 注册 + **新工具 `stopTaskLoop`**（`src/tools/stop-task-loop.ts` 新文件 + 注册）+ `dispatch-core/exclusivity.ts` 身份缝合 + driver 升级点挂起改造（`suspendForVerdict`）+ `runLoop` finally 清注入 + `notify/templates.ts` 结束结算形态。函数级清单见 `injection-spec.md`。
- 改进 3c：loop driver 结束段（宽限窗 + 终止条件全集）。
- 改进 4：`spawn/{in-process-driver,seam}.ts` + native Job Object 绑定。
- 改进 5：`addTask` 工具身份分流（`src/tools/add-task.ts` + spawn 身份透传）+ submit-task/fix-bug skill blocked 路径改写。
- 改进 6：`src/triage/{triage,decision,prompt}.ts`（回灌/分流/链深入参/slug 校验）+ `src/loop/driver.ts` triage 触发段（决策缓存重放、history 带 rawSummary）。
- **联动面**：契约 pin（含新 pin-dispatch-injection、worker-matrix）、e2e dogfood（e2e/specs/m2、m3）、文档四处（task-domain.md、task-pipeline.md、monorepo-structure.md、AGENTS.md）。
- **排除**：关键路径调度、任务模型/表结构变更、blocked 处置权下放（三权分立不变：循环机械执行、编排层规划、用户终裁）。

## 影响范围

- blocked 问询仅无活后继任务场景上浮；静默经 notify 知情。
- 同轮就绪集内 fix 先行——不改并发语义与收敛结果。
- 改进 3 后：指令与工具行为同源（无 job 模式）；升级点可挂起续接不结束；skill 退役，GUI 入口归一；注入协作面、结束即净。
- 改进 4 后：worker 任意终态子进程整树退出，无 commit 孤儿。

## 验收

1. blocked 且有**活的后继任务**（fix/继任处于 pending/in_progress）：无问询上浮，notify 发出，留痕含原因摘要与后继任务键。
2. 后继任务自身 blocked（无再下级后继）：问询恢复上浮。
3. 后继任务被 rejected/skipped 且 source 待处置：问询恢复上浮。
4. blocked 无后继任务：照旧上浮（行为不变）。
5. fix 与普通任务同轮就绪：fix 先领；普通任务不跨轮饿死。
6. 既有循环回归（正常结算/fix 解阻/池快照口径）全绿。
7. （3a）run-tasks 不在技能目录；GUI 循环经 `/run-dag-tasks`；协议正本可在核心文档+注入模板溯源。
8. （3b）指令与工具结算语义同构；无 job 模式；守卫双入口同 registry 判活；description 完整、响应自解释；注入按触发点出文本、结束清零、多容器并行时各槽互不干扰、description↔模板 pin 锁定（**机制断言 + 单元/契约测试可证**）；e2e dogfood（回放脚本驱动，不依赖模型服从性）：发起后系统提示词含 P1、终局后零残留、守卫拒绝响应含归属与入口、挂起摘要可经重调获取。
9. （3b）内联超时→registry 留存、re-entry 幂等续接；升级点挂起（awaiting-verdict）处置后 re-entry，全程无死锁；stopTaskLoop 作用域（owner 运行中可停/挂起态任意会话可停/越权拒绝自解释）与 stop-dag-tasks 指令均可停止循环，统一结束处理；结束通知为 settlement 形态（source 元数据 + steer/followup 投递），GUI 对 source 有投影渲染；**owner 会话失活时挂起/结束不投死信**，任意会话可凭 slug 认领处置，守卫/初次调用响应在活循环挂起态时返回挂起摘要。
10. （3c）宽限窗内新派任务自动续派；终止条件全集各有触发路径；会话关闭循环照常存活（现状保持），挂起可续接。观察项：结束评审指示的回灌监督（容器级「评审完成」标记或结束行驻留至回灌落账）——若实跑出现评审静默丢失再立项。
11. （3b）全部完成（no-task 且 done）结束时：**机制断言**——结束通知（user message 与工具响应双径）含 P8 评审指示段（四重点逐字在文）；**模型行为项（观察，不作为机制验收门）**——主会话派评审 subagent、复核结论后 recordBug/addTask 回灌，实跑统计服从率，异常时按 3c 观察项处理。
12. （5）worker 会话调用 addTask 被拒且响应自解释（指明权限归属与正确动作：submitTask result=blocked）；worker blocked 结算不再自派 fix，triage/主会话派生的后继任务照常解阻；submit-task/fix-bug skill 无「worker 派 fix」残留指引。
13. （6）triage 重试轮 prompt 含上次失败摘要；基建故障走退避、决策无效走立即重试（两径不同节奏）；落库失败重放执行不重跑分析；链深余量在 triage 输入中可见且余量不足时不产 add-fix 决策；编造的 externalSlug 被校验拒绝；disposition-over-limit 升级载荷 history 含各次原始输出摘要。
14. （4）worker 以**任意终态**（success/blocked/interrupted/killed/异常终止）结束后：其子进程（含 `--watch` 形态）在有限时间内整树退出，commit charge 无孤儿占用残留——**真机端到端取证**；worker 会话句柄 dispose、in-flight 清位、guard 计数复位在全部终态路径可达（既有机械回归断言）。

## 分期

1. **第一批**：改进 1 + 改进 2（各自独立小任务）。
2. **第二批**：改进 4（中，含真机取证）；改进 5（小）；改进 6（小，与改进 5 同批顺——两者同触 triage/blocked 面，先 5 后 6 避免返工）。
3. **第三批**：改进 3a → 3b → 3c（逐期独立验收；3b 为最重期，含注入与挂起态）。
4. **改进 7**（e2e 取证债）：独立于 1–6 的基建债收敛，随第二批或第三批并行排期（不阻塞其它改进）。
5. 具名 subagent：另行立项。
