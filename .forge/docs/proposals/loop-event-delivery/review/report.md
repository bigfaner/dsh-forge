# loop-event-delivery 提案评审报告（第 3 版，覆盖前版）

- 评审人：独立 subagent（review-proposal，不继承会话上下文，结论只以自读材料为据）
- 日期：2026-10-18
- 评审对象：`.forge/docs/proposals/loop-event-delivery/proposal.md`（按前轮两条 Blocker 修复方向返工后的版本）
- 取证基线：官方包 `@deepseek-ai/dsh-agent`（runtime-types.d.ts/types.d.ts）、`@deepseek-ai/dsh-agent-loop`（lib/index.js 实现）、`@deepseek-ai/dsh-session-projection`（lib/index.js 实现）+ 仓内 `packages/plugin-forge`、`apps/web`；pnpm store 实路径逐行读取
- 前版处置核销：B-1（nextTurn 逐条 drain）→ 本版全场景改 nextStep ✅ 已实证修复；B-2（fold 锚 user/message 消费时点）→ 本版 fold 输入改 'forge/progress' 会话事件 ✅ 已实证修复；Q-1（forge/progress 未处置）→ 本版进度链改为扩展 1.17 既有链 ✅；Q-2（⑭ 唯一唤醒成员矛盾）→ :174 改为「⑩⑭ 同为即时唤醒成员」✅，但封闭清单口径仍有残留（见 Q-1）；N-3（验收载荷清单）→ :220 已对齐 ✅；N-1（⑬ 行 incident 错位）→ **未修**（并入 Q-1）。

---

## 一、需求满足吗 —— 三条主链路承重假设全部独立实证成立

**In Scope 逐条对照**：

| 需求 | 对应方案 | 结论 |
|---|---|---|
| 1. 进度事件人类独立渲染（web+mobile，含 title），不烧模型回合 | forge/progress 扩载荷 + forge-dispatch-events fold + 双端面板 | ✅ 链路成立（见下核销）；挂起态静默径见 Q-1 |
| 2. 事件维持 send(msg, target, wakeup=false) 官方形态、持久留痕、逐字一致 | 事件径统一 send(nextStep, false)，模板沿用 | ✅ 消费模型实证成立 |
| 3. 结算单点唤醒一次 send(true) | 真终局四类单点 send(nextStep, true) | ✅ 整批消费承诺成立 |

**核销 1：nextStep 修复正确性（dsh-agent-loop lib/index.js 实查）——全部成立**：

- `claim(target, turn)` :103-111：:104 `mutate("next-step", 0, this.nextStep.length, [], false)` next-step **整批并取**；:105 仅 target='next-turn' 时**额外取 1 条** next-turn——提案 :35 逐字与实现一致。
- 消费序实证：turn() :949 首步 target='next-turn'（claim = next-step 全量 + 1 条 next-turn，next-step 在前），:1006 后续步 target='next-step'（每步 claim next-step 全量）。
- `send(message, target, wakeup)` :800-805：wakeup=false 仅 `inbox.splice` 持久写入（:204 `session.append("agent/inbox/spliced")`），不 wakeDriver——「写入不唤醒」精确成立。
- 跨回合行为（提案边界 1）：运行中回合每步 claim next-step 全量（:1006→:906）；回合将结束时 next-step 非空则续步（:998/:1005）；回合尾 hasPending 续新回合（:1035-1039）；kick 收尾 wakeRequested 兜底（:892-898）。「任何活动回合的下一步被消费；空闲时静默积压」与实现逐点相符。
- nextTurn 否决依据复核：每回合只消化 1 条 next-turn，N 条积压 + 1 结算 = N+1 连续回合 ✅（前轮 B-1 定性正确，本版修复方向正确）。
- 顺带核销：现状 notice = `agent.inject` = `send(next-step, false)`（:813）——false 组改造在消费边界上与现状一致，真实增量是统一出口与 GUI 折叠 source.kind，改造风险低。

**核销 2：forge/progress 锚正确性——成立**：

