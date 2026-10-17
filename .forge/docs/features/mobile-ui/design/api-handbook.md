---
created: 2026-10-17
---

# API 手册：mobile-ui（forge 扩展面 + 受影响既有 API）

统一信封（既有口径不变）：`POST /remote/__rpc`，body `{channel, payload}` → `{ok:true, data}` | `{ok:false, error:{code, reason}}`。鉴权：官方 `authorizeIndex` 放行优先，`dswf_forge_remote` cookie 自持兜底（`authorizeRemoteRpc`，零改动）。通道 = allowlist 精确匹配，未列通道 fail-soft 错误信封。

## 一、新增通道（收敛为 1 薄方法 + 透传；用户裁决 2026-10-17 评估收敛）

### 1.0 指令动作 = 用户消息（无专用通道）

派发/暂停按钮**不是专用通道**，但也不是裸 `session.prompt`（**dsh 源码核实 2026-10-17 证伪**：slash 仲裁在 interactive UI adapter——官方 `CommandUiRuntime` 自述「the '/' command source…Every execute addresses the session's agent by sessionId」，`session.prompt` 路径零 command 引用；官方手机页 70KB 源码 command/slash 零命中 = 官方手机页本无指令面）。**落法（方案 A）**：手机页 composer 承担官方 UI-adapter 契约级仲裁——输入以 `/` 开头 → 解析 name/args → 经**官方指令执行远程面**（`CommandRuntime` extends `TypertRemoteService`，注册表本身远程可调；桌面浏览器 composer 同径）执行 `/run-dag-tasks <slug>`、`/stop-dag-tasks`；未命中指令目录 → 按字面消息经 `session.prompt` 发送。执行 RPC 端点名/载荷 = 批次①录制抓样钉死（桌面浏览器调指令时的 catalog/execute RPC 形状）。回执 = `command/executed` 语义的指令结果 + 会话内回执文本；loop-active 拒绝同桌面。此仲裁非业务逻辑——是官方 UI adapter 契约的忠实履行。stale 置灰数据驱动。

### 1.1 `forge:remote/read-state`（已读游标，host 共享——唯一新增薄方法）

| | |
|---|---|
| 读 payload | `{sessionId: string}` |
| 读 data | `{seq: number, unread: number, stale?: true}`——`stale:true` 仅出现在域重建窗口（tailSeq 未就绪），客户端徽标显示旧值不归零 |
| 写 payload | `{sessionId: string, seq: number}` |
| 写 data | `{seq, unread}`（归零成功）或 `{seq: 保持值, unread: >0}`（单调守卫拒绝回退时返回现值，**不报错**——显示层对账语义） |
| 守卫 | **单调**：写仅在 `seq > 当前 lastReadSeq` 时落盘（`KvTable.update` 原子 RMW 内实现，见 tech-research R6.4）；`seq > tailSeq` clamp 至 tailSeq |
| 失败码 | `not-found`（会话不存在） |
| 要点 | 计算单源在 host（`unread = tailSeq − lastReadSeq`）；payload 含 `seq` 即写、不含即读（单端点双语义）；官方无未读面（实证零命中），PRD 硬需求 |

### 1.2 已撤销/延后的候选通道（评估结论留痕）

| 候选 | 结论 | 依据 |
|---|---|---|
| `task-action` | **撤销** | 指令 = user message（1.0 节） |
| `loops` | **撤销** | 寻址也是逻辑，归 host 指令机制 |
| `workers` | **撤销** | 官方面完整派生：`session.list`（`SessionSummary.parentSessionId` + `origin:'subagent'` + `running`）视图过滤 + 父会话日志 `subagent/catalog` 持久事件（`{childId, mode, label}`，wire-samples 实证）投影——`mode`/`label`/`activity` 三字段全有源 |
| `session-links` | **延后（可选增强）** | hero 已是乐观切换 + host 建会话守卫回执兜底（确认框由回执驱动）；预检组合（sessionLinks×listTasks）是唯一新增业务判定，收益/侵入比最低——确认框需要更充分信息时再加 |

### 1.3 透传通道（零新增 host 逻辑）

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
| `invalid-state` | 请求动作与当前状态冲突（薄方法侧） | 提示 + 刷新 |
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

**指令动作也走此面**：`session.prompt` 发送 `/run-dag-tasks <slug>`、`/stop-dag-tasks` 指令文本（1.0 节口径）。

## 六、类型复用纪律（复用审计 2026-10-17）

- `core/wire.ts` 判别集：**type-only import** `@deepseek-ai/dsh-session`（SessionEvent 判别）与 `dsh-api-session-controller`（SessionEventWindow/change）类型——契约类型单源，不手写重声明（零运行时依赖不受影响）。
- md 渲染：`dsh-client-ui-renderer` 为 React/host-loader 生态不可复用；**官方手机页自带 `markdown()`/`inlineMarkdown()` vanilla 实现（R8 实证）——照搬之**，mermaid 增强器复用 `@dsh-forge/md-mermaid`。
- `/`、`@` 触发面：数据全走官方远程面（CommandRuntime=TypertRemoteService；dsh-api-workspace-files remote-client；session.list）——tech-research R7。

`POST /api/rpc`：`session.list/models/selectModel/create/history/prompt/cancel`、`interaction.pending/answer/cancel`、`workspace.list`、`agentPreset.list/select`；SSE `GET /api/session/stream?sessionId=…`（命名事件 `snapshot`/`event`，帧形状见 tech-research R1）；`GET /api/status`（心跳 + tunnelExpiresAt）。端点形状正本 = 官方手机页源码（probes/official-mobile-page.js.txt），批次①回放录制钉死。
