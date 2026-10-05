# S8 spike：会话 id 在 tool 上下文可得性（主会话 + 子会话）

结论与落点见 `docs/proposals/dsh-forge-m2-pipeline/spikes/s8-session-ctx.md`（本目录 = 可执行工件）。

## 工件

- `echo-ctx/`——`@dsh-s8/echo-ctx` 插件（Cordis Plugin.Function，inject `['tools']`）：注册 `s8_echo_ctx` 工具，执行点 dump `exec.agent.session.{id, header.cwd}` 到 `S8_DUMP_FILE`（JSONL 追加）。**spike 工件，不得演化为产品结构**（沿 s1 纪律）。
- `pw.config.ts`——本地 playwright 配置（testDir = 本目录，不进仓 e2e 池）。
- `s8.spec.ts`——dogfood 走查：产品宿主 + 叠层注入（模型行 + 插件 insert 行）+ 注册夹具工作区 + composer 发两步指令（主会话直调 / 同步 subagent 派发）→ dump 对比。
- `launch-probe.mjs`——排障探针（electron 启动失败时的 env 验证——见下「环境备忘」）。

## 运行（从 harness 会话——注意 shim 陷阱）

```powershell
# 1. 注入插件包（untracked node_modules 区，spike 后删除）
New-Item -ItemType Directory -Force apps\host\profile.dev\node_modules\@dsh-s8 | Out-Null
Copy-Item -Recurse -Force spikes\m2-s8-session-ctx\echo-ctx apps\host\profile.dev\node_modules\@dsh-s8\echo-ctx

# 2. 跑（必须绕过 harness node.cmd shim——它会 set ELECTRON_RUN_AS_NODE=1，
#    继承该变量的 electron 以 Node 模式启动，playwright 报 "bad option: --remote-debugging-port=0"）
& 'D:\developer\nodejs\node.exe' 'node_modules\.pnpm\playwright@1.63.0\node_modules\playwright\cli.js' test -c 'spikes\m2-s8-session-ctx\pw.config.ts'

# 3. 清理注入件
Remove-Item -Recurse -Force apps\host\profile.dev\node_modules\@dsh-s8
```

前置：`~/.dsh/.credentials.yaml` 在场（dogfood 凭据，缺席 = 留痕 skip）；零活动 electron 实例（单实例纪律）。

## 环境备忘（普适）

harness `node.cmd` shim（`%APPDATA%\dsh-desktop\harness\.desktop-bin\`）注入 `ELECTRON_RUN_AS_NODE=1`——任何由它启动的进程树内 spawn electron 都会进 Node 模式。harness 会话跑 electron e2e 一律绕 shim 直调真实 node。
