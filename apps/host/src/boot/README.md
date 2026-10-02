# boot/

定位：**基础** —— dsh 宿主 boot（fix-1 起 child 形态：`ELECTRON_RUN_AS_NODE=1 --expose-internals` 子进程跑宿主，官方 Desktop 同款、S1 spike run3 母本；direct-in-main 形态下 agent 工具派发恒挂起——4.2 dogfood 实证）。

- `run.ts` — 进程编排：spawn → ready 等待 → `{url, injections}` manifest + 产品双服务 RPC 代理面世 → 有界关停（DshHostHandle 面不变，main.ts 零感知）
- `child.ts` — 子进程入口：loadProfileDirectory → boot overlay → runProfile（direct 形态原路径原序平移）→ ready/rpc/shutdown 消息面
- `bridge.ts` — IPC 桥协议纯逻辑（消息形状与守卫 / Map wire 编解码 / argv 选项解析 / 子侧派发与主侧代理 / 外部叠层清单）
- `manifest.ts` — boot manifest 组装（G1 契约面第 1 项 `{url, injections}` 缝）
- `overlay.ts` — 产品插件行 config 装配期注入（patchFiles 叠层，4.2）
