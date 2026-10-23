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

## 已知环境事实

- 打包/正式形态与 dev 形态行为差异以 dev 树实测为准（AGENTS §1.4：外部装配面真机取证才算交付）。
- 两实例共用 userdata.dev 会互顶（后启杀先启）；隔离验收用独立 userdata 目录。
- provider（上游模型）出字节奏决定打字机粒度；模型不调工具 ≠ 功能故障——先查 durable 历史再定性。
