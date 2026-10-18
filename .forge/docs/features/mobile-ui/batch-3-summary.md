# 批次③ 交付摘要：任务域与循环/文档（mobile-ui 阶段 3 · 任务 1.16–1.19）

- 日期：2026-10-20 · 分支：mobile-ui（worktree `.forge/worktrees/mobile-ui`）
- 口径：每任务单条交付事实 + commit hash + 证据索引；G4–G5 对照按批次③范围逐条标注。

## 1. 交付清单

| # | 任务 | 交付 | commit |
|---|---|---|---|
| 1.16 | 任务浮层与悬浮球 | `widgets/fab.ts` 悬浮球（pointer 拖拽/点按阈值 6px、释放贴边、贴边收纳半圆）；`views/tasks.ts` 任务浮层——数据源 = 会话日志 + wire 投影（`forge/progress`→TaskRun 最新 seq；循环叙述/回执 `command/run+done` 成对投影），不直调 forge/progress；运行中置顶/完成折叠、多 run chips 按 source_slug 分组（R10-F2）；派发/暂停 = 指令发当前浏览会话（F5-甲零映射，`hasActiveSource` 同源独占守卫），经 composer `/` 仲裁 = `forge:proxy/commands-list/execute`（wire 形状取 1.1 录制）；无审批、无进度百分比 | 8f909698 |
| 1.17 | worker 会话双形态 | `views/worker.ts`：列表 = `forge:proxy/session-list` 过滤 parentSessionId+origin:'subagent' + 父会话投影 mode/label/running activity；子会话流 = 镜像帧 getEvents/subscribe 合流 + live-chunk 瞬态行；continuable composer prompt steer 注入下一轮 / one-shot 只读；`#/worker/:sessionId` 路由 + `.worker-*` 样式族 | 1e3d36b2 |
| 1.18 | 循环注入 source.kind（桌面侧） | `packages/plugin-forge` loop-injected 消息声明类型化 `source.kind:'forge-loop'`（声明合并 `MessageSourceMap['forge-loop']` 键位消费，AD-4）；注入机械（inject/followup 缝）原样未改，未来 agent.send 演进不被排除；为移动端循环卡 verb→kind 识别（R10-F3）提供类型化依据 | 9ca70bcc |
| 1.19 | 循环卡与文档阅读 | `widgets/msg-cards.ts` 循环卡家族——verb→kind 色条全集（claim 蓝/claim-resume 浅蓝/settle·stop 灰/completed 绿，R10-F3）+ 同 runId 非最新叙述退化单行 chip（原位替换不重排）+ 文档卡五类识别（md/txt/csv/html/链接，size 右对齐 › 前、resolveSize 异步回填 fail-soft）；`views/reader.ts` 全屏阅读页——「渲染｜文本」胶囊、md/csv/html 默认渲染、rich md 语义 + mermaid 动态 import（`@dsh-forge/md-mermaid/web`，无 fence 零引擎装载）、链接内置浏览器；`rpc.ts` `forge:proxy/file` 全文件读（逐块 base64 + maxBytes 守卫） | f0bfb300 |

## 2. 走查证据索引

| 证据 | 位置（留盘不进 git） |
|---|---|
| 1.16 走查记录（门禁实测：tsc 0 错 / oxlint 0 / vitest 179/179 / esbuild 产出） | `proposals/mobile-ui/walkthrough/1-16-tasks/walkthrough-record.md`；门禁日志 `logs/mobile-ui/1.16/001-gates/` |
| 1.17 resume（门禁实测：tsc 0 错 / vitest 200/200 / worker.spec.ts 1 通过） | `logs/mobile-ui/1.17/resume.md`；探针页 `e2e/mobile/test-artifacts/worker-probe.html` |
| 1.18 质量门证据（tsc×3 exit 0 / vitest 729/729 / oxlint 0 / lint-imports 0） | `logs/mobile-ui/1.18/001-forge-loop/gates.md` |
| 1.19 走查记录（屏⑨⑩⑪逐位对照 + e2e loop-reader.spec.ts 1 通过） | `proposals/mobile-ui/walkthrough/1-19-loop-reader/walkthrough-record.md` + impl-screen-9/10/11 图 |

归档补齐（2026-10-20 批次③验收门复跑）：

- `walkthrough/1-17-worker/` 已补齐：walkthrough-record.md（原误存为平铺同名文件，已归位目录结构）+ impl-worker-list/continuable/oneshot.png 三图（worker.spec.ts 复跑重生成）。
- `walkthrough/1-19-loop-reader/` 屏⑨⑩⑪四图已补齐（loop-reader.spec.ts 复跑重生成；此前仅存走查记录）。
- 1.16 fab/任务浮层整机截图仍待 main.ts 集成装配后补录（screen-map #7 为 mockup 无屏号附加面，不占十屏口径）。

## 3. 循环注入改造说明（批次③专项）

- 改造点：桌面侧 `plugin-forge` 循环注入消息新增类型化 `source.kind:'forge-loop'`（commit 9ca70bcc），经声明合并 `MessageSourceMap` 编译期校验消费键位。
- 边界：只插孔不改制——inject/followup 合法缝原样，不改注入机械、不改会话格式（循环哨兵仍是读侧约定）；移动端 1.19 循环卡 verb→kind 色条映射消费该类型化来源。
- 验证：plugin-forge vitest 729/729 全绿，host 依赖方 tsc exit 0（详见 §2 gates.md）。

## 4. PRD G4–G5 对照（批次③口径）

| 目标 | 批次③结论 | 证据 |
|---|---|---|
| G4 各屏与 UI 定稿逐位一致 | ✅ 达成（批次③覆盖屏面口径） | 1.19 屏⑨⑩⑪ 逐位对照（色条全集/叙述 chip 退化/阅读页三态/双主题）走查记录 + 4 图；1.16 fab 贴边收纳 + `.tasks-sheet` 令牌对齐既有刻度（走查记录）；1.17 双形态样式族 `.worker-*`（resume + e2e 回放探针 1 通过）。残留：1.16/1.17 组件级截图与整机装配后走查归档未收口（§2 偏差），G4 最终收口依赖集成批次 |
| G5 分批交付，每批独立 e2e 验收；UI/交互验收 = Chrome 设备模拟 | ✅ 达成（批次③口径） | 4/4 任务质量门全绿：1.16 vitest 179/179、1.17 vitest 200/200 + worker.spec.ts 1 通过、1.18 vitest 729/729、1.19 vitest 193/193 + loop-reader.spec.ts 1 通过；walkthrough 取证归档 1-16/1-19 目录（1-17 目录偏差如实记录，§2）；1.19 走查经 Playwright chromium 设备模拟 390×844 触摸取证 |

## 5. 遗留与移交

- main.ts 集成装配（fab 挂载、任务浮层开合、forge-stream 帧订阅、onOpenDoc 阅读页入栈、resolveDocSize 真实 rpc）属集成批次——组件均已 e2e/单测验证，整机走查待装配后统一收口。
- 1.17 三张截图已补录归档（2026-10-20 门禁轮复跑重生成）。
