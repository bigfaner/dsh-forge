---
created: 2026-10-17
---

# API 手册：mobile-ui（forge 扩展面 + 受影响既有 API）

统一信封（既有口径不变）：`POST /remote/__rpc`，body `{channel, payload}` → `{ok:true, data}` | `{ok:false, error:{code, reason}}`。鉴权：官方 `authorizeIndex` 放行优先，`dswf_forge_remote` cookie 自持兜底（`authorizeRemoteRpc`，零改动）。通道 = allowlist 精确匹配，未列通道 fail-soft 错误信封。

## 一、新增通道（4 个薄方法 + 1 个动作转发）

### 1.1 `forge:remote/task-action`（任务动作意图转发）

| | |
|---|---|
| payload | `{action: 'pause' \| 'dispatch', slug?: string, ownerSessionId?: string}`（dispatch 附任务源 slug；pause 附循环归属会话） |
| data | `{result: ForgeCommandResult}`（指令回执原样——run-dag-tasks/stop-dag-tasks 的结果信封） |
| 守卫 | **包装 `/run-dag-tasks` 与 `/stop-dag-tasks` 指令**（用户裁决 2026-10-17）：`dispatch` → run-dag-tasks（同源独占/loop-active 拒绝等既有守卫全部继承）；`pause` → stop-dag-tasks（按 ownerSessionId 停循环）；零新执行逻辑——薄方法只做参数装配与指令调用 |
| 失败码 | `invalid-state`（loop-active 同源占用等指令拒绝——手机端弹确认框）、`not-found`（slug/循环不存在）、`stale`（数据过期） |
| 要点 | **只转发意图，零执行逻辑在手机端**；动作合法性判定完全在指令既有守卫（AD-1）——薄方法不复制任何判定 |

### 1.2 `forge:remote/session-links`（分支切换校验薄方法）

| | |
|---|---|
| payload | `{branch: string, worktree: string}` |
| data | `{running: [{taskId, slug, title}], blocked: boolean}`——目标分支/worktree 上运行中任务反查结果 |
| 守卫 | 只读组合：`sessionLinks` + `listTasks` 反查；无写副作用 |
| 要点 | hero 分支切换的**预检数据源**：host 返回事实，手机端据此弹确认框（选回/仍要切换）——「选回/仍要」的裁决仍由用户做，host 不替用户决定 |

### 1.3 `forge:remote/read-state`（已读游标，host 共享）

| | |
|---|---|
| 读 payload | `{sessionId: string}` |
| 读 data | `{seq: number, unread: number, stale?: true}`——`stale:true` 仅出现在域重建窗口（tailSeq 未就绪），客户端徽标显示旧值不归零 |
| 写 payload | `{sessionId: string, seq: number}` |
| 写 data | `{seq, unread}`（归零成功）或 `{seq: 保持值, unread: >0}`（单调守卫拒绝回退时返回现值，**不报错**——显示层对账语义） |
| 守卫 | **单调**：写仅在 `seq > 当前 lastReadSeq` 时落盘（`KvTable.update` 原子 RMW 内实现，见 tech-research R6.4）；`seq > tailSeq` clamp 至 tailSeq |
| 失败码 | `not-found`（会话不存在） |
| 要点 | 计算单源在 host（`unread = tailSeq − lastReadSeq`）；两动作**拆分为同通道双语义**：payload 含 `seq` 即写、不含即读（保持单端点、无 op 字段的歧义） |

### 1.4 `forge:remote/workers`（worker 会话目录切片）

| | |
|---|---|
| payload | `{parentSessionId: string}` |
| data | `{workers: [{id, mode: 'one-shot'│'continuable', activity: 'running'│'inactive', label?, hasChildren}]}`——`id` 即 SessionId（worker 路由键 `#/worker/:id`）；wire 实证字段（subagent/catalog 样本），`label` 在 one-shot 分支可选 |
| 守卫 | 只读：父会话 catalog 投影（`listChildren` 口径）；越权访问非本会话子孙 → 空列表（不泄露） |
| 要点 | `mode` 定 worker 只读/可续聊（US-8）；`activity` 定状态徽标 |

### 1.5 透传通道（零新增 host 逻辑）

`forge:worktree/branches`、`forge:worktree/list`、`forge:worktree/sessionCreate`——桥上已有通道白名单放行，payload/data 由既有 worktree 桥契约定义（child.ts 直通）；`sessionCreate` 属意图转发，host 侧照旧校验。

## 二、受影响的既有 API

