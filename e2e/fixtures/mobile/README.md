# mobile 回放 fixtures（1.1 录制首跑产物——测试资产，R12 形状）

来源：真实 host（隔离 boot + 配对链回环 authority + dogfood 低成本模型）录制。
驱动证据：proxyChannels=15(plain)；pskForm=2；apiSessionList ok=true items=1；apiRefLeg=4；forgeStream frames=0；created=session-b318371c-9e1b-4d0f-a80e-fb8449cc87a7；mux=installed；askPinned=false callId=(unfound)；controlFrames=6

| 文件 | 内容 |
|---|---|
| `proxy-rpc.jsonl` | POST /remote/__rpc 交换（{channel,payload} → RPC 信封）——forge:proxy/* 全通道集 + forge:remote/{progress,approval,disconnect}；LAN 裸形态 + PSK v3 信封头形态（envelope 字段） |
| `api-ref.jsonl` | 官方 /api typert 端点交换（client-request 信封）——协议形状参照（R12#4）：session/list SessionSummary 字段清单原样、commands list/execute、userQuestions/answer |
| `forge-stream.jsonl` | SSE 逐帧（snapshot/event 命名事件，t = 毫秒偏移；url 区分 /remote/forge-stream 与 /api/session/stream 两源） |

回放消费：`e2e/mobile/replay.ts` installReplay（page.route + timed SSE 重放）；冒烟 = `replay-smoke.spec.ts`。
