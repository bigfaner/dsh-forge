# mobile 项目架构（apps/mobile）

移动端（手机浏览器/隧道访问）单页应用：esbuild 内联单文件 bundle（`dist/index.html`，JS+CSS 内联），官方 dsh 宿主进程直接静态伺服于 `/remote` 路径。无独立服务端——一切数据经宿主代理通道/镜像流。

## 目录

```text
apps/mobile/src
├─ main.ts            装配根：router/会话身份/logCache 同步/镜像流订阅/浮层
├─ core/              数据层（零 DOM）
│  ├─ api.ts          官方控制器代理面（session.* 直调映射 forge:proxy/*）
│  ├─ rpc.ts          /remote/__rpc 通道客户端（proxyCall + DisconnectedError）
│  ├─ log-sync.ts     会话日志缓存（节流重拉 + 完成通知单缝）
│  ├─ forge-stream-source.ts  SSE 订阅（LAN 明文/隧道 AEAD 双域解帧）
│  ├─ psk-crypto.ts   隧道逐帧解密 + host 签名验证
│  ├─ sse.ts          判活/合帧/轮询兜底口径
│  ├─ tunnel*.ts      隧道配对/材料/传输
│  └─ wire.ts         durable 事件 → Projection 投影（E 档零渲染守卫）+ settler 瞬态状态机
├─ views/             路由视图（hero/chat/worker/ask/reader/models/settings/drawer/tasks）
├─ widgets/           复合件（composer/msg-cards/fab/tunnel-panel）
└─ style.css          全量样式（对齐 DESIGN.md 令牌）
```

## 路由

hash 路由：`#/`（hero 建会话）、`#/chat/:sessionId`（主视图）、`#/ask`、`#/worker`、`#/models` 等；`buildView(match)` 按 key 重建，`rendered` 持当前视图句柄。

## 渲染管线

- **数据单源**：`log-sync` 每会话一份 durable 历史快照（`api.history` 尾窗）；SSE 镜像帧只做失效信号（600ms 节流重拉，**重拉完成即通知**，frameListeners 按 seq 尾序增量外推——不重不漏）。
- **瞬态流**：`assistant/live-chunk` 等瞬态帧不落账，经 frameListeners 原样穿透 → settler（per-attemptId 状态机）打字机渲染；durable 结算卡原子取代。
- **渲染合帧**：`scheduleRender()`（rAF，非浏览器 setTimeout 16ms 兜底）——一帧内多次变更合并为单次全量重建；加载路径（loadInitial/loadOlder）同步 render（滚动锚依赖同步 DOM）。

细节正本：`docs/mobile/core-flows.md`；接口与加密正本：`docs/mobile/api-and-crypto.md`。
