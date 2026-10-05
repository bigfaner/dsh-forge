---
created: "2026-10-05"
related: "../db-schema.md#§7-14"
status: "done（结论闭合）"
---

# S8 spike：dsh 会话 id 在 tool 上下文可得性（主会话 + 子会话）

> 排程锚：db-schema §7-14（PRD 前 spike；2026-10-05 已收窄——主会话半有生产证据，实测面 = 子会话）。承重假设 = SC6③（任务↔会话挂接）与 task_records.session_id 追溯链（claim 记 dispatcher 会话、submit 记 executor 子会话）。可执行工件 = [`spikes/m2-s8-session-ctx/`](../../../../spikes/m2-s8-session-ctx/)（echo 插件 + playwright spec，dogfood 真实模型 glm-5.3-flash，1 次通过 1.1m）。

## 方法

- `@dsh-s8/echo-ctx` 插件（Cordis Plugin.Function，inject `['tools']`，与 knowledge 插件同缝）：注册 `s8_echo_ctx` 工具，执行时 dump `exec.agent.session.{id, header.cwd}` 到 JSONL。
- 产品宿主（dev profile）+ `DSH_FORGE_PATCH_FILES` 叠层注入（dogfood 模型行 + 插件 insert 行）；隔离 userData + DSH_HOME（凭据播种，flywheel 同径）。
- 注册夹具工作区 → composer 发送两步指令（①主会话直接调工具 why=main；②同步 subagent 派发子任务调工具 why=subagent）→ 轮询 dump 对比。

## 结果（2026-10-05，真实模型单跑通过）

| 侧 | agent.session.id | header.cwd | sessionKeys 形状 |
|---|---|---|---|
| 主会话 ×2（模型重试一次） | `session-b967e43f-461e-43ac-988b-b6ec97adda0b` | `…\s8-ws`（工作区根） | header/log/derived/eventsSnapshot/toolHistoryProjection 等 15 键 |
| 子会话（匿名 subagent，同步派发） | `f629d146-dd76-4cab-bdf7-20ba94de7d4e` | 同一工作区根 | **与主会话逐键一致** |

关键判读：

1. **子会话 tool exec ctx 携带 agent.session.id——S8 核心问题肯定回答**。SC6③（executor 会话不隐没）与 records 追溯链（claim(s_disp) → submit(s_exec)）的写入侧假设成立。
2. **子会话 id 与主会话 id 可区分且形态不同**：主会话 = `session-<uuid>`（带前缀），子会话 = **裸 UUID（无 session- 前缀）**——子会话由 in-process driver 驱动、无独立持久化目录（跑时隔离 dshHome 会话目录为空，主会话文件亦未及落盘——持久化为回合后追加，非本 spike 断言面）。**tech-design 记账**：session_id 列将混两种形态（`session-` 前缀有无），「执行会话 ≠ 派发会话」断言按 id 相异判即可，勿按前缀判型。
3. `header.cwd` 两侧在场且同值——**cwd→工作区路由对子会话同样可用**（M2 plugin-forge 的 cwd→forge.db 路由无子会话盲区）。
4. 旁证：模型在输出 schema 校验失败（spike 工具返回体超 schema 声明）后**自主重试并按指令继续**——工具面错误不破坏回合（对 dispatchPrompt 约束块的「失败分诊」语义是正面信号）。

## 结论与落点

- **S8 通过，无需回退**：db-schema §7-14 预设的回退（submit 侧 session_id NULL + 记偏离）保留为防御性路径，非预期路径。
- PRD 落点：SC6③ AC 可写双侧断言（任务行双数据源 = links（dispatcher）+ records.session_id（executor），两侧 id 相异可判）；会话头部挂接展示的数据源成立。
- tech-design 落点：tool 侧会话上下文解析 = `exec.agent.session.id` + `exec.agent.session.header.cwd`（knowledge 插件 `sessionContextOf` 同型，M2 复用该缝）；session_id 形态差异记账。

## 附：环境备忘（对 M2 dogfood/e2e 有普适价值）

harness 会话的 `node`/`pnpm` = `C:\Users\panda\AppData\Roaming\dsh-desktop\harness\.desktop-bin\*.cmd` shim，其中 `node.cmd` 会 `set ELECTRON_RUN_AS_NODE=1`——继承该变量的 **electron 子进程以 Node 模式启动**，playwright `_electron.launch` 即报 `bad option: --remote-debugging-port=0` → "Process failed to launch!"。**规避**：从 harness 会话跑 e2e 时用真实 node 直调 playwright CLI（`& 'D:\developer\nodejs\node.exe' …\playwright\cli.js test -c …`），或先 `Remove-Item Env:ELECTRON_RUN_AS_NODE`（后者无效于 shim 注入面——shim 在自身进程内 set，pwsh env 本就干净，须绕 shim 本体）。排障探针 = `spikes/m2-s8-session-ctx/launch-probe.mjs`。