- 写入即落日志：`progress/index.ts:99` `append.call(session, 'forge/progress', data)` → session.append 同步落会话日志。
- 非模型面：'forge/progress' 不在 SurfaceEventType 五元集（progress/index.ts:16-20 注释引上游 types.d.ts L441；declare-module :115-120）——fold 该类型零模型上下文污染。
- 载荷扩展可行：`ForgeProgressEventData`（:46-59）declare-module 值类型即本包接口，可选字段追加 + `isForgeProgressData` 守卫（:62-71）同步扩即可；向后兼容成立（旧读端多字段无感）。
- 实时驱动链实证（`dsh-session-projection/lib/index.js`）：:64-66 `ctx.on("session/event", ...)` → :401-416 eager drive「pass one committed event through every unit」→ onChanged（:110-118）按 Object.is 推送——**事件 append 即驱动 fold、view 变即通知**，「写入即落日志→面板实时更新」链路在官方机械上成立。
- 发射点现状差距属实：emitProgress（driver.ts:609-625）调用点 = claim/claim-resume（:1109）、settle completed/blocked 族（:1240/:1255-1477）、settle interrupted（:1183）、stop（:667）；启动 ①②③、重试 ⑪⑫、终局 ⑬⑮⑯ 无发射——提案 :107-109「补齐十八场景」差距声明与实况一致。
- 前轮 B-2 修复正确性：`user/message` 确为消费时点事件（:1061 step 首请求时 append）——改锚写入时点的 'forge/progress' 后，「循环运行期 fold 零更新」缺陷消除。

**核销 3：投影键可行性——成立**：

- 先例 `projection/dispatch-loop.ts`：六字段 fold unit（:171-216 key/stateVersion/stateSchema/init/apply/wire），fold 官方 `command/run|done` 会话事件（:178-207）——证明 fold 插件关心的任意会话事件类型（含自有 declare-module 合并键）模式成立。
- stateVersion 契约：registry :81 非负整数校验、:91 同键异版本拒绝共享注册；dispatch-loop.ts:31-32 失配重折语义。
- 官方 `inboxProjectionDefinition`（dsh-agent-loop :26-62）fold `agent/inbox/spliced` 同为 fold 会话事件先例 ✅。
- 注册缝先例：`index.ts:375-390` reflect.get('sessionProjections') 防御读取 + register——新键走同一缝。
- session_projcache 断言：官方 dsh 宿主产物 `official-main.js:12067` `storages/session_projcache/sessions` 在位——「宿主 base 已挂载，插件零改动」成立。
- web 消费先例：侧栏 `projectionValues['forge-dispatch-loop']` 窄读（sidebar-model.ts:47-51/:118-128、ForgeWorkspacePanel.tsx:217）；mobile 经 `forge:proxy/session-projections` 通道（apps/host/proxy-channels.ts:36/:191）可达。

**其它核销**：send/followup/steer/inject 官方把手（runtime-types.d.ts:186/:192/:200/:209，InboxTarget='next-turn'|'next-step' types.d.ts）；⑩ 路由漂移属实（templates.ts:194 标 notice vs narrator.ts:109-111 实走 followup，提案 :200 如实声明）；notifyReceipt 装配点（index.ts:302-308）；⑬⑭⑮⑯ 现状叙述点（haltLoop settle+escalation :1571/:1580、deadlock followup+挂起 :1532-1542、timeout settle :1549、finished-all settle :1512）；e2e/escalation 文件在位；两 mermaid 图人工核验结构合法无悬空。

## 二、方案周密吗 —— 主链周密，挂起族静默径与 web 守卫两处呈报

见 Q-1/Q-2。方案直击根因（投递方式收敛 + 复用既有进度链），无更简单整体方案被跳过——前轮 Q-1 的「扩既有 forge/progress 为投影输入」选项已被采纳为本版方案本体。边界 1-9 覆盖注入时点/消费税/问询后置/无二份存储/事件表分立/路由表漂移，周密度较前版实质提升。

## 三、改动收敛吗 —— file 清单与实况相符，收敛

- file 清单（:202-212）逐项对上代码实况：faces.ts 适配层（:405-434）、notify 三件、driver 投递点、escalation/index 装配（:302-308）、progress 载荷、projection 新键 + 注册处（:375-390 先例）、web/mobile 渲染面、e2e。
- 扩展既有 forge/progress 链（不另起）消除了前轮 Q-1 的双通道冗余；新投影键有 dispatch-loop 先例；无新机制、无新依赖。✅
- 收敛性缺口仅 Q-2（web 守卫随迁未点名——清单精确度问题，非新增机制）。

## 四、表述清晰吗 —— 总体清晰，三处措辞随迁（见 Note）

术语（事件径/进度链/结算径/真终局四类/⑩-⑰ 编号）有定义且与 templates.ts 场景表对齐；一致性检查表验收↔文件映射可测；探针先行（:234-238）把承重语义列为定案变量。残留：图 1「持久 user message」措辞（Note 1）、steer 边界措辞（Note 2）、两处 incident 现状列错位（并入 Q-1）。未发现新怪词（「插话/并取/烧回合」口语但语境自明，前版已判）。

---

## 分级问题清单

