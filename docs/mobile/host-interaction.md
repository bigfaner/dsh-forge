# mobile ↔ host 交互逻辑

mobile 与宿主（`apps/host` child 进程）的全部交互走两条物理通道，双域（LAN 明文 / 隧道 AEAD）同构。

## 1. RPC 通道：`POST /remote/__rpc`（请求-应答）

- mobile → `{channel, payload}` → host `remote-http-rpc.ts` 分发 → `proxy-channels.ts` 通道表（`forge:proxy/*`，allowlist 纪律，表外 404）。
- 通道族（正本 = `proxy-channels.ts` PROXY_CHANNELS）：
  - `session-*`：官方 sessionController 控制器方法直调（list/create/page/prompt/cancel/projections/selectModel…），typert 编组 strict schema 边界；
  - `commands-list/execute`：ctx.commands；携 sessionId → `resolveAgent` 收敛 agent 作用域清单；
  - `user-questions-answer`：ask 应答（桥内 waterfall 在途题优先回灌，否则官方 continued 面）；
  - `projects-grouped`：项目→worktree→sessions 归组（抽屉/hero 数据源）；
  - `agent-preset-select`：resolveAgent **解包 `{agent}|{error}` 后** registry.select（整包装直传会崩——先例 344dd76b 族）；
  - `file / file-list`：分块读面（64KB/块；隧道域逐块 AEAD，manifest 携 SHA-256）；
  - `read-state / read-state-write`：已读游标 host 侧持久（跨重启/端口 churn）。
- 鉴权：会话 cookie（配对握手）+ 隧道域 PSK 门； Lan/回环维持旧门语义。

## 2. 推送通道：`GET /remote/forge-stream`（SSE 镜像）

- 每连接注册：8 个官方事件名镜像（`subscribeOfficialEvents`）+ assistant 流式密帧镜像（`subscribeAssistantStreamMirror`，`agent/assistant-stream` → `{sessionId, frame}`）+ ask 桥扇出（连接注册进 `streamPushes` 集）。
- 帧体 `{type, payload, at}`；隧道域逐帧 AEAD + host Ed25519 签名，LAN 明文。
- mobile `onEvent` 消费：`frameSessionIdOf(payload)` → `scheduleRefresh`（节流重拉）；`agent/assistant-stream` 瞬态帧穿透 settler；`user-questions/request` → 直开 ask 面板。

## 3. 宿主侧插件（dsh-forge 专有缝）

- `@dsh-forge/mobile-bridge`（boot overlay insert 行）：组合期注册 `user-questions/request` waterfall answerer——**必须先于 api-remotes 的捕获监听装载**（scoped 分发 + 客户端子树 `ctx.remote` 私有，根 ctx.on 不参与分发）。桥本体经全局锚 `__dshMobileAskBridge` 注入（child runProfile 前），emit 扇出到 streamPushes；无桥侧超时（桌面同语义），中止透传 next。
- 已排除路径（勿再走）：根 ctx.on 收不到 scoped waterfall；`ctx.remote` 在 child 根 ctx 不存在（客户端插件子树私有）。

## 4. 已读游标

host 单点持久（`read-cursor-store`，state.db 邻接 JSON 0600，单调写）；mobile 触底/开屏写、抽屉行消费显示未读徽标。localStorage 因 origin 含端口每次启动变化，不可用。

## 5. 其它宿主面（索引）

- **配对与隧道**：展示密钥 + PIN 激活、PSK v3 帧加密、密钥轮换——协议正本 `.forge/docs/features/mobile-ui/design/tunnel-psk.md`，加密过程详解 `api-and-crypto.md` §3–4。
- **审批桥接**：`forge:remote/approval` → approvalRelay 中继到宿主审批瀑布；配方修正先例 `mobile-remote-approval/disc-1`（AGENTS §1.5）。
- **模型/设置**：`session-model-catalog` / `select-model` / `agent-presets`；默认模型暂存 localStorage（同 origin 内有效），建会话成功即下发并清除。
- **worker 视图**：`session-list` origin=subagent 过滤 + worker 会话进入（env 只读，一次性任务直发）。
