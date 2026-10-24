# mobile 验收流程

## 质量门（每次改动后按序，首败即停）

| 门 | 命令 | 备注 |
|---|---|---|
| compile | `pnpm lint:types` | tsc -b 全量（含 mobile tsconfig） |
| fmt/lint | `npx oxlint -c oxlint.config.ts apps/mobile/src`（--fix 自修 ≤1 次） | |
| test | `npx vitest run apps/mobile/src`（+ 受影响 host 测试文件） | 定向跑，不跑全局 |
| bundle | `pnpm --filter @dsh-forge/mobile build` | run-once esbuild（禁 watch——孤儿进程吃尽 commit charge 判例） |

## 生效路径判据

- 纯前端（src/）：重建 bundle → 手机刷新页面。
- host 侧（apps/host/src）：需重启宿主进程（含 mobile-bridge/代理通道/镜像器改动）。
- durable 数据语义（usage/turn-end/todos）：仅新产生数据携带，旧会话经重拉读在场字段。

## 真机验收（WiFi 模式优先——用户裁决）

1. **实例**：worktree dev 实例。启动（脱离进程树——harness Job Object 会回收子进程，用 WMI `Win32_Process.Create` EncodedCommand）：
   ```powershell
   $env:DSH_FORGE_DEV_PROFILE='dev'; $env:DSH_FORGE_USER_DATA='<repo>\apps\host\userdata.dev'
   Remove-Item Env:DSH_HOME, Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
   & '<repo>\apps\host\node_modules\electron\dist\dsh-forge-dev.exe' '<repo>\apps\host'
   ```
   token/端口从 `userdata.dev/logs/app-*.jsonl` 行 `dsh web: http://…?token=…` 读取；LAN 绑定核验 `Get-NetTCPConnection LocalAddress=0.0.0.0`（需 remoteApproval 设置，settings 文件**无 BOM** 写入）。
2. **探针**：Playwright headless（`.dev-tmp/*.mjs` 过程产物，不进 git）；cookie `dswf_forge_remote=1` + token；常见陷阱：hero 富化整树重建（等待 3.5s 稳定窗再交互）、EventSource addInitScript 计帧、模型不配合工具调用需重试驱动。
3. **走查锚点**：composer textarea=`.composer textarea`、发送=`.composer button` 末个、折叠组=`.turn-fold`、ask 卡=`.ask-card`、TODO 面板=`.todo-panel`、文档卡=`.fcard`、阅读页=`.reader`、抽屉行=`.drawer button.sess`。
4. **证据**：DOM 逐项断言 + 截图（存 `.forge/docs/features/mobile-ui/walkthrough/`，不进 git）；各流程判据见 `core-flows.md`。

## 隧道模式（互联网）验收程序（2026-10-24 归纳）

### 实例与隧道面

- 隧道 = cloudflared（host 自启，`tmpdir()/dsh-cloudflared` 二进制）；验收可用自管 `cloudflared tunnel --url http://127.0.0.1:<port>` 等价替代——公网 `*.trycloudflare.com` Host 即进 PSK 强制域，与 host 自启链路同协议。
- **隧道配对 URL 不落日志**：pair token 只存活在 child 内存，经 `pair`/`tunnel` 消息推送桌面端 QR（每次 /pair/verify 成功或 5min 定时器轮换）。日志只有 web token（`dsh web:` 行）与 `tokenVerify=pass/fail` 结果行——不要试图从日志恢复 pair token。
- 探针免 QR 认证链：`GET /?forgeRemote=1&token=<web token>`（官方 token 交换腿）+ 手动 cookie `dswf_forge_remote=1` 即达 mobile 配对屏；真实手机仍走桌面 QR → PIN 页。

### PSK 三件套（配对激活输入）