| # | 级别 | 摘要 | 证据 | 建议 |
|---|---|---|---|---|
| Q-1 | Question | 挂起族「封闭清单两值」断言与实况不符：suspendForVerdict 挂起径 ≥5（deadlock :1537、blocked-ask-user :1267、landing-rejected :1184、rate-limit ×2 :1134/:1199、worker-abort-over-limit :1206），其中后四个径现状零叙述发射、rate-limit/over-limit 连 emitProgress 都无——循环挂起时消息面与进度面板完全静默（人类不可见）；⑬ haltLoop 的 escalation 问询（:1580-1586）去留未声明；⑬ 行 incident 列「settle-landing-rejected」（:1182 属 landing-rejected 径）与 ⑪ 行「spawn-rate-limited」（:1133 属挂起径非重试）现状标注错位（前版 N-1 未修） | driver.ts:1134/:1184/:1199/:1206/:1537/:1580-1586、templates.ts 表 :68/:66；提案 :174/:228（封闭清单两值）、:107-109（发射点扩展不含挂起径） | 呈用户裁定：静默挂起径维持现状（届时声明「封闭清单仅指叙述面成员，静默挂起径依 incident+挂起投影可观测」）或补场景行进十八表；⑬ 问询去留显式声明；两处 incident 列随手校正 |
| Q-2 | Question | web 端流内折叠行数据守卫硬编码 verb 四值——plugin-forge 扩 verb（startup/retry/halt/timeout/finish-all/stopped）后若 web 守卫不随迁，新场景事件被守卫静默吞（渲染 null，无未知事件兜底），流内折叠行对启动/重试/终局族空行；:210「扩展字段呈现零回归」与验收 5「既有 web 流内折叠行零回归」措辞未覆盖此项必要改动 | apps/web/src/views/session/forge-progress-data.ts:28-29（verb/status 值集硬编码）、ForgeProgressNode.tsx:57（守卫失败 null）；plugin-forge 侧守卫 progress/index.ts:66-67 提案已点名（:105/:208），web 侧未点名 | 影响范围清单显式补 `forge-progress-data.ts` 守卫与单测随迁；或声明流内折叠行不覆盖新 verb 场景（面板为聚合主面）——二选一呈用户定 |
| N-1 | Note | 图 1 O 节点「持久 user message」措辞残留前轮 B-2 痕迹：inbox 队列持久化的是 `agent/inbox/spliced` 事件内的 UserMessage（:204），非 user/message 事件（消费时点 :1061）——字面易诱导实施者再锚错事件 | dsh-agent-loop lib/index.js:204/:1061；提案 §方案图 1 | 措辞改「持久 inbox 消息（agent/inbox/spliced）」 |
| N-2 | Note | :129「取消运行中 steer 插队（结算排下一回合边界）」与实现有张力：send(nextStep, true) 与 steer 是同一调用（:809-811），运行中行为仍是「最近下一步边界」（可插入活动回合），非「下一回合边界」；该语义已被边界 1 接受，仅措辞需对齐 | dsh-agent-loop lib/index.js:809-811/:1006；提案 §结算径 :129 vs 边界 1 :178 | 措辞统一为「下一步边界」 |
| N-3 | Note | send(...,true) 恰逢活动回合已 abort 时，官方强制 resolvedTarget='next-turn'（:801-802 wakingAfterAbort）——⑩⑬⑭⑮⑯⑰ 唤醒消息降级为 1 条/回合语义（不丢失）；提案未提及，探针设计知悉即可 | dsh-agent-loop lib/index.js:801-804 | 探针①加一个 abort 竞态观察点 |
| N-4 | Note | 行号小勘误：inboxProjectionDefinition 实际 :26-62（提案 :49 写 26-55，漏 wire/stateVersion 尾段）；emitProgress 函数体实际 :609-630（提案 :41 写 604-629，含注释块起算勉强成立） | dsh-agent-loop lib/index.js:26-62；driver.ts:609-630 | 核销表随手校 |

## 结论

**放行**：Blocker 0。前轮两条 Blocker 的修复方向与实现均已独立实证正确——nextStep 整批消费语义（claim :104-105）、forge/progress 写入即落日志 + eager drive 实时驱动（session-projection :64-66/:401-416）、fold 自有事件类型先例（dispatch-loop.ts:171-216）三条承重链路全部成立；三条需求覆盖完整，改动收敛于既有缝。Q-1（挂起族静默径归属 + ⑬ 问询去留）、Q-2（web 守卫随迁）随裁决请求一并呈用户定夺；4 条 Note 留档随迁。

——review-proposal 独立评审（第 3 轮），2026-10-18
