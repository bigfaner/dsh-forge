# 批次① 交付摘要：底座与对话通道（mobile-ui 阶段 1 · 任务 1.1–1.7）

- 日期：2026-10-17 · 分支：mobile-ui（worktree `.forge/worktrees/mobile-ui`）
- 口径：每任务单条交付事实 + commit hash + 证据索引；G1–G3 对照按批次①范围逐条标注。

## 1. 交付清单

| # | 任务 | 交付 | commit |
|---|---|---|---|
| 1.1 | e2e 录制基建 + fixtures | 15 通道 wire 常量 + recorder 配对链回环；api-ref.jsonl 1130 行（session/list 含 projections、modelCatalog、create、selectModel、commands、workspace/list）+ proxy-rpc.jsonl 117 行（/remote/__rpc LAN 裸 + PSK v3 信封）；replay-smoke exit 0 | 516ec61d（复核轮 89cbd93e 修正 README） |
| 1.2 | apps/mobile 脚手架 | esbuild 单文件 run-once 产物（dist/index.html，JS+CSS 内联）；零运行时依赖；lint-imports mobile 边界规则 + selftest 负样例；vitest mobile 池 + tsc 纳入工作区门禁 | acf8f8a2 |
| 1.3 | core 层引擎 | wire.ts 37 类持久事件五档投影 + per-attemptId 结算状态机 + seq 单调门；sse.ts Live/Degraded/Offline 状态机 + 官方三值退避（250/750→5s 封顶）+ 心跳判活；rpc.ts /remote/__rpc 信封 + `/` 前缀指令仲裁；api.ts 官方面窄面 13 方法；router/store；单测 97 绿 | 139853ac |
| 1.4 | chat 视图与消息卡家族 | 屏①②③：气泡/活动卡/系统层三层级、工具卡配对三态、循环卡 kind 色条、折叠/分页/触底未读、SSE 流式与断线/401 覆盖层；单测 16 例 | d06b1ff1 |
| 1.5 | ask 分页面板 | 三题型（单选/多选/other）语义状态机 + 一屏一题分页 + interaction.answer/cancel 提交链；单测 11 例 | f277ef6b |
| 1.6 | 设置面板与模型列表 | 屏⑦⑧：session.models / selectModel 官方面接入 | b36603de |
| 1.7 | /remote/ 静态面接入 | webDistRoot 改指 apps/mobile/dist（单文件秒开）；dist 缺席 fail-soft 提示页 + diag；配对链实机走查全链 302/303→/remote/ 200 = mobile dist 原文 + 官方 index 注入；host 单测 90/90、tsc、oxlint 0 警告 | fd801944 |

任务 1.5/1.6 与 commit 的对应按提交时序推断（f277ef6b 19:49 先于 b36603de 19:55），低风险假设。

## 2. 走查证据索引

| 证据 | 位置（留盘不进 git） |
|---|---|
| 1.1 录制/回放日志 | logs/mobile-ui/1.1/002-record、004-record（record-run-009.log、replay-smoke.log）；复核结论 proposals/mobile-ui/walkthrough/1-1-record/resume.md |
| 1.2 门禁证据 | logs/mobile-ui/1.2/001-scaffold/evidence.md（+lint-full.txt） |
| 1.3 门禁证据 | logs/mobile-ui/1.3/001-core-green（tsc-mobile.log、vitest-mobile.log） |
| 1.4 mockup ①②③ 逐位对照 | logs/mobile-ui/1.4/walkthrough/（walkthrough-record.md + mockup/impl 各 3 图 + probe）；基准 proposals/mobile-ui/mobile-ui-mockup-final.html |
| 1.7 秒开 + 配对链实机 | logs/mobile-ui/1.7/001-walkthrough/（设备模拟截图、dist 缺席提示页）、002-pair-chain/（CDP 全链 cookie jar 取证） |

（logs 根：`C:\Users\panda\AppData\Roaming\dsh-forge\forge-workspaces\Z-project-dsh-dsh-forge@dadf6b04\logs\mobile-ui\`）

## 3. PRD G1–G3 对照（批次①口径）

| 目标 | 批次①结论 | 证据 |
|---|---|---|
| G1 手机端独立 view 层工程，与桌面零模块引用；扫码秒开（单文件产物） | ✅ 达成（批次①口径） | 零运行时依赖 + lint-imports 边界规则含负样例拦截（1.2）；单文件 dist/index.html + Chrome 设备模拟秒开采证（1.7）。真机扫码取证属后续批次面 |
| G2 对话体验对齐官方手机页机械（SSE 流式、断线降级轮询 750ms→5s、恢复自愈） | ✅ 达成（单测/回放口径）；实机断线轮询实测待 T4 取证门 | sse.ts 三值退避 250/750→5s + 心跳判活，单测 16 例（1.3）；流式/断线/401 覆盖层与 mockup 逐位对照一致（1.4 走查记录）；形状正本 = 1.1 官方 fixtures |
| G3 forge 任务域手机可见可控（只读展示 + 意图转发，动作经 host 守卫） | ◐ 部分达成（属批次①范围的部分已就位） | 只读展示：循环卡 kind 色条家族已随 1.4 落地；意图转发与 host 守卫为批次②/③任务，批次①内不适用 |

## 4. 遗留与移交

- 真实 ask 载荷补录腿 → 1.11（1.1 五项 AC 已达，不阻塞）。
- e2e remote-pair-cookie-chain 末段断言与 mobile dist 改指漂移待更新；实机页图证需 `E2E_WINDOW_VISIBLE=1` 补拍（1.7 resume）。
- G2 实机断线/恢复取证、G1 真机扫码秒开 → 各批次 T4 取证门统一收口。