- 展示密钥：`userdata.dev/remote-psk.json` 的 `psk`（base64 raw）→ base32（RFC4648）**52 字符**按 5 字符分组连字符连接——末字符含填充位，**51 字符 = 位填充派生错误**（激活报 `psk:length`）；校验段 = SHA256(raw) 前 4 hex。
- PIN：`remote-pin.json`（durable 位在厂长效态下轮换零换签，跨实例重启稳定）。
- host 公钥：`remote-psk.json` 的 `signing.spki`（base64，≥40 字符）。
- 激活入口两面：全页配对屏（`.pairing-root .tunnel-panel`）与抽屉连接详情（`.drawer .foot` 点按展开内嵌面板）；PIN/SPKI 激活成功后入 localStorage 预填（PSK 恒不落）。

### 归因判据（host 日志 `[pair-diag]` 行）

| 日志 | 含义 |
|---|---|
| `web-entry landing mode=tunnel probe=gated` | 隧道域识别正确 |
| `/remote/__rpc channel=<redacted> [tunnel] status=unauthorized` | PSK 信封层拒绝（解密/水位/形状/allowlist 外）——通道名恒脱敏 |
| `/remote/__rpc channel=… [tunnel] status=ok` | 准入成功（allowlist 内才落真实通道名） |
| `/remote/forge-stream [tunnel] status=unauthorized（sid/epoch 缺席）` | 启动模式探测的预期噪音（激活前无材料） |
| `401 且单帧、同信道相邻有 ok` | 隧道层同信封重传伪影（曾成功准入、重传被防重放拒）——fail-soft 可重拉，不构成功能面 |

### 隧道特有验收维度（在六条规则之上叠加）

1. **世代卫生**：同页重建传输（抽屉再激活/配对后重建）后不得出现 401（判例：`3579f34f`——seq 归零撞防重放水位，修复 = 重建即 `beginSession` 换世代）。
2. **延迟预算**：公网 RTT 放大串行链——抽屉打开走快照缓存 + grouped 去重（判例：`ef6afa2a`，冷开 1.5s / 温开 ≤0.3s 为当前基准）；新交互面加进抽屉链时重测该基准。
3. **探针卫生补充**：信封取证用 fetch 包装记录 401 帧的 `sid/epoch/seq`（归因世代冲突 vs 重传伪影的唯一手段）；配对 token 5min 窗内完不成时就地重启实例重取，不要跨窗复用。

## 已知环境事实

- 打包/正式形态与 dev 形态行为差异以 dev 树实测为准（AGENTS §1.4：外部装配面真机取证才算交付）。
- 两实例共用 userdata.dev 会互顶（后启杀先启）；隔离验收用独立 userdata 目录。
- provider（上游模型）出字节奏决定打字机粒度；模型不调工具 ≠ 功能故障——先查 durable 历史再定性。

## 验收规则（2026-10-23 固化；2026-10-24 增补第 7 条）

七条验收规则（归纳缘起与具体判例见 `acceptance-examples.md`）：

1. **可见性断言**：UI 验收必须含视口内可见（`getBoundingClientRect` 与 viewport 相交且 `offsetHeight > 0`），DOM 存在只算前置条件。
2. **版本/实例同一性**：验收前记录实例端口 + token + 启动日志行，确认被测页面 bundle 为当前构建（必要时强制 reload）；用户报告的现场先确认其实例身份再定性。
3. **现场保真**：验收窗口内禁止重启实例；发生中断即重跑全程，不得沿用中断前结果。
4. **全链闭环**：交互流程按「到达 → 可见 → 操作 → 回灌 → 恢复态」五段逐段断言，缺一段即不完整。
5. **维度扫全**：按用户裁决逐维度覆盖（如「所有模式都支持」= 每个预设/模式至少一条用例）。
6. **探针卫生**：探针先自证（选择器命中唯一、无脚本异常、页面 error 监听必挂且随结果输出）；等待用显式条件而非固定时长的单次等待。
7. **隧道域归因**（2026-10-24）：401 先取信封三元组归因（世代冲突 vs 重放伪影 vs 未认证）再动手；延迟报告先量化分段时间线；host 日志 `[pair-diag]` 行为隧道域单源（判据表见上节）。
