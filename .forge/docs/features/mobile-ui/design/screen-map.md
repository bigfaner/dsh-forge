---
created: 2026-10-17
---

# Screen Map：mobile-ui（mobile 表面手册）

单轻量页 hash 路由；浮层不走路由。基准 = `mobile-ui-mockup-final.html`（屏号标注）。e2e 表面 = `apps/mobile`（Chrome 设备模拟移动端）。

| # | Screen | 路由/形态 | mockup 屏 | 关键交互 | 数据源 |
|---|---|---|---|---|---|
| 1 | chat 对话主视图（根） | `#/chat/:sessionId` | ①②③ | 仅消息区滚动、滚动到底（未读计数）、composer 底行（模式/worktree/滑杆/发送） | 官方 SSE + `session.history` |
| 2 | drawer 抽屉会话列表 | 浮层（☰） | ④ | 项目树折叠、置顶、双级未读、连接状态弹层（断开） | `forge:remote/read-state`、`workspace.list`、`forge:remote/disconnect` |
| 3 | hero 新会话 | `#/new` | ⑤ | 模式/分支乐观切换、host 拒绝确认框 | `forge:worktree/*`、`forge:remote/session-links`、`session.create` |
| 4 | ask 分页面板 | `#/ask` | ⑥ | 一屏一题、序号/总数、上一个/提交/下一个 | `interaction.pending/answer` |
| 5 | settings 最小化面板 | 浮层（滑杆钮） | ⑦ | 模型行、推理等级分段（选档即生效） | `session.rpc` 模型/effort 面 |
| 6 | models 模型列表 | `#/models` | ⑧ | 防抖检索、提供商分组、最近使用置顶、选中态 | 官方 model catalog、localStorage |
| 7 | tasks 任务浮层 | 浮层（悬浮球） | — | 悬浮球拖拽/贴边、run 切换 chips、任务卡三态、暂停/派发意图 | `forge:remote/progress`、`task-action` |
| 8 | worker 会话 | `#/worker/:sessionId` | — | one-shot 只读 / continuable 可发送、← 退出 | `forge:remote/workers`、官方 SSE（子会话） |
| 9 | reader 全屏阅读页 | `#/doc/:messageId` | ⑨⑩⑪ | 渲染｜文本胶囊、表格居中、← 退出 | 消息流文档卡（`meta` 通道） |
