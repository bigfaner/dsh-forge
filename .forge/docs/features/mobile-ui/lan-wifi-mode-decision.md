# WiFi（LAN）模式官方面接入方案裁决

日期：2026-10-22 ｜ 裁决人：用户 ｜ 结论：**方案 B（双域统一代理化）**

## 背景

- 官方 DSH Desktop 桌面端支持 LAN 移动配对（`/pair?token` → PIN → 同源 `/api/*`），安全模型 = 一次性 token + PIN 第二因子 + **官方围栏自动信任 IP 字面量 Host**（bridge.ts 核销）。
- 我们 `remoteExpose`（0.0.0.0）开 LAN 可达后，1.32 增加 `api-loopback-guard`：非回环 Host × `/api` → 403（判例：配对设备不应获「完整桌面级会话控制权」）。
- 后果：手机页面（LAN 与隧道域皆然）直呼官方面（`/api/rpc`、`/api/status`、`/api/session/stream`）被围栏拒绝——隧道域已有 `TUNNEL_OFFICIAL_RPC_PROXY`（`forge:proxy/*` 进程内代理）绕开，LAN 分支仍挂旧直呼装配。

## 方案差异

| | A：官方对齐 | B：双域统一代理化（已采纳） |
|---|---|---|
| 做法 | LAN 移动页直呼 `/api/*`（同官方）；撤/收窄 1.32 api-guard | LAN 与隧道域统一：官方面调用全部映射 `forge:proxy/*` 走 `/remote/__rpc`（LAN = 明文 + 配对 cookie；隧道 = PSK AEAD 信封） |
| 对齐度 | 与官方逐位一致（AGENTS §3.1） | 数据语义同官方，传输/收敛面超出官方 |
| 安全 | 回到 1.32 加固前的暴露面：/api 全量可达（官方原样 = LAN 信任域 + 配对入口闸） | 保留围栏；数据面收敛在 allowlist 通道；配对 cookie / PSK 门槛 |
| 改动 | 撤 guard + 恢复 LAN 直连装配 | main.ts LAN 分支代理化 + 抽屉/hero 心跳统一 grouped 通道 + chat 流引擎统一 forge-stream（撤 `/api/session/stream` 死面） |
| 风险 | 撤有判例的安全加固，需明确接受官方暴露面 | 无放松；host 零改动 |

## 裁决与理由

采纳 B：1.32 收敛是有判例的安全决策（数据面只留 allowlist 通道，是我们比官方多做对的地方）；且隧道域代理面已建成，B 的 LAN 分支只是复用同一映射表——双域同一套数据语义、同一套 allowlist，差异收敛到传输层（明文+cookie vs TLS+PSK）。

## 统一后形态

| 面 | LAN 域 | 隧道域 |
|---|---|---|
| 授权 | `/pair` token + PIN → `dswf_forge_remote` cookie | token + PIN + PSK 材料（SPKI/PIN，PSK 不落盘） |
| RPC | `/remote/__rpc` `{channel,payload}` 明文 | 同左，AEAD 信封 + 逐帧验签 |
| 官方面 | `TUNNEL_OFFICIAL_RPC_PROXY` 映射 → `forge:proxy/*`（allowlist，宿主进程内直调 controller） | 同左 |
| 心跳 | `forge:proxy/projects-grouped` | 同左 |
| 会话流 | `/remote/forge-stream`（明文镜像帧） | 同左（AEAD 帧） |
| 官方 `/api` 裸面 | api-guard 403（保留） | api-guard 403（保留） |