| API | 影响 | 兼容性 |
|---|---|---|
| `GET /remote/`（静态面） | **产物更换**：桌面裁剪分支 dist → mobile 单文件 `index.html`。改指点 = webDistRoot 局部值 + remoteViewIndexTap 两处对齐（不动共享 `resolveWebDistDir`） | 对手机客户端透明（同 URL 新产物）；桌面若仍访问 `/remote/` 将得到手机页（裁决如此——mobile 替代裁剪分支） |
| `POST /remote/__rpc`（分发器） | `channelTableOf` allowlist 增 4 通道 + worktree 三通道放行；`RemoteHttpRpcDeps` 注入面扩充（transitionTask 切片、sessionLinks 组合、read-state domain、workers 目录、既有 forwardApproval/tasks/projects 不变） | 既有通道（progress/approval/projects）payload/data 零变化 |
| `@dsh-forge/contracts` `REMOTE_CHANNELS` | 枚举只增不改：`+task-action, +session-links, +read-state, +workers` | apps/web remote-transport 等消费方编译期兼容（只增枚举 = 超集） |
| 桌面 web-app `/remote/` 入口 | 入口移除（改指 mobile） | 桌面功能不经 `/remote/`（其走本地窗口），零影响 |
| 会话日志/官方 API | **零改动**（哨兵是读侧约定 + forge/progress 既有事件；SSE/RPC 官方面原样消费） | — |

## 三、错误模型（新增通道统一码表）

| code | 语义 | 手机端处置 |
|---|---|---|
| `invalid-state` | 状态机不允许该动作（如 pause 非 suspended） | 确认框/提示 + 刷新任务卡 |
| `not-found` | 目标对象不存在 | 列表刷新（对象已消失） |
| `stale` | 请求基于过期数据 | 静默刷新 + 按钮置灰 |
| `unavailable` | 依赖服务缺席（fail-soft 既有码） | 面板不可用态，对话不受影响 |
| `invalid-argument` | payload 形状不符 allowlist handler 预期 | 不应发生（客户端 bug）——诊断行落链 |
| `{ok:false, error:{code:'disconnected'}}` | 网络层断开 | 断线覆盖层 + 停轮询 |

诊断：每请求经 diag 落一行（通道 + 结算态）——既有 `/__rvdiag` 同链，零改动。

## 四、内部接口（host 侧新模块，非 wire）

### 4.1 read-state 域（`apps/host/src/boot/read-state-domain.ts`）

```ts
// DomainSpec（zod 持久边界校验）
const readStateDomain = defineDomain({
  name: 'read-state',
  version: 1,
  tables: {
    sessionReadState: domainTable<SessionId, { last_read_seq: number }>(
      z.object({ last_read_seq: z.number().int().nonnegative() }),
    ),
  },
})
// 薄方法 handler 签名（纯函数、fake 可测——remote-http-rpc.test.ts 同型）
interface ReadStateHandlerDeps {
  /** tailSeq 只读视图（host 进程内 session/event global 监听维护） */
  readonly tailSeqOf: (sessionId: string) => number | undefined   // undefined = 重建窗口
  /** 原子 RMW（域写链内；单调守卫在此实现） */
  readonly putIfAfter: (sessionId: string, seq: number) => Promise<{ seq: number }>
  readonly get: (sessionId: string) => Promise<{ seq: number } | undefined>
}
```

要点：`tailSeqOf` 返回 `undefined` 即重建窗口 → 读响应带 `stale:true`；写一律接受并 clamp（不拒）——游标单调由 `putIfAfter` 在写链内保证，handler 不做第二处校验（单源）。

### 4.2 tailSeq 监听（装配缝）

```ts
ctx.on('session/event', (e) => tailSeq.set(e.sessionId, e.event.seq), { global: true })
```

`{global:true}` 必需（scope-filtered 事件，否则 agent-scoped 收不全——先例 child.ts:738）；重启重建 = SessionStore 日志重放回填。

### 4.3 循环注入声明（桌面侧，批次③先行）

```ts
// MessageSourceMap 声明合并（plugin-forge 自有模块）
declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'forge-loop': { kind: 'forge-loop'; loopKind: string; runId: string; task: string; state: string } & ContextFormed
  }
}
// 注入点：faces.ts forgeUserMessage / notify/ 通道 / run-dag-tasks.ts 指令单行——source 一律 kind:'forge-loop'
```

## 五、官方 API 消费面（非本设计新增，手机端消费清单）

`POST /api/rpc`：`session.list/models/selectModel/create/history/prompt/cancel`、`interaction.pending/answer/cancel`、`workspace.list`、`agentPreset.list/select`；SSE `GET /api/session/stream?sessionId=…`（命名事件 `snapshot`/`event`，帧形状见 tech-research R1）；`GET /api/status`（心跳 + tunnelExpiresAt）。端点形状正本 = 官方手机页源码（probes/official-mobile-page.js.txt），批次①回放录制钉死。
